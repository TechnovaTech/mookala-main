import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Valid 10-digit phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Match on the phone alone, whatever the status. Filtering to finished
    // profiles here used to strand anyone who started signing up and stopped
    // before completing: check-user said "new", registration then rejected the
    // number as already taken, and the phone could never get past this screen.
    // The caller decides what to do with an unfinished profile via `status`.
    const artist = await db.collection('artists').findOne({ phone });
    const organizer = await db.collection('organizers').findOne({ phone });

    // A phone may hold both roles — they live in separate collections — so
    // report every role found, not just the first match.
    const roles = [
      ...(artist ? ['artist'] : []),
      ...(organizer ? ['organizer'] : []),
    ];

    if (artist) {
      return NextResponse.json({
        exists: true,
        role: 'artist',
        roles,
        user: {
          phone: artist.phone,
          _id: artist._id,
          status: artist.status,
          name: artist.name || null
        }
      });
    }

    if (organizer) {
      return NextResponse.json({
        exists: true,
        role: 'organizer',
        roles,
        user: {
          phone: organizer.phone,
          _id: organizer._id,
          status: organizer.status,
          name: organizer.name || null
        }
      });
    }

    return NextResponse.json({ exists: false, roles: [] });
  } catch (error) {
    return NextResponse.json({ error: 'Check user failed' }, { status: 500 });
  }
}