import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** GET /api/artist/dashboard-stats?phone= */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne(
      { phone: auth.phone },
      { projection: { name: 1, phone: 1, status: 1, followersCount: 1, totalEarnings: 1 } }
    );
    if (!artist) return fail('Artist not found', 404);

    const followers = await db.collection('users').countDocuments({ followedArtists: artist._id });
    if (artist.followersCount !== followers) {
      await db.collection('artists').updateOne({ _id: artist._id }, { $set: { followersCount: followers } });
    }

    // A booking request is an approved event that lists the artist and has no
    // answer yet: the same rule as /api/artist/booking-requests.
    const bookingRequests = await db.collection('events').countDocuments({
      artists: artist._id,
      status: 'approved',
      artistResponse: { $exists: false },
    });

    // `startDate` is stored as "YYYY-MM-DD" text.
    const today = new Date().toISOString().slice(0, 10);
    const upcomingEvents = await db.collection('events').countDocuments({
      artists: artist._id,
      artistResponse: 'accepted',
      startDate: { $gte: today },
    });

    return ok({
      stats: {
        followers,
        bookingRequests,
        upcomingEvents,
        totalEarnings: artist.totalEarnings || 0,
      },
      artist: {
        _id: artist._id.toString(),
        name: artist.name,
        phone: artist.phone,
        status: artist.status,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return fail('Failed to fetch dashboard stats', 500);
  }
}
