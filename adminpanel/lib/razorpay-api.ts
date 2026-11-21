import crypto from 'crypto';
import { getRazorpayConfig, razorpayBaseUrl } from './razorpay';

/**
 * Server-side calls to the Razorpay REST API, using the credentials saved in
 * Settings -> Payment Gateway. The key secret never leaves the server.
 *
 * Every function returns a result object instead of throwing, so callers can
 * show the gateway's own message.
 */

export interface GatewayResult<T> {
  ok: boolean;
  status: number | null;
  data: T | null;
  error: string | null;
  /** True when no usable credentials are saved or the gateway is switched off. */
  notConfigured?: boolean;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, any>): Promise<GatewayResult<T>> {
  const config = await getRazorpayConfig();
  if (!config.isConfigured || !config.enabled) {
    return {
      ok: false,
      status: null,
      data: null,
      notConfigured: true,
      error: !config.isConfigured
        ? 'The payment gateway is not configured. Save the Razorpay keys in Settings.'
        : 'Online payments are switched off in Settings.',
    };
  }

  const auth = Buffer.from(config.keyId + ':' + config.keySecret).toString('base64');

  try {
    const response = await fetch(razorpayBaseUrl() + path, {
      method,
      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: data?.error?.description || `Razorpay returned ${response.status}`,
      };
    }
    return { ok: true, status: response.status, data: data as T, error: null };
  } catch (error: any) {
    return { ok: false, status: null, data: null, error: 'Could not reach Razorpay: ' + (error?.message || 'network error') };
  }
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/** Creates an order for an amount in rupees. `receipt` must be 40 characters or fewer. */
export function createRazorpayOrder(amountRupees: number, receipt: string, notes: Record<string, string> = {}) {
  return call<RazorpayOrder>('POST', '/orders', {
    amount: toPaise(amountRupees),
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes,
  });
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
  email?: string;
  contact?: string;
  fee?: number;
  tax?: number;
  amount_refunded?: number;
  error_code?: string | null;
  error_description?: string | null;
  notes?: Record<string, any> | any[] | null;
  created_at: number;
}

export function fetchRazorpayPayment(paymentId: string) {
  return call<RazorpayPayment>('GET', '/payments/' + encodeURIComponent(paymentId));
}

/** Payments created between two dates (at most 100 per call; use `skip` to page). */
export function listRazorpayPayments(from: Date, to: Date, skip = 0) {
  const params = new URLSearchParams({
    from: String(Math.floor(from.getTime() / 1000)),
    to: String(Math.floor(to.getTime() / 1000)),
    count: '100',
    skip: String(skip),
  });
  return call<{ count: number; items: RazorpayPayment[] }>('GET', '/payments?' + params.toString());
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

/** Refunds part or all of a captured payment. The amount is in rupees. */
export function createRazorpayRefund(paymentId: string, amountRupees: number, notes: Record<string, string> = {}) {
  return call<RazorpayRefund>('POST', '/payments/' + encodeURIComponent(paymentId) + '/refund', {
    amount: toPaise(amountRupees),
    notes,
  });
}

/* ------------------------------------------------------------------ */
/* Settlements (what Razorpay paid into the merchant's bank account)   */
/* ------------------------------------------------------------------ */

export interface RazorpaySettlement {
  id: string;
  /** Paise transferred to the bank account. */
  amount: number;
  status: string;
  /** Paise. Total fees and the tax on them deducted from this settlement. */
  fees?: number;
  tax?: number;
  utr?: string | null;
  created_at: number;
}

/** Settlements created between two dates (at most 100 per call; use `skip` to page). */
export function listRazorpaySettlements(from: Date, to: Date, skip = 0) {
  const params = new URLSearchParams({
    from: String(Math.floor(from.getTime() / 1000)),
    to: String(Math.floor(to.getTime() / 1000)),
    count: '100',
    skip: String(skip),
  });
  return call<{ count: number; items: RazorpaySettlement[] }>('GET', '/settlements?' + params.toString());
}

/** One line of the settlement reconciliation report: a payment, refund or adjustment inside a settlement. */
export interface RazorpaySettlementReconItem {
  entity_id: string;
  type: string;
  /** Paise. */
  debit: number;
  credit: number;
  amount: number;
  fee: number;
  tax: number;
  currency?: string;
  settled?: boolean;
  on_hold?: boolean;
  created_at?: number;
  settled_at?: number;
  settlement_id: string | null;
  settlement_utr?: string | null;
  payment_id?: string | null;
  order_id?: string | null;
}

export const SETTLEMENT_RECON_PAGE = 1000;

/**
 * The transactions settled on one day (India time), with the settlement each
 * one went into (at most 1000 per call; use `skip` to page).
 */
export function fetchRazorpaySettlementRecon(year: number, month: number, day: number, skip = 0) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    day: String(day),
    count: String(SETTLEMENT_RECON_PAGE),
    skip: String(skip),
  });
  return call<{ count: number; items: RazorpaySettlementReconItem[] }>('GET', '/settlements/recon/combined?' + params.toString());
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Confirms that a checkout result really came from Razorpay: the signature is
 * HMAC-SHA256 of "<order_id>|<payment_id>" with the key secret.
 */
export async function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const config = await getRazorpayConfig();
  if (!config.keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', config.keySecret).update(orderId + '|' + paymentId).digest('hex');
  return safeEqual(expected, signature);
}

/** Confirms a webhook delivery: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
