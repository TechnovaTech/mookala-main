import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Published policies (one per type), without their text. Drafts and archived versions are never listed. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const policies = await db
      .collection('policies')
      .find({ status: 'published' }, { projection: { type: 1, title: 1, version: 1, effectiveDate: 1, publishedAt: 1 } })
      .sort({ type: 1 })
      .toArray();

    return ok({
      policies: policies.map((p) => ({
        type: p.type,
        title: p.title,
        version: p.version,
        effectiveDate: p.effectiveDate || null,
        publishedAt: p.publishedAt || null,
      })),
    });
  } catch (error) {
    console.error('Public policies failed:', error);
    return fail('Policies are unavailable', 500);
  }
}
