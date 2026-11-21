import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { toObjectId } from '@/lib/http';
import { bookingStatsForEvent, summariseTickets } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events/[id]/scan-stats: read by the gate staff screen of the organiser app.
 *
 *   totalTickets      seats on sale across all ticket categories
 *   soldTickets       seats sold (ticket inventory, or confirmed bookings when that is higher)
 *   scannedTickets    seats on bookings that were checked in at the gate
 *   remainingTickets  sold seats that have not been scanned yet
 *   unsoldTickets     seats still available to buy
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = toObjectId(params.id);
    if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });

    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: eventId }, { projection: { tickets: 1 } });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const tickets = summariseTickets(event.tickets);
    const totalTickets = tickets.reduce((sum, t) => sum + t.quantity, 0);
    const inventorySold = tickets.reduce((sum, t) => sum + t.sold, 0);

    const bookings = await bookingStatsForEvent(db, eventId);
    const scannedTickets = bookings.checkedInSeats;
    const soldTickets = Math.max(inventorySold, bookings.confirmedSeats, scannedTickets);

    return NextResponse.json({
      success: true,
      stats: {
        totalTickets,
        soldTickets,
        scannedTickets,
        remainingTickets: Math.max(0, soldTickets - scannedTickets),
        unsoldTickets: Math.max(0, totalTickets - soldTickets),
      },
    });
  } catch (error) {
    console.error('Error fetching scan stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
