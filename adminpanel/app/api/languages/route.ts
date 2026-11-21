import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { DEFAULT_LANGUAGES } from '@/lib/resources/catalogue';

export const dynamic = 'force-dynamic';

/**
 * GET /api/languages: the languages an organiser can pick for an event. Managed
 * in the admin panel (resource "languages"); the built-in list is used only
 * while that list is empty.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const rows = await db
      .collection('languages')
      .find({}, { projection: { name: 1, status: 1 } })
      .sort({ sortOrder: 1, name: 1 })
      .toArray();

    const languages =
      rows.length === 0
        ? DEFAULT_LANGUAGES
        : rows.filter((row) => row.status !== 'inactive' && typeof row.name === 'string' && row.name).map((row) => row.name);

    return NextResponse.json({ success: true, languages });
  } catch (error) {
    console.error('Error fetching languages:', error);
    return NextResponse.json({ success: true, languages: DEFAULT_LANGUAGES });
  }
}
