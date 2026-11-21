import { NextRequest, NextResponse } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';
import {
  PUBLIC_PERSON_PROJECTION,
  VENUE_LOOKUP_STAGES,
  identifyCaller,
  prepareStaff,
  sanitiseEvent,
} from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'];

/** Fields a client may never set on a new event. */
const SERVER_ONLY_FIELDS = [
  '_id',
  'status',
  'artistResponse',
  'rejectionReason',
  'reviewedBy',
  'reviewedAt',
  'creatorRole',
  'createdAt',
  'updatedAt',
  'organizerPhone',
  'organizerRole',
];

// Largest event (mostly its base64 media) that fits safely in one MongoDB document.
const MAX_EVENT_CHARS = 12_000_000;

function personLookup(from: string, as: string) {
  return [
    {
      $lookup: {
        from,
        let: { creatorId: '$organizerId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } }, { $project: PUBLIC_PERSON_PROJECTION }],
        as,
      },
    },
    { $unwind: { path: '$' + as, preserveNullAndEmptyArrays: true } },
  ];
}

/**
 * GET /api/events
 * The user app calls this without a login, so anonymous callers only receive
 * approved events. An admin with events:view receives every event.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const match = isAdminWith(request, 'events:view') ? {} : { status: 'approved' };

    const events = await db
      .collection('events')
      .aggregate([
        { $match: match },
        ...personLookup('organizers', 'organizer'),
        ...personLookup('artists', 'artist'),
        ...VENUE_LOOKUP_STAGES,
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    return NextResponse.json({ events: events.map((event) => sanitiseEvent(event)) });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

/**
 * POST /api/events
 * Called by the organiser app without a login. An anonymous caller always
 * creates a pending event; only an admin with events:manage may set `status`.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await identifyCaller(request, 'events:manage');
    if (caller.kind === 'denied') return caller.response;

    const raw = await request.text();
    if (raw.length > MAX_EVENT_CHARS) {
      return NextResponse.json(
        { error: 'The event is too large to save. Use fewer or smaller images (about 1 MB each).' },
        { status: 413 }
      );
    }

    let eventData: any;
    try {
      eventData = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!eventData || typeof eventData !== 'object' || Array.isArray(eventData)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (Object.keys(eventData).some((key) => key.startsWith('$') || key.includes('.'))) {
      return NextResponse.json({ error: 'Invalid field name' }, { status: 400 });
    }

    const name = asString(eventData.name, 300);
    if (!name) return NextResponse.json({ error: 'Event name is required' }, { status: 400 });

    const { db } = await connectToDatabase();

    // Events can be created by an organiser or by an artist: look in the
    // collection matching the sent role first, then fall back to the other.
    let organizerId = null;
    let creatorRole: string | null = null;
    const organizerPhone = asString(eventData.organizerPhone, 30);
    if (caller.kind !== 'admin') {
      // An app user may only create events for their own phone number.
      const gate = requireAppUser(request, organizerPhone);
      if (!gate.ok) return gate.response;
    }

    if (organizerPhone) {
      const collections = eventData.organizerRole === 'artist' ? ['artists', 'organizers'] : ['organizers', 'artists'];
      for (const collection of collections) {
        const creator = await db.collection(collection).findOne({ phone: organizerPhone }, { projection: { _id: 1 } });
        if (creator) {
          organizerId = creator._id;
          creatorRole = collection === 'artists' ? 'artist' : 'organizer';
          break;
        }
      }
      if (!organizerId) return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
    } else if (eventData.organizerId) {
      organizerId = toObjectId(eventData.organizerId);
      if (!organizerId) return NextResponse.json({ error: 'Invalid organizerId' }, { status: 400 });
      const isArtist = await db.collection('artists').findOne({ _id: organizerId }, { projection: { _id: 1 } });
      creatorRole = isArtist ? 'artist' : 'organizer';
    }

    let artists: any[] | undefined;
    if (Array.isArray(eventData.artists)) {
      artists = [];
      for (const id of eventData.artists) {
        const oid = toObjectId(id);
        if (!oid) return NextResponse.json({ error: 'Invalid artist id' }, { status: 400 });
        artists.push(oid);
      }
    }

    // Sales always start at zero, whatever the client sends.
    let tickets = eventData.tickets;
    if (Array.isArray(tickets)) {
      tickets = tickets
        .filter((t: any) => t && typeof t === 'object' && !Array.isArray(t))
        .map((t: any) => ({ ...t, sold: '0' }));
    }

    const requestedStatus = asString(eventData.status, 20);
    const status =
      caller.kind === 'admin' && STATUSES.includes(requestedStatus) ? requestedStatus : 'pending';

    const clean: Record<string, any> = { ...eventData };
    for (const key of SERVER_ONLY_FIELDS) delete clean[key];

    const now = new Date();
    const newEvent: Record<string, any> = {
      ...clean,
      name,
      ...(organizerId ? { organizerId, creatorRole } : {}),
      ...(artists ? { artists } : {}),
      ...(tickets !== undefined ? { tickets } : {}),
      category: eventData.category || null,
      subCategories: Array.isArray(eventData.subCategories)
        ? eventData.subCategories.filter((sub: any) => typeof sub === 'string' && sub.trim() !== '')
        : [],
      languages: Array.isArray(eventData.languages)
        ? eventData.languages.filter((lang: any) => typeof lang === 'string' && lang.trim() !== '')
        : typeof eventData.language === 'string' && eventData.language
        ? [eventData.language]
        : [],
      scannerStaff: await prepareStaff(eventData.scannerStaff),
      description: eventData.description || null,
      terms: eventData.terms || null,
      photographyContact: eventData.photographyContact || null,
      status,
      createdAt: now,
      updatedAt: now,
    };

    if (caller.kind === 'admin' && status !== 'pending') {
      newEvent.reviewedBy = caller.admin.email || null;
      newEvent.reviewedAt = now;
    }

    const result = await db.collection('events').insertOne(newEvent);

    if (caller.kind === 'admin') {
      await logAudit({
        admin: caller.admin,
        action: 'create',
        module: 'events',
        entityType: 'event',
        entityId: String(result.insertedId),
        entityLabel: name,
        after: { name, status, category: newEvent.category },
        request,
      });
    }

    return NextResponse.json({ message: 'Event created successfully', eventId: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
