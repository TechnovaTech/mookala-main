import type { Db } from 'mongodb';

/**
 * Account restrictions set by an admin in User Management.
 *
 * `accountStatus` on a user document is one of:
 *   active      normal account (also the meaning of a missing value)
 *   suspended   temporarily stopped by an admin; may be reactivated
 *   blocked     stopped because of abuse or fraud
 *
 * The older boolean `isActive` is kept in step with it (false for suspended
 * and blocked) so existing data keeps working.
 */
export type AccountStatus = 'active' | 'suspended' | 'blocked';

export function accountStatusOf(doc: any): AccountStatus {
  if (doc?.accountStatus === 'blocked' || doc?.accountStatus === 'suspended') return doc.accountStatus;
  if (doc?.isActive === false) return 'suspended';
  return 'active';
}

/**
 * Returns a message when the account may not sign in or transact, or null when
 * it may. An unknown phone number is not restricted.
 */
export async function restrictionFor(
  db: Db,
  collection: 'users' | 'artists' | 'organizers',
  phone: string
): Promise<string | null> {
  if (typeof phone !== 'string' || !phone) return null;
  const doc = await db
    .collection(collection)
    .findOne({ phone }, { projection: { accountStatus: 1, isActive: 1 } });
  if (!doc) return null;

  const status = accountStatusOf(doc);
  if (status === 'blocked') return 'This account has been blocked. Please contact Mookalaa support.';
  if (status === 'suspended') return 'This account is suspended. Please contact Mookalaa support.';
  return null;
}
