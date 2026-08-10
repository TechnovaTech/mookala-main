import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get('userPhone');
    const organizerPhone = searchParams.get('organizerPhone');
    const eventTitle = searchParams.get('eventTitle');
    const eventId = searchParams.get('eventId');

    const query: Record<string, unknown> = {};

    if (userPhone) {
      query.userPhone = userPhone;
    }

    if (eventId) {
      query.eventId = eventId;
    }

    if (eventTitle) {
      query.eventTitle = eventTitle;
    }

    // The organizer app asks for its own event bookings with organizerPhone,
    // but these filters used to be ignored entirely — every caller received
    // every booking on the platform, including other organizers' customers.
    // Resolve the organizer's events and scope the query to them.
    if (organizerPhone) {
      const organizer = await db.collection('organizers').findOne({ phone: organizerPhone });
      const artist = await db.collection('artists').findOne({ phone: organizerPhone });

      const creatorIds = [];
      if (organizer) creatorIds.push(organizer._id);
      if (artist) creatorIds.push(artist._id);

      if (creatorIds.length === 0) {
        return NextResponse.json({ success: true, bookings: [] });
      }

      const events = await db.collection('events')
        .find({ organizerId: { $in: creatorIds } })
        .project({ _id: 1, name: 1 })
        .toArray();

      if (events.length === 0) {
        return NextResponse.json({ success: true, bookings: [] });
      }

      // Bookings reference their event by id, but older rows carry the title.
      const eventIds = events.map((event) => event._id.toString());
      const eventNames = events.map((event) => event.name).filter(Boolean);

      query.$or = [
        { eventId: { $in: eventIds } },
        { eventTitle: { $in: eventNames } },
      ];
    }

    const bookings = await db.collection('bookings')
      .find(query)
      .sort({ bookingDate: -1 })
      .toArray();

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const bookingData = await request.json();

    const requested: any[] = Array.isArray(bookingData.tickets) ? bookingData.tickets : [];

    // Nothing used to check availability, so a block of 100 seats could be
    // sold 110 times and the same seat could go to two people. Validate the
    // request against the event's tickets before writing anything.
    let event: any = null;
    if (bookingData.eventId && /^[a-fA-F0-9]{24}$/.test(String(bookingData.eventId))) {
      event = await db.collection('events').findOne({ _id: new ObjectId(String(bookingData.eventId)) });
    }

    if (event && requested.length > 0) {
      const eventTickets: any[] = Array.isArray(event.tickets) ? event.tickets : [];

      for (const line of requested) {
        const ticket = eventTickets.find(
          (t) => t.name === line.category || (line.block && t.blockName === line.block)
        );
        if (!ticket) continue;

        const capacity = parseInt(ticket.quantity) || 0;
        const alreadySold = parseInt(ticket.sold) || 0;
        const wanted = parseInt(line.quantity) || 0;

        if (wanted <= 0) {
          return NextResponse.json(
            { success: false, error: 'Ticket quantity must be at least 1' },
            { status: 400 }
          );
        }

        if (alreadySold + wanted > capacity) {
          return NextResponse.json(
            {
              success: false,
              error: `Only ${Math.max(0, capacity - alreadySold)} seat(s) left in ${ticket.name}`,
            },
            { status: 409 }
          );
        }

        // Seats are numbered within the block, so a request must stay inside it.
        const startSeat = parseInt(ticket.startSeat) || 1;
        const endSeat = parseInt(ticket.endSeat) || capacity;
        const from = parseInt(line.fromSeat);
        const to = parseInt(line.toSeat);

        if (!Number.isNaN(from) && !Number.isNaN(to) && (from < startSeat || to > endSeat)) {
          return NextResponse.json(
            {
              success: false,
              error: `Seats ${from}-${to} are outside ${ticket.name} (${startSeat}-${endSeat})`,
            },
            { status: 409 }
          );
        }
      }
    }

    // Add timestamp and generate booking ID
    const booking = {
      ...bookingData,
      bookingDate: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('bookings').insertOne(booking);

    // Keep the event's sold counts in step. Nothing wrote these before, so
    // the finance page reported zero revenue and the gate's scan stats showed
    // a full house remaining no matter how many tickets had gone out.
    if (event && requested.length > 0) {
      const eventTickets: any[] = Array.isArray(event.tickets) ? event.tickets : [];
      let changed = false;

      for (const line of requested) {
        const ticket = eventTickets.find(
          (t) => t.name === line.category || (line.block && t.blockName === line.block)
        );
        if (!ticket) continue;
        ticket.sold = String((parseInt(ticket.sold) || 0) + (parseInt(line.quantity) || 0));
        changed = true;
      }

      if (changed) {
        await db.collection('events').updateOne(
          { _id: event._id },
          { $set: { tickets: eventTickets, updatedAt: new Date() } }
        );
      }
    }

    return NextResponse.json({
      success: true,
      bookingId: result.insertedId,
      message: 'Booking created successfully'
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}