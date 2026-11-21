import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { ReportFileError, canReadReport, runSchedule } from '@/lib/report-files';
import { getReportInfo } from '@/lib/resources/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * "Run now" for a saved schedule: generates the report for the last completed
 * period in the schedule's format with the same code the hourly scheduler
 * uses, stores the file under Generated Files and returns its details. The
 * browser then downloads it through the permission-checked download route.
 * Nothing is emailed: no email provider is connected.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'reports:view');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return fail('Invalid schedule ID.');

  try {
    const { db } = await connectToDatabase();
    const schedule = await db.collection('scheduledReports').findOne({ _id: id });
    if (!schedule) return fail('Schedule not found.', 404);

    const info = getReportInfo(String(schedule.reportType || ''));
    if (!info) return fail('This schedule points to a report that no longer exists.', 409);
    if (!canReadReport(check.admin, info.key)) return fail('You do not have permission to run this report.', 403);

    const outcome = await runSchedule(db, schedule, { admin: check.admin, trigger: 'run_now', request });
    const { file } = outcome;
    return ok({
      file: {
        _id: String(file._id),
        name: file.name,
        format: file.format,
        size: file.size,
        sha256: file.sha256,
        expiresAt: file.expiresAt,
      },
      rows: file.rows,
      rangeLabel: outcome.rangeLabel,
      downloadUrl: `/api/admin/reports/files/${file._id}/download`,
    });
  } catch (error) {
    if (error instanceof ReportFileError) return fail(error.message, error.status);
    console.error('Scheduled report run failed:', error);
    return fail('Could not run the report.', 500);
  }
}
