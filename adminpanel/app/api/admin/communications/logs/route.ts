import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { LOG_COLLECTION, isChannel } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const STATUSES = ['accepted', 'failed', 'not_sent'];
const EXPORT_LIMIT = 5000;

function buildFilter(params: URLSearchParams, withStatus: boolean) {
  const filter: Record<string, any> = {};

  const channel = params.get('channel');
  if (isChannel(channel)) filter.channel = channel;

  const status = params.get('status');
  if (withStatus && status && STATUSES.includes(status)) filter.status = status;

  const template = (params.get('template') || '').trim().slice(0, 60);
  if (template) filter.templateKey = template;

  const campaign = (params.get('campaign') || '').trim().slice(0, 64);
  if (campaign) filter.campaignId = campaign;

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) filter.to = { $regex: escapeRegex(q), $options: 'i' };

  const range: Record<string, Date> = {};
  const from = params.get('from');
  const to = params.get('to');
  if (from && !Number.isNaN(new Date(from).getTime())) range.$gte = new Date(from);
  if (to && !Number.isNaN(new Date(to).getTime())) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  if (Object.keys(range).length) filter.createdAt = range;

  return filter;
}

/** Delivery log with filters, counts per status, the filter options and CSV export. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const logs = db.collection(LOG_COLLECTION);
    const filter = buildFilter(params, true);

    if (params.get('export') === 'csv') {
      const rows = await logs.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).toArray();
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'communications',
        entityType: 'notification-logs',
        meta: { rows: rows.length, filter: Object.keys(filter) },
        request,
      });
      const csv = toCsv(rows, [
        { key: 'createdAt', label: 'Time' },
        { key: 'channel', label: 'Channel' },
        { key: 'to', label: 'To' },
        { key: 'templateKey', label: 'Template' },
        { key: 'status', label: 'Status' },
        { key: 'provider', label: 'Provider' },
        { key: 'providerMessageId', label: 'Provider reference' },
        { key: 'error', label: 'Reason' },
        { key: 'attempt', label: 'Attempt' },
        { key: 'campaignType', label: 'Campaign type' },
        { key: 'campaignId', label: 'Campaign ID' },
        { key: 'subject', label: 'Subject' },
        { key: 'body', label: 'Message' },
        { key: 'requestedBy', label: 'Requested by' },
      ]);
      return csvResponse(csv, `delivery-log-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));

    const [items, total, grouped, templates, campaignIds] = await Promise.all([
      logs.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      logs.countDocuments(filter),
      logs.aggregate([{ $match: buildFilter(params, false) }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      logs.distinct('templateKey', { templateKey: { $ne: null } }),
      logs
        .aggregate([
          { $match: { campaignId: { $ne: null } } },
          { $group: { _id: { id: '$campaignId', type: '$campaignType' }, last: { $max: '$createdAt' } } },
          { $sort: { last: -1 } },
          { $limit: 100 },
        ])
        .toArray(),
    ]);

    // Names for the campaign filter, read from the campaigns themselves.
    const campaigns = [];
    for (const entry of campaignIds) {
      const oid = toObjectId(entry._id.id);
      const collection = entry._id.type === 'announcement' ? 'announcements' : entry._id.type === 'push-campaign' ? 'pushCampaigns' : null;
      const doc = oid && collection ? await db.collection(collection).findOne({ _id: oid }, { projection: { title: 1 } }) : null;
      campaigns.push({
        id: entry._id.id,
        type: entry._id.type || null,
        title: doc?.title || `(deleted ${entry._id.type || 'campaign'})`,
      });
    }

    const counts: Record<string, number> = { accepted: 0, failed: 0, not_sent: 0 };
    for (const group of grouped) if (group._id in counts) counts[group._id] = group.count;

    return ok({
      items: items.map((item) => ({ ...item, _id: String(item._id) })),
      total,
      page,
      limit,
      counts,
      templates: (templates as string[]).filter(Boolean).sort(),
      campaigns,
      canManage: can(check.admin, 'communications:manage'),
    });
  } catch (error) {
    console.error('Load delivery log failed:', error);
    return fail('Failed to load the delivery log', 500);
  }
}
