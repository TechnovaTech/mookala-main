import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { ok, fail, asString, escapeRegex, toObjectId, toCsv, csvResponse } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { SECURITY_EVENTS, SECURITY_EVENT_TYPES } from '@/lib/security-settings';
import { describeDevice } from '@/components/security/device';
import { dateRangeFilter, isSuperAdmin, pageParams, readBody } from '../_shared';

export const dynamic = 'force-dynamic';

const SEVERITIES = ['low', 'medium', 'high'];

/** One plain phrase for the email alert attempts stored on an event. */
function emailOutcome(alerts: any[]): string {
  if (!Array.isArray(alerts) || alerts.length === 0) return 'No email attempted';
  const by = new Map<string, number>();
  for (const alert of alerts) by.set(alert.status, (by.get(alert.status) || 0) + 1);
  const parts: string[] = [];
  for (const [status, count] of by) {
    const label =
      status === 'not_sent' ? 'Not sent, no email provider' : status === 'accepted' || status === 'sent' ? 'Sent' : status === 'failed' ? 'Failed' : status;
    parts.push(`${label}: ${count}`);
  }
  return parts.join(', ');
}

function shape(row: any) {
  return {
    id: String(row._id),
    type: row.type,
    label: row.label || SECURITY_EVENT_TYPES[row.type]?.label || row.type,
    severity: row.severity,
    adminEmail: row.adminEmail,
    adminName: row.adminName,
    actorEmail: row.actorEmail,
    ip: row.ip,
    device: describeDevice(row.userAgent),
    userAgent: row.userAgent || '',
    detail: row.detail,
    meta: row.meta || null,
    emailAlerts: Array.isArray(row.emailAlerts)
      ? row.emailAlerts.map((alert: any) => ({ to: alert.to, status: alert.status, error: alert.error || null }))
      : [],
    emailOutcome: emailOutcome(row.emailAlerts),
    acknowledged: Boolean(row.acknowledgedAt),
    acknowledgedBy: row.acknowledgedBy || null,
    acknowledgedAt: row.acknowledgedAt || null,
    acknowledgeNote: row.acknowledgeNote || null,
    createdAt: row.createdAt,
  };
}

/**
 * Security events: new devices and IPs, failed and refused sign-ins, locks,
 * 2FA and password changes, role and permission changes, settings changes.
 *
 *   GET ?severity=&type=&admin=&ack=open|acknowledged&q=&from=&to=&page=&limit=
 *   GET ?format=csv          export of the filtered events (recorded as an export)
 *   POST { action: 'acknowledge', id, note? }   Super Admin only
 *
 * Events are written by lib/security-settings.ts recordSecurityEvent. This
 * route never edits or deletes one; acknowledging only adds who, when and a note.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'security:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const filter: Record<string, any> = {};

  const severity = asString(params.get('severity'), 10);
  if (severity) {
    if (!SEVERITIES.includes(severity)) return fail('Unknown severity. Use low, medium or high.');
    filter.severity = severity;
  }
  const type = asString(params.get('type'), 60);
  if (type) filter.type = type;

  const ack = asString(params.get('ack'), 20);
  if (ack === 'open') filter.acknowledgedAt = null;
  else if (ack === 'acknowledged') filter.acknowledgedAt = { $ne: null };
  else if (ack) return fail('Unknown filter. Use open or acknowledged.');

  const adminTerm = asString(params.get('admin'), 200);
  if (adminTerm) {
    const pattern = { $regex: escapeRegex(adminTerm), $options: 'i' };
    filter.$and = [...(filter.$and || []), { $or: [{ adminEmail: pattern }, { adminName: pattern }, { actorEmail: pattern }] }];
  }
  const q = asString(params.get('q'), 200);
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    filter.$and = [...(filter.$and || []), { $or: [{ detail: pattern }, { ip: pattern }, { label: pattern }, { userAgent: pattern }] }];
  }

  const range = dateRangeFilter(params.get('from'), params.get('to'));
  if (range.error) return fail(range.error);
  if (range.filter) filter.createdAt = range.filter;

  const { db } = await connectToDatabase();
  const events = db.collection(SECURITY_EVENTS);

  if (params.get('format') === 'csv') {
    const rows = await events.find(filter).sort({ createdAt: -1 }).limit(10000).toArray();
    await logAudit({
      admin: check.admin,
      action: 'export',
      module: 'security',
      entityType: 'securityEvent',
      meta: { rows: rows.length, filters: Object.fromEntries(params.entries()) },
      request,
    });
    const csv = toCsv(
      rows.map((row) => {
        const item = shape(row);
        return {
          ...item,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
          acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt).toISOString() : '',
          acknowledged: item.acknowledged ? 'Yes' : 'No',
        };
      }),
      [
        { key: 'createdAt', label: 'Time (UTC)' },
        { key: 'severity', label: 'Severity' },
        { key: 'label', label: 'Event' },
        { key: 'type', label: 'Type' },
        { key: 'adminEmail', label: 'Admin' },
        { key: 'actorEmail', label: 'Caused by' },
        { key: 'ip', label: 'IP address' },
        { key: 'device', label: 'Device' },
        { key: 'detail', label: 'Detail' },
        { key: 'emailOutcome', label: 'Email alert' },
        { key: 'acknowledged', label: 'Acknowledged' },
        { key: 'acknowledgedBy', label: 'Acknowledged by' },
        { key: 'acknowledgedAt', label: 'Acknowledged at (UTC)' },
        { key: 'acknowledgeNote', label: 'Note' },
      ]
    );
    return csvResponse(csv, `security-events-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const { page, limit, skip } = pageParams(params);
  const [rows, total, openHigh, types] = await Promise.all([
    events.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    events.countDocuments(filter),
    events.countDocuments({ severity: 'high', acknowledgedAt: null }),
    events.distinct('type'),
  ]);

  return ok({
    events: rows.map(shape),
    total,
    page,
    limit,
    openHigh,
    types: types
      .filter((value): value is string => typeof value === 'string' && Boolean(value))
      .sort()
      .map((value) => ({ value, label: SECURITY_EVENT_TYPES[value]?.label || value })),
    canAcknowledge: isSuperAdmin(check.admin),
  });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'security:manage');
  if (!check.ok) return check.response;
  if (!isSuperAdmin(check.admin)) return fail('Only a Super Admin can acknowledge security events.', 403);

  const body = await readBody(request);
  if (asString(body.action, 20) !== 'acknowledge') return fail('Unknown action.');
  const id = toObjectId(body.id);
  if (!id) return fail('That event id is not valid.');
  const note = asString(body.note, 500) || null;

  const { db } = await connectToDatabase();
  const events = db.collection(SECURITY_EVENTS);
  const now = new Date();
  // Only an event nobody has acknowledged yet changes: the first acknowledgement is kept.
  const result = await events.findOneAndUpdate(
    { _id: id, acknowledgedAt: null },
    { $set: { acknowledgedAt: now, acknowledgedBy: check.admin.email || null, acknowledgeNote: note } },
    { returnDocument: 'after' }
  );
  const updated: any = result && (result as any).value !== undefined ? (result as any).value : result;
  if (!updated) {
    const exists = await events.findOne({ _id: id }, { projection: { acknowledgedBy: 1 } });
    if (!exists) return fail('Event not found.', 404);
    return fail(`This event was already acknowledged by ${exists.acknowledgedBy || 'another admin'}.`, 409);
  }

  await logAudit({
    admin: check.admin,
    action: 'acknowledge',
    module: 'security',
    entityType: 'securityEvent',
    entityId: String(id),
    entityLabel: `${updated.label || updated.type}${updated.adminEmail ? ` (${updated.adminEmail})` : ''}`,
    before: { acknowledged: false },
    after: { acknowledged: true, note },
    reason: note,
    request,
  });

  return ok({ event: shape(updated), message: 'Event acknowledged.' });
}
