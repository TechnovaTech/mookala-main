import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { payeeBalance } from '@/lib/ledger';
import { csvResponse, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { findParty } from '../../_shared';

export const dynamic = 'force-dynamic';

/** How a successful entry moves what the artist is still owed (see payeeBalance). */
function effectOf(entry: any): number | null {
  if (entry.status !== 'success') return null;
  switch (entry.type) {
    case 'payment':
      return entry.amount;
    case 'commission':
    case 'gst':
    case 'gateway_fee':
    case 'refund':
    case 'settlement':
      return -entry.amount;
    default:
      return null;
  }
}

function parseDay(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + (endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * GET /api/admin/artists/payments/[id]?from=YYYY-MM-DD&to=YYYY-MM-DD
 * One artist's statement: overall balance, ledger entries in the period and
 * settlements. `export=csv` downloads the entries.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'settlements:view');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid artist id', 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await findParty(db, 'artist', params.id);
    if (!artist) return fail('Artist not found', 404);

    const query = request.nextUrl.searchParams;
    const from = parseDay(query.get('from'), false);
    const to = parseDay(query.get('to'), true);
    if ((query.get('from') && !from) || (query.get('to') && !to)) return fail('Dates must be in YYYY-MM-DD format.', 400);
    if (from && to && from > to) return fail('The start date is after the end date.', 400);

    const filter: Record<string, any> = { payeeType: 'artist', payeeId: params.id };
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const exporting = query.get('export') === 'csv';
    const limit = exporting ? 5000 : 500;
    const [entries, entryCount] = await Promise.all([
      db.collection('transactions').find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray(),
      db.collection('transactions').countDocuments(filter),
    ]);

    const rows = entries.map((entry) => ({
      _id: String(entry._id),
      reference: entry.reference || '',
      createdAt: entry.createdAt || null,
      type: entry.type,
      service: entry.service || '',
      status: entry.status || '',
      amount: entry.amount || 0,
      effect: effectOf(entry),
      bookingId: entry.bookingId || '',
      eventId: entry.eventId || '',
      parentReference: entry.parentReference || '',
      gatewayPaymentId: entry.gatewayPaymentId || '',
      description: entry.description || '',
    }));

    if (exporting) {
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'settlements',
        entityType: 'artist-statement',
        entityId: params.id,
        entityLabel: artist.name || artist.phone,
        meta: { rows: rows.length, from: query.get('from'), to: query.get('to') },
        request,
      });
      // Two unsigned columns: the shared CSV writer treats a leading "-" as a
      // spreadsheet formula and would prefix negative amounts with a quote.
      const flat = rows.map((row) => ({
        ...row,
        added: row.effect !== null && row.effect > 0 ? row.effect : '',
        deducted: row.effect !== null && row.effect < 0 ? -row.effect : '',
      }));
      return csvResponse(
        toCsv(flat, [
          { key: 'createdAt', label: 'Date' },
          { key: 'reference', label: 'Reference' },
          { key: 'type', label: 'Type' },
          { key: 'service', label: 'Service' },
          { key: 'status', label: 'Status' },
          { key: 'amount', label: 'Amount (INR)' },
          { key: 'added', label: 'Added to amount owed (INR)' },
          { key: 'deducted', label: 'Deducted from amount owed (INR)' },
          { key: 'bookingId', label: 'Booking' },
          { key: 'eventId', label: 'Event' },
          { key: 'parentReference', label: 'Payment reference' },
          { key: 'gatewayPaymentId', label: 'Gateway payment' },
          { key: 'description', label: 'Description' },
        ]),
        `artist-statement-${params.id}-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const [balance, settlements] = await Promise.all([
      payeeBalance(db, 'artist', params.id),
      db
        .collection('settlements')
        .find({ payeeType: 'artist', payeeId: { $in: [params.id, oid] } })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
    ]);

    // Service-wise totals for the same period as the entries, from successful ledger entries.
    const serviceRows = await db
      .collection('transactions')
      .aggregate([
        { $match: { ...filter, status: 'success' } },
        { $group: { _id: { service: '$service', type: '$type' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ])
      .toArray();
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const services = new Map<string, Record<string, number>>();
    for (const row of serviceRows) {
      const key = String(row._id.service || '');
      const entry = services.get(key) || { payments: 0, gross: 0, commission: 0, gst: 0, gatewayFee: 0, refunds: 0, settled: 0 };
      const type = String(row._id.type);
      if (type === 'payment') {
        entry.gross += row.total;
        entry.payments += row.count;
      } else if (type === 'commission') entry.commission += row.total;
      else if (type === 'gst') entry.gst += row.total;
      else if (type === 'gateway_fee') entry.gatewayFee += row.total;
      else if (type === 'refund') entry.refunds += row.total;
      else if (type === 'settlement') entry.settled += row.total;
      services.set(key, entry);
    }
    const byService = Array.from(services.entries())
      .map(([service, e]) => ({
        service,
        payments: e.payments,
        gross: round(e.gross),
        commission: round(e.commission),
        commissionPercent: e.gross > 0 ? round((e.commission / e.gross) * 100) : null,
        gst: round(e.gst),
        gatewayFee: round(e.gatewayFee),
        refunds: round(e.refunds),
        earned: round(e.gross - e.commission - e.gst - e.gatewayFee - e.refunds),
        settled: round(e.settled),
      }))
      .sort((a, b) => b.gross - a.gross);

    return ok({
      artist: { _id: artist._id, name: artist.name, phone: artist.phone, city: artist.city, accountStatus: artist.accountStatus },
      balance,
      byService,
      entries: rows,
      entryCount,
      truncated: entryCount > rows.length,
      settlements: settlements.map((s) => ({
        _id: String(s._id),
        service: s.service || '',
        periodFrom: s.periodFrom || null,
        periodTo: s.periodTo || null,
        grossAmount: s.grossAmount ?? null,
        commissionAmount: s.commissionAmount ?? null,
        gstAmount: s.gstAmount ?? null,
        gatewayFeeAmount: s.gatewayFeeAmount ?? null,
        refundsAmount: s.refundsAmount ?? null,
        netAmount: s.netAmount ?? null,
        dueDate: s.dueDate || null,
        bankReference: s.bankReference || '',
        status: s.status || 'pending',
        paidAt: s.paidAt || null,
        createdAt: s.createdAt || null,
      })),
    });
  } catch (error) {
    console.error('Artist statement failed:', error);
    return fail('Failed to load the statement', 500);
  }
}
