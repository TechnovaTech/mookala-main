import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { escapeRegex, fail, ok, parseAmount, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Bookings of one event, a page at a time. Admin only ('finance:view', enforced
 * by the middleware).
 *
 * Bookings store `eventId` as a plain string (that is what the apps and the
 * website send); very old rows may hold an ObjectId, so both are matched.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid event ID', 400);

  try {
    const { db } = await connectToDatabase();
    const search = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(search.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(search.get('limit') || '25', 10) || 25));

    const filter: Record<string, any> = { eventId: { $in: [params.id, oid] } };
    const paymentStatus = (search.get('paymentStatus') || '').slice(0, 30);
    if (/^[a-z_]+$/.test(paymentStatus)) filter.paymentStatus = paymentStatus;
    const q = (search.get('q') || '').trim().slice(0, 60);
    if (q) filter.userPhone = { $regex: escapeRegex(q), $options: 'i' };

    const collection = db.collection('bookings');
    const [rows, total] = await Promise.all([
      collection
        .find(filter, {
          projection: {
            userPhone: 1,
            tickets: 1,
            totalSeats: 1,
            totalPrice: 1,
            amountPaid: 1,
            status: 1,
            paymentStatus: 1,
            paymentId: 1,
            gatewayPaymentId: 1,
            refundId: 1,
            checkedIn: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    const bookings = rows.map((b) => {
      const tickets = (Array.isArray(b.tickets) ? b.tickets : []).slice(0, 50).map((t: any) => ({
        category: t?.category ?? null,
        block: t?.block ?? null,
        fromSeat: t?.fromSeat ?? null,
        toSeat: t?.toSeat ?? null,
        quantity: parseInt(String(t?.quantity ?? 0), 10) || 0,
        price: parseAmount(t?.price),
        totalPrice: parseAmount(t?.totalPrice),
      }));
      return {
        _id: String(b._id),
        userPhone: b.userPhone || null,
        tickets,
        totalSeats: parseInt(String(b.totalSeats ?? 0), 10) || tickets.reduce((sum: number, t: any) => sum + t.quantity, 0),
        totalPrice: parseAmount(b.totalPrice),
        amountPaid: typeof b.amountPaid === 'number' ? b.amountPaid : null,
        status: b.status || null,
        paymentStatus: b.paymentStatus || null,
        gatewayPaymentId: b.gatewayPaymentId || null,
        refundId: b.refundId || null,
        checkedIn: Boolean(b.checkedIn),
        createdAt: b.createdAt || null,
      };
    });

    return ok({ bookings, total, page, limit });
  } catch (error) {
    console.error('Error fetching event bookings:', error);
    return fail('Failed to fetch bookings', 500);
  }
}
