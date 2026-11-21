import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { changeAccountStatus, findParty } from '../_shared';
import { loadArtistDetail } from '../_detail';

export const dynamic = 'force-dynamic';

/** Public profile text an admin may correct. Phone, email and KYC details are not editable here. */
const PROFILE_FIELDS: Record<string, { label: string; max: number; required?: boolean }> = {
  name: { label: 'Name', max: 120, required: true },
  city: { label: 'City', max: 120 },
  bio: { label: 'Bio', max: 3000 },
  genre: { label: 'Genre', max: 200 },
  pricing: { label: 'Pricing', max: 200 },
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;
  if (!toObjectId(params.id)) return fail('Invalid artist id', 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await loadArtistDetail(db, params.id, can(check.admin, 'kyc:view'));
    if (!artist) return fail('Artist not found', 404);
    return ok({
      artist,
      canManage: can(check.admin, 'artists:manage'),
      canViewKyc: can(check.admin, 'kyc:view'),
      canViewPayments: can(check.admin, 'settlements:view'),
    });
  } catch (error) {
    console.error('Admin artist detail failed:', error);
    return fail('Failed to load the artist', 500);
  }
}

/**
 * PATCH /api/admin/artists/[id]
 *   { action: 'suspend' | 'reactivate', reason }
 *   { action: 'assign_category', categoryId | null, reason }
 *   { action: 'edit_profile', profile: { name?, city?, bio?, genre?, pricing? }, reason }
 *   { action: 'remove_image', image: 'profile' | 'banner', reason }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'artists:manage');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid artist id', 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body', 400);
  }
  const action = asString(body?.action, 40);
  const reason = asString(body?.reason, 1000);

  try {
    const { db } = await connectToDatabase();

    if (action === 'suspend' || action === 'reactivate') {
      const result = await changeAccountStatus({
        db,
        role: 'artist',
        id: params.id,
        action,
        reason,
        admin: check.admin,
        request,
      });
      if ('error' in result) return fail(result.error, result.status);
      return ok({ artist: result.row });
    }

    if (action === 'assign_category') {
      const existing = await findParty(db, 'artist', params.id);
      if (!existing) return fail('Artist not found', 404);
      if (!reason) return fail('A reason is required to change the category.', 400);

      const requested = body?.categoryId === null ? '' : asString(body?.categoryId, 40);
      let nextName: string | null = null;
      if (requested) {
        const categoryId = toObjectId(requested);
        if (!categoryId) return fail('Invalid category', 400);
        const category = await db.collection('artistCategories').findOne({ _id: categoryId }, { projection: { name: 1 } });
        if (!category) return fail('That category does not exist.', 404);
        nextName = category.name || '';
      }

      const previous = existing.categoryId || '';
      if (previous === requested) return fail('The artist is already in that category.', 409);

      const previousCategory =
        previous && toObjectId(previous)
          ? await db.collection('artistCategories').findOne({ _id: toObjectId(previous)! }, { projection: { name: 1 } })
          : null;

      await db
        .collection('artists')
        .updateOne({ _id: oid }, { $set: { categoryId: requested || null, updatedAt: new Date() } });

      await logAudit({
        admin: check.admin,
        action: 'assign_category',
        module: 'artists',
        entityType: 'artist',
        entityId: params.id,
        entityLabel: existing.name || existing.phone,
        before: { categoryId: previous || null, category: previousCategory?.name || null },
        after: { categoryId: requested || null, category: nextName },
        reason,
        request,
      });

      return ok({ artist: await findParty(db, 'artist', params.id), categoryName: nextName });
    }

    if (action === 'edit_profile') {
      if (!reason) return fail('A reason is required to edit an artist\'s public profile.', 400);
      const input = body?.profile;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Send the profile fields to change.', 400);
      const unknown = Object.keys(input).filter((key) => !(key in PROFILE_FIELDS));
      if (unknown.length) return fail(`These fields cannot be edited here: ${unknown.join(', ')}`, 400);

      const existing = await db
        .collection('artists')
        .findOne({ _id: oid }, { projection: { name: 1, phone: 1, city: 1, bio: 1, genre: 1, pricing: 1 } });
      if (!existing) return fail('Artist not found', 404);

      const set: Record<string, any> = {};
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};
      for (const [key, rule] of Object.entries(PROFILE_FIELDS)) {
        if (!(key in input)) continue;
        const raw = input[key];
        // Pricing has been stored both as text and as a number.
        if (typeof raw !== 'string' && !(key === 'pricing' && typeof raw === 'number' && Number.isFinite(raw))) {
          return fail(`${rule.label} must be text.`, 400);
        }
        const value = String(raw).trim();
        if (value.length > rule.max) return fail(`${rule.label} can be at most ${rule.max} characters.`, 400);
        if (rule.required && !value) return fail(`${rule.label} cannot be empty.`, 400);
        const previous = existing[key] === undefined || existing[key] === null ? '' : String(existing[key]);
        if (previous === value) continue;
        set[key] = value;
        before[key] = previous;
        after[key] = value;
      }
      if (Object.keys(set).length === 0) return fail('Nothing was changed: the profile already has these values.', 409);

      const now = new Date();
      await db.collection('artists').updateOne(
        { _id: oid },
        { $set: { ...set, updatedAt: now, profileEditedBy: check.admin.email || null, profileEditedAt: now } }
      );
      await logAudit({
        admin: check.admin,
        action: 'edit_profile',
        module: 'artists',
        entityType: 'artist',
        entityId: params.id,
        entityLabel: existing.name || existing.phone,
        before,
        after,
        reason,
        request,
      });
      return ok({ artist: await findParty(db, 'artist', params.id), changed: Object.keys(set) });
    }

    if (action === 'remove_image') {
      if (!reason) return fail('A reason is required to remove an image.', 400);
      const image = asString(body?.image, 20);
      if (image !== 'profile' && image !== 'banner') return fail('image must be profile or banner', 400);
      const field = image === 'profile' ? 'profileImage' : 'bannerImage';

      const existing = await db.collection('artists').findOne({ _id: oid }, { projection: { name: 1, phone: 1, [field]: 1 } });
      if (!existing) return fail('Artist not found', 404);
      const stored = typeof existing[field] === 'string' ? (existing[field] as string) : '';
      if (!stored) return fail(`This artist has no ${image} image.`, 409);

      await db.collection('artists').updateOne({ _id: oid }, { $set: { [field]: null, updatedAt: new Date() } });
      await logAudit({
        admin: check.admin,
        action: 'remove_image',
        module: 'artists',
        entityType: 'artist',
        entityId: params.id,
        entityLabel: existing.name || existing.phone,
        // The image itself is never copied into the log, only its size and a fingerprint.
        before: { [field]: 'present' },
        after: { [field]: 'removed' },
        reason,
        meta: {
          image,
          characters: stored.length,
          sha256: crypto.createHash('sha256').update(stored).digest('hex'),
        },
        request,
      });
      return ok({ artist: await findParty(db, 'artist', params.id), removed: image });
    }

    return fail('Unknown action', 400);
  } catch (error) {
    console.error('Admin artist update failed:', error);
    return fail('Failed to update the artist', 500);
  }
}
