import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { getRazorpayConfig } from '@/lib/razorpay';
import {
  SETTLEMENT_RECON_PAGE,
  fetchRazorpaySettlementRecon,
  listRazorpaySettlements,
  type RazorpaySettlement,
  type RazorpaySettlementReconItem,
} from '@/lib/razorpay-api';
import { addDays, resolveRange, type DateRange } from '@/lib/reporting';

export const dynamic = 'force-dynamic';

/**
 * Gateway settlement matching.
 *
 * Razorpay does not pay the merchant per payment: it transfers captured
 * payments to the bank account in settlements, each with a UTR, after taking
 * its fee and the tax on it. This route fetches those settlements and the
 * settlement reconciliation report (which payments, refunds and adjustments
 * each settlement contained), stores them in `gatewaySettlements` and
 * `gatewaySettlementItems`, and matches every settled payment to its ledger
 * entry by gateway payment id. A matched ledger payment is stamped with the
 * settlement id, the UTR and the fee and tax the gateway actually charged.
 *
 * (These are the gateway's payouts to the platform. The platform's own payouts
 * to organisers and artists are under Finance -> Settlements.)
 */

const MAX_SYNC_DAYS = 62;
const SETTLEMENT_CAP = 2000;
const ITEM_CAP = 20000;
const LISTED_UNSETTLED = 200;
const LISTED_ITEMS = 50;
const SYNC_KEY = 'gatewaySettlements';

const rupees = (paise: unknown) => (typeof paise === 'number' && Number.isFinite(paise) ? roundMoney(paise / 100) : 0);
const seconds = (value: unknown) => (typeof value === 'number' && value > 0 ? new Date(value * 1000) : null);

let indexes: Promise<unknown> | null = null;
function ensureSettlementIndexes(db: Db) {
  if (!indexes) {
    indexes = Promise.all([
      db.collection('gatewaySettlements').createIndex({ provider: 1, settlementId: 1 }, { unique: true }),
      db.collection('gatewaySettlements').createIndex({ settledAt: -1 }),
      db.collection('gatewaySettlementItems').createIndex({ settlementId: 1, entityId: 1 }, { unique: true }),
      db.collection('gatewaySettlementItems').createIndex({ paymentId: 1 }, { sparse: true }),
      db.collection('transactions').createIndex({ gatewaySettlementId: 1 }, { sparse: true }),
    ]).catch((error) => {
      indexes = null;
      console.error('Could not create the gateway settlement indexes:', error?.message || error);
    });
  }
  return indexes;
}

/** Links stored settlement lines to ledger payments, both ways. Safe to repeat. */
async function matchItems(db: Db, settlementIds: string[]): Promise<number> {
  if (settlementIds.length === 0) return 0;
  const items = db.collection('gatewaySettlementItems');
  const transactions = db.collection('transactions');
  const open = await items
    .find({ settlementId: { $in: settlementIds }, type: 'payment', ledgerReference: { $in: [null] }, paymentId: { $type: 'string' } })
    .limit(ITEM_CAP)
    .toArray();
  if (open.length === 0) return 0;

  const payments = await transactions
    .find({ type: 'payment', gatewayPaymentId: { $in: open.map((item) => String(item.paymentId)) } })
    .project({ reference: 1, gatewayPaymentId: 1, amount: 1, status: 1 })
    .toArray();
  const byId = new Map(payments.map((payment) => [String(payment.gatewayPaymentId), payment]));

  let matched = 0;
  for (const item of open) {
    const payment = byId.get(String(item.paymentId));
    // A failed attempt in the ledger is not the payment the gateway settled.
    if (!payment || payment.status === 'failed' || payment.status === 'pending') continue;
    await items.updateOne(
      { _id: item._id },
      { $set: { ledgerReference: payment.reference, ledgerAmount: roundMoney(Number(payment.amount) || 0), matchedAt: new Date() } }
    );
    await transactions.updateOne(
      { _id: payment._id },
      {
        $set: {
          gatewaySettlementId: item.settlementId,
          gatewaySettlementUtr: item.utr || null,
          gatewaySettledAt: item.settledAt || null,
          gatewayFeeCharged: item.fee,
          gatewayTaxCharged: item.tax,
        },
      }
    );
    matched++;
  }
  return matched;
}

function storedRange(range: DateRange) {
  return { settledAt: { $gte: range.start, $lt: range.end } };
}

/**
 * GET ('finance:view'): the settlements stored for a date range with what
 * each contained, and the ledger payments of the same range with whether the
 * gateway has settled them. Nothing is fetched from the gateway here.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const range = resolveRange(request.nextUrl.searchParams, 'month');
  if (typeof range === 'string') return fail(range);

  try {
    const { db } = await connectToDatabase();
    await ensureSettlementIndexes(db);
    const config = await getRazorpayConfig();

    const settlements = await db.collection('gatewaySettlements').find(storedRange(range)).sort({ settledAt: -1 }).limit(SETTLEMENT_CAP).toArray();
    const ids = settlements.map((settlement) => String(settlement.settlementId));
    // Payments confirmed after the last fetch are linked now.
    await matchItems(db, ids);

    const items = ids.length
      ? await db.collection('gatewaySettlementItems').find({ settlementId: { $in: ids } }).limit(ITEM_CAP).toArray()
      : [];
    const references = items.map((item) => item.ledgerReference).filter(Boolean) as string[];
    const feeRows = references.length
      ? await db
          .collection('transactions')
          .aggregate([
            // The fee entry of a disputed payment is set aside, not gone, so it is still compared.
            { $match: { type: 'gateway_fee', parentReference: { $in: references }, status: { $in: ['success', 'disputed', 'refunded'] } } },
            { $group: { _id: '$parentReference', total: { $sum: '$amount' } } },
          ])
          .toArray()
      : [];
    const ledgerFeeOf = new Map(feeRows.map((row) => [String(row._id), roundMoney(row.total)]));

    const rows = settlements.map((settlement) => {
      const own = items.filter((item) => item.settlementId === settlement.settlementId);
      const payments = own.filter((item) => item.type === 'payment');
      const matched = payments.filter((item) => item.ledgerReference);
      const unmatched = payments.filter((item) => !item.ledgerReference);
      const others = own.filter((item) => item.type !== 'payment');
      const sum = (list: any[], key: string) => roundMoney(list.reduce((total, item) => total + (Number(item[key]) || 0), 0));
      const itemsNet = roundMoney(sum(own, 'credit') - sum(own, 'debit'));
      const ledgerFees = roundMoney(matched.reduce((total, item) => total + (ledgerFeeOf.get(String(item.ledgerReference)) || 0), 0));
      const gatewayFees = sum(payments, 'fee');
      const amountMismatches = matched.filter((item) => Math.abs((Number(item.amount) || 0) - (Number(item.ledgerAmount) || 0)) >= 0.005);
      return {
        settlementId: settlement.settlementId,
        utr: settlement.utr || null,
        status: settlement.status || null,
        settledAt: settlement.settledAt || null,
        amount: settlement.amount ?? null,
        fees: settlement.fees ?? null,
        tax: settlement.tax ?? null,
        fetchedAt: settlement.fetchedAt || null,
        lines: own.length,
        payments: payments.length,
        paymentsGross: sum(payments, 'amount'),
        matched: matched.length,
        unmatched: unmatched.length,
        refunds: others.filter((item) => item.type === 'refund').length,
        otherLines: others.filter((item) => item.type !== 'refund').length,
        debits: sum(others, 'debit'),
        itemsNet,
        // What the lines add up to against what the bank received.
        netDifference: settlement.amount == null ? null : roundMoney(itemsNet - Number(settlement.amount)),
        gatewayFees,
        gatewayTax: sum(payments, 'tax'),
        matchedGatewayFees: sum(matched, 'fee'),
        ledgerFees,
        feeDifference: roundMoney(sum(matched, 'fee') - ledgerFees),
        amountMismatches: amountMismatches.length,
        unmatchedItems: unmatched.slice(0, LISTED_ITEMS).map((item) => ({
          paymentId: item.paymentId,
          orderId: item.orderId || null,
          amount: item.amount,
          fee: item.fee,
          tax: item.tax,
        })),
        mismatchedItems: amountMismatches.slice(0, LISTED_ITEMS).map((item) => ({
          paymentId: item.paymentId,
          ledgerReference: item.ledgerReference,
          amount: item.amount,
          ledgerAmount: item.ledgerAmount,
        })),
      };
    });

    /* ---- the ledger's side: has the gateway settled each payment? ---- */
    const ledgerFilter = {
      type: 'payment',
      status: { $in: ['success', 'disputed', 'refunded'] },
      gatewayPaymentId: { $type: 'string' },
      createdAt: { $gte: range.start, $lt: range.end },
    };
    const transactions = db.collection('transactions');
    const [grouped, unsettled] = await Promise.all([
      transactions
        .aggregate([
          { $match: ledgerFilter },
          {
            $group: {
              _id: { $cond: [{ $eq: [{ $type: '$gatewaySettlementId' }, 'string'] }, 'settled', 'unsettled'] },
              count: { $sum: 1 },
              total: { $sum: '$amount' },
            },
          },
        ])
        .toArray(),
      transactions
        .find({ ...ledgerFilter, gatewaySettlementId: { $not: { $type: 'string' } } })
        .project({ reference: 1, gatewayPaymentId: 1, amount: 1, status: 1, createdAt: 1, bookingId: 1 })
        .sort({ createdAt: 1 })
        .limit(LISTED_UNSETTLED)
        .toArray(),
    ]);
    const bucket = (key: string) => {
      const row = grouped.find((entry) => entry._id === key);
      return { count: row?.count || 0, total: roundMoney(row?.total || 0) };
    };

    const marker = await db.collection('syncState').findOne({ key: SYNC_KEY });
    const total = (key: keyof (typeof rows)[number]) => roundMoney(rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));

    return ok({
      range: { preset: range.preset, from: range.from, to: range.to, label: range.label, days: range.days },
      gateway: {
        configured: config.isConfigured,
        enabled: config.enabled,
        mode: config.mode,
        usable: config.isConfigured && config.enabled,
        message: !config.isConfigured
          ? 'The payment gateway is not configured. Save the Razorpay keys in Settings.'
          : !config.enabled
          ? 'Online payments are switched off in Settings, so the gateway cannot be read.'
          : null,
      },
      lastFetch: marker
        ? { at: marker.fetchedAt || null, by: marker.fetchedBy || null, range: marker.rangeLabel || null, error: marker.error || null }
        : null,
      maxFetchDays: MAX_SYNC_DAYS,
      settlements: rows,
      totals: {
        settlements: rows.length,
        amount: total('amount'),
        payments: rows.reduce((sum, row) => sum + row.payments, 0),
        matched: rows.reduce((sum, row) => sum + row.matched, 0),
        unmatched: rows.reduce((sum, row) => sum + row.unmatched, 0),
        gatewayFees: total('gatewayFees'),
        gatewayTax: total('gatewayTax'),
        matchedGatewayFees: total('matchedGatewayFees'),
        ledgerFees: total('ledgerFees'),
      },
      ledger: {
        settled: bucket('settled'),
        unsettled: bucket('unsettled'),
        unsettledListed: unsettled.map((payment) => ({ ...payment, _id: String(payment._id) })),
      },
    });
  } catch (error) {
    console.error('Gateway settlements failed:', error);
    return fail('Could not load the gateway settlements.', 500);
  }
}

/**
 * POST ('finance:manage') { action: 'fetch', preset | from, to, reason? }
 * Fetches the settlements and their contents from Razorpay for the range,
 * stores them and matches them to the ledger.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null);
  if (asString(body?.action, 20) !== 'fetch') return fail('Unknown action.');
  const params = new URLSearchParams();
  for (const key of ['preset', 'from', 'to']) {
    const value = asString(body?.[key], 12);
    if (value) params.set(key, value);
  }
  const range = resolveRange(params, 'month');
  if (typeof range === 'string') return fail(range);
  if (range.days > MAX_SYNC_DAYS) {
    return fail(`Settlements can be fetched for at most ${MAX_SYNC_DAYS} days at a time. Choose a shorter range.`);
  }

  try {
    const { db } = await connectToDatabase();
    await ensureSettlementIndexes(db);
    const config = await getRazorpayConfig();
    if (!config.isConfigured || !config.enabled) {
      return fail(
        !config.isConfigured
          ? 'The payment gateway is not configured. Save the Razorpay keys in Settings.'
          : 'Online payments are switched off in Settings, so the gateway cannot be read.',
        503,
        { notConfigured: true }
      );
    }

    const fetchedAt = new Date();
    const by = check.admin.email || null;
    const stop = async (message: string, status: number) => {
      await db
        .collection('syncState')
        .updateOne({ key: SYNC_KEY }, { $set: { key: SYNC_KEY, fetchedAt, fetchedBy: by, rangeLabel: range.label, error: message } }, { upsert: true });
      await logAudit({
        admin: check.admin,
        action: 'gateway_settlements_fetch_failed',
        module: 'finance',
        entityType: 'gatewaySettlements',
        entityLabel: 'Razorpay settlements ' + range.label,
        after: { error: message },
        reason: asString(body?.reason, 500) || null,
        request,
      });
      return fail('The settlements could not be fetched. ' + message, status);
    };

    /* ---- settlements in the range ---- */
    const listed: RazorpaySettlement[] = [];
    for (let skip = 0; skip < SETTLEMENT_CAP; skip += 100) {
      const page = await listRazorpaySettlements(range.start, range.end, skip);
      if (!page.ok || !page.data) return stop(page.error || 'The gateway did not return any data.', page.notConfigured ? 503 : 502);
      listed.push(...page.data.items);
      if (page.data.items.length < 100) break;
    }

    /* ---- what each one contained: the reconciliation report, day by day ---- */
    const lines: RazorpaySettlementReconItem[] = [];
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      const [year, month, date] = day.split('-').map(Number);
      for (let skip = 0; lines.length < ITEM_CAP; skip += SETTLEMENT_RECON_PAGE) {
        const page = await fetchRazorpaySettlementRecon(year, month, date, skip);
        if (!page.ok || !page.data) return stop(page.error || 'The gateway did not return the settlement report.', page.notConfigured ? 503 : 502);
        lines.push(...page.data.items);
        if (page.data.items.length < SETTLEMENT_RECON_PAGE) break;
      }
    }

    const settlements = db.collection('gatewaySettlements');
    const items = db.collection('gatewaySettlementItems');
    const ids = new Set<string>();

    for (const settlement of listed) {
      if (!settlement?.id) continue;
      ids.add(settlement.id);
      await settlements.updateOne(
        { provider: 'razorpay', settlementId: settlement.id },
        {
          $set: {
            provider: 'razorpay',
            settlementId: settlement.id,
            amount: rupees(settlement.amount),
            status: settlement.status || null,
            fees: typeof settlement.fees === 'number' ? rupees(settlement.fees) : null,
            tax: typeof settlement.tax === 'number' ? rupees(settlement.tax) : null,
            utr: settlement.utr || null,
            settledAt: seconds(settlement.created_at),
            fetchedAt,
            fetchedBy: by,
          },
          $setOnInsert: { createdAt: fetchedAt },
        },
        { upsert: true }
      );
    }

    let stored = 0;
    for (const line of lines) {
      if (!line?.settlement_id || !line.entity_id) continue;
      // A line can name a settlement the list call did not return (created just outside the range).
      if (!ids.has(line.settlement_id)) {
        ids.add(line.settlement_id);
        await settlements.updateOne(
          { provider: 'razorpay', settlementId: line.settlement_id },
          {
            $set: { provider: 'razorpay', settlementId: line.settlement_id, fetchedAt, fetchedBy: by },
            $setOnInsert: {
              amount: null,
              status: null,
              fees: null,
              tax: null,
              utr: line.settlement_utr || null,
              settledAt: seconds(line.settled_at),
              createdAt: fetchedAt,
              knownFromReportOnly: true,
            },
          },
          { upsert: true }
        );
      }
      await items.updateOne(
        { settlementId: line.settlement_id, entityId: line.entity_id },
        {
          $set: {
            settlementId: line.settlement_id,
            entityId: line.entity_id,
            type: line.type || 'unknown',
            paymentId: line.type === 'payment' ? line.entity_id : line.payment_id || null,
            orderId: line.order_id || null,
            amount: rupees(line.amount),
            credit: rupees(line.credit),
            debit: rupees(line.debit),
            fee: rupees(line.fee),
            tax: rupees(line.tax),
            utr: line.settlement_utr || null,
            settledAt: seconds(line.settled_at),
            fetchedAt,
          },
          $setOnInsert: { ledgerReference: null },
        },
        { upsert: true }
      );
      stored++;
    }

    const matched = await matchItems(db, Array.from(ids));
    const unmatched = await items.countDocuments({ settlementId: { $in: Array.from(ids) }, type: 'payment', ledgerReference: { $in: [null] } });

    await db
      .collection('syncState')
      .updateOne({ key: SYNC_KEY }, { $set: { key: SYNC_KEY, fetchedAt, fetchedBy: by, rangeLabel: range.label, error: null } }, { upsert: true });
    await logAudit({
      admin: check.admin,
      action: 'gateway_settlements_fetch',
      module: 'finance',
      entityType: 'gatewaySettlements',
      entityLabel: 'Razorpay settlements ' + range.label,
      after: { settlements: ids.size, lines: stored, newlyMatched: matched, paymentsNotInLedger: unmatched },
      reason: asString(body?.reason, 500) || null,
      meta: { dateRange: range.label },
      request,
    });

    return ok({
      settlements: ids.size,
      lines: stored,
      newlyMatched: matched,
      unmatched,
      message: `Fetched ${ids.size} settlement${ids.size === 1 ? '' : 's'} with ${stored} line${stored === 1 ? '' : 's'}; ${matched} payment${matched === 1 ? '' : 's'} newly matched to the ledger, ${unmatched} not in the ledger.`,
    });
  } catch (error) {
    console.error('Gateway settlement fetch failed:', error);
    return fail('Could not fetch the gateway settlements.', 500);
  }
}
