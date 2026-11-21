import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { escapeRegex, fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Approved artists a custom wish can be assigned to, searched by name, city or
 * phone. Returns only what the picker shows: no documents, images or KYC data.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'wishes:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
    const filter: Record<string, any> = { kycStatus: 'approved' };
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ name: regex }, { city: regex }, { phone: regex }];
    }
    const [artists, total] = await Promise.all([
      db
        .collection('artists')
        .find(filter, { projection: { name: 1, city: 1, genre: 1, phone: 1 } })
        .sort({ name: 1 })
        .limit(20)
        .toArray(),
      db.collection('artists').countDocuments(filter),
    ]);

    return ok({
      total,
      artists: artists.map((artist) => ({
        id: String(artist._id),
        name: String(artist.name || 'Unnamed artist'),
        city: artist.city ? String(artist.city) : '',
        genre: Array.isArray(artist.genre) ? artist.genre.join(', ') : artist.genre ? String(artist.genre) : '',
        phoneEnding: artist.phone ? String(artist.phone).slice(-4) : '',
      })),
    });
  } catch (error) {
    console.error('Wishes artist search failed:', error);
    return fail('Failed to search artists', 500);
  }
}
