import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { FILE_LIST_PROJECTION, REPORT_FILES, canReadReport } from '@/lib/report-files';

export const dynamic = 'force-dynamic';

/**
 * Deletes one generated file before its expiry date. Needs 'reports:manage',
 * every permission of the report the file contains, and a reason.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'reports:manage');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return fail('Invalid file ID.');

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = asString(body?.reason, 500);
  if (!reason) return fail('Give a reason for deleting this file.');

  try {
    const { db } = await connectToDatabase();
    const file = await db.collection(REPORT_FILES).findOne({ _id: id }, { projection: FILE_LIST_PROJECTION });
    // A file the admin may not read is reported as missing, so its existence is not revealed.
    if (!file || !canReadReport(check.admin, String(file.reportType))) return fail('File not found.', 404);

    await db.collection(REPORT_FILES).deleteOne({ _id: id });
    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'reports',
      entityType: 'report-file',
      entityId: String(id),
      entityLabel: file.name,
      before: {
        name: file.name,
        reportType: file.reportType,
        period: file.period,
        format: file.format,
        size: file.size,
        sha256: file.sha256,
        generatedBy: file.generatedBy,
        createdAt: file.createdAt,
        expiresAt: file.expiresAt,
      },
      reason,
      request,
    });
    return ok({ deleted: true });
  } catch (error) {
    console.error('Report file delete failed:', error);
    return fail('Could not delete the file.', 500);
  }
}
