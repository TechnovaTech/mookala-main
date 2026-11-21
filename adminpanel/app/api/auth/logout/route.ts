import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { AUTH_COOKIE, getAdminFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = getAdminFromRequest(request);

  if (admin?.sid) {
    try {
      const { db } = await connectToDatabase();
      await db
        .collection('adminSessions')
        .updateOne({ sid: admin.sid, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout', revokedBy: admin.email || null } });
      await logAudit({
        admin,
        action: 'logout',
        module: 'security',
        entityType: 'admin',
        entityId: admin.id,
        entityLabel: admin.email,
        request,
      });
    } catch (error) {
      console.error('Logout session update failed:', error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
