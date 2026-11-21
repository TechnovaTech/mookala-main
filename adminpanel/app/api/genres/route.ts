import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { DEFAULT_GENRES } from '@/lib/resources/catalogue';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/genres: the genre names shown in the apps. Managed in the admin
 * panel (resource "genres"); the built-in list is used only while that list is empty.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const rows = await db
      .collection('genres')
      .find({}, { projection: { name: 1, status: 1 } })
      .sort({ sortOrder: 1, name: 1 })
      .toArray();

    const genres =
      rows.length === 0
        ? DEFAULT_GENRES
        : rows.filter((row) => row.status !== 'inactive' && typeof row.name === 'string' && row.name).map((row) => row.name);

    return NextResponse.json({ success: true, genres });
  } catch (error) {
    console.error('Error fetching genres:', error);
    return NextResponse.json({ success: true, genres: DEFAULT_GENRES });
  }
}
