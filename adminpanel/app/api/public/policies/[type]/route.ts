import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const TYPES = ['terms', 'privacy', 'refund', 'cancellation', 'community', 'advertiser', 'artist_agreement'];

/** The published version of one policy type, with its full text. */
export async function GET(_request: NextRequest, { params }: { params: { type: string } }) {
  if (!TYPES.includes(params.type)) return fail('Unknown policy type', 404);

  try {
    const { db } = await connectToDatabase();
    const policy = await db.collection('policies').findOne({ type: params.type, status: 'published' });
    if (!policy) return fail('No published policy of this type', 404);

    return ok({
      policy: {
        type: policy.type,
        title: policy.title,
        version: policy.version,
        effectiveDate: policy.effectiveDate || null,
        publishedAt: policy.publishedAt || null,
        body: policy.body || '',
      },
    });
  } catch (error) {
    console.error('Public policy failed:', error);
    return fail('The policy is unavailable', 500);
  }
}
