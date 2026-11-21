import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, toObjectId } from '@/lib/http';
import { fileDownload } from '@/lib/report-export';
import { REPORT_FILES, ReportFileError, canReadReport, fileBytes, purgeExpiredFiles } from '@/lib/report-files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Downloads one generated file. This is the only way to read a stored file:
 * it needs a live admin session and every permission of the report the file
 * contains, the bytes are checked against the stored SHA-256 before they are
 * sent, and every download is written to the activity log.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'reports:view');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return fail('Invalid file ID.');

  try {
    const { db } = await connectToDatabase();
    await purgeExpiredFiles(db);

    const file = await db.collection(REPORT_FILES).findOne({ _id: id });
    if (!file) return fail('File not found. It may have expired and been deleted.', 404);

    if (!canReadReport(check.admin, String(file.reportType))) {
      await logAudit({
        admin: check.admin,
        action: 'download_denied',
        module: 'reports',
        entityType: 'report-file',
        entityId: String(id),
        entityLabel: file.name,
        meta: { report: file.reportType },
        request,
      });
      return fail('You do not have permission to download this file.', 403);
    }

    if (file.expiresAt && new Date(file.expiresAt).getTime() <= Date.now()) {
      return fail('This file has expired.', 410);
    }

    const bytes = fileBytes(file);
    const now = new Date();
    await db
      .collection(REPORT_FILES)
      .updateOne({ _id: id }, { $inc: { downloads: 1 }, $set: { lastDownloadedAt: now, lastDownloadedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'download',
      module: 'reports',
      entityType: 'report-file',
      entityId: String(id),
      entityLabel: file.name,
      meta: {
        report: file.reportType,
        dateRange: file.period,
        format: file.format,
        size: file.size,
        sha256: file.sha256,
        generatedBy: file.generatedBy,
        trigger: file.trigger,
      },
      request,
    });

    return fileDownload(bytes, String(file.name), String(file.contentType), { 'X-Checksum-Sha256': String(file.sha256) });
  } catch (error) {
    if (error instanceof ReportFileError) return fail(error.message, error.status);
    console.error('Report file download failed:', error);
    return fail('Could not download the file.', 500);
  }
}
