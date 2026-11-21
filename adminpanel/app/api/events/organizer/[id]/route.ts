import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { payeeBalance, roundMoney } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Events created by one organiser (or artist), with the money each has in the
 * ledger and the creator's balance. Admin only ('finance:view', enforced by
 * the middleware). Base64 media and scanner staff logins are never returned.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid organiser ID', 400);

  try {
    const { db } = await connectToDatabase();

    const contact = { name: 1, email: 1, phone: 1, city: 1, kycStatus: 1 };
    let payeeType: 'organizer' | 'artist' = 'organizer';
    let payee = await db.collection('organizers').findOne({ _id: oid }, { projection: contact });
    if (!payee) {
      payee = await db.collection('artists').findOne({ _id: oid }, { projection: contact });
      if (payee) payeeType = 'artist';
    }

    const events = await db
      .collection('events')
      .find({ organizerId: { $in: [oid, params.id] } }, { projection: { media: 0, scannerStaff: 0, description: 0, terms: 0 } })
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray();

    if (!payee && events.length === 0) return fail('Organiser not found', 404);

    const eventIds = events.map((e) => String(e._id));
    const rows = eventIds.length
      ? await db
          .collection('transactions')
          .aggregate([
            // Only money owed to this organiser: an artist's fee on the same event is not theirs.
            { $match: { eventId: { $in: eventIds }, status: 'success', payeeId: params.id, payeeType: { $ne: 'platform' } } },
            { $group: { _id: { eventId: '$eventId', type: '$type' }, total: { $sum: '$amount' } } },
          ])
          .toArray()
      : [];

    const money = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = String(row._id.eventId);
      const entry = money.get(key) || {};
      entry[String(row._id.type)] = Number(row.total) || 0;
      money.set(key, entry);
    }

    const list = events.map((event) => {
      const m = money.get(String(event._id)) || {};
      const tickets = Array.isArray(event.tickets) ? event.tickets : [];
      const gross = roundMoney(m.payment || 0);
      return {
        ...event,
        _id: String(event._id),
        organizerId: String(event.organizerId),
        totalTickets: tickets.reduce((sum: number, t: any) => sum + (parseInt(String(t?.quantity ?? 0), 10) || 0), 0),
        ticketsSold: tickets.reduce((sum: number, t: any) => sum + (parseInt(String(t?.sold ?? 0), 10) || 0), 0),
        ledger: {
          gross,
          commission: roundMoney(m.commission || 0),
          gst: roundMoney(m.gst || 0),
          gatewayFee: roundMoney(m.gateway_fee || 0),
          refunds: roundMoney(m.refund || 0),
          net: roundMoney(gross - (m.commission || 0) - (m.gst || 0) - (m.gateway_fee || 0) - (m.refund || 0)),
        },
      };
    });

    return ok({
      events: list,
      payee: payee
        ? {
            _id: params.id,
            type: payeeType,
            name: payee.name || null,
            email: payee.email || null,
            phone: payee.phone || null,
            city: payee.city || null,
            kycStatus: payee.kycStatus || null,
          }
        : null,
      balance: await payeeBalance(db, payeeType, params.id),
    });
  } catch (error) {
    console.error('Error fetching organizer events:', error);
    return fail('Failed to fetch events', 500);
  }
}
