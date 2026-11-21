import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ok, fail, toObjectId, asString, parseAmount } from '@/lib/http';
import { accountStatusOf, type AccountStatus } from '@/lib/user-status';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

const HISTORY_LIMIT = 100;
const SIGN_IN_LIMIT = 30;
const BOOKING_SCAN_LIMIT = 2000;
const MIN_REASON = 5;

function profileOf(user: any) {
  const accountStatus = accountStatusOf(user);
  const signupStatus = user.status || 'pending';
  return {
    id: String(user._id),
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    city: user.city || '',
    genres: Array.isArray(user.genres) ? user.genres : [],
    profileImage: typeof user.profileImage === 'string' ? user.profileImage : null,
    followedArtistsCount: Array.isArray(user.followedArtists) ? user.followedArtists.length : 0,
    status: signupStatus,
    phoneVerified: signupStatus === 'verified' || signupStatus === 'completed',
    profileCompleted: signupStatus === 'completed',
    accountStatus,
    isActive: accountStatus === 'active',
    accountStatusReason: user.accountStatusReason || null,
    accountStatusBy: user.accountStatusBy || null,
    accountStatusAt: user.accountStatusAt || null,
    verifiedByAdmin: user.verifiedByAdmin?.at ? user.verifiedByAdmin : null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function time(value: any): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const ACTION_LABELS: Record<string, string> = {
  suspend: 'Account suspended',
  block: 'Account blocked',
  reactivate: 'Account reactivated',
  verify: 'Marked as verified by admin',
  unverify: 'Admin verification cleared',
  update: 'Profile updated by admin',
  delete: 'Account deleted',
};

/**
 * GET /api/users/:id
 * The user's profile plus everything support staff need on one screen:
 * bookings, ledger entries, support cases, feedback, reports, admin actions
 * and one merged timeline.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'users:view');
  if (!check.ok) return check.response;

  const _id = toObjectId(params.id);
  if (!_id) return fail('Invalid user id', 400);

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ _id }, { projection: { otp: 0 } });
    if (!user) return fail('User not found', 404);

    const phone = typeof user.phone === 'string' ? user.phone : '';
    const none: any[] = [];

    const [bookingRows, bookingsTotal, transactions, transactionsTotal, cases, feedback, reports, audit, signIns, reportsFiled] =
      await Promise.all([
        phone
          ? db
              .collection('bookings')
              .find(
                { userPhone: phone },
                {
                  projection: {
                    eventId: 1,
                    eventTitle: 1,
                    eventDate: 1,
                    eventTime: 1,
                    venue: 1,
                    totalSeats: 1,
                    totalPrice: 1,
                    amountPaid: 1,
                    status: 1,
                    paymentStatus: 1,
                    checkedIn: 1,
                    cancelledAt: 1,
                    cancelReason: 1,
                    createdAt: 1,
                  },
                }
              )
              .sort({ createdAt: -1 })
              .limit(BOOKING_SCAN_LIMIT)
              .toArray()
          : none,
        phone ? db.collection('bookings').countDocuments({ userPhone: phone }) : 0,
        phone
          ? db
              .collection('transactions')
              .find(
                { customerPhone: phone },
                {
                  projection: {
                    reference: 1,
                    type: 1,
                    service: 1,
                    amount: 1,
                    status: 1,
                    bookingId: 1,
                    description: 1,
                    gatewayPaymentId: 1,
                    createdAt: 1,
                  },
                }
              )
              .sort({ createdAt: -1 })
              .limit(HISTORY_LIMIT)
              .toArray()
          : none,
        phone ? db.collection('transactions').countDocuments({ customerPhone: phone }) : 0,
        phone
          ? db
              .collection('supportCases')
              .find({ customerPhone: phone }, { projection: { notes: 0 } })
              .sort({ createdAt: -1 })
              .limit(HISTORY_LIMIT)
              .toArray()
          : none,
        phone
          ? db.collection('feedback').find({ customerPhone: phone }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).toArray()
          : none,
        phone
          ? db
              .collection('userReports')
              .find({ reportedPhone: phone }, { projection: { notes: 0 } })
              .sort({ createdAt: -1 })
              .limit(HISTORY_LIMIT)
              .toArray()
          : none,
        db
          .collection('auditLogs')
          .find({ entityType: 'user', entityId: String(user._id) })
          .sort({ createdAt: -1 })
          .limit(HISTORY_LIMIT)
          .toArray(),
        // Sign-ins exist from the time the OTP service started recording them.
        phone
          ? db
              .collection('otpEvents')
              .find({ phone, type: 'verify', role: { $in: ['user', null] } }, { projection: { success: 1, ip: 1, createdAt: 1 } })
              .sort({ createdAt: -1 })
              .limit(SIGN_IN_LIMIT)
              .toArray()
          : none,
        phone
          ? db
              .collection('userReports')
              .find({ reporterPhone: phone }, { projection: { notes: 0 } })
              .sort({ createdAt: -1 })
              .limit(HISTORY_LIMIT)
              .toArray()
          : none,
      ]);

    const bookingsAll = bookingRows.map((b: any) => ({
      id: String(b._id),
      eventId: b.eventId ? String(b.eventId) : null,
      eventTitle: b.eventTitle || '',
      eventDate: b.eventDate || null,
      eventTime: b.eventTime || null,
      venue: typeof b.venue === 'string' ? b.venue : b.venue?.name || '',
      totalSeats: b.totalSeats ?? null,
      amount: parseAmount(b.amountPaid ?? b.totalPrice),
      status: b.status || '',
      paymentStatus: b.paymentStatus || '',
      checkedIn: b.checkedIn === true,
      cancelledAt: b.cancelledAt || null,
      cancelReason: b.cancelReason || null,
      createdAt: b.createdAt || null,
    }));

    const bookingSummary = {
      total: bookingsTotal,
      counted: bookingsAll.length,
      confirmed: bookingsAll.filter((b) => b.status === 'confirmed' || b.status === 'attended').length,
      cancelled: bookingsAll.filter((b) => b.status === 'cancelled').length,
      // Only money the gateway confirmed counts as paid.
      paidAmount: bookingsAll.filter((b) => b.paymentStatus === 'paid').reduce((sum, b) => sum + b.amount, 0),
    };

    const adminActions = audit.map((a: any) => ({
      id: String(a._id),
      action: a.action,
      label: ACTION_LABELS[a.action] || a.action,
      adminName: a.adminName || null,
      adminEmail: a.adminEmail || null,
      adminRole: a.adminRole || null,
      reason: a.reason || null,
      createdAt: a.createdAt || null,
    }));

    const serialiseCase = (c: any) => ({
      id: String(c._id),
      kind: c.kind || 'ticket',
      subject: c.subject || '',
      service: c.service || '',
      priority: c.priority || '',
      status: c.status || '',
      assignedTeam: c.assignedTeam || '',
      bookingId: c.bookingId || '',
      resolution: c.resolution || '',
      resolvedAt: c.resolvedAt || null,
      createdAt: c.createdAt || null,
    });

    const supportCases = cases.map(serialiseCase);

    const timeline: { at: any; type: string; title: string; detail: string }[] = [];
    if (user.createdAt) {
      timeline.push({ at: user.createdAt, type: 'signup', title: 'Signed up', detail: phone ? `Phone ${phone}` : '' });
    }
    for (const b of bookingsAll.slice(0, HISTORY_LIMIT)) {
      if (b.createdAt) {
        timeline.push({
          at: b.createdAt,
          type: 'booking',
          title: `Booking created${b.eventTitle ? ': ' + b.eventTitle : ''}`,
          detail: [b.status && `status ${b.status}`, b.paymentStatus && `payment ${b.paymentStatus}`]
            .filter(Boolean)
            .join(', '),
        });
      }
      if (b.cancelledAt) {
        timeline.push({
          at: b.cancelledAt,
          type: 'booking',
          title: `Booking cancelled${b.eventTitle ? ': ' + b.eventTitle : ''}`,
          detail: b.cancelReason || '',
        });
      }
    }
    for (const c of supportCases) {
      const noun = c.kind === 'complaint' ? 'Complaint' : 'Support ticket';
      if (c.createdAt) {
        timeline.push({ at: c.createdAt, type: 'support', title: `${noun} raised: ${c.subject}`, detail: c.status ? `status ${c.status}` : '' });
      }
      if (c.resolvedAt) {
        timeline.push({ at: c.resolvedAt, type: 'support', title: `${noun} resolved: ${c.subject}`, detail: c.resolution });
      }
    }
    for (const r of reports) {
      if (r.createdAt) {
        timeline.push({
          at: r.createdAt,
          type: 'report',
          title: 'Reported by another account',
          detail: [r.reason, r.status && `status ${r.status}`].filter(Boolean).join(', '),
        });
      }
    }
    for (const f of feedback) {
      if (f.createdAt) {
        timeline.push({
          at: f.createdAt,
          type: 'feedback',
          title: `Feedback given${f.targetName ? ' on ' + f.targetName : ''}`,
          detail: [f.rating ? `${f.rating} of 5` : '', f.comment || ''].filter(Boolean).join(': '),
        });
      }
    }
    for (const r of reportsFiled) {
      if (r.createdAt) {
        timeline.push({
          at: r.createdAt,
          type: 'report',
          title: `Reported another account${r.reportedName ? ': ' + r.reportedName : ''}`,
          detail: [r.reason, r.status && `status ${r.status}`].filter(Boolean).join(', '),
        });
      }
    }
    for (const t of transactions) {
      if (t.createdAt && (t.type === 'payment' || t.type === 'refund')) {
        timeline.push({
          at: t.createdAt,
          type: 'payment',
          title: `${t.type === 'refund' ? 'Refund' : 'Payment'} of ₹${parseAmount(t.amount).toLocaleString('en-IN')} ${t.status || ''}`.trim(),
          detail: [t.reference, t.description].filter(Boolean).join(' · '),
        });
      }
    }
    for (const e of signIns) {
      if (e.createdAt) {
        timeline.push({
          at: e.createdAt,
          type: 'signin',
          title: e.success ? 'Signed in with OTP' : 'Sign-in failed (wrong or expired OTP)',
          detail: e.ip ? `From ${e.ip}` : '',
        });
      }
    }
    for (const a of adminActions) {
      if (a.createdAt) {
        timeline.push({
          at: a.createdAt,
          type: 'admin',
          title: `${a.label}${a.adminName || a.adminEmail ? ' by ' + (a.adminName || a.adminEmail) : ''}`,
          detail: a.reason || '',
        });
      }
    }
    timeline.sort((x, y) => time(y.at) - time(x.at));

    return ok({
      user: profileOf(user),
      bookings: bookingsAll.slice(0, HISTORY_LIMIT),
      bookingSummary,
      transactions: transactions.map((t: any) => ({
        id: String(t._id),
        reference: t.reference || '',
        type: t.type || '',
        service: t.service || '',
        amount: parseAmount(t.amount),
        status: t.status || '',
        bookingId: t.bookingId ? String(t.bookingId) : '',
        description: t.description || '',
        gatewayPaymentId: t.gatewayPaymentId || '',
        createdAt: t.createdAt || null,
      })),
      transactionsTotal,
      supportCases,
      feedback: feedback.map((f: any) => ({
        id: String(f._id),
        targetType: f.targetType || '',
        targetName: f.targetName || '',
        rating: typeof f.rating === 'number' ? f.rating : parseAmount(f.rating),
        comment: f.comment || '',
        status: f.status || '',
        createdAt: f.createdAt || null,
      })),
      reports: reports.map((r: any) => ({
        id: String(r._id),
        reason: r.reason || '',
        details: r.details || '',
        reporterPhone: r.reporterPhone || '',
        status: r.status || '',
        actionTaken: r.actionTaken || '',
        createdAt: r.createdAt || null,
      })),
      reportsFiled: reportsFiled.map((r: any) => ({
        id: String(r._id),
        reportedName: r.reportedName || '',
        reportedPhone: r.reportedPhone || '',
        reportedType: r.reportedType || '',
        reason: r.reason || '',
        status: r.status || '',
        createdAt: r.createdAt || null,
      })),
      lastSignInAt: signIns.find((e: any) => e.success)?.createdAt || null,
      adminActions,
      timeline,
    });
  } catch (error) {
    console.error('User detail error:', error);
    return fail('Failed to fetch user', 500);
  }
}

const RESTRICTION_ACTIONS: Record<string, AccountStatus> = {
  suspend: 'suspended',
  block: 'blocked',
  reactivate: 'active',
};

/**
 * PATCH /api/users/:id
 *   { action: 'suspend' | 'block' | 'reactivate', reason }   account restriction
 *   { action: 'verify' | 'unverify', reason }                manual verification mark
 * A written reason is always required and every change is audited.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'users:manage');
  if (!check.ok) return check.response;

  const _id = toObjectId(params.id);
  if (!_id) return fail('Invalid user id', 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Request body must be JSON', 400);
  }

  const action = asString(body?.action, 30);
  const reason = asString(body?.reason, 1000);
  const isRestriction = action in RESTRICTION_ACTIONS;
  if (!isRestriction && action !== 'verify' && action !== 'unverify') {
    return fail('Unknown action. Use suspend, block, reactivate, verify or unverify.', 400);
  }
  if (reason.length < MIN_REASON) {
    return fail(`A written reason of at least ${MIN_REASON} characters is required.`, 400);
  }

  try {
    const { db } = await connectToDatabase();
    const users = db.collection('users');
    const user = await users.findOne({ _id }, { projection: { profileImage: 0, otp: 0 } });
    if (!user) return fail('User not found', 404);

    const now = new Date();
    const by = check.admin.email || check.admin.name || null;
    const label = user.name || user.phone || String(user._id);

    if (isRestriction) {
      const current = accountStatusOf(user);
      const next = RESTRICTION_ACTIONS[action];
      if (current === next) return fail(`This account is already ${next}.`, 409);

      const set = {
        accountStatus: next,
        isActive: next === 'active',
        accountStatusReason: reason,
        accountStatusBy: by,
        accountStatusAt: now,
        updatedAt: now,
      };
      await users.updateOne({ _id }, { $set: set });

      await logAudit({
        admin: check.admin,
        action,
        module: 'users',
        entityType: 'user',
        entityId: String(_id),
        entityLabel: label,
        before: {
          accountStatus: current,
          isActive: user.isActive ?? null,
          accountStatusReason: user.accountStatusReason ?? null,
        },
        after: { accountStatus: next, isActive: set.isActive, accountStatusReason: reason },
        reason,
        request,
      });

      return ok({
        accountStatus: next,
        isActive: set.isActive,
        accountStatusReason: reason,
        accountStatusBy: by,
        accountStatusAt: now,
      });
    }

    const already = Boolean(user.verifiedByAdmin?.at);
    if (action === 'verify') {
      if (already) return fail('This profile is already marked as verified.', 409);
      const verifiedByAdmin = { by, at: now, reason };
      await users.updateOne({ _id }, { $set: { verifiedByAdmin, updatedAt: now } });
      await logAudit({
        admin: check.admin,
        action: 'verify',
        module: 'users',
        entityType: 'user',
        entityId: String(_id),
        entityLabel: label,
        before: { verifiedByAdmin: null },
        after: { verifiedByAdmin },
        reason,
        request,
      });
      return ok({ verifiedByAdmin });
    }

    if (!already) return fail('This profile is not marked as verified.', 409);
    await users.updateOne({ _id }, { $unset: { verifiedByAdmin: '' }, $set: { updatedAt: now } });
    await logAudit({
      admin: check.admin,
      action: 'unverify',
      module: 'users',
      entityType: 'user',
      entityId: String(_id),
      entityLabel: label,
      before: { verifiedByAdmin: user.verifiedByAdmin },
      after: { verifiedByAdmin: null },
      reason,
      request,
    });
    return ok({ verifiedByAdmin: null });
  } catch (error) {
    console.error('User action error:', error);
    return fail('Action failed', 500);
  }
}

/**
 * DELETE /api/users/:id   body { reason }
 * Removes the account only. Bookings and ledger entries are financial records
 * and are kept; they stay linked by phone number.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'users:manage');
  if (!check.ok) return check.response;

  const _id = toObjectId(params.id);
  if (!_id) return fail('Invalid user id', 400);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const reason = asString(body?.reason, 1000) || asString(request.nextUrl.searchParams.get('reason'), 1000);
  if (reason.length < MIN_REASON) {
    return fail(`A written reason of at least ${MIN_REASON} characters is required to delete a user.`, 400);
  }

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ _id }, { projection: { profileImage: 0, otp: 0 } });
    if (!user) return fail('User not found', 404);

    const phone = typeof user.phone === 'string' ? user.phone : '';
    const [bookingsKept, transactionsKept] = phone
      ? await Promise.all([
          db.collection('bookings').countDocuments({ userPhone: phone }),
          db.collection('transactions').countDocuments({ customerPhone: phone }),
        ])
      : [0, 0];

    const result = await db.collection('users').deleteOne({ _id });
    if (result.deletedCount === 0) return fail('User not found', 404);

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'users',
      entityType: 'user',
      entityId: String(_id),
      entityLabel: user.name || user.phone || String(_id),
      before: user,
      after: null,
      reason,
      request,
      meta: { bookingsKept, transactionsKept },
    });

    return ok({ bookingsKept, transactionsKept });
  } catch (error) {
    console.error('User delete error:', error);
    return fail('Delete failed', 500);
  }
}
