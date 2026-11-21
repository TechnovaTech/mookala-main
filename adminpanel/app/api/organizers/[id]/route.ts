import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { payeeBalance } from '@/lib/ledger';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import {
  EVENT_PROJECTION,
  changeAccountStatus,
  findParty,
  historyFor,
  maskId,
  organizerEventsFilter,
  toEventRow,
} from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/organizers/[id]   (admin, 'organizers:view')
 * One organiser: profile, KYC status and reviewer, account status, their
 * events (events whose `organizerId` is this organiser), admin history and,
 * for admins who may see settlements, the ledger balance. KYC documents are
 * not returned here: they are opened from the KYC screen.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'organizers:view');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid organiser id', 400);

  try {
    const { db } = await connectToDatabase();
    const row = await findParty(db, 'organizer', params.id);
    if (!row) return fail('Organiser not found', 404);

    const canViewKyc = can(check.admin, 'kyc:view');
    const canViewBalance = can(check.admin, 'settlements:view') || can(check.admin, 'finance:view');

    const payee = { payeeType: 'organizer', payeeId: params.id };
    const [settlements, recentEntries] = canViewBalance
      ? await Promise.all([
          db.collection('settlements').find({ payeeType: 'organizer', payeeId: { $in: [params.id, oid] } }).sort({ createdAt: -1 }).limit(100).toArray(),
          db.collection('transactions').find(payee).sort({ createdAt: -1, _id: -1 }).limit(15).toArray(),
        ])
      : [[], []];

    const [extra, events, eventTotal, history, balance, ledgerEntries] = await Promise.all([
      db
        .collection('organizers')
        .findOne({ _id: oid }, { projection: { profileImage: 1, aadharId: 1, panId: 1 } }),
      db
        .collection('events')
        .find(organizerEventsFilter(params.id), { projection: EVENT_PROJECTION })
        .sort({ startDate: -1, createdAt: -1 })
        .limit(200)
        .toArray(),
      db.collection('events').countDocuments(organizerEventsFilter(params.id)),
      historyFor(db, 'organizer', params.id),
      canViewBalance ? payeeBalance(db, 'organizer', params.id) : Promise.resolve(null),
      canViewBalance
        ? db.collection('transactions').countDocuments({ payeeType: 'organizer', payeeId: params.id })
        : Promise.resolve(0),
    ]);

    const image = typeof extra?.profileImage === 'string' && extra.profileImage ? extra.profileImage : null;

    return ok({
      organizer: {
        ...row,
        profileImage: image ? (image.startsWith('data:') || image.startsWith('http') ? image : 'data:image/jpeg;base64,' + image) : null,
        identity: canViewKyc ? { aadhar: maskId(extra?.aadharId), pan: maskId(extra?.panId) } : null,
        events: events.map((event) => toEventRow(event)),
        eventTotal,
        history,
      },
      balance,
      ledgerEntries,
      settlements: settlements.map((s) => ({
        _id: String(s._id),
        service: s.service || '',
        periodFrom: s.periodFrom || null,
        periodTo: s.periodTo || null,
        grossAmount: s.grossAmount ?? null,
        netAmount: s.netAmount ?? null,
        status: s.status || 'pending',
        bankReference: s.bankReference || '',
        paidAt: s.paidAt || null,
      })),
      recentEntries: recentEntries.map((entry) => ({
        _id: String(entry._id),
        reference: entry.reference || '',
        createdAt: entry.createdAt || null,
        type: entry.type || '',
        service: entry.service || '',
        status: entry.status || '',
        amount: entry.amount || 0,
        eventId: entry.eventId || '',
      })),
      canManage: can(check.admin, 'organizers:manage'),
      canViewKyc,
      canViewBalance,
    });
  } catch (error) {
    console.error('Error fetching organizer:', error);
    return fail('Failed to fetch organizer', 500);
  }
}

/** PATCH /api/organizers/[id]  { action: 'suspend' | 'reactivate', reason } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'organizers:manage');
  if (!check.ok) return check.response;
  if (!toObjectId(params.id)) return fail('Invalid organiser id', 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body', 400);
  }
  const action = asString(body?.action, 40);
  if (action !== 'suspend' && action !== 'reactivate') return fail('Unknown action', 400);

  try {
    const { db } = await connectToDatabase();
    const result = await changeAccountStatus({
      db,
      role: 'organizer',
      id: params.id,
      action,
      reason: asString(body?.reason, 1000),
      admin: check.admin,
      request,
    });
    if ('error' in result) return fail(result.error, result.status);
    return ok({ organizer: result.row });
  } catch (error) {
    console.error('Error updating organizer:', error);
    return fail('Failed to update the organiser', 500);
  }
}
