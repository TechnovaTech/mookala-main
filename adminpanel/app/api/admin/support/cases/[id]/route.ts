import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { asString, fail, ok, parseAmount, toObjectId } from '@/lib/http';
import { findBooking } from '@/lib/bookings';
import { isChannel, sendNotification } from '@/lib/notifications';
import {
  CASE_TEAMS,
  DONE_CASE_STATUSES,
  REPLY_CHANNELS,
  SUPPORT_REPLY_TEMPLATE,
} from '@/lib/resources/support';
import {
  MIN_REASON,
  eligibleAssignees,
  escalationFields,
  evaluateSla,
  firstResponseFields,
  getSupportSettings,
  isTeam,
  statusTimingFields,
  syncCaseTiming,
  teamLabel,
  type Assignee,
} from '@/lib/resources/support.hooks';
import { CASES, auditCase, caseRow, customerAccount, loadCase } from '../../_cases';

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 500;

function refundView(refund: any) {
  return {
    _id: String(refund._id),
    bookingId: refund.bookingId || null,
    status: refund.status || '',
    refundAmount: parseAmount(refund.refundAmount),
    amountPaid: parseAmount(refund.amountPaid),
    deductionAmount: parseAmount(refund.deductionAmount),
    reason: refund.reason || '',
    disputeReason: refund.disputeReason || null,
    disputedAt: refund.disputedAt || null,
    rejectionReason: refund.rejectionReason || null,
    processedAt: refund.processedAt || null,
    requestedBy: refund.requestedBy || null,
    createdAt: refund.createdAt || null,
  };
}

/**
 * GET /api/admin/support/cases/[id]   (support:view)
 * The whole case: details, SLA state now, replies to the customer, internal
 * notes, escalations, the complete activity history, the customer's account,
 * the related booking and (for admins who may see refunds) the refund status.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;
  if (!toObjectId(params.id)) return fail('Invalid case id', 400);

  try {
    const { db } = await connectToDatabase();
    const doc = await loadCase(db, params.id);
    if (!doc) return fail('Case not found', 404);
    await syncCaseTiming(db, [doc]);

    const settings = await getSupportSettings(db);
    const now = new Date();
    const canViewRefunds = can(check.admin, 'refunds:view');
    const entityType = doc.kind === 'complaint' ? 'complaints' : 'support-tickets';

    // The linked refund, and any other refund of the same booking.
    const refundMatch: Record<string, any>[] = [];
    if (toObjectId(doc.refundId)) refundMatch.push({ _id: toObjectId(doc.refundId)! });
    if (doc.bookingId) refundMatch.push({ bookingId: String(doc.bookingId) });

    const [history, account, booking, refunds] = await Promise.all([
      db.collection('auditLogs').find({ entityType, entityId: params.id }).sort({ createdAt: 1 }).limit(HISTORY_LIMIT).toArray(),
      customerAccount(db, doc.customerPhone),
      doc.bookingId ? findBooking(db, String(doc.bookingId)) : Promise.resolve(null),
      canViewRefunds && refundMatch.length
        ? db.collection('refunds').find({ $or: refundMatch }).sort({ createdAt: -1 }).limit(20).toArray()
        : Promise.resolve([] as any[]),
    ]);

    const row = caseRow(doc, settings.sla, now);
    return ok({
      item: {
        ...row,
        description: doc.description || '',
        resolution: doc.resolution || '',
        statusReason: doc.statusReason || null,
        assignedAt: doc.assignedAt || null,
        assignedBy: doc.assignedBy || null,
        escalatedAt: doc.escalatedAt || null,
        escalationReason: doc.escalationReason || null,
        escalations: Array.isArray(doc.escalations) ? doc.escalations : [],
        firstResponseBy: doc.firstResponseBy || null,
        firstResponseType: doc.firstResponseType || null,
        resolvedBy: doc.resolvedBy || null,
        reopenCount: Number(doc.reopenCount) || 0,
        timingSource: doc.timingSource || null,
        createdBy: doc.createdBy || null,
        notes: Array.isArray(doc.notes) ? doc.notes : [],
        replies: Array.isArray(doc.replies) ? doc.replies : [],
      },
      sla: settings.sla,
      slaConfigured: settings.configured,
      history: history.map((h) => ({ ...h, _id: String(h._id) })),
      account,
      booking: booking
        ? {
            _id: String(booking._id),
            eventTitle: booking.eventTitle || '',
            eventDate: booking.eventDate || null,
            status: booking.status || '',
            paymentStatus: booking.paymentStatus || '',
            amountPaid: parseAmount(booking.amountPaid ?? booking.totalPrice),
            userPhone: booking.userPhone || '',
            refundId: booking.refundId || null,
          }
        : null,
      bookingMissing: Boolean(doc.bookingId) && !booking,
      refunds: refunds.map(refundView),
      linkedRefundId: doc.refundId || null,
      canViewRefunds,
      teams: CASE_TEAMS,
      replyChannels: REPLY_CHANNELS,
      canManage: can(check.admin, 'support:manage'),
      computedAt: now.toISOString(),
      evaluated: evaluateSla(doc, settings.sla, now),
    });
  } catch (error) {
    console.error('Support case detail failed:', error);
    return fail('Failed to load the case', 500);
  }
}

async function pickAssignee(db: any, team: string, assigneeId: string): Promise<Assignee | null | string> {
  if (!assigneeId) return null;
  const eligible = await eligibleAssignees(db, team);
  const found = eligible.find((a) => a.id === assigneeId);
  if (!found) {
    return `That admin cannot be assigned ${teamLabel(team)} cases: only active ${teamLabel(team)} admins and Super Admins who can open support cases can be.`;
  }
  return found;
}

function assignmentFields(team: string | null, assignee: Assignee | null, by: string | null, at: Date) {
  return {
    assignedTeam: team,
    assignedTo: assignee ? assignee.email : null,
    assignedToId: assignee ? assignee.id : null,
    assignedToName: assignee ? assignee.name : null,
    assignedAt: at,
    assignedBy: by,
  };
}

/**
 * POST /api/admin/support/cases/[id]   (support:manage)
 *   { action: 'assign', team, assigneeId?, reason? }   reason required to reassign
 *   { action: 'unassign', reason }
 *   { action: 'escalate', reason, team?, assigneeId? }
 *   { action: 'note', text }                           internal note
 *   { action: 'reply', text, channel }                 reply to the customer
 * Status changes go through the generic resource API, whose hook records the timing.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'support:manage');
  if (!check.ok) return check.response;
  if (!toObjectId(params.id)) return fail('Invalid case id', 400);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body', 400);
  const action = asString(body.action, 20);
  const reason = asString(body.reason, 500);

  try {
    const { db } = await connectToDatabase();
    const existing = await loadCase(db, params.id);
    if (!existing) return fail('Case not found', 404);
    const admin = check.admin;
    const by = admin.email || null;
    const now = new Date();
    const collection = db.collection(CASES);
    const before = {
      assignedTeam: existing.assignedTeam || null,
      assignedTo: existing.assignedTo || null,
    };

    if (action === 'assign' || action === 'unassign') {
      let team: string | null = null;
      let assignee: Assignee | null = null;
      if (action === 'assign') {
        team = asString(body.team, 20);
        if (!isTeam(team)) return fail('Choose the team: operations, finance, marketing or legal.', 400);
        const picked = await pickAssignee(db, team, asString(body.assigneeId, 30));
        if (typeof picked === 'string') return fail(picked, 400);
        assignee = picked;
      }
      const wasAssigned = Boolean(existing.assignedTeam || existing.assignedTo);
      const same = (existing.assignedTeam || null) === team && (existing.assignedToId || null) === (assignee?.id || null);
      if (same) return fail(team ? 'The case is already assigned this way.' : 'The case is not assigned.', 409);
      if (wasAssigned && reason.length < MIN_REASON) {
        return fail(`Changing an assignment needs a reason of at least ${MIN_REASON} characters.`, 400);
      }
      const set = { ...assignmentFields(team, assignee, by, now), updatedAt: now, updatedBy: by };
      const entry = { at: now, by, byName: admin.name || null, team, assignee: assignee?.email || null, reason: reason || null };
      await collection.updateOne({ _id: existing._id }, { $set: set, $push: { assignments: entry } as any });
      await auditCase({
        admin,
        doc: existing,
        action: action === 'unassign' ? 'unassign' : wasAssigned ? 'reassign' : 'assign',
        before,
        after: { assignedTeam: team, assignedTo: assignee?.email || null },
        reason,
        request,
      });
      return ok({ message: team ? `Assigned to ${teamLabel(team)}${assignee ? ': ' + assignee.name : ''}.` : 'Assignment removed.' });
    }

    if (action === 'escalate') {
      if (reason.length < MIN_REASON) return fail(`Escalating needs a reason of at least ${MIN_REASON} characters.`, 400);
      if (DONE_CASE_STATUSES.includes(existing.status)) return fail('This case is finished. Reopen it before escalating it.', 409);

      // By default the case stays with its team and person.
      let team: string | null = isTeam(existing.assignedTeam) ? existing.assignedTeam : null;
      let assignee: Assignee | null = existing.assignedToId
        ? { id: existing.assignedToId, email: existing.assignedTo || '', name: existing.assignedToName || existing.assignedTo || '', role: '', roleLabel: '', canAct: false }
        : null;
      const requestedTeam = asString(body.team, 20);
      const requestedAssignee = asString(body.assigneeId, 30);
      if (requestedTeam) {
        if (!isTeam(requestedTeam)) return fail('Choose the team: operations, finance, marketing or legal.', 400);
        if (requestedTeam !== team) {
          team = requestedTeam;
          // The previous person may not belong to the new team.
          assignee = null;
        }
      }
      if (requestedAssignee) {
        if (!team) return fail('Choose a team for the person you are escalating to.', 400);
        const picked = await pickAssignee(db, team, requestedAssignee);
        if (typeof picked === 'string') return fail(picked, 400);
        assignee = picked;
      }
      const assignmentChanged = team !== (existing.assignedTeam || null) || (assignee?.id || null) !== (existing.assignedToId || null);

      const set: Record<string, any> = {
        ...statusTimingFields(existing, existing.status, 'escalated', now, by),
        ...escalationFields(existing, {
          reason,
          at: now,
          by,
          byName: admin.name || null,
          toTeam: team,
          toAssignee: assignee?.email || null,
        }),
        status: 'escalated',
        statusReason: reason,
        statusChangedAt: now,
        statusChangedBy: by,
        updatedAt: now,
        updatedBy: by,
      };
      if (assignmentChanged) Object.assign(set, assignmentFields(team, assignee, by, now));

      await collection.updateOne({ _id: existing._id }, { $set: set });
      await auditCase({
        admin,
        doc: existing,
        action: 'escalate',
        before: {
          status: existing.status,
          priority: existing.priority,
          escalationLevel: Number(existing.escalationLevel) || 0,
          ...before,
        },
        after: {
          status: 'escalated',
          priority: set.priority,
          escalationLevel: set.escalationLevel,
          assignedTeam: set.assignedTeam ?? before.assignedTeam,
          assignedTo: set.assignedTo ?? before.assignedTo,
        },
        reason,
        request,
      });
      return ok({ message: `Escalated: priority is now ${set.priority}${assignmentChanged ? `, assigned to ${teamLabel(team)}` : ''}.`, priority: set.priority });
    }

    if (action === 'note') {
      const text = asString(body.text, 4000);
      if (!text) return fail('Write the note first.', 400);
      const note = { text, by, byName: admin.name || null, at: now };
      const timing = firstResponseFields(existing, now, by, 'note');
      await collection.updateOne(
        { _id: existing._id },
        { $push: { notes: note } as any, $set: { ...timing, updatedAt: now, updatedBy: by } }
      );
      await auditCase({ admin, doc: existing, action: 'note', after: { note: text, ...timing }, request });
      return ok({ message: 'Internal note added.', firstResponse: Boolean(timing.firstResponseAt) });
    }

    if (action === 'reply') {
      const text = asString(body.text, 2000);
      if (!text) return fail('Write the reply first.', 400);
      const channel = asString(body.channel, 20) || 'app';
      if (!REPLY_CHANNELS.some((c) => c.value === channel)) return fail('Unknown channel', 400);

      let delivery: Record<string, any> = { status: 'in_app', logId: null, error: null, provider: null };
      let to: string | null = null;
      if (channel !== 'app' && isChannel(channel)) {
        const account = await customerAccount(db, existing.customerPhone);
        const address = channel === 'email' ? account?.email || '' : String(existing.customerPhone || '');
        to = address;
        const reference = String(existing._id).slice(-8).toUpperCase();
        const result = await sendNotification(db, {
          channel,
          to: address,
          templateKey: SUPPORT_REPLY_TEMPLATE,
          variables: {
            name: existing.customerName || account?.name || 'Customer',
            message: text,
            subject: existing.subject || '',
            reference,
          },
          requestedBy: by,
        });
        delivery = { status: result.status, logId: result.logId, error: result.error, provider: null, providerMessageId: result.providerMessageId };
      }

      const reply = {
        id: new ObjectId().toHexString(),
        text,
        by,
        byName: admin.name || null,
        at: now,
        channel,
        to,
        delivery,
      };
      const timing = firstResponseFields(existing, now, by, 'reply');
      await collection.updateOne(
        { _id: existing._id },
        { $push: { replies: reply } as any, $set: { ...timing, lastReplyAt: now, updatedAt: now, updatedBy: by } }
      );
      await auditCase({
        admin,
        doc: existing,
        action: 'reply',
        after: { reply: text, channel, delivery: delivery.status, ...timing },
        meta: { logId: delivery.logId, error: delivery.error },
        request,
      });
      const outcome =
        delivery.status === 'in_app'
          ? 'The customer sees it in the app under Help and support.'
          : delivery.status === 'accepted'
            ? 'The provider accepted the message. It is also shown in the app.'
            : `It was not delivered through ${channel}: ${delivery.error || 'the provider did not accept it'}. It is shown in the app.`;
      return ok({ message: `Reply saved. ${outcome}`, delivery });
    }

    return fail('Unknown action', 400);
  } catch (error) {
    console.error('Support case action failed:', error);
    return fail('Failed to update the case', 500);
  }
}
