import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { readBody, requireAppUser, text } from '@/lib/app-auth';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { findBooking } from '@/lib/bookings';
import { CASE_SERVICES, DONE_CASE_STATUSES } from '@/lib/resources/support';
import { last10, phoneForms } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

/** Tickets one phone may raise in a rolling 24 hours. */
const DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the customer sees of a status: never the internal wording. */
const CUSTOMER_STATUS: Record<string, string> = {
  open: 'Received',
  in_progress: 'Being looked at',
  waiting_customer: 'Waiting for your reply',
  escalated: 'Being looked at',
  resolved: 'Resolved',
  closed: 'Closed',
};

function publicCase(doc: any) {
  const replies = Array.isArray(doc.replies) ? doc.replies : [];
  return {
    id: String(doc._id),
    reference: String(doc._id).slice(-8).toUpperCase(),
    kind: doc.kind === 'complaint' ? 'complaint' : 'ticket',
    subject: doc.subject || '',
    service: doc.service || '',
    serviceLabel: CASE_SERVICES.find((s) => s.value === doc.service)?.label || '',
    description: doc.source === 'app' ? doc.description || '' : '',
    bookingId: doc.bookingId || null,
    status: CUSTOMER_STATUS[doc.status] ? doc.status : 'open',
    statusLabel: CUSTOMER_STATUS[doc.status] || 'Received',
    finished: DONE_CASE_STATUSES.includes(doc.status),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    // Replies written to the customer only. Internal notes, who handled the
    // case, its priority and its team are never sent to the app.
    replies: replies
      .filter((r: any) => r && typeof r.text === 'string' && r.text.trim())
      .map((r: any) => ({ text: r.text, at: r.at || null, from: 'Mookalaa support' })),
  };
}

/**
 * GET /api/public/support/tickets?phone=   (app user)
 * The customer's own tickets and complaints with their status and the replies
 * written to them. The phone must belong to the caller (requireAppUser).
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, request.nextUrl.searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const rows = await db
      .collection('supportCases')
      .find({ customerPhone: { $in: phoneForms(auth.phone) } }, { projection: { notes: 0, assignedTo: 0, assignedToId: 0, assignedToName: 0, assignments: 0, escalations: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return ok({ tickets: rows.map(publicCase), dailyLimit: DAILY_LIMIT });
  } catch (error) {
    console.error('Public support tickets failed:', error);
    return fail('Could not load your tickets', 500);
  }
}

/**
 * POST /api/public/support/tickets   (app user)
 *   { phone, subject, service, description, bookingId? }
 * Creates a ticket (kind 'ticket', status 'open', source 'app'). A booking,
 * when given, must be one of this phone's bookings. At most 5 tickets per
 * phone in 24 hours.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Send the ticket as JSON', 400);
  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;

  const subject = text(body.subject, 200);
  const service = text(body.service, 40);
  const description = text(body.description, 4000);
  const bookingId = text(body.bookingId, 80);
  if (subject.length < 3) return fail('Write a short subject (at least 3 characters).', 400);
  if (!CASE_SERVICES.some((s) => s.value === service)) return fail('Choose what the ticket is about.', 400);
  if (description.length < 10) return fail('Describe the problem in a few words (at least 10 characters).', 400);

  try {
    const { db } = await connectToDatabase();
    const phones = phoneForms(auth.phone);

    const since = new Date(Date.now() - DAY_MS);
    const recent = await db
      .collection('supportCases')
      .find({ customerPhone: { $in: phones }, source: 'app', createdAt: { $gte: since } }, { projection: { createdAt: 1 } })
      .sort({ createdAt: 1 })
      .toArray();
    if (recent.length >= DAILY_LIMIT) {
      const oldest = new Date(recent[0].createdAt).getTime();
      const retryAfterSeconds = Math.max(60, Math.ceil((oldest + DAY_MS - Date.now()) / 1000));
      const response = fail(`You can raise up to ${DAILY_LIMIT} tickets a day. Please add to an open ticket or try again later.`, 429, { retryAfterSeconds });
      response.headers.set('Retry-After', String(retryAfterSeconds));
      return response;
    }

    let booking: any = null;
    if (bookingId) {
      booking = await findBooking(db, bookingId);
      // The same answer for "no such booking" and "not your booking".
      if (!booking || last10(booking.userPhone) !== last10(auth.phone)) return fail('That booking was not found in your bookings.', 404);
    }

    const user = await db.collection('users').findOne({ phone: { $in: phones } }, { projection: { name: 1 } });
    const refund = booking ? await db.collection('refunds').find({ bookingId: String(booking._id) }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).limit(1).next() : null;
    const now = new Date();
    const doc: Record<string, any> = {
      kind: 'ticket',
      subject,
      customerName: typeof user?.name === 'string' ? user.name.trim().slice(0, 120) : '',
      customerPhone: auth.phone,
      service,
      priority: 'normal',
      bookingId: booking ? String(booking._id) : null,
      refundId: refund ? String(refund._id) : null,
      aboutRefund: false,
      description,
      status: 'open',
      source: 'app',
      escalated: false,
      escalationLevel: 0,
      assignedTeam: null,
      assignedTo: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'customer:' + auth.phone,
      updatedBy: null,
    };
    const inserted = await db.collection('supportCases').insertOne(doc);

    // The ticket's activity history starts with the customer raising it.
    await logAudit({
      admin: null,
      action: 'create',
      module: 'support',
      entityType: 'support-tickets',
      entityId: String(inserted.insertedId),
      entityLabel: subject,
      after: { subject, service, bookingId: doc.bookingId, status: 'open', source: 'app' },
      meta: { raisedBy: 'customer', tokenChecked: !auth.legacy },
      request,
    });

    return ok(
      { ticket: publicCase({ ...doc, _id: inserted.insertedId }), message: 'Your ticket has been sent. Our support team will reply here.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Raise support ticket failed:', error);
    return fail('Could not send your ticket', 500);
  }
}
