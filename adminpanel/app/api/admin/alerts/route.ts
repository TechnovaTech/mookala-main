import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { accountRestriction, requireAdmin } from '@/lib/auth';
import { can, normaliseRole } from '@/lib/permissions';
import { ok } from '@/lib/http';
import { APPROVALS, SENSITIVE_ACTIONS, expireOldApprovals, mayDecide } from '@/lib/approvals';
import { SECURITY_EVENTS, getSecuritySettings } from '@/lib/security-settings';

export const dynamic = 'force-dynamic';

interface AlertSource {
  key: string;
  label: string;
  href: string;
  permission: string;
  severity: 'info' | 'warning' | 'critical';
  collection: string;
  filter: Record<string, any>;
}

/**
 * Operational alerts for the header bell and the dashboard (requirements section 2).
 * Each alert is shown only to admins who can act on it (the module's manage
 * permission), so a role that can only look at a module is not asked to act.
 */
const SOURCES: AlertSource[] = [
  { key: 'artist_kyc', label: 'Artist verifications pending', href: '/kyc', permission: 'kyc:manage', severity: 'warning', collection: 'artists', filter: { kycStatus: 'pending', aadharId: { $exists: true, $ne: '' } } },
  { key: 'organizer_kyc', label: 'Organiser verifications pending', href: '/kyc', permission: 'kyc:manage', severity: 'warning', collection: 'organizers', filter: { kycStatus: 'pending', aadharId: { $exists: true, $ne: '' } } },
  { key: 'event_approval', label: 'Events awaiting approval', href: '/events', permission: 'events:manage', severity: 'warning', collection: 'events', filter: { status: 'pending' } },
  { key: 'ad_applications', label: 'Advertisement applications to review', href: '/advertising/applications', permission: 'ads:manage', severity: 'info', collection: 'adApplications', filter: { status: 'pending' } },
  { key: 'failed_payments', label: 'Failed payments', href: '/finance/payments', permission: 'finance:manage', severity: 'critical', collection: 'transactions', filter: { type: 'payment', status: 'failed' } },
  { key: 'refund_requests', label: 'Refund requests to review', href: '/finance/refunds', permission: 'refunds:manage', severity: 'warning', collection: 'refunds', filter: { status: { $in: ['requested', 'awaiting_second_approval'] } } },
  { key: 'refund_disputes', label: 'Refund disputes', href: '/finance/refunds', permission: 'refunds:manage', severity: 'critical', collection: 'refunds', filter: { status: 'disputed' } },
  { key: 'settlements_due', label: 'Settlements awaiting approval', href: '/finance/settlements', permission: 'settlements:manage', severity: 'warning', collection: 'settlements', filter: { status: { $in: ['pending', 'awaiting_second_approval'] } } },
  { key: 'open_complaints', label: 'Open complaints and tickets', href: '/support/complaints', permission: 'support:manage', severity: 'info', collection: 'supportCases', filter: { status: { $in: ['open', 'escalated'] } } },
  { key: 'risk_cases', label: 'Open risk cases', href: '/fraud/cases', permission: 'fraud:manage', severity: 'critical', collection: 'riskCases', filter: { status: { $in: ['open', 'escalated'] } } },
  { key: 'deletion_requests', label: 'Data deletion requests', href: '/legal/deletion-requests', permission: 'legal:manage', severity: 'info', collection: 'deletionRequests', filter: { status: 'requested' } },
  { key: 'incidents', label: 'Open system incidents', href: '/system/incidents', permission: 'system:manage', severity: 'critical', collection: 'incidents', filter: { status: { $in: ['open', 'investigating'] } } },
  { key: 'hire_requests', label: 'New hire requests', href: '/hire-requests', permission: 'hire:manage', severity: 'info', collection: 'hireRequests', filter: { status: 'pending' } },
];

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;

  const { db } = await connectToDatabase();

  // An account that must first change its password or turn 2FA on sees nothing here yet.
  const [account, settings] = await Promise.all([
    db.collection('admins').findOne({ _id: new ObjectId(check.admin.id) }, { projection: { mustChangePassword: 1, twoFactorEnabled: 1 } }),
    getSecuritySettings(db),
  ]);
  if (accountRestriction(account, check.admin.role, settings)) return ok({ alerts: [] });

  const allowed = SOURCES.filter((source) => can(check.admin, source.permission));

  const counted = await Promise.all(
    allowed.map(async (source) => {
      try {
        const count = await db.collection(source.collection).countDocuments(source.filter);
        return { key: source.key, label: source.label, href: source.href, severity: source.severity, count };
      } catch {
        return { key: source.key, label: source.label, href: source.href, severity: source.severity, count: 0 };
      }
    })
  );

  // Support cases assigned to this admin that are still open, and how many of them are escalated.
  if (can(check.admin, 'support:view') && check.admin.id) {
    try {
      const mine = { assignedToId: check.admin.id, status: { $in: ['open', 'in_progress', 'waiting_customer', 'escalated'] } };
      const [count, escalated] = await Promise.all([
        db.collection('supportCases').countDocuments(mine),
        db.collection('supportCases').countDocuments({ ...mine, escalated: true }),
      ]);
      counted.push({ key: 'my_cases', label: 'Open cases assigned to you', href: '/support/my-cases', severity: 'warning', count });
      counted.push({ key: 'my_cases_escalated', label: 'Escalated cases assigned to you', href: '/support/my-cases?escalated=1', severity: 'critical', count: escalated });
    } catch {}
  }

  // Settlements whose payout date has passed are reported separately as overdue.
  if (can(check.admin, 'settlements:manage')) {
    try {
      const overdue = await db
        .collection('settlements')
        .countDocuments({ status: { $in: ['pending', 'approved'] }, dueDate: { $lt: new Date() } });
      counted.push({ key: 'settlements_overdue', label: 'Overdue settlements', href: '/finance/settlements', severity: 'critical', count: overdue });
    } catch {}
  }

  // Security: unacknowledged high-severity events, for Super Admins.
  if (normaliseRole(check.admin.role) === 'super_admin') {
    try {
      const count = await db.collection(SECURITY_EVENTS).countDocuments({ severity: 'high', acknowledgedAt: null });
      counted.push({
        key: 'security_events',
        label: 'High-severity security events to acknowledge',
        href: '/security/events?severity=high&ack=open',
        severity: 'critical',
        count,
      });
    } catch {}
  }

  // Changes waiting for a second approver that this admin may decide (never their own).
  const decidable = SENSITIVE_ACTIONS.filter((action) => mayDecide(check.admin, action)).map((action) => action.key);
  if (decidable.length) {
    try {
      await expireOldApprovals(db);
      const count = await db.collection(APPROVALS).countDocuments({
        status: 'pending',
        action: { $in: decidable },
        requestedById: { $ne: check.admin.id || '__none__' },
        expiresAt: { $gt: new Date() },
      });
      counted.push({ key: 'approvals_pending', label: 'Changes waiting for your approval', href: '/security/approvals', severity: 'warning', count });
    } catch {}
  }

  return ok({ alerts: counted.filter((alert) => alert.count > 0) });
}
