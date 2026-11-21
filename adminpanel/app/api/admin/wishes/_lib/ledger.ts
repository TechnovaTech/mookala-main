import type { Db } from 'mongodb';
import { wishOrderKey } from '@/lib/resources/wishes.hooks';

/**
 * Compares wish orders with the finance ledger. Every order that was marked
 * paid must have one `payment` entry, and every refunded one a `refund` entry
 * (both written by the hooks in lib/resources/wishes.hooks.ts).
 */

export interface LedgerGap {
  id: string;
  kind: 'template' | 'custom';
  status: string;
  customerName: string;
  recipientName: string;
  amount: number;
  missing: 'payment' | 'refund';
  /** Why the entry cannot be written automatically, when it cannot. */
  blocked: string | null;
}

export interface LedgerPicture {
  payments: number;
  refunds: number;
  commission: number;
  gst: number;
  gatewayFee: number;
  /** payments - refunds */
  net: number;
  /** Payments on custom wishes, owed on to artists before commission. */
  owedToArtistsGross: number;
  entries: number;
  gaps: LedgerGap[];
}

export async function ledgerPicture(db: Db, orders: any[]): Promise<LedgerPicture> {
  const paidOrders = orders.filter((order) => order.paidAt);
  const keys = paidOrders.map((order) => wishOrderKey(order._id));
  const entries = keys.length
    ? await db
        .collection('transactions')
        .find({ service: 'wishes', status: 'success', 'meta.recordKey': { $in: keys } })
        .project({ type: 1, amount: 1, payeeType: 1, 'meta.recordKey': 1 })
        .toArray()
    : [];

  const picture: LedgerPicture = { payments: 0, refunds: 0, commission: 0, gst: 0, gatewayFee: 0, net: 0, owedToArtistsGross: 0, entries: entries.length, gaps: [] };
  const hasPayment = new Set<string>();
  const hasRefund = new Set<string>();
  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    const key = String(entry.meta?.recordKey || '');
    if (entry.type === 'payment') {
      picture.payments += amount;
      hasPayment.add(key);
      if (entry.payeeType === 'artist') picture.owedToArtistsGross += amount;
    } else if (entry.type === 'refund') {
      picture.refunds += amount;
      hasRefund.add(key);
    } else if (entry.type === 'commission') picture.commission += amount;
    else if (entry.type === 'gst') picture.gst += amount;
    else if (entry.type === 'gateway_fee') picture.gatewayFee += amount;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  picture.payments = round(picture.payments);
  picture.refunds = round(picture.refunds);
  picture.commission = round(picture.commission);
  picture.gst = round(picture.gst);
  picture.gatewayFee = round(picture.gatewayFee);
  picture.owedToArtistsGross = round(picture.owedToArtistsGross);
  picture.net = round(picture.payments - picture.refunds);

  for (const order of paidOrders) {
    const key = wishOrderKey(order._id);
    const base = {
      id: String(order._id),
      kind: (order.kind === 'custom' ? 'custom' : 'template') as 'template' | 'custom',
      status: String(order.status || ''),
      customerName: String(order.customerName || ''),
      recipientName: String(order.recipientName || ''),
      amount: Number(order.amount) || 0,
    };
    if (!hasPayment.has(key)) {
      let blocked: string | null = null;
      if (!(base.amount > 0)) blocked = 'The order has no amount.';
      else if (order.kind === 'custom' && !order.artistId) blocked = 'No approved artist is assigned, so there is nobody to record the payment for.';
      else if (order.status === 'cancelled') blocked = 'Cancelled after payment with no refund recorded: decide whether the money was returned.';
      picture.gaps.push({ ...base, missing: 'payment', blocked });
    } else if (order.status === 'refunded' && !hasRefund.has(key)) {
      picture.gaps.push({ ...base, missing: 'refund', blocked: null });
    }
  }
  return picture;
}
