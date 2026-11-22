import { NextRequest, NextResponse } from 'next/server';
import { isAdminWith } from '@/lib/auth';
import { appAuthMode, getAppPhone } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';
import {
  PUBLIC_PERSON_PROJECTION,
  bookingStatsForEvent,
  identifyCaller,
  mergeTickets,
  prepareStaff,
  sanitiseEvent,
  staffNames,
  summariseTickets,
} from '@/app/api/admin/catalogue/_lib/shared';
import { maintenanceBlock } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'];

/** GET /api/events/[id]: read by the website and the user app without a login. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = toObjectId(params.id);
    if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });

    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: eventId });
    if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

    // An event that is not approved yet is visible only to an admin and to the
    // organiser or artist who created it.
    if (event.status !== 'approved' && !isAdminWith(request, 'events:view')) {
      const tokenPhone = getAppPhone(request);
      const denied = tokenPhone ? await ownerGate(request, db, event) : null;
      if (!tokenPhone || denied) {
        return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
      }
    }

    const artistIds = Array.isArray(event.artists) ? (event.artists.map((id: any) => toObjectId(id)).filter(Boolean) as any[]) : [];
    const creatorId = toObjectId(event.organizerId);

    const [organizer, artist, artistDetails] = await Promise.all([
      creatorId ? db.collection('organizers').findOne({ _id: creatorId }, { projection: PUBLIC_PERSON_PROJECTION }) : null,
      creatorId ? db.collection('artists').findOne({ _id: creatorId }, { projection: PUBLIC_PERSON_PROJECTION }) : null,
      artistIds.length
        ? db.collection('artists').find({ _id: { $in: artistIds } }, { projection: PUBLIC_PERSON_PROJECTION }).toArray()
        : [],
    ]);

    const result: Record<string, any> = { ...event, artistDetails };
    if (organizer) result.organizer = organizer;
    // Set when the event was created by an artist rather than an organiser.
    if (artist) result.artist = artist;

    return NextResponse.json({ success: true, event: sanitiseEvent(result) });
  } catch (error) {
    console.error('Error fetching event details:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch event details' }, { status: 500 });
  }
}

/**
 * DELETE /api/events/[id]
 * The organiser app calls this without a login, so it stays open, but an event
 * with confirmed bookings can only be removed by an admin who gives a reason.
 */
/**
 * For a caller who is not an admin: the event may only be changed by the
 * organiser or artist who created it. With a session token the phone must be
 * the creator's. Without one the request is let through only while the server
 * is in transition mode (APP_AUTH_MODE is not 'enforce'), so app builds that
 * do not send a token yet keep working.
 */
async function ownerGate(request: NextRequest, db: any, event: any): Promise<NextResponse | null> {
  const tokenPhone = getAppPhone(request);
  if (!tokenPhone) {
    if (appAuthMode() === 'enforce') {
      return NextResponse.json({ success: false, error: 'Please sign in again to continue.' }, { status: 401 });
    }
    return null;
  }

  const creatorId = toObjectId(String(event.organizerId || ''));
  const [organizer, artist] = creatorId
    ? await Promise.all([
        db.collection('organizers').findOne({ _id: creatorId }, { projection: { phone: 1 } }),
        db.collection('artists').findOne({ _id: creatorId }, { projection: { phone: 1 } }),
      ])
    : [null, null];

  if (organizer?.phone === tokenPhone || artist?.phone === tokenPhone) return null;
  return NextResponse.json(
    { success: false, error: 'Only the organiser who created this event can change it.' },
    { status: 403 }
  );
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const down = await maintenanceBlock(null, request); if (down) return down;
    const eventId = toObjectId(params.id);
    if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });

    const caller = await identifyCaller(request, 'events:manage');
    if (caller.kind === 'denied') return caller.response;

    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500) || asString(request.nextUrl.searchParams.get('reason'), 500);

    if (caller.kind === 'admin' && !reason) {
      return NextResponse.json({ success: false, error: 'A reason is required to delete an event' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: eventId });
    if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

    if (caller.kind !== 'admin') {
      const denied = await ownerGate(request, db, event);
      if (denied) return denied;
    }

    const stats = await bookingStatsForEvent(db, eventId);
    if (stats.confirmedBookings > 0 && caller.kind !== 'admin') {
      return NextResponse.json(
        {
          success: false,
          error: `This event has ${stats.confirmedBookings} confirmed booking${stats.confirmedBookings === 1 ? '' : 's'} and cannot be deleted. Contact Mookalaa support to cancel it.`,
        },
        { status: 409 }
      );
    }

    await db.collection('events').deleteOne({ _id: eventId });

    if (caller.kind === 'admin') {
      await logAudit({
        admin: caller.admin,
        action: 'delete',
        module: 'events',
        entityType: 'event',
        entityId: String(eventId),
        entityLabel: event.name,
        before: {
          name: event.name,
          status: event.status,
          category: event.category,
          startDate: event.startDate,
          organizerId: event.organizerId,
          tickets: summariseTickets(event.tickets),
          scannerStaff: staffNames(event.scannerStaff),
        },
        reason,
        meta: { confirmedBookings: stats.confirmedBookings, confirmedSeats: stats.confirmedSeats },
        request,
      });
    }

    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete event' }, { status: 500 });
  }
}

/**
 * PATCH /api/events/[id]
 *  - anonymous (organiser app): may only replace `tickets`; stored `sold` values are kept.
 *  - admin with events:manage: may also set `status` (with `reason`) and `scannerStaff`.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const down = await maintenanceBlock(null, request); if (down) return down;
    const eventId = toObjectId(params.id);
    if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });

    const caller = await identifyCaller(request, 'events:manage');
    if (caller.kind === 'denied') return caller.response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { status, tickets, scannerStaff } = body;

    if (caller.kind !== 'admin' && (status !== undefined || scannerStaff !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Only a Mookalaa admin can change the status or scanner staff of an event' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: eventId });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    if (caller.kind !== 'admin') {
      const denied = await ownerGate(request, db, event);
      if (denied) return denied;
    }

    const now = new Date();
    const updateData: Record<string, any> = {};
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    if (tickets !== undefined) {
      const merged = mergeTickets(tickets, event.tickets);
      if (merged.error) return NextResponse.json({ success: false, error: merged.error }, { status: merged.status || 400 });
      updateData.tickets = merged.tickets;
      before.tickets = summariseTickets(event.tickets);
      after.tickets = summariseTickets(merged.tickets);
    }

    if (scannerStaff !== undefined) {
      if (!Array.isArray(scannerStaff)) return NextResponse.json({ error: 'scannerStaff must be an array' }, { status: 400 });
      updateData.scannerStaff = await prepareStaff(scannerStaff, Array.isArray(event.scannerStaff) ? event.scannerStaff : []);
      before.scannerStaff = staffNames(event.scannerStaff);
      after.scannerStaff = staffNames(updateData.scannerStaff);
    }

    const reason = asString(body.reason, 500);
    let statusChanged = false;

    if (status !== undefined) {
      if (typeof status !== 'string' || !STATUSES.includes(status)) {
        return NextResponse.json({ success: false, error: 'status must be pending, approved or rejected' }, { status: 400 });
      }
      const previous = STATUSES.includes(event.status) ? event.status : 'pending';

      if (status !== event.status) {
        if (status === 'rejected' && !reason) {
          return NextResponse.json({ success: false, error: 'A reason is required to reject an event' }, { status: 400 });
        }
        if (previous !== 'pending' && !reason) {
          return NextResponse.json(
            { success: false, error: 'A reason is required to reverse a decision that was already made' },
            { status: 400 }
          );
        }

        statusChanged = true;
        updateData.status = status;
        updateData.reviewedBy = caller.kind === 'admin' ? caller.admin.email || null : null;
        updateData.reviewedAt = now;
        updateData.rejectionReason = status === 'rejected' ? reason : null;
        updateData.statusReason = reason || null;
        before.status = event.status ?? null;
        after.status = status;

        if (status === 'approved') {
          // With no artists selected there is nobody to wait for.
          const hasArtists = Array.isArray(event.artists) && event.artists.length > 0;
          if (!hasArtists) updateData.artistResponse = 'accepted';
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      if (status !== undefined) return NextResponse.json({ success: true, message: 'Event already has this status', unchanged: true });
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    updateData.updatedAt = now;

    // When tickets are replaced, write only if they are still as they were
    // read. A sale in between changes the sold count; overwriting it with the
    // older copy would lose that sale.
    const filter: Record<string, any> = { _id: eventId };
    if (updateData.tickets) filter.tickets = event.tickets ?? null;
    const written = await db.collection('events').updateOne(filter, { $set: updateData });
    if (written.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Tickets were sold while you were editing. Reload the event and try again.' },
        { status: 409 }
      );
    }

    if (caller.kind !== 'admin' && updateData.tickets) {
      // Inventory changes made from the organiser app are kept in the event's history too.
      await logAudit({
        admin: null,
        action: 'organizer_ticket_update',
        module: 'events',
        entityType: 'event',
        entityId: String(eventId),
        entityLabel: event.name,
        before,
        after,
        meta: { actor: 'organizer', phone: getAppPhone(request) },
        request,
      });
    }

    if (caller.kind === 'admin') {
      await logAudit({
        admin: caller.admin,
        action: statusChanged ? 'status_change' : 'update',
        module: 'events',
        entityType: 'event',
        entityId: String(eventId),
        entityLabel: event.name,
        before,
        after,
        reason: reason || null,
        request,
      });
    }

    const message = !statusChanged
      ? updateData.tickets
        ? 'Tickets updated successfully'
        : 'Event updated successfully'
      : status === 'approved' && !updateData.artistResponse
      ? 'Event approved successfully. Waiting for artist acceptance.'
      : status === 'approved'
      ? 'Event approved and organized successfully (no artist required).'
      : 'Event status updated successfully';

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}
