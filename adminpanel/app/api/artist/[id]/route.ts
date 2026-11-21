import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { loadArtistDetail } from '@/app/api/admin/artists/_detail';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artist/[id]
 * Older admin endpoint for one artist, kept for anything that still links to
 * it. Same data as GET /api/admin/artists/[id]: no KYC documents, images as
 * links only.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;
  if (!toObjectId(params.id)) return fail('Invalid artist id', 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await loadArtistDetail(db, params.id, can(check.admin, 'kyc:view'));
    if (!artist) return fail('Artist not found', 404);
    return ok({ artist });
  } catch (error) {
    console.error('Error fetching artist:', error);
    return fail('Failed to fetch artist', 500);
  }
}
