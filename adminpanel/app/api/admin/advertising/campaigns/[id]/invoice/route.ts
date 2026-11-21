import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { DAY_MS, DEFAULT_GST_PERCENT, INVOICE_DUE_DAYS, nextInvoiceNumber, round2, startOfToday } from '../../../_lib/campaigns';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/advertising/campaigns/<id>/invoice
 *   { gstPercent?: number (default 18), dueDate?: "YYYY-MM-DD", reason?: string }
 *
 * Raises the invoice for a campaign: the price of the campaign's package plus
 * GST, numbered by the server. A campaign has at most one open or paid
 * invoice; a second can be raised only after the first was refunded.
 *
 * Needs 'finance:manage': the invoice is an Ad Payments record, and those are
 * recorded by Finance (the `ad-payments` resource uses the same permission).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  try {
    const body = (await request.json().catch(() => null)) || {};
    if (typeof body !== 'object') return fail('Invalid request body');

    const oid = toObjectId(params.id);
    if (!oid) return fail('Campaign not found', 404);
    const { db } = await connectToDatabase();
    const campaign = await db.collection('adCampaigns').findOne({ _id: oid });
    if (!campaign) return fail('Campaign not found', 404);

    const advertiserId = toObjectId(campaign.advertiser);
    const advertiser = advertiserId ? await db.collection('advertisers').findOne({ _id: advertiserId }) : null;
    if (!advertiser) return fail('This campaign has no advertiser on record.', 409);

    const packageId = toObjectId(campaign.package);
    const pack = packageId ? await db.collection('adPackages').findOne({ _id: packageId }) : null;
    if (!pack) return fail('This campaign has no package, so there is no price to invoice. Choose a package on the campaign, or add the invoice by hand on Ad Payments.', 409);
    const amount = round2(Number(pack.price) || 0);
    if (!(amount > 0)) return fail(`The package "${pack.name}" has no price.`, 409);

    let gstPercent = DEFAULT_GST_PERCENT;
    if (body.gstPercent !== undefined && body.gstPercent !== null && body.gstPercent !== '') {
      gstPercent = typeof body.gstPercent === 'number' ? body.gstPercent : parseFloat(String(body.gstPercent));
      if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 28) return fail('GST must be between 0 and 28 percent.');
    }

    let dueDate = new Date(startOfToday().getTime() + INVOICE_DUE_DAYS * DAY_MS);
    if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '') {
      const text = asString(body.dueDate, 30);
      const parsed = /^\d{4}-\d{2}-\d{2}/.test(text) ? new Date(text.slice(0, 10) + 'T00:00:00.000Z') : null;
      if (!parsed || Number.isNaN(parsed.getTime())) return fail('The due date is not a valid date.');
      dueDate = parsed;
    }

    const open = await db
      .collection('adPayments')
      .findOne({ campaign: String(campaign._id), status: { $in: ['invoiced', 'overdue', 'paid'] } }, { projection: { invoiceNumber: 1, status: 1 } });
    if (open) {
      return fail(`This campaign already has invoice ${open.invoiceNumber} (${open.status}). A new one can be raised only after that invoice is refunded.`, 409, {
        invoiceId: String(open._id),
      });
    }

    const gstAmount = round2((amount * gstPercent) / 100);
    const now = new Date();
    const doc = {
      invoiceNumber: await nextInvoiceNumber(db),
      advertiser: String(advertiser._id),
      campaign: String(campaign._id),
      amount,
      gstAmount,
      gstPercent,
      total: round2(amount + gstAmount),
      dueDate,
      paidOn: null,
      method: null,
      gatewayPaymentId: null,
      packageName: pack.name || null,
      status: 'invoiced',
      createdAt: now,
      updatedAt: now,
      createdBy: check.admin.email || null,
      updatedBy: check.admin.email || null,
    };
    const result = await db.collection('adPayments').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'ads',
      entityType: 'ad-payments',
      entityId: String(result.insertedId),
      entityLabel: doc.invoiceNumber,
      after: doc,
      reason: asString(body.reason, 500) || `Raised from campaign "${campaign.name}" at the price of package "${pack.name}"`,
      meta: { campaignId: String(campaign._id), packageId: String(pack._id) },
      request,
    });

    return ok({ id: String(result.insertedId), invoice: { ...doc, _id: String(result.insertedId) } }, { status: 201 });
  } catch (error) {
    console.error('Raise campaign invoice failed:', error);
    return fail('Failed to raise the invoice', 500);
  }
}
