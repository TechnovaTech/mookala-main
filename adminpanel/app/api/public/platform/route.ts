import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { getPlatformConfig, publicPlatformInfo } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

/**
 * Public platform information for the mobile apps and the website: name,
 * support contacts, currency, timezone, policy links and maintenance status.
 * No sign-in needed, so nothing private is returned.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    return ok(publicPlatformInfo(await getPlatformConfig(db)));
  } catch (error) {
    console.error('Public platform info failed:', error);
    return fail('Platform information is unavailable', 500);
  }
}
