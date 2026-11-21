import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { normaliseRole } from '@/lib/permissions';
import { ok, fail, asString, toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { describeDevice } from '@/components/security/device';
import { getSecuritySettings, recordSecurityEvent } from '@/lib/security-settings';
import { clientIp } from '@/lib/auth';
import { isSuperAdmin, revokeSessionsOf, readBody } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * Active admin sessions.
 *
 * A Super Admin sees and can end every session. Every other admin sees and
 * can end only their own, whatever permissions they hold, so this route asks
 * only for a signed-in admin and applies that rule itself.
 *
 *   GET  ?mine=1                         only the caller's sessions
 *   GET  ?devices=1[&adminId=][&mine=1]  known devices (IP address plus browser) from the
 *                                        sign-in history, with first and last sign-in
 *   POST { action: 'revoke', id, reason }             end one session
 *   POST { action: 'revoke_all', adminId, reason }    end every session of one admin
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const params = request.nextUrl.searchParams;
  const seeAll = isSuperAdmin(admin) && params.get('mine') !== '1';
  const { db } = await connectToDatabase();

  if (params.get('devices') === '1') return knownDevices(db, admin, seeAll, params.get('adminId'));

  const filter: Record<string, any> = { revokedAt: null, expiresAt: { $gt: new Date() } };
  if (!seeAll) filter.adminId = admin.id || '__none__';

  const settings = await getSecuritySettings(db);
  const sessions = await db.collection('adminSessions').find(filter).sort({ lastSeenAt: -1 }).limit(500).toArray();

  const ids = [...new Set(sessions.map((session) => String(session.adminId)))]
    .map((value) => toObjectId(value))
    .filter(Boolean) as any[];
  const accounts = ids.length
    ? await db.collection('admins').find({ _id: { $in: ids } }, { projection: { name: 1, email: 1, role: 1 } }).toArray()
    : [];
  const accountOf = new Map(accounts.map((account) => [String(account._id), account]));

  return ok({
    scope: seeAll ? 'all' : 'own',
    rules: { sessionHours: settings.sessionHours, idleTimeoutMinutes: settings.idleTimeoutMinutes, maxSessions: settings.maxSessions },
    sessions: sessions.map((session) => {
      const account = accountOf.get(String(session.adminId));
      return {
        // The Mongo id identifies the row. The session id inside the token is never sent to the browser.
        id: String(session._id),
        adminId: String(session.adminId),
        adminName: account?.name || '',
        email: account?.email || session.email || '',
        role: normaliseRole(account?.role),
        ip: session.ip || 'unknown',
        device: describeDevice(session.userAgent),
        userAgent: session.userAgent || '',
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        current: session.sid === admin.sid,
      };
    }),
  });
}

/**
 * A device is an IP address plus a browser (user agent), as the sign-in route
 * counts it for the "new device" alert. Built from successful sign-ins in
 * adminLoginHistory, with whether a session is open on it right now.
 */
async function knownDevices(db: any, admin: any, seeAll: boolean, adminIdParam: string | null) {
  let email: string | null = null;
  if (!seeAll) email = admin.email || '__none__';
  else if (adminIdParam) {
    const id = toObjectId(adminIdParam);
    if (!id) return fail('That admin id is not valid.');
    const account = await db.collection('admins').findOne({ _id: id }, { projection: { email: 1 } });
    if (!account) return fail('Admin not found.', 404);
    email = account.email;
  }

  const match: Record<string, any> = { success: true };
  if (email) match.email = email;
  const rows = await db
    .collection('adminLoginHistory')
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: { email: '$email', ip: '$ip', userAgent: '$userAgent' },
          firstSeen: { $min: '$createdAt' },
          lastSeen: { $max: '$createdAt' },
          signIns: { $sum: 1 },
        },
      },
      { $sort: { lastSeen: -1 } },
      { $limit: 500 },
    ])
    .toArray();

  const live = await db
    .collection('adminSessions')
    .find({ revokedAt: null, expiresAt: { $gt: new Date() }, ...(email ? { email } : {}) }, { projection: { email: 1, ip: 1, userAgent: 1 } })
    .toArray();
  const openKey = new Set(live.map((session: any) => `${session.email}|${session.ip}|${session.userAgent || ''}`));
  const accounts = await db.collection('admins').find({}, { projection: { email: 1, name: 1 } }).toArray();
  const nameOf = new Map(accounts.map((account: any) => [account.email, account.name || '']));

  return ok({
    scope: email && !seeAll ? 'own' : email ? 'one' : 'all',
    devices: rows.map((row: any) => ({
      email: row._id.email,
      adminName: nameOf.get(row._id.email) || '',
      ip: row._id.ip || 'unknown',
      userAgent: row._id.userAgent || '',
      device: describeDevice(row._id.userAgent),
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      signIns: row.signIns,
      sessionOpen: openKey.has(`${row._id.email}|${row._id.ip}|${row._id.userAgent || ''}`),
    })),
  });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;
  const isSuper = isSuperAdmin(admin);

  const body = await readBody(request);
  const action = asString(body.action, 40);
  const reason = asString(body.reason, 500);

  if (action !== 'revoke' && action !== 'revoke_all') return fail('Unknown action.');
  if (!reason) return fail('A reason is required. It is saved in the activity log.');

  const { db } = await connectToDatabase();
  const actor = admin.email || 'admin';

  if (action === 'revoke') {
    const id = toObjectId(body.id);
    if (!id) return fail('That session id is not valid.');

    const session = await db.collection('adminSessions').findOne({ _id: id });
    // Someone else's session is reported as missing to an admin who may not see it.
    if (!session || (!isSuper && String(session.adminId) !== admin.id)) return fail('Session not found.', 404);
    if (session.revokedAt) return fail('This session has already ended.');

    await db
      .collection('adminSessions')
      .updateOne({ _id: id }, { $set: { revokedAt: new Date(), revokedReason: 'revoked_by_admin', revokedBy: actor } });

    await logAudit({
      admin,
      action: 'session_revoke',
      module: 'security',
      entityType: 'adminSession',
      entityId: String(session._id),
      entityLabel: session.email,
      before: { revoked: false, ip: session.ip, device: describeDevice(session.userAgent) },
      after: { revoked: true },
      reason,
      request,
    });

    if (String(session.adminId) !== admin.id) {
      await recordSecurityEvent(db, {
        type: 'session_ended_by_admin',
        adminId: String(session.adminId),
        adminEmail: session.email,
        actorEmail: actor,
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        detail: `${actor} ended a session (${describeDevice(session.userAgent)}, ${session.ip || 'unknown IP'}). Reason: ${reason}`,
      });
    }

    return ok({ message: 'Session ended.', endedOwnSession: session.sid === admin.sid });
  }

  const adminId = asString(body.adminId, 40);
  const targetId = toObjectId(adminId);
  if (!targetId) return fail('That admin id is not valid.');
  if (!isSuper && adminId !== admin.id) return fail('You can only end your own sessions.', 403);

  const target = await db.collection('admins').findOne({ _id: targetId }, { projection: { email: 1 } });
  if (!target) return fail('Admin not found.', 404);

  // An admin signing out their own other devices keeps the session they are using.
  const keep = adminId === admin.id && body.includeCurrent !== true ? admin.sid : undefined;
  const ended = await revokeSessionsOf(db, adminId, 'revoked_by_admin', actor, keep);

  await logAudit({
    admin,
    action: 'session_revoke_all',
    module: 'security',
    entityType: 'admin',
    entityId: adminId,
    entityLabel: target.email,
    after: { sessionsEnded: ended },
    reason,
    request,
  });

  if (adminId !== admin.id && ended > 0) {
    await recordSecurityEvent(db, {
      type: 'session_ended_by_admin',
      adminId,
      adminEmail: target.email,
      actorEmail: actor,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      detail: `${actor} ended all ${ended} session${ended === 1 ? '' : 's'} of this admin. Reason: ${reason}`,
    });
  }

  return ok({ message: `${ended} session${ended === 1 ? '' : 's'} ended.`, ended });
}
