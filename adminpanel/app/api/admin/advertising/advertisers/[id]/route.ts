import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { effectiveStatus, round2, syncCampaignStatuses, syncInvoiceStatuses } from '../../_lib/campaigns';

export const dynamic = 'force-dynamic';

/**
 * Everything about one advertiser: profile, applications, campaigns, invoices
 * and payments, the amounts outstanding and paid, and the change history of
 * the advertiser and of its applications, campaigns and invoices.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:view');
  if (!check.ok) return check.response;

  try {
    const oid = toObjectId(params.id);
    if (!oid) return fail('Advertiser not found', 404);
    const { db } = await connectToDatabase();
    const advertiser = await db.collection('advertisers').findOne({ _id: oid });
    if (!advertiser) return fail('Advertiser not found', 404);

    const context = { admin: null, request, trigger: 'advertiser account opened' };
    await syncCampaignStatuses(db, context);
    await syncInvoiceStatuses(db, context);

    const id = String(advertiser._id);
    const [applications, campaigns, invoices] = await Promise.all([
      db.collection('adApplications').find({ advertiser: id }).sort({ createdAt: -1 }).toArray(),
      db.collection('adCampaigns').find({ advertiser: id }).sort({ startDate: -1 }).toArray(),
      db.collection('adPayments').find({ advertiser: id }).sort({ createdAt: -1 }).toArray(),
    ]);

    const packageIds = Array.from(new Set([...applications, ...campaigns].map((row) => row.package).filter(Boolean)))
      .map((value) => toObjectId(value))
      .filter(Boolean) as ObjectId[];
    const packages = packageIds.length
      ? await db.collection('adPackages').find({ _id: { $in: packageIds } }).project({ name: 1, price: 1, placement: 1, durationDays: 1 }).toArray()
      : [];
    const packageOf = new Map(packages.map((p) => [String(p._id), p]));
    const campaignName = new Map(campaigns.map((c) => [String(c._id), c.name]));

    const totalOf = (invoice: any) => round2((Number(invoice.amount) || 0) + (Number(invoice.gstAmount) || 0));
    const sum = (statuses: string[]) => round2(invoices.filter((i) => statuses.includes(i.status)).reduce((total, i) => total + totalOf(i), 0));
    const count = (statuses: string[]) => invoices.filter((i) => statuses.includes(i.status)).length;

    const entityIds = [id, ...applications.map((a) => String(a._id)), ...campaigns.map((c) => String(c._id)), ...invoices.map((i) => String(i._id))];
    const history = await db
      .collection('auditLogs')
      .find({ module: 'ads', entityType: { $in: ['advertisers', 'ad-applications', 'ad-campaigns', 'ad-payments'] }, entityId: { $in: entityIds } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const now = new Date();
    return ok({
      advertiser: { ...advertiser, _id: id },
      applications: applications.map((a) => ({
        _id: String(a._id),
        label: a.applicationLabel || '',
        package: packageOf.get(String(a.package))?.name || null,
        requestedStartDate: a.requestedStartDate || null,
        targetLocations: a.targetLocations || [],
        status: a.status,
        statusReason: a.statusReason || null,
        campaign: a.campaign || null,
        campaignName: a.campaign ? campaignName.get(String(a.campaign)) || null : null,
        createdAt: a.createdAt,
      })),
      campaigns: campaigns.map((c) => ({
        _id: String(c._id),
        name: c.name,
        package: packageOf.get(String(c.package))?.name || null,
        placement: c.placement,
        startDate: c.startDate || null,
        endDate: c.endDate || null,
        targetLocations: c.targetLocations || [],
        status: effectiveStatus(c, now),
        statusReason: c.statusReason || null,
        hasCreative: Boolean(c.hasCreative) || Boolean(c.creativeUrl),
        impressions: Number(c.impressions) || 0,
        clicks: Number(c.clicks) || 0,
      })),
      invoices: invoices.map((i) => ({
        _id: String(i._id),
        invoiceNumber: i.invoiceNumber,
        campaign: i.campaign || null,
        campaignName: i.campaign ? campaignName.get(String(i.campaign)) || null : null,
        amount: Number(i.amount) || 0,
        gstAmount: Number(i.gstAmount) || 0,
        total: totalOf(i),
        dueDate: i.dueDate || null,
        paidOn: i.paidOn || null,
        method: i.method || null,
        status: i.status,
        createdAt: i.createdAt,
      })),
      totals: {
        applications: applications.length,
        campaigns: campaigns.length,
        liveCampaigns: campaigns.filter((c) => effectiveStatus(c, now) === 'live').length,
        impressions: campaigns.reduce((total, c) => total + (Number(c.impressions) || 0), 0),
        clicks: campaigns.reduce((total, c) => total + (Number(c.clicks) || 0), 0),
        // Everything below includes GST.
        billed: sum(['invoiced', 'overdue', 'paid']),
        outstanding: sum(['invoiced', 'overdue']),
        outstandingInvoices: count(['invoiced', 'overdue']),
        overdue: sum(['overdue']),
        overdueInvoices: count(['overdue']),
        paid: sum(['paid']),
        paidInvoices: count(['paid']),
        refunded: sum(['refunded']),
        refundedInvoices: count(['refunded']),
      },
      history: history.map((entry) => ({
        _id: String(entry._id),
        at: entry.createdAt,
        admin: entry.adminName || entry.adminEmail || 'Automatic',
        action: entry.action,
        entityType: entry.entityType,
        entityLabel: entry.entityLabel || '',
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason || null,
      })),
      canManage: can(check.admin, 'ads:manage'),
    });
  } catch (error) {
    console.error('Advertiser account failed:', error);
    return fail('Failed to load the advertiser account', 500);
  }
}
