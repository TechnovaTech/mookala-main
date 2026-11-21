import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { csvResponse, fail, ok, toCsv } from '@/lib/http';
import { OPEN_STATUSES, PROBLEM_STATUSES, STAMP_FIELDS, endOfDueDay, resourceOf, templateTitles, toDate } from '../_lib/orders';

export const dynamic = 'force-dynamic';

/**
 * Delivery monitor, computed when it is read (there is no scheduler):
 *   problems     orders now failed, delayed or disputed, with how long they have been so
 *   overdue      custom wishes past their due date and not delivered, cancelled or refunded
 *   pastSchedule orders whose scheduled time has passed and that are still created, paid or processing
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'wishes:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const now = new Date();
    const orders = await db
      .collection('wishOrders')
      .find({ status: { $in: OPEN_STATUSES } })
      .project({ notes: 0, message: 0, brief: 0 })
      .sort({ statusChangedAt: 1, createdAt: 1 })
      .limit(5000)
      .toArray();

    const titles = await templateTitles(db, orders.filter((o) => o.kind !== 'custom').map((o) => String(o.template || '')));
    const hours = (from: Date | null) => (from ? Math.max(0, Math.round(((now.getTime() - from.getTime()) / 3600000) * 10) / 10) : null);

    const row = (order: any) => {
      const status = String(order.status || '');
      const since = toDate(order[STAMP_FIELDS[status]]) || toDate(order.statusChangedAt) || toDate(order.createdAt);
      const due = endOfDueDay(order.dueDate);
      return {
        id: String(order._id),
        resource: resourceOf(order),
        kind: order.kind === 'custom' ? 'custom' : 'template',
        status,
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        recipientName: order.recipientName || '',
        item: order.kind === 'custom' ? order.artistName || order.requestedArtist || '' : titles.get(String(order.template || '')) || '',
        deliveryChannel: order.deliveryChannel || '',
        amount: Number(order.amount) || 0,
        paid: Boolean(order.paidAt),
        reason: order.statusReason || '',
        since,
        ageHours: hours(since),
        retryCount: Number(order.retryCount) || 0,
        dueDate: order.dueDate || null,
        daysOverdue: due && due.getTime() < now.getTime() ? Math.floor((now.getTime() - due.getTime()) / 86400000) + 1 : 0,
        scheduledFor: order.scheduledFor || null,
        hoursPastSchedule:
          toDate(order.scheduledFor) && (toDate(order.scheduledFor) as Date).getTime() < now.getTime() ? hours(toDate(order.scheduledFor)) : null,
        createdAt: order.createdAt || null,
      };
    };

    const rows = orders.map(row);
    const problems = rows.filter((r) => PROBLEM_STATUSES.includes(r.status)).sort((a, b) => (b.ageHours || 0) - (a.ageHours || 0));
    const overdue = rows.filter((r) => r.kind === 'custom' && r.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
    const pastSchedule = rows
      .filter((r) => r.hoursPastSchedule !== null && ['created', 'paid', 'processing'].includes(r.status))
      .sort((a, b) => (b.hoursPastSchedule || 0) - (a.hoursPastSchedule || 0));

    const exportKind = request.nextUrl.searchParams.get('export');
    if (exportKind) {
      const set = exportKind === 'problems' ? problems : exportKind === 'overdue' ? overdue : exportKind === 'past-schedule' ? pastSchedule : null;
      if (!set) return fail('Unknown export');
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'wishes',
        entityType: 'wishes-monitor',
        meta: { list: exportKind, rows: set.length },
        request,
      });
      return csvResponse(
        toCsv(set, [
          { key: 'status', label: 'Status' },
          { key: 'kind', label: 'Type' },
          { key: 'customerName', label: 'Customer' },
          { key: 'customerPhone', label: 'Customer phone' },
          { key: 'recipientName', label: 'Recipient' },
          { key: 'item', label: 'Template or artist' },
          { key: 'deliveryChannel', label: 'Channel' },
          { key: 'amount', label: 'Amount' },
          { key: 'reason', label: 'Reason' },
          { key: 'since', label: 'In this status since' },
          { key: 'ageHours', label: 'Age (hours)' },
          { key: 'retryCount', label: 'Retries' },
          { key: 'dueDate', label: 'Due date' },
          { key: 'daysOverdue', label: 'Days overdue' },
          { key: 'scheduledFor', label: 'Scheduled for' },
          { key: 'createdAt', label: 'Created' },
        ]),
        `wishes-${exportKind}-${now.toISOString().slice(0, 10)}.csv`
      );
    }

    return ok({
      asOf: now,
      counts: {
        failed: problems.filter((r) => r.status === 'failed').length,
        delayed: problems.filter((r) => r.status === 'delayed').length,
        disputed: problems.filter((r) => r.status === 'disputed').length,
        overdue: overdue.length,
        pastSchedule: pastSchedule.length,
      },
      problems,
      overdue,
      pastSchedule,
      canManage: can(check.admin, 'wishes:manage'),
    });
  } catch (error) {
    console.error('Wishes monitor failed:', error);
    return fail('Failed to load the delivery monitor', 500);
  }
}
