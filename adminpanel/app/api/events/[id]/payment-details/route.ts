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
    let ticketsSold = 0;
    let totalRevenue = 0;

    const ticketBreakdown = tickets.map((ticket: any) => {
      const quantity = parseInt(ticket.quantity) || 0;
      const sold = parseInt(ticket.sold) || 0;
      const price = parseFloat(ticket.price?.replace('₹', '').replace(',', '')) || 0;
      
      totalTickets += quantity;
      ticketsSold += sold;
      totalRevenue += sold * price;

      return {
        name: ticket.name,
        price: ticket.price,
        quantity,
        sold,
        revenue: sold * price
      };
    });

    const eventDetails = {
      eventName: event.name,
      totalTickets,
      ticketsSold,
      totalRevenue: totalRevenue.toLocaleString('en-IN'),
      tickets: ticketBreakdown
    };

    return NextResponse.json({ success: true, eventDetails });
  } catch (error) {
    console.error('Error fetching event payment details:', error);
    return NextResponse.json({ error: 'Failed to fetch payment details' }, { status: 500 });
  }
}