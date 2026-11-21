import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { payeeBalance } from '@/lib/ledger';
import { fail, ok, parseAmount, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

const whole = (value: unknown) => {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * GET /api/admin/catalogue/cinemas/[id]   (venues:view)
 * One cinema hall as an account: the listing and its owner, its shows with
 * seat inventory, and (for admins who may see settlements or finance) the
 * ledger entries and settlements recorded with the cinema as payee
 * (`payeeType: 'cinema'`, `payeeId`: this cinema's id).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'venues:view');
  if (!check.ok) return check.response;
  const id = toObjectId(params.id);
  if (!id) return fail('Invalid cinema id', 400);

  try {
    const { db } = await connectToDatabase();
    const cinema = await db.collection('cinemas').findOne({ _id: id });
    if (!cinema) return fail('Cinema not found', 404);

    const canViewMoney = can(check.admin, 'settlements:view') || can(check.admin, 'finance:view');
    const payee = { payeeType: 'cinema', payeeId: params.id };

    const [shows, history, balance, entries, entryCount, settlements] = await Promise.all([
      db
        .collection('cinemaShows')
        .find({ cinemaId: { $in: [params.id, id] } })
        .sort({ showAt: -1 })
        .limit(500)
        .toArray(),
      db
        .collection('auditLogs')
        .find({ entityId: params.id, module: 'venues' })
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray(),
      canViewMoney ? payeeBalance(db, 'cinema', params.id) : null,
      canViewMoney ? db.collection('transactions').find(payee).sort({ createdAt: -1, _id: -1 }).limit(200).toArray() : [],
      canViewMoney ? db.collection('transactions').countDocuments(payee) : 0,
      canViewMoney ? db.collection('settlements').find(payee).sort({ createdAt: -1 }).limit(200).toArray() : [],
    ]);

    const showRows = shows.map((show) => {
      const totalSeats = whole(show.totalSeats);
      const seatsSold = whole(show.seatsSold);
      const basePrice = parseAmount(show.basePrice);
      return {
        _id: String(show._id),
        title: show.title || '',
        language: show.language || '',
        screen: show.screen || '',
        showAt: show.showAt || null,
        status: show.status || 'scheduled',
        ticketCategories: typeof show.ticketCategories === 'string' ? show.ticketCategories : '',
        basePrice,
        totalSeats,
        seatsSold,
        remaining: Math.max(0, totalSeats - seatsSold),
        value: Math.round(seatsSold * basePrice * 100) / 100,
      };
    });

    return ok({
      cinema: {
        _id: String(cinema._id),
        name: cinema.name || '',
        ownerName: cinema.ownerName || '',
        ownerPhone: cinema.ownerPhone || '',
        ownerEmail: cinema.ownerEmail || '',
        city: cinema.city || '',
        state: cinema.state || '',
        address: cinema.address || '',
        screens: whole(cinema.screens),
        totalSeats: whole(cinema.totalSeats),
        gstNumber: cinema.gstNumber || '',
        status: cinema.status || 'pending',
        statusReason: cinema.statusReason || '',
        reviewedBy: cinema.reviewedBy || '',
        reviewedAt: cinema.reviewedAt || null,
        createdAt: cinema.createdAt || null,
        createdBy: cinema.createdBy || '',
      },
      shows: showRows,
      showTotals: {
        shows: showRows.length,
        scheduled: showRows.filter((show) => show.status === 'scheduled').length,
        cancelled: showRows.filter((show) => show.status === 'cancelled').length,
        totalSeats: showRows.reduce((sum, show) => sum + show.totalSeats, 0),
        seatsSold: showRows.reduce((sum, show) => sum + show.seatsSold, 0),
        value: Math.round(showRows.reduce((sum, show) => sum + show.value, 0) * 100) / 100,
      },
      history: history.map((row) => ({
        _id: String(row._id),
        action: row.action,
        adminName: row.adminName || row.adminEmail || 'Admin',
        before: row.before || null,
        after: row.after || null,
        reason: row.reason || '',
        createdAt: row.createdAt,
      })),
      canViewMoney,
      balance,
      entryCount,
      entries: (entries as any[]).map((entry) => ({
        _id: String(entry._id),
        reference: entry.reference || '',
        createdAt: entry.createdAt || null,
        type: entry.type || '',
        service: entry.service || '',
        status: entry.status || '',
        amount: entry.amount || 0,
        description: entry.description || '',
      })),
      settlements: (settlements as any[]).map((s) => ({
        _id: String(s._id),
        periodFrom: s.periodFrom || null,
        periodTo: s.periodTo || null,
        grossAmount: s.grossAmount ?? null,
        commissionAmount: s.commissionAmount ?? null,
        netAmount: s.netAmount ?? null,
        status: s.status || 'pending',
        bankReference: s.bankReference || '',
        paidAt: s.paidAt || null,
        createdAt: s.createdAt || null,
      })),
    });
  } catch (error) {
    console.error('Cinema account failed:', error);
    return fail('Failed to load the cinema', 500);
  }
}
