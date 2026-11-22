import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, parseAmount, toCsv } from '@/lib/http';
import { istDateTime } from '@/lib/reporting';
import {
  CASE_PRIORITIES,
  CASE_TEAMS,
  OPEN_CASE_STATUSES,
  PRIORITY_ORDER,
} from '@/lib/resources/support';
import { TEAM_VALUES, evaluateSla, getSupportSettings, isTeam, minutesBetween, syncCaseTiming, type SlaSettings } from '@/lib/resources/support.hooks';
import { CASES, dayRange } from '../_cases';

export const dynamic = 'force-dynamic';

const SCAN_LIMIT = 20000;

interface Figure {
  group: 'totals' | 'open_priority' | 'open_team' | 'sla' | 'time';
  key: string;
  label: string;
  /** The figure as the screens compute it: from the loaded cases, with the same code that gives each case its SLA state. */
  value: number | null;
  /** The same figure counted again by the database directly from the raw documents. */
  independent: number | null;
  match: boolean;
  unit?: 'cases' | 'minutes';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function figure(group: Figure['group'], key: string, label: string, value: number | null, independent: number | null, unit: Figure['unit'] = 'cases'): Figure {
  const match = value === null || independent === null ? value === independent : Math.abs(value - independent) < 0.01;
  return { group, key, label, value, independent, match, unit };
}

/**
 * The independent path: MongoDB counts written without the screen's code, so
 * a bug in either shows up as a mismatch.
 */
async function databaseCounts(db: Db, base: Record<string, any>, sla: SlaSettings, now: Date) {
  const col = db.collection(CASES);
  const open = { ...base, status: { $in: OPEN_CASE_STATUSES } };
  const byPriority: Record<string, number> = {};
  for (const p of PRIORITY_ORDER) byPriority[p] = await col.countDocuments({ ...open, priority: p });
  byPriority.other = await col.countDocuments({ ...open, priority: { $nin: PRIORITY_ORDER } });
  const byTeam: Record<string, number> = {};
  for (const t of TEAM_VALUES) byTeam[t] = await col.countDocuments({ ...open, assignedTeam: t });
  byTeam.unassigned = await col.countDocuments({ ...open, assignedTeam: { $nin: TEAM_VALUES } });

  // Took longer than `ms`: both dates present and their difference over the target
  // ($and stops at the first false test, so a value that is not a date is never subtracted).
  const tookLonger = (field: string, ms: number) => ({
    $expr: {
      $and: [
        { $eq: [{ $type: '$' + field }, 'date'] },
        { $eq: [{ $type: '$createdAt' }, 'date'] },
        { $gt: [{ $subtract: ['$' + field, '$createdAt'] }, ms] },
      ],
    },
  });

  let responseBreached = 0;
  let resolutionBreached = 0;
  for (const p of PRIORITY_ORDER) {
    const target = sla[p];
    if (target.responseHours !== null) {
      const ms = target.responseHours * 3_600_000;
      responseBreached += await col.countDocuments({
        ...base,
        priority: p,
        $or: [tookLonger('firstResponseAt', ms), { firstResponseAt: { $in: [null] }, status: 'open', createdAt: { $lt: new Date(now.getTime() - ms) } }],
      });
    }
    if (target.resolutionHours !== null) {
      const ms = target.resolutionHours * 3_600_000;
      resolutionBreached += await col.countDocuments({
        ...base,
        priority: p,
        $or: [
          tookLonger('resolvedAt', ms),
          { resolvedAt: { $in: [null] }, status: { $in: OPEN_CASE_STATUSES }, createdAt: { $lt: new Date(now.getTime() - ms) } },
        ],
      });
    }
  }

  const [response] = await col
    .aggregate([{ $match: { ...base, firstResponseAt: { $type: 'date' } } }, { $group: { _id: null, avg: { $avg: '$responseMinutes' }, count: { $sum: 1 } } }])
    .toArray();
  const [resolution] = await col
    .aggregate([{ $match: { ...base, resolvedAt: { $type: 'date' } } }, { $group: { _id: null, avg: { $avg: '$resolutionMinutes' }, count: { $sum: 1 } } }])
    .toArray();

  return {
    total: await col.countDocuments(base),
    open: await col.countDocuments(open),
    escalatedOpen: await col.countDocuments({ ...open, escalated: true }),
    escalatedTotal: await col.countDocuments({ ...base, escalated: true }),
    byPriority,
    byTeam,
    responseBreached,
    resolutionBreached,
    responded: response?.count || 0,
    avgResponse: typeof response?.avg === 'number' ? round2(response.avg) : null,
    resolved: resolution?.count || 0,
    avgResolution: typeof resolution?.avg === 'number' ? round2(resolution.avg) : null,
  };
}

/**
 * GET /api/admin/support/overview   (support:view)
 *   from, to   whole days in IST (YYYY-MM-DD); cases CREATED in that range.
 *              Without them: every case.
 *   kind       complaint | ticket (omitted: both)
 *   export     summary: the figures as CSV
 * Every figure is given twice: as the screens compute it and as an
 * independent database count of the raw documents, with whether they match.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;
  const params = request.nextUrl.searchParams;
  const range = dayRange(params);
  if (typeof range === 'string') return fail(range, 400);
  const kind = params.get('kind');

  try {
    const { db } = await connectToDatabase();
    const base: Record<string, any> = {};
    if (kind === 'complaint' || kind === 'ticket') base.kind = kind;
    if (range) base.createdAt = { $gte: range.start, $lt: range.end };

    const settings = await getSupportSettings(db);
    const docs = await db
      .collection(CASES)
      .find(base, { projection: { description: 0, resolution: 0, 'notes.text': 0, 'replies.text': 0, escalations: 0 } })
      .limit(SCAN_LIMIT)
      .toArray();
    // Timing that the records prove is written first, so both paths read the same documents.
    await syncCaseTiming(db, docs);
    const now = new Date();

    // The screen's path.
    const openDocs = docs.filter((d) => OPEN_CASE_STATUSES.includes(d.status));
    const byPriority: Record<string, number> = Object.fromEntries([...PRIORITY_ORDER, 'other'].map((p) => [p, 0]));
    for (const d of openDocs) byPriority[PRIORITY_ORDER.includes(d.priority) ? d.priority : 'other'] += 1;
    const byTeam: Record<string, number> = Object.fromEntries([...TEAM_VALUES, 'unassigned'].map((t) => [t, 0]));
    for (const d of openDocs) byTeam[isTeam(d.assignedTeam) ? d.assignedTeam : 'unassigned'] += 1;
    const evaluated = docs.map((d) => evaluateSla(d, settings.sla, now));
    const responseTimes = docs
      .filter((d) => d.firstResponseAt instanceof Date && d.createdAt instanceof Date)
      .map((d) => minutesBetween(d.createdAt, d.firstResponseAt));
    const resolutionTimes = docs
      .filter((d) => d.resolvedAt instanceof Date && d.createdAt instanceof Date)
      .map((d) => minutesBetween(d.createdAt, d.resolvedAt));
    const average = (list: number[]) => (list.length ? round2(list.reduce((s, v) => s + v, 0) / list.length) : null);

    const independent = await databaseCounts(db, base, settings.sla, now);

    const figures: Figure[] = [
      figure('totals', 'total', 'Cases created in the range', docs.length, independent.total),
      figure('totals', 'open', 'Still open (open, in progress, waiting for customer, escalated)', openDocs.length, independent.open),
      figure('totals', 'escalated_open', 'Open and escalated', openDocs.filter((d) => d.escalated === true).length, independent.escalatedOpen),
      figure('totals', 'escalated_total', 'Escalated at least once', docs.filter((d) => d.escalated === true).length, independent.escalatedTotal),
      ...[...CASE_PRIORITIES, { value: 'other', label: 'No valid priority' }].map((p) =>
        figure('open_priority', 'open_' + p.value, p.label, byPriority[p.value], independent.byPriority[p.value])
      ),
      ...[...CASE_TEAMS, { value: 'unassigned', label: 'Unassigned' }].map((t) => figure('open_team', 'team_' + t.value, t.label, byTeam[t.value], independent.byTeam[t.value])),
      figure('sla', 'response_breached', 'First response past target', evaluated.filter((e) => e.response.state === 'breached').length, independent.responseBreached),
      figure('sla', 'resolution_breached', 'Resolution past target', evaluated.filter((e) => e.resolution.state === 'breached').length, independent.resolutionBreached),
      figure('time', 'responded', 'Cases with a first response', responseTimes.length, independent.responded),
      figure('time', 'avg_response', 'Average time to first response', average(responseTimes), independent.avgResponse, 'minutes'),
      figure('time', 'resolved', 'Cases resolved', resolutionTimes.length, independent.resolved),
      figure('time', 'avg_resolution', 'Average time to resolution', average(resolutionTimes), independent.avgResolution, 'minutes'),
    ];

    const rangeInfo = {
      from: range?.from || null,
      to: range?.to || null,
      label: range ? range.label : 'All cases',
      timezone: 'Asia/Kolkata (IST)',
      computedAt: now.toISOString(),
      capped: docs.length >= SCAN_LIMIT,
    };
    const definitions = [
      'Cases are counted by the day they were created, in IST. Open means open, in progress, waiting for customer or escalated.',
      'First response: the first time the case left "open", received an internal note, or received a reply to the customer.',
      'Resolution: the time the case became resolved (or closed without being resolved). Reopening clears it.',
      'Past target: a first response or resolution later than the target hours for the case\'s current priority, or a case still waiting longer than that now. Priorities with no target are not counted.',
      '"Independent count" is a separate database count of the raw documents; "Check" says whether the two agree.',
    ];

    if (params.get('export') === 'summary') {
      const header = [
        { group: 'Range', label: rangeInfo.label, value: '', independent: '', check: '' },
        { group: 'Timezone', label: rangeInfo.timezone, value: '', independent: '', check: '' },
        { group: 'Computed at (IST)', label: istDateTime(now), value: '', independent: '', check: '' },
        { group: 'Kind', label: kind === 'complaint' ? 'Complaints' : kind === 'ticket' ? 'Tickets' : 'Complaints and tickets', value: '', independent: '', check: '' },
      ];
      const rows = figures.map((f) => ({
        group: { totals: 'Totals', open_priority: 'Open by priority', open_team: 'Open by team', sla: 'SLA', time: 'Response and resolution' }[f.group],
        label: f.label + (f.unit === 'minutes' ? ' (minutes)' : ''),
        value: f.value ?? '',
        independent: f.independent ?? '',
        check: f.match ? 'match' : 'MISMATCH',
      }));
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'support',
        entityType: 'support-overview',
        meta: { range: rangeInfo.label, kind: kind || 'all', figures: figures.length },
        request,
      });
      const csv = toCsv([...header, ...rows], [
        { key: 'group', label: 'Section' },
        { key: 'label', label: 'Figure' },
        { key: 'value', label: 'Shown' },
        { key: 'independent', label: 'Independent count' },
        { key: 'check', label: 'Check' },
      ]);
      return csvResponse(csv, `support-summary-${range ? range.from + '_' + range.to : 'all'}.csv`);
    }

    // Refund disputes and the cases about them, for admins who may see refunds.
    let disputes: any[] | null = null;
    if (can(check.admin, 'refunds:view')) {
      const refunds = await db.collection('refunds').find({ status: 'disputed' }).sort({ disputedAt: -1, createdAt: -1 }).limit(50).toArray();
      const ids = refunds.map((r) => String(r._id));
      const bookings = refunds.map((r) => String(r.bookingId || '')).filter(Boolean);
      const cases = ids.length
        ? await db
            .collection(CASES)
            .find({ $or: [{ refundId: { $in: ids } }, ...(bookings.length ? [{ bookingId: { $in: bookings } }] : [])] }, { projection: { subject: 1, kind: 1, status: 1, refundId: 1, bookingId: 1, escalated: 1, priority: 1 } })
            .toArray()
        : [];
      disputes = refunds.map((r) => ({
        _id: String(r._id),
        bookingId: r.bookingId || null,
        customerPhone: r.customerPhone || '',
        eventTitle: r.eventTitle || '',
        refundAmount: parseAmount(r.refundAmount),
        disputeReason: r.disputeReason || '',
        disputedAt: r.disputedAt || null,
        cases: cases
          .filter((c) => c.refundId === String(r._id) || (r.bookingId && c.bookingId === String(r.bookingId)))
          .map((c) => ({ _id: String(c._id), kind: c.kind, subject: c.subject || '', status: c.status || '', escalated: c.escalated === true, priority: c.priority || '' })),
      }));
    }

    const pendingRatings = await db.collection('feedback').countDocuments({ status: 'pending' });

    return ok({
      range: rangeInfo,
      definitions,
      figures,
      allMatch: figures.every((f) => f.match),
      sla: settings.sla,
      slaConfigured: settings.configured,
      slaUpdatedAt: settings.updatedAt,
      slaUpdatedBy: settings.updatedBy,
      disputes,
      pendingRatings,
      canManage: can(check.admin, 'support:manage'),
    });
  } catch (error) {
    console.error('Support overview failed:', error);
    return fail('Failed to load the support summary', 500);
  }
}
