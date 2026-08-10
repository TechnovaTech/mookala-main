import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * POST /api/bookings/verify
 * Body: { bookingId } OR { qrData: "<json string from the ticket QR>" }
 *
 * Verifies a ticket against the database and performs a one-time check-in:
 *  - not found            -> valid:false, reason:"not_found"
 *  - already checked in   -> valid:false, reason:"already_used"  (+ prior check-in time)
 *  - cancelled            -> valid:false, reason:"cancelled"
 *  - otherwise            -> valid:true, marks checkedIn + status:"attended"
 *
 * A `checkOnly:true` flag verifies WITHOUT marking the ticket as used.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let bookingId: string | undefined = body.bookingId;
    const checkOnly: boolean = body.checkOnly === true;

    // Allow passing the raw QR JSON payload directly.
    if (!bookingId && body.qrData) {
      try {
        const parsed = typeof body.qrData === 'string' ? JSON.parse(body.qrData) : body.qrData;
        bookingId = parsed.bookingId || parsed._id || parsed.id;
      } catch {
        return NextResponse.json(
          { success: true, valid: false, reason: 'bad_qr', message: 'QR data is not valid' },
          { status: 200 }
        );
      }
    }

    if (!bookingId) {
      return NextResponse.json(
        { success: false, error: 'bookingId or qrData is required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Resolve the booking by ObjectId when possible, else by common string id fields.
    let booking = null;
    if (/^[a-fA-F0-9]{24}$/.test(bookingId)) {
      booking = await db.collection('bookings').findOne({ _id: new ObjectId(bookingId) });
    }
    if (!booking) {
      // The mobile app generates its own `_id` (a millisecond timestamp) and
      // sends it with the booking, so most tickets are stored under a plain
      // string _id rather than an ObjectId. Without this lookup every one of
      // those QR codes reported "ticket not found" at the gate.
      booking = await db.collection('bookings').findOne({ _id: bookingId as any });
    }
    if (!booking) {
      // Fallback: some tickets carry a string bookingId/ticketId field.
      booking = await db.collection('bookings').findOne({
        $or: [{ bookingId: bookingId }, { ticketId: bookingId }],
      });
    }

    if (!booking) {
      return NextResponse.json({
        success: true,
        valid: false,
        reason: 'not_found',
        message: 'Ticket not found',
      });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({
        success: true,
        valid: false,
        reason: 'cancelled',
        message: 'This ticket was cancelled',
        booking: serialize(booking),
      });
    }

    if (booking.checkedIn === true) {
      return NextResponse.json({
        success: true,
        valid: false,
        reason: 'already_used',
        message: 'Ticket already checked in',
        checkedInAt: booking.checkedInAt || null,
        booking: serialize(booking),
      });
    }

    // Valid ticket. Mark as used unless caller only wants to peek.
    if (!checkOnly) {
      const checkedInAt = new Date();
      await db.collection('bookings').updateOne(
        { _id: booking._id },
        { $set: { checkedIn: true, checkedInAt, status: 'attended', updatedAt: checkedInAt } }
      );
      booking.checkedIn = true;
      booking.checkedInAt = checkedInAt;
      booking.status = 'attended';
    }

    return NextResponse.json({
      success: true,
      valid: true,
      reason: 'ok',
      message: checkOnly ? 'Ticket is valid' : 'Ticket verified & checked in',
      booking: serialize(booking),
    });
  } catch (error) {
    console.error('Verify Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify ticket' },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(booking: any) {
  return {
    _id: booking._id?.toString(),
    eventTitle: booking.eventTitle || '',
    eventDate: booking.eventDate || '',
    eventTime: booking.eventTime || '',
    venue: booking.venue || '',
    userPhone: booking.userPhone || '',
    totalSeats: booking.totalSeats || 0,
    totalPrice: booking.totalPrice || 0,
    tickets: booking.tickets || [],
    status: booking.status || '',
    checkedIn: booking.checkedIn === true,
    checkedInAt: booking.checkedInAt || null,
  };
}
