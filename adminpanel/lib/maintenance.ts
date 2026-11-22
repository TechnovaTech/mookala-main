import crypto from 'crypto';
import type { Db } from 'mongodb';
import { NextResponse, type NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { getAdminFromRequest, type AdminTokenPayload } from './auth';
import { logAudit } from './audit';
import { formatIst, getPlatformConfig, maintenanceStatus, PLATFORM_TIMEZONE, type MaintenanceWindow, type PlatformConfig } from './platform-config';

/**
 * Maintenance mode, enforced (requirements section 15). Server only.
 *
 * maintenanceBlock() is called as the first statement of each public write
 * route listed in MAINTENANCE_ENFORCEMENT.blocked. While maintenance is active
 * (the switch is on, or a scheduled window covers the current time) those
 * routes answer 503 { code: 'MAINTENANCE', error, message, endsAt, retryAfter }.
 * Everything else keeps working, on purpose: money that was already taken
 * must still be recorded, gates must still admit ticket holders, and admins
 * must be able to work during the maintenance.
 *
 * syncMaintenanceNotices() keeps one announcement per maintenance window that
 * is to be announced in advance. It only writes announcements with status
 * 'pending_approval' (or cancels them); sending is done by the communications
 * scheduler once an approver has approved the announcement.
 */

export interface EnforcedRoute {
  route: string;
  /** Route file, relative to app/api. */
  file: string;
  what: string;
}

export const MAINTENANCE_ENFORCEMENT: {
  blocked: EnforcedRoute[];
  allowed: { route: string; why: string }[];
  notCovered: { route: string; what: string }[];
} = {
  blocked: [
    { route: 'POST /api/payment/order', file: 'payment/order/route.ts', what: 'Starting a ticket payment (new orders and seat holds)' },
    { route: 'POST /api/bookings', file: 'bookings/route.ts', what: 'Free bookings and the older booking route' },
    { route: 'POST /api/bookings/cancel', file: 'bookings/cancel/route.ts', what: 'Cancelling a booking, including the refund quote' },
    { route: 'POST /api/public/otp/send', file: 'public/otp/send/route.ts', what: 'Sending a sign-in code (OTP)' },
    { route: 'POST /api/events', file: 'events/route.ts', what: 'Creating an event from the organiser app' },
    { route: 'PATCH /api/events/{id}', file: 'events/[id]/route.ts', what: "Changing an event's tickets from the organiser app" },
    { route: 'DELETE /api/events/{id}', file: 'events/[id]/route.ts', what: 'Deleting an event from the organiser app' },
    { route: 'POST /api/user/profile', file: 'user/profile/route.ts', what: 'Saving a customer profile' },
    { route: 'POST /api/organizer/profile', file: 'organizer/profile/route.ts', what: 'Saving an organiser profile' },
    { route: 'POST /api/artist/profile', file: 'artist/profile/route.ts', what: 'Saving an artist profile' },
    { route: 'POST /api/organizer/kyc', file: 'organizer/kyc/route.ts', what: 'Organiser KYC submission' },
    { route: 'POST /api/organizer/resubmit-kyc', file: 'organizer/resubmit-kyc/route.ts', what: 'Organiser KYC resubmission' },
    { route: 'POST /api/artist/kyc', file: 'artist/kyc/route.ts', what: 'Artist KYC submission' },
    { route: 'POST /api/artist/resubmit-kyc', file: 'artist/resubmit-kyc/route.ts', what: 'Artist KYC resubmission' },
    { route: 'POST /api/hire-requests', file: 'hire-requests/route.ts', what: 'Requests to hire a professional' },
    { route: 'POST /api/jatra', file: 'jatra/route.ts', what: 'Jatra registrations' },
    { route: 'POST /api/user/register', file: 'user/register/route.ts', what: 'Older sign-in route (sends a sign-in code)' },
    { route: 'POST /api/organizer/register', file: 'organizer/register/route.ts', what: 'Starting an organiser registration' },
    { route: 'POST /api/artist/register', file: 'artist/register/route.ts', what: 'Starting an artist registration' },
    { route: 'POST /api/artists/follow', file: 'artists/follow/route.ts', what: 'Following an artist' },
    { route: 'POST /api/artist/availability', file: 'artist/availability/route.ts', what: "An artist's availability" },
    { route: 'POST /api/artist/media', file: 'artist/media/route.ts', what: 'Artist portfolio uploads' },
    { route: 'POST /api/artist/booking-response', file: 'artist/booking-response/route.ts', what: "An artist's reply to a booking request" },
  ],
  allowed: [
    { route: 'POST /api/payment/verify', why: 'A payment Razorpay has already taken still becomes a ticket.' },
    { route: 'POST /api/payment/webhook', why: "Razorpay's payment notifications are still recorded." },
    { route: 'POST /api/bookings/verify', why: 'Gate check-in on the day keeps working.' },
    { route: 'POST /api/staff/login', why: 'Gate staff can still sign in to scan tickets.' },
    { route: 'POST /api/public/otp/verify', why: 'A sign-in code that was already sent can still be used.' },
    { route: 'Every read (GET)', why: 'Events, tickets, policies and platform information stay visible.' },
    { route: 'The admin panel', why: 'Every /api/admin route, and an admin calling the event routes above, is never blocked.' },
  ],
  notCovered: [
    { route: 'POST /api/user|organizer|artist/verify-otp', what: 'Older code-verification routes (a code already sent can still be used)' },
    { route: 'POST /api/public/ads/track', what: 'Advert view and click counting' },
  ],
};

/**
 * Null when the request may go ahead, otherwise the 503 answer to return.
 * Pass `request` on routes the admin panel also uses: a caller with an admin
 * token is never blocked (the route itself still checks the admin's rights).
 * A failure to read the settings lets the request through; the route then
 * meets the same database problem and reports it.
 */
export async function maintenanceBlock(db?: Db | null, request?: NextRequest): Promise<NextResponse | null> {
  try {
    if (request && getAdminFromRequest(request)) return null;
    const database = db || (await connectToDatabase()).db;
    const status = maintenanceStatus(await getPlatformConfig(database));
    if (!status.active) return null;

    const retryAfter = status.endsAt ? Math.max(1, Math.ceil((status.endsAt.getTime() - Date.now()) / 1000)) : null;
    const response = NextResponse.json(
      { success: false, code: 'MAINTENANCE', error: status.message, message: status.message, endsAt: status.endsAt, retryAfter },
      { status: 503 }
    );
    if (retryAfter) response.headers.set('Retry-After', String(retryAfter));
    return response;
  } catch (error) {
    console.error('Maintenance check failed:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Advance notice announcements                                        */
/* ------------------------------------------------------------------ */

export const NOTICE_SOURCE = 'maintenance_window';
/** Announcement statuses that can still go out, so they follow edits to their window. */
const OPEN_STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'sending', 'failed'];
/** Edited in place, then back to 'pending_approval': the approved text no longer matches the window. */
const APPROVED_STATUSES = ['approved', 'scheduled', 'failed'];
/** Content is locked while it is being sent: it is cancelled and a new notice is made. */
const SENDING = 'sending';

export interface NoticeChange {
  windowId: string;
  action: 'created' | 'updated' | 'needs_approval_again' | 'cancelled';
  announcementId: string;
  title: string;
}

function istDay(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: PLATFORM_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** What the announcement for a window says, and when it is due. */
export function noticeFor(config: Pick<PlatformConfig, 'platformName'>, w: MaintenanceWindow, now = new Date()) {
  const name = config.platformName || 'Mookalaa';
  const own = w.message.trim();
  const sentence = /[.!?]$/.test(own) ? own : own + '.';
  const dueAt = new Date(w.startsAt.getTime() - w.notifyHoursBefore * 3600 * 1000);
  // The version of the window this notice describes: a change makes a new version.
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify([name, w.startsAt.toISOString(), w.endsAt.toISOString(), own, w.notifyHoursBefore]))
    .digest('hex')
    .slice(0, 16);
  return {
    key,
    title: `Planned maintenance on ${istDay(w.startsAt)}`,
    message:
      `${name} will be under planned maintenance from ${formatIst(w.startsAt)} to ${formatIst(w.endsAt)} (India time). ${sentence} ` +
      'During this time you cannot book tickets, make payments, get sign-in codes or change your profile. ' +
      'Tickets you already have stay valid and entry scanning continues.',
    // Due N hours before the start; when that moment has passed, as soon as it is approved.
    scheduledFor: dueAt > now ? dueAt : now,
  };
}

/** Announcements linked to each window, newest first. */
export async function noticesForWindows(db: Db, windowIds: string[]) {
  if (windowIds.length === 0) return {} as Record<string, any[]>;
  const rows = await db
    .collection('announcements')
    .find(
      { source: NOTICE_SOURCE, maintenanceWindowId: { $in: windowIds } },
      { projection: { title: 1, status: 1, scheduledFor: 1, approvedBy: 1, maintenanceWindowId: 1, channels: 1, templateKey: 1, statusReason: 1, createdAt: 1 } }
    )
    .sort({ createdAt: -1 })
    .toArray();
  const out: Record<string, any[]> = {};
  for (const row of rows) {
    const id = String(row.maintenanceWindowId);
    (out[id] ||= []).push({ ...row, _id: String(row._id) });
  }
  return out;
}

/**
 * Brings the advance notice announcements in line with the saved windows:
 * a window announced in advance gets an announcement (status
 * 'pending_approval', audience everyone, due N hours before the start); an
 * edited window updates its announcement, which needs approval again if it
 * had been approved; a deleted window, or one no longer announced, cancels
 * its announcement. A notice that was sent or cancelled is left as a record,
 * and is not created again unless the window changes.
 */
export async function syncMaintenanceNotices(
  db: Db,
  input: { before: PlatformConfig; after: PlatformConfig; admin: AdminTokenPayload; reason: string; request?: NextRequest }
): Promise<NoticeChange[]> {
  const { before, after, admin, reason, request } = input;
  const now = new Date();
  const by = admin.email || null;
  const collection = db.collection('announcements');
  const changes: NoticeChange[] = [];

  const ids = Array.from(new Set([...before.maintenanceWindows, ...after.maintenanceWindows].map((w) => w.id)));
  if (ids.length === 0) return changes;
  const linked = await collection.find({ source: NOTICE_SOURCE, maintenanceWindowId: { $in: ids } }).sort({ createdAt: -1 }).toArray();
  const forWindow = (id: string) => linked.filter((a) => a.maintenanceWindowId === id);
  const open = (id: string) => forWindow(id).filter((a) => OPEN_STATUSES.includes(a.status));

  const cancel = async (a: any, why: string) => {
    const result = await collection.updateOne(
      { _id: a._id, status: a.status },
      { $set: { status: 'cancelled', statusReason: why, statusChangedAt: now, statusChangedBy: by, updatedAt: now, updatedBy: by } }
    );
    if (result.modifiedCount === 0) return;
    await logAudit({
      admin,
      action: 'status_change',
      module: 'communications',
      entityType: 'announcements',
      entityId: String(a._id),
      entityLabel: a.title,
      before: { status: a.status },
      after: { status: 'cancelled' },
      reason: `${why}. Platform configuration change: ${reason}`,
      request,
    });
    changes.push({ windowId: a.maintenanceWindowId, action: 'cancelled', announcementId: String(a._id), title: a.title });
  };

  const keptIds = new Set(after.maintenanceWindows.map((w) => w.id));
  for (const w of before.maintenanceWindows) {
    if (keptIds.has(w.id)) continue;
    for (const a of open(w.id)) await cancel(a, 'The maintenance window was deleted');
  }

  for (const w of after.maintenanceWindows) {
    const current = open(w.id);
    if (!w.notifyInAdvance) {
      for (const a of current) await cancel(a, 'Advance notice was switched off for this maintenance window');
      continue;
    }
    // Once a window has started an advance notice is too late; its records are left as they are.
    if (w.startsAt <= now) continue;

    const notice = noticeFor(after, w, now);
    let editable = current;
    if (current.some((a) => a.status === SENDING && a.maintenanceNoticeKey !== notice.key)) {
      for (const a of current) await cancel(a, 'The maintenance window changed while the notice was being sent; a new notice replaces it');
      editable = [];
    }
    if (editable.length > 0) {
      const [keep, ...extra] = editable;
      for (const a of extra) await cancel(a, 'Replaced by a newer notice for the same maintenance window');
      if (keep.maintenanceNoticeKey === notice.key) continue;

      const reapprove = APPROVED_STATUSES.includes(keep.status);
      const set: Record<string, any> = {
        title: notice.title,
        message: notice.message,
        scheduledFor: notice.scheduledFor,
        maintenanceNoticeKey: notice.key,
        updatedAt: now,
        updatedBy: by,
      };
      if (reapprove) {
        Object.assign(set, {
          status: 'pending_approval',
          statusReason: 'The maintenance window changed, so the notice needs approval again',
          statusChangedAt: now,
          statusChangedBy: by,
          approvedBy: null,
          approvedAt: null,
          // As when an announcement goes back to draft: a new approval starts a new send.
          recipientsProcessed: 0,
          sendCursor: null,
          acceptedCount: 0,
          failedCount: 0,
          notSentCount: 0,
        });
      }
      await collection.updateOne({ _id: keep._id }, { $set: set });
      await logAudit({
        admin,
        action: 'update',
        module: 'communications',
        entityType: 'announcements',
        entityId: String(keep._id),
        entityLabel: notice.title,
        before: { title: keep.title, message: keep.message, scheduledFor: keep.scheduledFor, ...(reapprove ? { status: keep.status, approvedBy: keep.approvedBy } : {}) },
        after: { title: set.title, message: set.message, scheduledFor: set.scheduledFor, ...(reapprove ? { status: 'pending_approval', approvedBy: null } : {}) },
        reason: `The maintenance window changed. Platform configuration change: ${reason}`,
        request,
      });
      changes.push({ windowId: w.id, action: reapprove ? 'needs_approval_again' : 'updated', announcementId: String(keep._id), title: notice.title });
      continue;
    }

    // Nothing open: a notice for this exact version of the window was already sent or cancelled.
    if (forWindow(w.id).some((a) => a.maintenanceNoticeKey === notice.key)) continue;

    const doc = {
      title: notice.title,
      message: notice.message,
      audience: 'all',
      // The audience filters of the announcement form, empty: everyone.
      city: null,
      eventFilter: null,
      attendedOnly: false,
      membershipFilter: null,
      channels: [...after.advanceNotice.channels],
      templateKey: after.advanceNotice.templateKey,
      priority: 'normal',
      emergencyReason: null,
      scheduledFor: notice.scheduledFor,
      status: 'pending_approval',
      statusReason: 'Created from a scheduled maintenance window; needs approval before it can be sent',
      statusChangedAt: now,
      statusChangedBy: by,
      source: NOTICE_SOURCE,
      maintenanceWindowId: w.id,
      maintenanceNoticeKey: notice.key,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    };
    const inserted = await collection.insertOne(doc);
    await logAudit({
      admin,
      action: 'create',
      module: 'communications',
      entityType: 'announcements',
      entityId: String(inserted.insertedId),
      entityLabel: doc.title,
      after: doc,
      reason: `Advance notice of a scheduled maintenance window. Platform configuration change: ${reason}`,
      request,
    });
    changes.push({ windowId: w.id, action: 'created', announcementId: String(inserted.insertedId), title: doc.title });
  }

  return changes;
}
