import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { resolveRange } from '@/lib/reporting';
import {
  FILE_LIST_PROJECTION,
  MAX_FILE_BYTES,
  REPORT_FILES,
  ReportFileError,
  canReadReport,
  generateAndStoreReport,
  getRetentionDays,
  purgeExpiredFiles,
  readableReportTypes,
  setRetentionDays,
} from '@/lib/report-files';
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, getReportInfo, isExportFormat } from '@/lib/resources/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 50;

/**
 * Generated report files.
 *
 *   GET    list the files this admin may download (never the bytes)
 *   POST   generate a report and store the file   { type, preset | from+to, format }
 *   PATCH  change the retention period            { retentionDays }
 *
 * An admin only ever sees files of reports they hold every permission for.
 * Expired files are deleted before the list is read.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'reports:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    await purgeExpiredFiles(db);

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const allowed = readableReportTypes(check.admin);
    const filter: Record<string, any> = { reportType: { $in: allowed } };

    const type = asString(params.get('type'), 60);
    if (type) {
      if (!getReportInfo(type)) return fail('Unknown report.');
      if (!allowed.includes(type)) return fail('You do not have permission to see files of this report.', 403);
      filter.reportType = type;
    }
    const format = asString(params.get('format'), 10);
    if (format) {
      if (!isExportFormat(format)) return fail('Unknown format. Use csv, xlsx or pdf.');
      filter.format = format;
    }

    const collection = db.collection(REPORT_FILES);
    const [items, total, hidden, retentionDays] = await Promise.all([
      collection
        .find(filter, { projection: FILE_LIST_PROJECTION })
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
      collection.countDocuments(filter),
      // How many files exist that this admin may not see, so the screen can say so without naming them.
      collection.countDocuments({ reportType: { $nin: allowed } }),
      getRetentionDays(db),
    ]);

    return ok({
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      hiddenFromYou: hidden,
      retentionDays,
      retentionLimits: { min: MIN_RETENTION_DAYS, max: MAX_RETENTION_DAYS },
      maxFileBytes: MAX_FILE_BYTES,
      canManage: can(check.admin, 'reports:manage'),
    });
  } catch (error) {
    console.error('Report files list failed:', error);
    return fail('Could not load the generated files.', 500);
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'reports:view');
  if (!check.ok) return check.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Send the report, the date range and the format as JSON.');
  }
  if (!body || typeof body !== 'object') return fail('Send the report, the date range and the format as JSON.');

  const type = asString(body.type, 60);
  const info = getReportInfo(type);
  if (!info) return fail('Unknown report.');
  if (!canReadReport(check.admin, info.key)) return fail('You do not have permission to run this report.', 403);

  const format = asString(body.format, 10);
  if (!isExportFormat(format)) return fail('Choose a format: csv, xlsx or pdf.');

  const params = new URLSearchParams();
  for (const key of ['preset', 'from', 'to']) {
    const value = asString(body[key], 20);
    if (value) params.set(key, value);
  }
  const range = resolveRange(params, 'month');
  if (typeof range === 'string') return fail(range);

  try {
    const { db } = await connectToDatabase();
    const file = await generateAndStoreReport(db, {
      reportType: info.key,
      range,
      format,
      generatedBy: check.admin.email || 'admin',
      trigger: 'manual',
    });

    await logAudit({
      admin: check.admin,
      action: 'export',
      module: 'reports',
      entityType: 'report-file',
      entityId: String(file._id),
      entityLabel: file.name,
      meta: {
        report: file.reportType,
        dateRange: file.period,
        rows: file.rows,
        format: file.format,
        size: file.size,
        sha256: file.sha256,
        expiresAt: file.expiresAt,
        stored: true,
      },
      request,
    });

    return ok({ file }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportFileError) return fail(error.message, error.status);
    console.error('Report file generation failed:', error);
    return fail('Could not generate the file.', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const check = await requireAdmin(request, 'reports:manage');
  if (!check.ok) return check.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Send the retention period as JSON.');
  }

  try {
    const { db } = await connectToDatabase();
    const result = await setRetentionDays(db, body?.retentionDays, check.admin);
    if (typeof result === 'string') return fail(result);

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'reports',
      entityType: 'report-file-retention',
      entityLabel: 'Generated file retention',
      before: { fileRetentionDays: result.before },
      after: { fileRetentionDays: result.after },
      reason: asString(body?.reason, 500) || null,
      request,
    });

    const deleted = await purgeExpiredFiles(db);
    return ok({ retentionDays: result.after, expiredFilesDeleted: deleted });
  } catch (error) {
    console.error('Report retention update failed:', error);
    return fail('Could not save the retention period.', 500);
  }
}
