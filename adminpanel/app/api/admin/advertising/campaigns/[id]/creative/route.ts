import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { mediaProblem } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/**
 * The creative (banner image or short video) of one advertiser campaign.
 *
 * The file is stored as a data URL in `adCreatives`, one document per
 * campaign, with the same size limit as homepage banners and sponsored ads.
 * It is kept out of the campaign document so that campaign lists stay small;
 * the campaign only records `hasCreative`.
 */

async function loadCampaign(id: string) {
  const oid = toObjectId(id);
  if (!oid) return { db: null, campaign: null };
  const { db } = await connectToDatabase();
  return { db, campaign: await db.collection('adCampaigns').findOne({ _id: oid }) };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:view');
  if (!check.ok) return check.response;
  try {
    const { db, campaign } = await loadCampaign(params.id);
    if (!db || !campaign) return fail('Campaign not found', 404);
    const creative = await db.collection('adCreatives').findOne({ campaignId: String(campaign._id) });
    return ok({
      image: creative?.image || '',
      mediaType: creative?.mediaType || null,
      uploadedAt: creative?.uploadedAt || null,
      uploadedBy: creative?.uploadedBy || null,
      creativeUrl: campaign.creativeUrl || null,
      clickUrl: campaign.clickUrl || null,
    });
  } catch (error) {
    console.error('Load campaign creative failed:', error);
    return fail('Failed to load the creative', 500);
  }
}

/** PUT { image: "data:image/...", clickUrl?: "https://..." } uploads or replaces the creative. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { db, campaign } = await loadCampaign(params.id);
    if (!db || !campaign) return fail('Campaign not found', 404);

    const image = body.image;
    if (image !== undefined) {
      if (typeof image !== 'string' || !image) return fail('Choose an image or a short video to upload.');
      if (!/^data:/i.test(image)) return fail('The creative must be an uploaded file. For an image hosted elsewhere, use the creative link on the campaign.');
      const problem = mediaProblem(image, 'Creative', { allowVideo: true });
      if (problem) return problem;
    }

    let clickUrl: string | null | undefined;
    if (body.clickUrl !== undefined) {
      clickUrl = asString(body.clickUrl, 2000) || null;
      if (clickUrl && !/^https?:\/\/\S+$/i.test(clickUrl)) return fail('The click-through link must start with http:// or https://');
    }
    if (image === undefined && clickUrl === undefined) return fail('Nothing to change');

    const reason = asString(body.reason, 500);
    const now = new Date();
    const id = String(campaign._id);
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    const set: Record<string, any> = { updatedAt: now, updatedBy: check.admin.email || null };

    if (image !== undefined) {
      const previous = await db.collection('adCreatives').findOne({ campaignId: id }, { projection: { uploadedAt: 1, mediaType: 1, size: 1 } });
      const mediaType = image.startsWith('data:video/') ? 'video' : 'image';
      await db.collection('adCreatives').updateOne(
        { campaignId: id },
        { $set: { campaignId: id, image, mediaType, size: image.length, uploadedAt: now, uploadedBy: check.admin.email || null } },
        { upsert: true }
      );
      set.hasCreative = true;
      set.creativeUpdatedAt = now;
      before.creative = previous ? { mediaType: previous.mediaType, characters: previous.size ?? null, uploadedAt: previous.uploadedAt } : null;
      after.creative = { mediaType, characters: image.length, uploadedAt: now };
    }
    if (clickUrl !== undefined && clickUrl !== (campaign.clickUrl || null)) {
      set.clickUrl = clickUrl;
      before.clickUrl = campaign.clickUrl || null;
      after.clickUrl = clickUrl;
    }

    await db.collection('adCampaigns').updateOne({ _id: campaign._id }, { $set: set });
    if (Object.keys(after).length) {
      await logAudit({
        admin: check.admin,
        action: 'update',
        module: 'ads',
        entityType: 'ad-campaigns',
        entityId: id,
        entityLabel: campaign.name || '',
        before,
        after,
        reason: reason || null,
        meta: image !== undefined ? { change: 'creative upload' } : undefined,
        request,
      });
    }
    return ok({ hasCreative: image !== undefined ? true : Boolean(campaign.hasCreative), clickUrl: clickUrl !== undefined ? clickUrl : campaign.clickUrl || null });
  } catch (error) {
    console.error('Save campaign creative failed:', error);
    return fail('Failed to save the creative', 500);
  }
}

/** DELETE { reason } removes the uploaded creative. An approved campaign must keep one. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;
  try {
    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500);
    if (!reason) return fail('A reason is required to remove a creative');

    const { db, campaign } = await loadCampaign(params.id);
    if (!db || !campaign) return fail('Campaign not found', 404);
    const id = String(campaign._id);
    const previous = await db.collection('adCreatives').findOne({ campaignId: id }, { projection: { uploadedAt: 1, mediaType: 1, size: 1 } });
    if (!previous) return fail('This campaign has no uploaded creative', 404);
    if (['live', 'scheduled'].includes(campaign.status) && !/^https?:\/\//i.test(String(campaign.creativeUrl || ''))) {
      return fail('This campaign is approved and would be left without a creative. Pause it first, or upload the replacement instead.', 409);
    }

    await db.collection('adCreatives').deleteOne({ campaignId: id });
    await db
      .collection('adCampaigns')
      .updateOne({ _id: campaign._id }, { $set: { hasCreative: false, creativeUpdatedAt: new Date(), updatedAt: new Date(), updatedBy: check.admin.email || null } });
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'ads',
      entityType: 'ad-campaigns',
      entityId: id,
      entityLabel: campaign.name || '',
      before: { creative: { mediaType: previous.mediaType, characters: previous.size ?? null, uploadedAt: previous.uploadedAt } },
      after: { creative: null },
      reason,
      meta: { change: 'creative removed' },
      request,
    });
    return ok({ hasCreative: false });
  } catch (error) {
    console.error('Remove campaign creative failed:', error);
    return fail('Failed to remove the creative', 500);
  }
}
