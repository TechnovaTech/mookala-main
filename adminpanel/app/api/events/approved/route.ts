import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { escapeRegex } from '@/lib/http';
import { VENUE_LOOKUP_STAGES, sanitiseEvent } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** GET /api/events/approved: the public event list of the website and the user app. */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get('category') || '').trim().slice(0, 100);

    const matchCriteria: any = {
      status: 'approved',
      $or: [
        { artistResponse: 'accepted' },
        {
          $and: [
            { $or: [{ artists: { $exists: false } }, { artists: { $size: 0 } }] },
            { artistResponse: { $exists: false } },
          ],
        },
      ],
    };

    if (category) {
      matchCriteria.category = { $regex: escapeRegex(category), $options: 'i' };
    }

    const events = await db
      .collection('events')
      .aggregate([
        { $match: matchCriteria },
        ...VENUE_LOOKUP_STAGES,
        { $addFields: { venue: { $ifNull: ['$venueDetails', '$venue'] } } },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      events: events.map((event) => sanitiseEvent(event)),
      count: events.length,
    });
  } catch (error) {
    console.error('Error fetching approved events:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch events' }, { status: 500 });
  }
}
