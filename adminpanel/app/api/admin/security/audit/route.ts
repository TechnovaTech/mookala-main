import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { ok, fail, asString, escapeRegex, toObjectId, toCsv, csvResponse } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { describeDevice } from '@/components/security/device';
import { dateRangeFilter, pageParams } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * The Admin Activity Log. Read-only by design: this route has no POST, PUT,
 * PATCH or DELETE handler, so entries cannot be edited or removed through the
 * API.
 *
 *   GET ?q=&admin=&module=&action=&entityType=&entityId=&from=&to=&page=&limit=
 *   GET ?id=<entry id>      one entry with old value, new value, reason, IP and device
 *   GET ?format=csv         export of the filtered entries (recorded as an export)
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'security:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const { db } = await connectToDatabase();
  const logs = db.collection('auditLogs');

  if (params.has('id')) {
    const id = toObjectId(params.get('id'));
    if (!id) return fail('That entry id is not valid.');
    const entry = await logs.findOne({ _id: id });
    if (!entry) return fail('Entry not found.', 404);
    return ok({ entry: { ...entry, _id: String(entry._id), device: describeDevice(entry.userAgent) } });
  }

  const filter: Record<string, any> = {};
  const exact = (param: string, field: string) => {
    const value = asString(params.get(param), 120);
    if (value) filter[field] = value;
  };
  exact('module', 'module');
  exact('action', 'action');
  exact('entityType', 'entityType');
  exact('entityId', 'entityId');

  const adminTerm = asString(params.get('admin'), 200);
  if (adminTerm) {
    const pattern = { $regex: escapeRegex(adminTerm), $options: 'i' };
    filter.$and = [...(filter.$and || []), { $or: [{ adminEmail: pattern }, { adminName: pattern }] }];
  }

  const q = asString(params.get('q'), 200);
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { entityLabel: pattern },
          { entityId: pattern },
          { entityType: pattern },
          { action: pattern },
          { module: pattern },
          { reason: pattern },
          { adminEmail: pattern },
          { adminName: pattern },
          { ip: pattern },
        ],
      },
    ];
  }

  const range = dateRangeFilter(params.get('from'), params.get('to'));
  if (range.error) return fail(range.error);
  if (range.filter) filter.createdAt = range.filter;

  if (params.get('format') === 'csv') {
    const rows = await logs.find(filter).sort({ createdAt: -1 }).limit(10000).toArray();
    await logAudit({
      admin: check.admin,
      action: 'export',
      module: 'security',
      entityType: 'auditLog',
      meta: { rows: rows.length, filters: Object.fromEntries(params.entries()) },
      request,
    });
    const csv = toCsv(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        device: describeDevice(row.userAgent),
      })),
      [
        { key: 'createdAt', label: 'Time (UTC)' },
        { key: 'adminName', label: 'Admin' },
        { key: 'adminEmail', label: 'Admin email' },
        { key: 'adminRole', label: 'Role' },
        { key: 'module', label: 'Module' },
        { key: 'action', label: 'Action' },
        { key: 'entityType', label: 'Record type' },
        { key: 'entityId', label: 'Record id' },
        { key: 'entityLabel', label: 'Record' },
        { key: 'before', label: 'Old value' },
        { key: 'after', label: 'New value' },
        { key: 'reason', label: 'Reason' },
        { key: 'ip', label: 'IP address' },
        { key: 'device', label: 'Device' },
      ]
    );
    return csvResponse(csv, `admin-activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const { page, limit, skip } = pageParams(params);
  const [rows, total, modules, actions, entityTypes] = await Promise.all([
    logs
      .find(filter, { projection: { before: 0, after: 0, meta: 0, userAgent: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    logs.countDocuments(filter),
    logs.distinct('module'),
    logs.distinct('action'),
    logs.distinct('entityType'),
  ]);

  const clean = (values: any[]) => values.filter((value) => typeof value === 'string' && value).sort();

  return ok({
    entries: rows.map((row) => ({ ...row, _id: String(row._id) })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    facets: { modules: clean(modules), actions: clean(actions), entityTypes: clean(entityTypes) },
  });
}
