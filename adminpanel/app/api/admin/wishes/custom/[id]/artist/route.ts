import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Assigns an approved artist to a custom wish, or replaces the one assigned.
 * Replacing needs a reason. Once the wish is marked paid the artist is the
 * payee of the ledger payment and can no longer be changed.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'wishes:manage');
  if (!check.ok) return check.response;

  const orderId = toObjectId(params.id);
  if (!orderId) return fail('Custom wish not found', 404);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');
    const artistId = toObjectId(asString(body.artistId));
    if (!artistId) return fail('Choose an artist.');
    const reason = asString(body.reason).trim().slice(0, 500);

    const { db } = await connectToDatabase();
    const orders = db.collection('wishOrders');
    const order = await orders.findOne({ _id: orderId, kind: 'custom' });
    if (!order) return fail('Custom wish not found', 404);

    // A wish entered before artists were chosen from the approved list may be
    // paid with no artist at all; that one can still be given its artist.
    if (order.paidAt && order.artistId) {
      return fail(
        'This wish is already marked paid and the payment is recorded in the ledger for the assigned artist, so the artist cannot be changed. Refund this wish and create a new one.',
        409
      );
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      return fail('This wish is closed, so its artist cannot be changed.', 409);
    }

    const artist = await db
      .collection('artists')
      .findOne({ _id: artistId }, { projection: { name: 1, kycStatus: 1 } });
    if (!artist) return fail('That artist does not exist.');
    if (artist.kycStatus !== 'approved') return fail('Only an artist the admin team has approved can be assigned.');

    if (String(order.artistId || '') === String(artist._id)) return ok({ unchanged: true, artistId: String(artist._id), artistName: order.artistName });
    if (order.artistId && !reason) return fail('Give a reason for replacing the assigned artist.');

    const now = new Date();
    const after = { artistId: String(artist._id), artistName: String(artist.name || 'Unnamed artist') };
    await orders.updateOne(
      { _id: orderId },
      { $set: { ...after, artistAssignedAt: now, artistAssignedBy: check.admin.email || null, updatedAt: now, updatedBy: check.admin.email || null } }
    );

    await logAudit({
      admin: check.admin,
      action: 'assign_artist',
      module: 'wishes',
      entityType: 'custom-wishes',
      entityId: params.id,
      entityLabel: String(order.recipientName || ''),
      before: { artistId: order.artistId || null, artistName: order.artistName || order.requestedArtist || null },
      after,
      reason: reason || null,
      request,
    });

    return ok(after);
  } catch (error) {
    console.error('Assign artist to custom wish failed:', error);
    return fail('Failed to assign the artist', 500);
  }
}
