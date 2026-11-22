import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { getRazorpayConfig } from '@/lib/razorpay';
import { fetchRazorpayPayment, listRazorpayPayments, type RazorpayPayment } from '@/lib/razorpay-api';
import { BookingError, confirmPaidBooking } from '@/lib/bookings';
import { afterPaymentConfirmed, logPaymentEvent } from '@/app/api/payment/shared';
import {
  buildExportCsv,
  csvDownload,
  ensureIndexes,
  exportFilename,
  resolveRange,
  type ReportColumn,
} from '@/lib/reporting';

export const dynamic = 'force-dynamic';

const GATEWAY_CAP = 1000;
const LEDGER_CAP = 5000;
const LISTED_MATCHES = 500;

type Category = 'matched' | 'amount_mismatch' | 'gateway_only' | 'ledger_only' | 'not_compared';

interface Row {
  category: Category;
  gatewayPaymentId: string;
  ledgerReference: string;
  ledgerStatus: string;
  ledgerAmount: number | null;
  ledgerCreatedAt: Date | null;
  gatewayStatus: string;
  gatewayAmount: number | null;
  gatewayCreatedAt: Date | null;
  amountDifference: number | null;
  gatewayFee: number | null;
  gatewayTax: number | null;
  ledgerGatewayFee: number | null;
  feeDifference: number | null;
  note: string;
  /** For a payment missing from the ledger: the booking its gateway order was created for, if any. */
  gatewayOrderId?: string | null;
  bookingId?: string | null;
  bookingStatus?: string | null;
}

const CATEGORY_LABEL: Record<Category, string> = {
  matched: 'Matched',
  amount_mismatch: 'Amount mismatch',
  gateway_only: 'In the gateway, missing from the ledger',
  ledger_only: 'In the ledger, not at the gateway',
  not_compared: 'Not compared (gateway unavailable)',
};

const EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'categoryLabel', label: 'Result', type: 'text' },
  { key: 'gatewayPaymentId', label: 'Gateway payment ID', type: 'text' },
  { key: 'ledgerReference', label: 'Ledger reference', type: 'text' },
  { key: 'ledgerStatus', label: 'Ledger status', type: 'text' },
  { key: 'ledgerAmount', label: 'Ledger amount', type: 'money' },
  { key: 'ledgerCreatedAt', label: 'Ledger date (IST)', type: 'datetime' },
  { key: 'gatewayStatus', label: 'Gateway status', type: 'text' },
  { key: 'gatewayAmount', label: 'Gateway amount', type: 'money' },
  { key: 'gatewayCreatedAt', label: 'Gateway date (IST)', type: 'datetime' },
  { key: 'amountDifference', label: 'Amount difference (gateway - ledger)', type: 'money' },
  { key: 'gatewayFee', label: 'Gateway fee (incl. tax)', type: 'money' },
  { key: 'gatewayTax', label: 'Gateway tax', type: 'money' },
  { key: 'ledgerGatewayFee', label: 'Ledger gateway fee', type: 'money' },
  { key: 'feeDifference', label: 'Fee difference (gateway - ledger)', type: 'money' },
  { key: 'note', label: 'Note', type: 'text' },
];

const rupees = (paise: number | undefined | null) => (typeof paise === 'number' ? roundMoney(paise / 100) : null);

async function webhookHealth(db: any) {
  const events = db.collection('webhookEvents');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // A processing error is a genuine delivery (valid signature) whose handler did not finish.
  const failedProcessing = { signatureValid: true, processed: { $ne: true } };
  const [last, total, last24h, invalid, invalid24h, errors, errors24h, recent, failing] = await Promise.all([
    events.find({}).project({ receivedAt: 1, event: 1, signatureValid: 1, processed: 1 }).sort({ receivedAt: -1 }).limit(1).next(),
    events.estimatedDocumentCount(),
    events.countDocuments({ receivedAt: { $gte: since } }),
    events.countDocuments({ signatureValid: false }),
    events.countDocuments({ signatureValid: false, receivedAt: { $gte: since } }),
    events.countDocuments(failedProcessing),
    events.countDocuments({ ...failedProcessing, receivedAt: { $gte: since } }),
    events.find({}).project({ payload: 0 }).sort({ receivedAt: -1 }).limit(25).toArray(),
    events.find(failedProcessing).project({ payload: 0 }).sort({ receivedAt: -1 }).limit(50).toArray(),
  ]);
  const present = (event: any) => ({
    ...event,
    _id: String(event._id),
    canReplay: event.signatureValid === true && event.processed !== true,
  });
  return {
    total,
    lastDeliveryAt: last?.receivedAt || null,
    lastEvent: last?.event || null,
    lastResult: !last ? null : last.signatureValid === false ? 'signature refused' : last.processed ? 'processed' : 'not processed',
    last24h,
    invalidSignatures: invalid,
    invalidSignatures24h: invalid24h,
    processingErrors: errors,
    processingErrors24h: errors24h,
    recent: recent.map(present),
    // Every delivery still waiting to be processed, however old, so none is lost below the recent list.
    failing: failing.map(present),
  };
}

/** Razorpay payments against ledger payment entries for a date range, plus webhook health. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const range = resolveRange(params, '7d');
  if (typeof range === 'string') return fail(range);

  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);
    const transactions = db.collection('transactions');

    /* ---- ledger side ------------------------------------------------ */
    const ledgerMatch = { type: 'payment', createdAt: { $gte: range.start, $lt: range.end } };
    const [ledgerPayments, ledgerCount, ledgerByStatus] = await Promise.all([
      transactions.find(ledgerMatch).sort({ createdAt: -1 }).limit(LEDGER_CAP).toArray(),
      transactions.countDocuments(ledgerMatch),
      transactions
        .aggregate([{ $match: ledgerMatch }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }])
        .toArray(),
    ]);

    /* ---- gateway side ----------------------------------------------- */
    const config = await getRazorpayConfig();
    const gatewayItems: RazorpayPayment[] = [];
    let gatewayError: string | null = null;
    let notConfigured = !config.isConfigured || !config.enabled;
    let gatewayTruncated = false;

    if (!notConfigured) {
      for (let skip = 0; skip < GATEWAY_CAP; skip += 100) {
        const result = await listRazorpayPayments(range.start, range.end, skip);
        if (!result.ok || !result.data) {
          gatewayError = result.error || 'The gateway did not return any data.';
          notConfigured = Boolean(result.notConfigured);
          break;
        }
        gatewayItems.push(...result.data.items);
        if (result.data.items.length < 100) break;
        if (skip + 100 >= GATEWAY_CAP) gatewayTruncated = true;
      }
    } else {
      gatewayError = !config.isConfigured
        ? 'The payment gateway is not configured. Save the Razorpay keys in Settings.'
        : 'Online payments are switched off in Settings.';
    }
    const compared = !gatewayError;

    /* ---- ledger entries the comparison needs ------------------------- */
    const byGatewayId = new Map<string, any>();
    for (const payment of ledgerPayments) {
      if (payment.gatewayPaymentId) byGatewayId.set(String(payment.gatewayPaymentId), payment);
    }
    // A gateway payment made just inside the range can have a ledger entry
    // dated just outside it, so look those up by id before calling it missing.
    const outside = gatewayItems.map((item) => item.id).filter((id) => !byGatewayId.has(id));
    const outsideRange = new Set<string>();
    if (outside.length) {
      const found = await transactions.find({ type: 'payment', gatewayPaymentId: { $in: outside } }).toArray();
      for (const payment of found) {
        byGatewayId.set(String(payment.gatewayPaymentId), payment);
        outsideRange.add(String(payment.gatewayPaymentId));
      }
    }

    const references = Array.from(byGatewayId.values())
      .map((p) => p.reference)
      .concat(ledgerPayments.map((p) => p.reference));
    const feeRows = references.length
      ? await transactions
          .aggregate([
            { $match: { type: 'gateway_fee', parentReference: { $in: Array.from(new Set(references)) } } },
            { $group: { _id: '$parentReference', total: { $sum: '$amount' } } },
          ])
          .toArray()
      : [];
    const ledgerFee = new Map(feeRows.map((row) => [String(row._id), roundMoney(row.total)]));

    /* ---- comparison -------------------------------------------------- */
    const rows: Row[] = [];
    const ledgerSide = (payment: any) => ({
      ledgerReference: payment?.reference || '',
      ledgerStatus: payment?.status || '',
      ledgerAmount: payment ? roundMoney(Number(payment.amount) || 0) : null,
      ledgerCreatedAt: payment?.createdAt || null,
      ledgerGatewayFee: payment ? ledgerFee.get(payment.reference) ?? 0 : null,
    });

    let recordedByHand = 0;
    if (compared) {
      const seen = new Set<string>();
      const counted = ['success', 'refunded', 'disputed'];
      for (const item of gatewayItems) {
        const payment = byGatewayId.get(item.id);
        const gatewayAmount = rupees(item.amount);
        const received = item.status === 'captured' || item.status === 'refunded';
        const inLedgerAsMoney = Boolean(payment) && counted.includes(payment.status);
        if (payment) seen.add(item.id);
        // Attempts the gateway never captured are not expected in the ledger
        // as money, and a failed attempt recorded as failed agrees.
        if (!received && !inLedgerAsMoney) continue;

        const side = ledgerSide(payment);
        const amountDifference = payment && gatewayAmount !== null ? roundMoney(gatewayAmount - (side.ledgerAmount || 0)) : null;
        const gatewayFee = rupees(item.fee);
        const base = {
          gatewayPaymentId: item.id,
          ...side,
          gatewayStatus: item.status,
          gatewayAmount,
          gatewayCreatedAt: new Date(item.created_at * 1000),
          gatewayFee,
          gatewayTax: rupees(item.tax),
          gatewayOrderId: item.order_id || null,
        };

        if (received && !inLedgerAsMoney) {
          rows.push({
            ...base,
            category: 'gateway_only',
            amountDifference: null,
            feeDifference: null,
            note: payment
              ? `The gateway captured this payment, but the ledger has it as ${payment.status}. Nothing is counted for it.`
              : 'The gateway captured this payment, but the ledger has no entry for it.',
          });
          continue;
        }
        if (!received) {
          rows.push({
            ...base,
            category: 'ledger_only',
            amountDifference: null,
            feeDifference: null,
            note: `The ledger counts this payment, but the gateway reports it as ${item.status}.`,
          });
          continue;
        }
        rows.push({
          ...base,
          category: amountDifference ? 'amount_mismatch' : 'matched',
          amountDifference,
          feeDifference: gatewayFee !== null ? roundMoney(gatewayFee - (side.ledgerGatewayFee || 0)) : null,
          note: outsideRange.has(item.id) ? 'The ledger entry is dated outside the chosen range.' : '',
        });
      }

      for (const payment of ledgerPayments) {
        const id = payment.gatewayPaymentId ? String(payment.gatewayPaymentId) : '';
        if (id && seen.has(id)) continue;
        // Only entries that claim money was received must exist at the gateway.
        if (!counted.includes(payment.status)) continue;
        // Payments recorded by hand never went through the gateway.
        if (payment.meta?.source === 'recorded_by_admin') {
          recordedByHand++;
          continue;
        }
        rows.push({
          category: 'ledger_only',
          gatewayPaymentId: id,
          ...ledgerSide(payment),
          gatewayStatus: '',
          gatewayAmount: null,
          gatewayCreatedAt: null,
          amountDifference: null,
          gatewayFee: null,
          gatewayTax: null,
          feeDifference: null,
          note: id ? 'The gateway did not list this payment for the chosen range.' : 'The ledger entry has no gateway payment ID.',
        });
      }

      // Which booking each payment missing from the ledger was meant for.
      const missing = rows.filter((row) => row.category === 'gateway_only' && row.gatewayOrderId);
      if (missing.length) {
        const bookings = await db
          .collection('bookings')
          .find({ gatewayOrderId: { $in: missing.map((row) => row.gatewayOrderId) } })
          .project({ gatewayOrderId: 1, status: 1 })
          .toArray();
        const byOrder = new Map(bookings.map((booking) => [String(booking.gatewayOrderId), booking]));
        for (const row of missing) {
          const booking = byOrder.get(String(row.gatewayOrderId));
          row.bookingId = booking ? String(booking._id) : null;
          row.bookingStatus = booking?.status || null;
        }
      }
    } else {
      for (const payment of ledgerPayments) {
        rows.push({
          category: 'not_compared',
          gatewayPaymentId: payment.gatewayPaymentId ? String(payment.gatewayPaymentId) : '',
          ...ledgerSide(payment),
          gatewayStatus: '',
          gatewayAmount: null,
          gatewayCreatedAt: null,
          amountDifference: null,
          gatewayFee: null,
          gatewayTax: null,
          feeDifference: null,
          note: '',
        });
      }
    }

    const summarise = (category: Category) => {
      const own = rows.filter((row) => row.category === category);
      return {
        count: own.length,
        ledgerAmount: roundMoney(own.reduce((t, r) => t + (r.ledgerAmount || 0), 0)),
        gatewayAmount: roundMoney(own.reduce((t, r) => t + (r.gatewayAmount || 0), 0)),
      };
    };
    const comparedRows = rows.filter((row) => row.category === 'matched' || row.category === 'amount_mismatch');
    const summary = {
      matched: summarise('matched'),
      amountMismatch: summarise('amount_mismatch'),
      gatewayOnly: summarise('gateway_only'),
      ledgerOnly: summarise('ledger_only'),
      notCompared: summarise('not_compared'),
      fees: {
        gatewayFee: roundMoney(comparedRows.reduce((t, r) => t + (r.gatewayFee || 0), 0)),
        gatewayTax: roundMoney(comparedRows.reduce((t, r) => t + (r.gatewayTax || 0), 0)),
        ledgerGatewayFee: roundMoney(comparedRows.reduce((t, r) => t + (r.ledgerGatewayFee || 0), 0)),
        paymentsWithFeeDifference: comparedRows.filter((r) => r.feeDifference).length,
      },
    };

    const notes: string[] = [];
    if (recordedByHand > 0) {
      notes.push(
        `${recordedByHand} ledger ${recordedByHand === 1 ? 'payment was' : 'payments were'} recorded by hand in the admin panel (memberships, courses, advertising). They never went through the gateway, so they are not compared.`
      );
    }
    if (gatewayTruncated) {
      notes.push(
        `The gateway returned more than ${GATEWAY_CAP} payments for this range. Only the newest ${GATEWAY_CAP} were compared, so "not at the gateway" results may be wrong. Choose a shorter range.`
      );
    }
    if (ledgerCount > LEDGER_CAP) {
      notes.push(`The ledger has ${ledgerCount} payments in this range. Only the newest ${LEDGER_CAP} were compared. Choose a shorter range.`);
    }

    if (params.get('format') === 'csv') {
      const mismatches = rows.filter((row) => row.category !== 'matched');
      const csv = buildExportCsv({
        name: compared ? 'Reconciliation mismatches' : 'Reconciliation: ledger payments (gateway not compared)',
        rangeLabel: range.label,
        generatedBy: check.admin.email,
        summary: [
          { label: 'Matched', value: summary.matched.count, type: 'number' },
          { label: 'Amount mismatches', value: summary.amountMismatch.count, type: 'number' },
          { label: 'In the gateway, missing from the ledger', value: summary.gatewayOnly.count, type: 'number' },
          { label: 'In the ledger, not at the gateway', value: summary.ledgerOnly.count, type: 'number' },
        ],
        columns: EXPORT_COLUMNS,
        rows: mismatches.map((row) => ({ ...row, categoryLabel: CATEGORY_LABEL[row.category] })),
        notes: [
          ...(gatewayError ? ['The gateway was not compared: ' + gatewayError] : []),
          "The gateway's fee includes the tax shown beside it. Gateway amounts are converted from paise to rupees.",
          ...notes,
        ],
      });
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'finance',
        entityType: 'reconciliation',
        entityLabel: 'Reconciliation mismatches',
        meta: { dateRange: range.label, rows: mismatches.length, compared },
        request,
      });
      return csvDownload(csv, exportFilename('reconciliation', range.label));
    }

    const matched = rows.filter((row) => row.category === 'matched');
    return ok({
      range: { preset: range.preset, from: range.from, to: range.to, label: range.label },
      gateway: {
        configured: config.isConfigured,
        enabled: config.enabled,
        mode: config.mode,
        compared,
        error: gatewayError,
        notConfigured,
        fetched: gatewayItems.length,
        truncated: gatewayTruncated,
        byStatus: ['captured', 'refunded', 'authorized', 'created', 'failed'].map((status) => {
          const own = gatewayItems.filter((item) => item.status === status);
          return { status, count: own.length, total: roundMoney(own.reduce((t, item) => t + item.amount, 0) / 100) };
        }),
      },
      ledger: {
        payments: ledgerCount,
        byStatus: ledgerByStatus.map((row) => ({ status: String(row._id), count: row.count, total: roundMoney(row.total) })),
      },
      summary,
      mismatches: rows.filter((row) => row.category !== 'matched'),
      matched: matched.slice(0, LISTED_MATCHES),
      matchedListed: Math.min(matched.length, LISTED_MATCHES),
      notes,
      webhooks: await webhookHealth(db),
    });
  } catch (error) {
    console.error('Reconciliation failed:', error);
    return fail('Could not run the reconciliation.', 500);
  }
}

/**
 * Repairs a payment the gateway captured but the ledger does not have
 * ('finance:manage'). The payment is fetched from the gateway again, and the
 * booking its order belongs to is confirmed through exactly the code the
 * webhook uses, so the booking, the ledger entries and the charges come out
 * the same as if the webhook had arrived.
 *
 *   { action: 'confirm_payment', gatewayPaymentId, reason }
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null);
  const action = asString(body?.action, 40);
  const gatewayPaymentId = asString(body?.gatewayPaymentId, 80);
  const reason = asString(body?.reason, 500);
  if (action !== 'confirm_payment') return fail('Unknown action.');
  if (!/^[A-Za-z0-9_]{6,80}$/.test(gatewayPaymentId)) return fail('A valid gateway payment ID is required.');
  if (reason.length < 5) return fail('A reason of at least 5 characters is required.');

  try {
    const { db } = await connectToDatabase();
    const fetched = await fetchRazorpayPayment(gatewayPaymentId);
    if (!fetched.ok || !fetched.data) {
      return fail(fetched.error || 'The gateway did not return this payment.', fetched.notConfigured ? 503 : fetched.status === 400 || fetched.status === 404 ? 404 : 502);
    }
    const payment = fetched.data;
    if (payment.status !== 'captured') {
      return fail(`The gateway reports this payment as ${payment.status}, not captured, so it cannot be confirmed.`, 409);
    }
    const booking = payment.order_id ? await db.collection('bookings').findOne({ gatewayOrderId: payment.order_id }) : null;
    if (!booking) {
      return fail(
        'No booking was created for the order this payment belongs to, so there is nothing to confirm. If the customer should not have been charged, refund the payment from the Razorpay dashboard.',
        404
      );
    }

    const amount = roundMoney(payment.amount / 100);
    const audit = (outcome: string, extra: Record<string, any> = {}) =>
      logAudit({
        admin: check.admin,
        action: 'reconcile_confirm_payment',
        module: 'finance',
        entityType: 'booking',
        entityId: String(booking._id),
        entityLabel: `${booking.eventTitle || 'Booking'} · ${gatewayPaymentId}`,
        before: { status: booking.status ?? null, paymentStatus: booking.paymentStatus ?? null },
        after: { outcome, ...extra },
        reason,
        meta: { gatewayPaymentId, gatewayOrderId: payment.order_id, amount },
        request,
      });
    const trace = { bookingId: String(booking._id), gatewayOrderId: payment.order_id, gatewayPaymentId, amount, actor: check.admin.email || null };

    try {
      const result = await confirmPaidBooking(
        db,
        booking,
        { id: payment.id, orderId: payment.order_id, amountPaise: payment.amount, method: payment.method || null },
        'reconciliation'
      );
      if (result.outcome === 'confirmed' || result.outcome === 'already_confirmed') {
        await afterPaymentConfirmed(db, result.booking, 'reconciliation');
      }
      const entry = await db.collection('transactions').findOne({ type: 'payment', gatewayPaymentId });
      await audit(result.outcome, {
        status: result.booking?.status ?? null,
        paymentStatus: result.booking?.paymentStatus ?? null,
        ledgerReference: entry?.reference || null,
      });
      await logPaymentEvent(db, {
        ...trace,
        kind: 'admin_action',
        outcome: entry ? 'ok' : 'failed',
        message: 'Confirmed from reconciliation: ' + result.outcome.replace(/_/g, ' '),
        reference: entry?.reference || null,
      });
      if (!entry) {
        return fail(
          'The booking is already confirmed with this payment, but no ledger entry could be written for it yet. Try again in a minute.',
          409,
          { outcome: result.outcome, bookingId: String(booking._id) }
        );
      }
      return ok({
        outcome: result.outcome,
        bookingId: String(booking._id),
        reference: entry.reference,
        message:
          result.outcome === 'late_refund'
            ? `The payment is now in the ledger as ${entry.reference}. The seats were no longer available, so the booking was cancelled and a full refund request was opened.`
            : `The payment is now in the ledger as ${entry.reference} and the booking is confirmed.`,
      });
    } catch (error) {
      if (error instanceof BookingError) {
        await audit('refused', { error: error.message });
        await logPaymentEvent(db, { ...trace, kind: 'admin_action', outcome: 'refused', message: 'Confirm from reconciliation refused: ' + error.message });
        return fail(error.message, error.status);
      }
      throw error;
    }
  } catch (error) {
    console.error('Reconciliation action failed:', error);
    return fail('Could not confirm the payment.', 500);
  }
}
