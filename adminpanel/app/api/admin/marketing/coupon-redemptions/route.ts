import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { csvResponse, escapeRegex, fail, ok, toCsv } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { REDEMPTIONS, settlePendingCouponBookings } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

const PAGE = 50;

/**
 * GET: coupon redemptions, read-only, for Marketing (marketing:view) and for
 * Finance reconciliation (finance:view). Each row is one paid (or free)
 * booking that used a coupon, with the list price, the discount, what the
 * customer paid and the ledger references of the payment and of the coupon
 * discount entry. ?q= code or booking, ?couponId=, ?from=&to= (YYYY-MM-DD),
 * ?page=, ?export=csv.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  if (!can(check.admin, 'marketing:view') && !can(check.admin, 'finance:view')) {
    return fail('You do not have permission to do this.', 403);
  }

  const params = request.nextUrl.searchParams;
  const filter: Record<string, any> = {};
  const q = (params.get('q') || '').trim().slice(0, 60);
  if (q) filter.$or = [{ code: { $regex: escapeRegex(q.toUpperCase()) } }, { bookingId: q }, { paymentReference: q }, { ledgerReference: q }];
  const couponId = (params.get('couponId') || '').trim();
  if (couponId) {
    if (!/^[a-f0-9]{24}$/i.test(couponId)) return fail('Invalid coupon id');
    filter.couponId = couponId;
  }
  const range: Record<string, Date> = {};
  for (const [key, op] of [['from', '$gte'], ['to', '$lt']] as const) {
    const value = params.get(key);
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(`"${key}" must be a date like 2026-11-30`);
    const date = new Date(value + 'T00:00:00+05:30');
    range[op] = key === 'to' ? new Date(date.getTime() + 24 * 3600 * 1000) : date;
  }
  if (Object.keys(range).length) filter.createdAt = range;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  try {
    const { db } = await connectToDatabase();
    // Bookings confirmed by a path that did not settle their coupon are settled first.
    await settlePendingCouponBookings(db, couponId ? { couponId } : {});
    const collection = db.collection(REDEMPTIONS);

    if (params.get('export') === 'csv') {
      const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(20000).toArray();
      await logAudit({ admin: check.admin, action: 'export', module: 'marketing', entityType: 'coupon-redemptions', meta: { rows: rows.length }, request });
      return csvResponse(
        toCsv(
          rows.map((r) => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '' })),
          [
            { key: 'createdAt', label: 'Redeemed at (UTC)' },
            { key: 'code', label: 'Coupon' },
            { key: 'bookingId', label: 'Booking' },
            { key: 'eventTitle', label: 'Event' },
            { key: 'listPrice', label: 'List price' },
            { key: 'discount', label: 'Discount (funded by the platform)' },
            { key: 'amountPaid', label: 'Paid by the customer' },
            { key: 'paymentReference', label: 'Payment ledger reference' },
            { key: 'ledgerReference', label: 'Coupon discount ledger reference' },
            { key: 'payeeType', label: 'Payee type' },
            { key: 'payeeId', label: 'Payee ID' },
            { key: 'overLimit', label: 'Over the usage limit' },
          ]
        ),
        'coupon-redemptions.csv'
      );
    }

    const [items, total, sums] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE)
        .limit(PAGE)
        .toArray(),
      collection.countDocuments(filter),
      collection
        .aggregate([
          { $match: filter },
          { $group: { _id: null, discount: { $sum: '$discount' }, listPrice: { $sum: '$listPrice' }, amountPaid: { $sum: '$amountPaid' } } },
        ])
        .toArray(),
    ]);
    // The ledger's own view of the same discounts, for reconciliation.
    const ledgerRefs = items.map((r) => r.ledgerReference).filter(Boolean);
    const ledger = ledgerRefs.length
      ? await db
          .collection('transactions')
          .find({ reference: { $in: ledgerRefs } }, { projection: { reference: 1, status: 1, amount: 1 } })
          .toArray()
      : [];
    const ledgerOf = new Map(ledger.map((e) => [String(e.reference), e]));

    return ok({
      items: items.map((r) => {
        const entry = r.ledgerReference ? ledgerOf.get(String(r.ledgerReference)) : null;
        return {
          id: String(r._id),
          createdAt: r.createdAt,
          code: r.code,
          couponId: r.couponId,
          bookingId: r.bookingId,
          eventTitle: r.eventTitle || '',
          userPhone: can(check.admin, 'users:view') || can(check.admin, 'finance:view') ? r.userPhone : null,
          listPrice: r.listPrice,
          discount: r.discount,
          amountPaid: r.amountPaid,
          free: r.free === true,
          paymentReference: r.paymentReference || null,
          ledgerReference: r.ledgerReference || null,
          ledgerStatus: entry?.status || null,
          ledgerAmount: entry?.amount ?? null,
          overLimit: r.overLimit === true,
          confirmedVia: r.confirmedVia || null,
        };
      }),
      total,
      page,
      pageSize: PAGE,
      totals: {
        discount: roundMoney(sums[0]?.discount || 0),
        listPrice: roundMoney(sums[0]?.listPrice || 0),
        amountPaid: roundMoney(sums[0]?.amountPaid || 0),
      },
      canExport: true,
    });
  } catch (error) {
    console.error('Coupon redemptions failed:', error);
    return fail('Could not load the coupon redemptions', 500);
  }
}
