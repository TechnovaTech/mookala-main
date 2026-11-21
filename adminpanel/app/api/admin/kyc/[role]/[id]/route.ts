import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { fail, ok, toObjectId } from '@/lib/http';
import { collectionFor, findParty, historyFor, parseRole } from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

function asDataUri(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.startsWith('data:') ? value : 'data:image/jpeg;base64,' + value;
}

/**
 * GET /api/admin/kyc/[role]/[id]
 * One KYC record with its identity numbers, document images and decision
 * history. This is the only endpoint that returns KYC images, it needs
 * 'kyc:view', and each time documents are opened it is written to the
 * activity log.
 */
export async function GET(request: NextRequest, { params }: { params: { role: string; id: string } }) {
  const check = await requireAdmin(request, 'kyc:view');
  if (!check.ok) return check.response;

  const role = parseRole(params.role);
  if (!role) return fail('Role must be artist or organizer', 400);
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid id', 400);

  try {
    const { db } = await connectToDatabase();
    const row = await findParty(db, role, params.id);
    if (!row) return fail('Record not found', 404);

    const documents = await db
      .collection(collectionFor(role))
      .findOne({ _id: oid }, { projection: { aadharId: 1, panId: 1, aadharImage: 1, panImage: 1 } });

    const history = await historyFor(db, role, params.id, 'kyc');

    if (documents?.aadharId || documents?.panId || documents?.aadharImage || documents?.panImage) {
      await logAudit({
        admin: check.admin,
        action: 'view_documents',
        module: 'kyc',
        entityType: role,
        entityId: params.id,
        entityLabel: row.name || row.phone,
        request,
      });
    }

    return ok({
      role,
      record: {
        ...row,
        aadharId: documents?.aadharId ? String(documents.aadharId) : '',
        panId: documents?.panId ? String(documents.panId) : '',
        aadharImage: asDataUri(documents?.aadharImage),
        panImage: asDataUri(documents?.panImage),
      },
      history,
      canManage: can(check.admin, 'kyc:manage'),
    });
  } catch (error) {
    console.error('KYC record failed:', error);
    return fail('Failed to load the KYC record', 500);
  }
}
