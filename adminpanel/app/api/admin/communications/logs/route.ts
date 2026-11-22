import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { DELIVERY_STATUSES, LOG_COLLECTION, isChannel } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const EXPORT_LIMIT = 5000;
const KINDS = ['message', 'otp', 'test', 'campaign'];

function buildFilter(params: URLSearchParams, withStatus: boolean) {
  const and: Record<string, any>[] = [];

  const channel = params.get('channel');
  if (isChannel(channel)) and.push({ channel });

  const status = params.get('status');
  if (withStatus && status && (DELIVERY_STATUSES as string[]).includes(status)) and.push({ status });

  const template = (params.get('template') || '').trim().slice(0, 60);
  if (template) and.push({ templateKey: template });

  const campaign = (params.get('campaign') || '').trim().slice(0, 64);
  if (campaign) and.push({ campaignId: campaign });

  const kind = params.get('kind');
  if (kind && KINDS.includes(kind)) and.push(kind === 'message' ? { kind: { $in: ['message', null] } } : { kind });

  // retry=retried: entries that were retried; retry=attempts: second and later attempts;
  // retry=scheduled: failed entries waiting for an automatic retry.
  const retry = params.get('retry');
  if (retry === 'retried') and.push({ retryLogId: { $ne: null } });
  if (retry === 'attempts') and.push({ attempt: { $gt: 1 } });
  if (retry === 'scheduled') and.push({ status: 'failed', retryable: true, retryLogId: null, nextRetryAt: { $ne: null } });

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) and.push({ $or: [{ to: { $regex: escapeRegex(q), $options: 'i' } }, { 'recipient.name': { $regex: escapeRegex(q), $options: 'i' } }, { providerMessageId: q }] });

  const range: Record<string, Date> = {};
  const from = params.get('from');
  const to = params.get('to');
  if (from && !Number.isNaN(new Date(from).getTime())) range.$gte = new Date(from);
  if (to && !Number.isNaN(new Date(to).getTime())) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  if (Object.keys(range).length) and.push({ createdAt: range });

  return and.length === 0 ? {} : and.length === 1 ? and[0] : { $and: and };
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
        meta: { rows: rows.length, filter: Array.from(params.keys()).filter((k) => k !== 'export') },
        request,
      });
      const csv = toCsv(
        rows.map((row) => ({
          ...row,
          recipientName: row.recipient?.name || '',
          recipientType: row.recipient?.type || '',
          retried: row.retryLogId ? 'yes' : '',
        })),
        [
          { key: 'createdAt', label: 'Queued or recorded at' },
          { key: 'channel', label: 'Channel' },
          { key: 'to', label: 'To' },
          { key: 'recipientName', label: 'Recipient' },
          { key: 'recipientType', label: 'Recipient type' },
          { key: 'templateKey', label: 'Template' },
          { key: 'status', label: 'Status' },
          { key: 'acceptedAt', label: 'Accepted by provider at' },
          { key: 'deliveredAt', label: 'Delivered at' },
          { key: 'readAt', label: 'Read or opened at' },
          { key: 'failedAt', label: 'Failed at' },
          { key: 'provider', label: 'Provider' },
          { key: 'providerMessageId', label: 'Provider reference' },
          { key: 'providerStatus', label: 'Last provider event' },
          { key: 'error', label: 'Reason' },
          { key: 'attempt', label: 'Attempt' },
          { key: 'retryOf', label: 'Retry of' },
          { key: 'retried', label: 'Retried' },
          { key: 'retryLogId', label: 'Retried as' },
          { key: 'nextRetryAt', label: 'Automatic retry at' },
          { key: 'kind', label: 'Kind' },
          { key: 'campaignType', label: 'Campaign type' },
          { key: 'campaignId', label: 'Campaign ID' },
          { key: 'subject', label: 'Subject' },
          { key: 'body', label: 'Message' },
          { key: 'requestedBy', label: 'Requested by' },
        ]
      );
      return csvResponse(csv, `delivery-log-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));
    const countFilter = buildFilter(params, false);

    const [items, total, grouped, retried, retryScheduled, templates, campaignIds] = await Promise.all([
      logs
        .find(filter, { projection: { variables: 0, direct: 0 } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      logs.countDocuments(filter),
      logs.aggregate([{ $match: countFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      logs.countDocuments({ $and: [countFilter, { retryLogId: { $ne: null } }] }),
      logs.countDocuments({ $and: [countFilter, { status: 'failed', retryable: true, retryLogId: null, nextRetryAt: { $ne: null } }] }),
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

    const counts: Record<string, number> = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0]));
    for (const group of grouped) if (group._id in counts) counts[group._id] = group.count;

    return ok({
      items: items.map((item) => ({ ...item, _id: String(item._id) })),
      total,
      page,
      limit,
      counts,
      retried,
      retryScheduled,
      templates: (templates as string[]).filter(Boolean).sort(),
      campaigns,
      canManage: can(check.admin, 'communications:manage'),
    });
  } catch (error) {
    console.error('Load delivery log failed:', error);
    return fail('Failed to load the delivery log', 500);
  }
}
