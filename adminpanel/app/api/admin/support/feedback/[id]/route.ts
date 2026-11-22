import { NextRequest } from 'next/server';
import type { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { findBooking } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/support/feedback/[id]   (support:view)
 * What a moderator needs next to a rating: the booking it was given for
 * (and whether it was attended), the event, its organiser and artists.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid feedback id', 400);

  try {
    const { db } = await connectToDatabase();
    const entry = await db.collection('feedback').findOne({ _id: oid });
    if (!entry) return fail('Feedback not found', 404);

    const booking = entry.bookingId ? await findBooking(db, String(entry.bookingId)) : null;
    const eventOid = toObjectId(entry.eventId || (entry.targetType === 'event' ? entry.targetId : null));
    const event = eventOid ? await db.collection('events').findOne({ _id: eventOid }, { projection: { name: 1, status: 1, startDate: 1, organizerId: 1, creatorRole: 1 } }) : null;
    const organizerOid = toObjectId(entry.organizerId);
    const organizer = organizerOid ? await db.collection('organizers').findOne({ _id: organizerOid }, { projection: { name: 1 } }) : null;
    const artistOids = (Array.isArray(entry.artistIds) ? entry.artistIds : [])
      .map((a: any) => toObjectId(String(a)))
      .filter((a: ObjectId | null): a is ObjectId => a !== null);
    const artists = artistOids.length ? await db.collection('artists').find({ _id: { $in: artistOids } }, { projection: { name: 1 } }).toArray() : [];

    return ok({
      source: entry.source || 'admin',
      booking: booking
        ? {
            _id: String(booking._id),
            eventTitle: booking.eventTitle || '',
            status: booking.status || '',
            checkedIn: booking.checkedIn === true,
            attended: booking.status === 'attended' || booking.checkedIn === true,
          }
        : null,
      event: event ? { _id: String(event._id), name: event.name || '', status: event.status || '', startDate: event.startDate || null } : null,
      organizer: organizer ? { _id: String(organizer._id), name: organizer.name || '' } : null,
      artists: artists.map((a) => ({ _id: String(a._id), name: a.name || '' })),
      moderation: entry.moderatedAt ? { by: entry.moderatedBy || null, at: entry.moderatedAt, reason: entry.moderationReason || null } : null,
    });
  } catch (error) {
    console.error('Feedback context failed:', error);
    return fail('Failed to load the rating', 500);
  }
}
