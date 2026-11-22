import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv } from '@/lib/http';
import { istDateTime } from '@/lib/reporting';
import { CASE_TEAMS } from '@/lib/resources/support';
import { getSupportSettings, syncCaseTiming } from '@/lib/resources/support.hooks';
import { CASES, caseFilter, caseRow, dayRange } from '../_cases';

export const dynamic = 'force-dynamic';

const SCAN_LIMIT = 5000;

/**
 * GET /api/admin/support/cases   (support:view)
 * Complaints and tickets with their SLA state computed now. Filters: see
 * caseFilter in ../_cases.ts, plus `sla=breached|within|met` (computed) and
 * `page`, `limit`. `export=csv` downloads every matching case (up to 5000).
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const range = dayRange(params);
    if (typeof range === 'string') return fail(range, 400);
    const filter = caseFilter(params, check.admin);
    const settings = await getSupportSettings(db);
    const now = new Date();

    const docs = await db
      .collection(CASES)
      .find(filter, { projection: { description: 0, resolution: 0, 'notes.text': 0, 'replies.text': 0, escalations: 0 } })
      .sort({ createdAt: -1 })
      .limit(SCAN_LIMIT)
      .toArray();
    await syncCaseTiming(db, docs);

    let rows = docs.map((doc) => caseRow(doc, settings.sla, now));
    const slaWanted = params.get('sla') || '';
    if (['breached', 'within', 'met'].includes(slaWanted)) {
      rows = rows.filter((row) => row.sla.response.state === slaWanted || row.sla.resolution.state === slaWanted);
    }

    if (params.get('export') === 'csv') {
      const columns = [
        { key: '_id', label: 'Case ID' },
        { key: 'kind', label: 'Kind' },
        { key: 'subject', label: 'Subject' },
        { key: 'customerName', label: 'Customer name' },
        { key: 'customerPhone', label: 'Customer phone' },
        { key: 'service', label: 'Service' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'source', label: 'Source' },
        { key: 'assignedTeam', label: 'Team' },
        { key: 'assignedTo', label: 'Assigned to' },
        { key: 'escalated', label: 'Escalated' },
        { key: 'escalationLevel', label: 'Times escalated' },
        { key: 'createdIst', label: 'Created (IST)' },
        { key: 'firstResponseIst', label: 'First response (IST)' },
        { key: 'responseMinutes', label: 'Minutes to first response' },
        { key: 'responseTarget', label: 'Response target (hours)' },
        { key: 'responseState', label: 'Response SLA' },
        { key: 'resolvedIst', label: 'Resolved (IST)' },
        { key: 'resolutionMinutes', label: 'Minutes to resolution' },
        { key: 'resolutionTarget', label: 'Resolution target (hours)' },
        { key: 'resolutionState', label: 'Resolution SLA' },
        { key: 'bookingId', label: 'Booking' },
        { key: 'refundId', label: 'Refund' },
      ];
      const flat = rows.map((row) => ({
        ...row,
        escalated: row.escalated ? 'yes' : 'no',
        createdIst: istDateTime(row.createdAt),
        firstResponseIst: istDateTime(row.firstResponseAt),
        resolvedIst: istDateTime(row.resolvedAt),
        responseTarget: row.sla.response.targetHours,
        responseState: row.sla.response.state,
        resolutionTarget: row.sla.resolution.targetHours,
        resolutionState: row.sla.resolution.state,
      }));
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'support',
        entityType: 'support-cases',
        meta: { rows: flat.length, filter: Object.keys(filter), sla: slaWanted || null, computedAt: now.toISOString() },
        request,
      });
      return csvResponse(toCsv(flat, columns), `support-cases-${now.toISOString().slice(0, 10)}.csv`);
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));

    // Counts per status within the other filters, for the status tabs.
    const countFilter = caseFilter(params, check.admin, { ignoreStatus: true });
    const grouped = await db
      .collection(CASES)
      .aggregate([{ $match: countFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();

    return ok({
      items: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      capped: docs.length >= SCAN_LIMIT,
      page,
      limit,
      statusCounts: Object.fromEntries(grouped.map((g) => [String(g._id), g.count])),
      slaConfigured: settings.configured,
      sla: settings.sla,
      teams: CASE_TEAMS,
      computedAt: now.toISOString(),
      canManage: can(check.admin, 'support:manage'),
    });
  } catch (error) {
    console.error('Support case list failed:', error);
    return fail('Failed to load the cases', 500);
  }
}
