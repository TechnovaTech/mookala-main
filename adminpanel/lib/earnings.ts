import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { requireAppUser } from './app-auth';
import { payeeBalance } from './ledger';
import { fail, ok } from './http';

/**
 * What an artist or organiser has earned through Mookalaa, for their own app.
 * Figures come from the ledger only: money that was verified with the payment
 * gateway, less commission, GST, gateway charges and refunds, and what has
 * already been paid out. Nothing is estimated from ticket counts.
 */
export async function earningsResponse(request: NextRequest, role: 'artist' | 'organizer') {
  const auth = requireAppUser(request, request.nextUrl.searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const collection = role === 'artist' ? 'artists' : 'organizers';
    const account = await db.collection(collection).findOne({ phone: auth.phone }, { projection: { _id: 1, name: 1 } });
    if (!account) return fail('Account not found', 404);

    const payeeId = String(account._id);
    const [balance, entries, settlements] = await Promise.all([
      payeeBalance(db, role, payeeId),
      db
        .collection('transactions')
        .find(
          { payeeType: role, payeeId, status: 'success', type: { $in: ['payment', 'refund', 'settlement'] } },
          { projection: { reference: 1, type: 1, amount: 1, description: 1, eventId: 1, bookingId: 1, createdAt: 1 } }
        )
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      db
        .collection('settlements')
        .find(
          { payeeType: role, payeeId },
          { projection: { periodFrom: 1, periodTo: 1, netAmount: 1, status: 1, dueDate: 1, paidAt: 1, bankReference: 1 } }
        )
        .sort({ createdAt: -1 })
        .limit(24)
        .toArray(),
    ]);

    return ok({
      currency: 'INR',
      balance,
      hasEntries: balance.gross > 0 || entries.length > 0,
      entries: entries.map((entry) => ({
        reference: entry.reference,
        type: entry.type,
        amount: entry.amount,
        description: entry.description || '',
        eventId: entry.eventId || null,
        bookingId: entry.bookingId || null,
        date: entry.createdAt,
      })),
      settlements: settlements.map((s) => ({
        id: String(s._id),
        periodFrom: s.periodFrom || null,
        periodTo: s.periodTo || null,
        amount: s.netAmount,
        status: s.status,
        dueDate: s.dueDate || null,
        paidAt: s.paidAt || null,
        bankReference: s.status === 'paid' ? s.bankReference || null : null,
      })),
    });
  } catch (error) {
    console.error(`${role} earnings error:`, error);
    return fail('Could not load earnings', 500);
  }
}
