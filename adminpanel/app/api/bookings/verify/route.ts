import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { asString } from '@/lib/http';
import { checkInBlock, effectivePaymentStatus, findBooking, markCheckedIn } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/verify (public: the gate scanners in both apps)
 * Body: { bookingId } OR { qrData: "<json string from the ticket QR>" },
 *       optional { eventId } (the event the scanner is working at),
 *       optional { checkOnly: true } to look without admitting.
 *
 * Always answers 200 with { success, valid, reason, message, booking }.
 * Reasons: ok, bad_qr, not_found, already_used, cancelled, and (new)
 * wrong_event, payment_pending, expired, payment_unverified, not_confirmed.
 *
 * The check-in itself is one conditional update, so when two scanners read
 * the same ticket at the same moment exactly one of them is told "ok".
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'bookingId or qrData is required' }, { status: 400 });
    }

    let bookingId = asString(body.bookingId, 80);
    const checkOnly = body.checkOnly === true;
    const eventId = asString(body.eventId, 80);

    // Allow passing the raw QR JSON payload directly.
    if (!bookingId && body.qrData) {
      try {
        const parsed = typeof body.qrData === 'string' ? JSON.parse(body.qrData) : body.qrData;
        bookingId = asString(parsed?.bookingId, 80) || asString(parsed?._id, 80) || asString(parsed?.id, 80);
      } catch {
        bookingId = '';
      }
      if (!bookingId) {
        return NextResponse.json({ success: true, valid: false, reason: 'bad_qr', message: 'QR data is not valid' });
      }
    }

    if (!bookingId) {
      return NextResponse.json({ success: false, error: 'bookingId or qrData is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Tickets are stored under an ObjectId or, for old app versions, a plain
    // string _id; a few carry a separate bookingId/ticketId field.
    let booking = await findBooking(db, bookingId);
    if (!booking) {
      booking = await db.collection('bookings').findOne({ $or: [{ bookingId }, { ticketId: bookingId }] });
    }

    if (!booking) {
      return NextResponse.json({ success: true, valid: false, reason: 'not_found', message: 'Ticket not found' });
    }

    const refuse = (reason: string, message: string, current: any) =>
      NextResponse.json({
        success: true,
        valid: false,
        reason,
        message,
        ...(reason === 'already_used' ? { checkedInAt: current.checkedInAt || null } : {}),
        booking: serialize(current),
      });

    const block = checkInBlock(booking, eventId || undefined);
    if (block) return refuse(block.reason, block.message, booking);

    if (!checkOnly) {
      const result = await markCheckedIn(db, booking, 'scanner');
      if (!result.done) {
        // Another scanner got there first, or the booking changed meanwhile.
        const current = (await db.collection('bookings').findOne({ _id: booking._id })) || booking;
        const now = checkInBlock(current, eventId || undefined) || {
          reason: 'already_used',
          message: 'Ticket already checked in',
        };
        return refuse(now.reason, now.message, current);
      }
      booking.checkedIn = true;
      booking.checkedInAt = result.checkedInAt;
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
    return NextResponse.json({ success: false, error: 'Failed to verify ticket' }, { status: 500 });
  }
}

function serialize(booking: any) {
  return {
    _id: booking._id?.toString(),
    eventId: booking.eventId ? String(booking.eventId) : '',
    eventTitle: booking.eventTitle || '',
    eventDate: booking.eventDate || '',
    eventTime: booking.eventTime || '',
    venue: booking.venue || '',
    userPhone: booking.userPhone || '',
    totalSeats: booking.totalSeats || 0,
    totalPrice: booking.totalPrice || 0,
    tickets: booking.tickets || [],
    status: booking.status || '',
    paymentStatus: effectivePaymentStatus(booking),
    checkedIn: booking.checkedIn === true,
    checkedInAt: booking.checkedInAt || null,
  };
}
