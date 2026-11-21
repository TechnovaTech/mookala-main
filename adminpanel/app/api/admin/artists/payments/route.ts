import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { payeeBalance, roundMoney } from '@/lib/ledger';
import { csvResponse, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { EXPORT_LIMIT, buildListFilter, listParties, parsePaging } from '../_shared';

export const dynamic = 'force-dynamic';

const BALANCE_KEYS = ['gross', 'commission', 'gst', 'gatewayFee', 'refunds', 'earned', 'settled', 'pending'] as const;

/**
 * GET /api/admin/artists/payments
 * Ledger balance per artist, from payeeBalance() in lib/ledger.ts, plus a
 * summary of their settlements. By default only artists that have ledger
 * entries are listed; `scope=all` lists every artist.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'settlements:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;

    const ledgerIds = (await db.collection('transactions').distinct('payeeId', { payeeType: 'artist' }))
      .filter((id) => typeof id === 'string' && id)
      .map(String);

    const filter = buildListFilter(params, 'artist');
    const scopeAll = params.get('scope') === 'all';
    const scoped = scopeAll
      ? filter
      : { $and: [{ _id: { $in: ledgerIds.map((id) => toObjectId(id)).filter(Boolean) } }, filter] };

    const exporting = params.get('export') === 'csv';
    const paging = parsePaging(params);
    const { rows, total } = await listParties(
      db,
      'artist',
      scoped,
      exporting ? { ...paging, page: 1, limit: EXPORT_LIMIT } : paging
    );

    const ids = rows.map((row) => row._id);
    const [balances, settlementRows] = await Promise.all([
      Promise.all(ids.map((id) => payeeBalance(db, 'artist', id))),
      ids.length
        ? db
            .collection('settlements')
            .aggregate([
              { $match: { payeeType: 'artist', payeeId: { $in: [...ids, ...ids.map((id) => toObjectId(id))] } } },
              {
                $group: {
                  _id: { payee: { $toString: '$payeeId' }, status: '$status' },
                  count: { $sum: 1 },
                  amount: { $sum: '$netAmount' },
                },
              },
            ])
            .toArray()
        : Promise.resolve([]),
    ]);

    const settlementsOf = new Map<string, { count: number; paid: number; open: number }>();
    for (const row of settlementRows as any[]) {
      const key = String(row._id.payee);
      const current = settlementsOf.get(key) || { count: 0, paid: 0, open: 0 };
      current.count += row.count;
      if (row._id.status === 'paid') current.paid += row.count;
      else if (row._id.status !== 'failed') current.open += row.count;
      settlementsOf.set(key, current);
    }

    const items = rows.map((row, i) => ({
      _id: row._id,
      name: row.name,
      phone: row.phone,
      city: row.city,
      accountStatus: row.accountStatus,
      ...balances[i],
      settlements: settlementsOf.get(row._id)?.count || 0,
      settlementsPaid: settlementsOf.get(row._id)?.paid || 0,
      settlementsOpen: settlementsOf.get(row._id)?.open || 0,
    }));

    if (exporting) {
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'settlements',
        entityType: 'artist-payments',
        meta: { rows: items.length },
        request,
      });
      return csvResponse(
        toCsv(items, [
          { key: 'name', label: 'Artist' },
          { key: 'phone', label: 'Phone' },
          { key: 'city', label: 'City' },
          { key: 'gross', label: 'Gross payments' },
          { key: 'commission', label: 'Commission' },
          { key: 'gst', label: 'GST' },
          { key: 'gatewayFee', label: 'Gateway fees' },
          { key: 'refunds', label: 'Refunds' },
          { key: 'earned', label: 'Earned' },
          { key: 'settled', label: 'Settled' },
          { key: 'pending', label: 'Pending' },
          { key: 'settlements', label: 'Settlements' },
        ]),
        `artist-payments-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    // Totals over every artist with ledger entries, using the same balance rule.
    const totals: Record<string, number> = Object.fromEntries(BALANCE_KEYS.map((key) => [key, 0]));
    const all = await Promise.all(ledgerIds.slice(0, 1000).map((id) => payeeBalance(db, 'artist', id)));
    for (const balance of all) for (const key of BALANCE_KEYS) totals[key] = roundMoney(totals[key] + balance[key]);

    return ok({
      items,
      total,
      page: paging.page,
      limit: paging.limit,
      totals,
      artistsWithEntries: ledgerIds.length,
      totalsComplete: ledgerIds.length <= 1000,
    });
  } catch (error) {
    console.error('Artist payments failed:', error);
    return fail('Failed to load artist payments', 500);
  }
}
