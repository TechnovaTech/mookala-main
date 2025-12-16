import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;

    const event = await db.collection('events').findOne({
      _id: new ObjectId(eventId)
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const tickets = event.tickets || [];
    let totalTickets = 0;
    let scannedTickets = 0;

    tickets.forEach((ticket: any) => {
      const quantity = parseInt(ticket.quantity) || 0;
      const sold = parseInt(ticket.sold) || 0;
      totalTickets += quantity;
      scannedTickets += sold;
    });

    const remainingTickets = totalTickets - scannedTickets;

    return NextResponse.json({
      success: true,
      stats: {
        totalTickets,
        scannedTickets,
        remainingTickets
      }
    });
  } catch (error) {
    console.error('Error fetching scan stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}