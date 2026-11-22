import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { DELIVERY_STATUSES, LOG_COLLECTION, isChannel } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * Per-recipient delivery results of one announcement, read from the delivery
 * log: counts per status and channel, and the entries page by page.
 * Statuses change as provider receipts arrive (delivered, read, failed).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid announcement id');

  try {
    const { db } = await connectToDatabase();
    const announcement = await db
      .collection('announcements')
      .findOne({ _id: oid }, { projection: { title: 1, status: 1, audienceCount: 1, recipientsProcessed: 1 } });
    if (!announcement) return fail('Announcement not found', 404);

    const search = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(search.get('page') || '1', 10) || 1);
    const base = { campaignId: String(oid), campaignType: 'announcement' };
    const filter: Record<string, any> = { ...base };
    const status = search.get('status');
    if (status && (DELIVERY_STATUSES as string[]).includes(status)) filter.status = status;
    const channel = search.get('channel');
    if (isChannel(channel)) filter.channel = channel;

    const logs = db.collection(LOG_COLLECTION);
    const [grouped, total, items] = await Promise.all([
      logs.aggregate([{ $match: base }, { $group: { _id: { status: '$status', channel: '$channel' }, count: { $sum: 1 } } }]).toArray(),
      logs.countDocuments(filter),
      logs
        .find(filter, {
          projection: {
            channel: 1,
            to: 1,
            status: 1,
            recipient: 1,
            attempt: 1,
            error: 1,
            providerMessageId: 1,
            acceptedAt: 1,
            deliveredAt: 1,
            readAt: 1,
            failedAt: 1,
            retryLogId: 1,
            retryOf: 1,
            nextRetryAt: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
    ]);

    const counts: Record<string, number> = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0]));
    const byChannel: Record<string, Record<string, number>> = {};
    for (const group of grouped) {
      const s = group._id.status as string;
      const c = group._id.channel as string;
      counts[s] = (counts[s] || 0) + group.count;
      byChannel[c] = byChannel[c] || Object.fromEntries(DELIVERY_STATUSES.map((x) => [x, 0]));
      byChannel[c][s] = (byChannel[c][s] || 0) + group.count;
    }

    return ok({
      announcement: {
        id: String(announcement._id),
        title: announcement.title,
        status: announcement.status,
        audienceCount: announcement.audienceCount ?? null,
        recipientsProcessed: announcement.recipientsProcessed ?? 0,
      },
      counts,
      byChannel,
      total,
      page,
      pageSize: PAGE_SIZE,
      items: items.map((item) => ({ ...item, _id: String(item._id) })),
    });
  } catch (error) {
    console.error('Announcement results failed:', error);
    return fail('Failed to load the delivery results', 500);
  }
}
