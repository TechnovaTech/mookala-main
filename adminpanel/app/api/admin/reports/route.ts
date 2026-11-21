import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { exportFilename, exportInputFor, resolveRange, runReport } from '@/lib/reporting';
import { buildExportFile, fileDownload } from '@/lib/report-export';
import { sha256Hex } from '@/lib/report-files';
import { getReportInfo, isExportFormat } from '@/lib/resources/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Runs one report.  ?type=<key>&preset=...|from=&to=   (&format=csv|xlsx|pdf to export)
 *
 * Every report needs 'reports:view' plus the permission for the data it reads,
 * so a role that may open Reports still cannot read finance figures. An export
 * is sent straight to the signed-in admin and recorded in the activity log
 * with its size and SHA-256; it is not kept on the server (use
 * POST /api/admin/reports/files to generate a file that is stored).
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'reports:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const type = (params.get('type') || '').trim();
  const info = getReportInfo(type);
  if (!info) return fail('Unknown report.', 400);

  const missing = info.permissions.filter((permission) => !can(check.admin, permission));
  if (missing.length) return fail('You do not have permission to run this report.', 403);

  const range = resolveRange(params, 'month');
  if (typeof range === 'string') return fail(range);

  const format = (params.get('format') || '').trim();
  if (format && !isExportFormat(format)) return fail('Unknown export format. Use csv, xlsx or pdf.');

  try {
    const { db } = await connectToDatabase();
    const report = await runReport(db, type, range, Boolean(format));
    if (!report) return fail('Unknown report.', 400);

    if (!isExportFormat(format)) return ok({ report });

    const built = await buildExportFile(format, exportInputFor(report, check.admin.email || null));
    const filename = exportFilename(report.name, report.rangeLabel, built.extension);

    await logAudit({
      admin: check.admin,
      action: 'export',
      module: 'reports',
      entityType: 'report',
      entityId: report.key,
      entityLabel: report.name,
      meta: {
        dateRange: report.rangeLabel,
        rows: report.rows.length,
        format: built.extension,
        fileName: filename,
        size: built.bytes.length,
        sha256: sha256Hex(built.bytes),
        stored: false,
      },
      request,
    });

    return fileDownload(built.bytes, filename, built.contentType);
  } catch (error) {
    console.error('Report failed:', error);
    return fail('Could not build the report.', 500);
  }
}
