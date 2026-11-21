import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv } from '@/lib/http';
import { can } from '@/lib/permissions';
import { money, percent, rangeIsInvalid, readRange, round2, today } from '../../learning/_lib/report';
import { CHANNELS, ORDER_STATUSES as STATUSES, PROBLEM_STATUSES as PROBLEM } from '../_lib/orders';
import { ledgerPicture } from '../_lib/ledger';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  created: 'Created',
  paid: 'Paid',
  processing: 'Processing',
  delivered: 'Delivered',
  failed: 'Failed',
  delayed: 'Delayed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', in_app: 'In the app' };

interface Check {
  group: string;
  metric: string;
  /** The figure the report shows. */
  report: number | null;
  /** The same figure counted again with a separate database query. */
  independent: number | null;
  unit: 'count' | 'money' | 'percent';
  matches: boolean;
}

/**
 * Wishes report, counted from the `wishOrders` collection (template orders
 * and custom wishes together). The date range selects orders by the date they
 * were created.
 *
 * Revenue counts the "Amount" of orders that were marked paid at some point
 * (`paidAt` is set) and are not refunded or cancelled now.
 * Delivery success rate is delivered / (delivered + failed).
 *
 * Every figure is produced twice: once by walking the orders (the report) and
 * once by a separate count or sum query on the raw documents (`checks`).
 * Revenue is also compared with the ledger entries written for those orders.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'wishes:view');
  if (!check.ok) return check.response;
  if (rangeIsInvalid(request)) return fail('The date range is not valid.');

  try {
    const { db } = await connectToDatabase();
    const range = readRange(request);

    const [orders, templates, categories] = await Promise.all([
      db
        .collection('wishOrders')
        .find(range.condition ? { createdAt: range.condition } : {})
        .project({ notes: 0, message: 0, brief: 0 })
        .sort({ createdAt: -1 })
        .toArray(),
      db.collection('greetingTemplates').find({}).project({ title: 1, category: 1 }).toArray(),
      db.collection('greetingCategories').find({}).project({ name: 1 }).toArray(),
    ]);
    const ledger = await ledgerPicture(db, orders);

    const templateById = new Map(templates.map((t) => [String(t._id), t]));
    const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));

    const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const byChannel: Record<string, { orders: number; delivered: number; failed: number }> = Object.fromEntries(
      CHANNELS.map((c) => [c, { orders: 0, delivered: 0, failed: 0 }])
    );
    const perCategory = new Map<string, { category: string; orders: number; delivered: number; failed: number; revenue: number }>();
    const byKind = { template: 0, custom: 0 };
    let revenue = 0;
    let paidOrders = 0;
    const problems: any[] = [];

    for (const order of orders) {
      const status = String(order.status || '');
      if (status in byStatus) byStatus[status] += 1;
      if (order.kind === 'custom') byKind.custom += 1;
      else byKind.template += 1;

      const counted = Boolean(order.paidAt) && status !== 'refunded' && status !== 'cancelled';
      const amount = counted ? money(order.amount) : 0;
      if (counted) {
        revenue += amount;
        paidOrders += 1;
      }

      const channel = byChannel[String(order.deliveryChannel || '')];
      if (channel) {
        channel.orders += 1;
        if (status === 'delivered') channel.delivered += 1;
        if (status === 'failed') channel.failed += 1;
      }

      const template = order.kind === 'custom' ? null : templateById.get(String(order.template || ''));
      const category =
        order.kind === 'custom'
          ? 'Custom wishes'
          : template
          ? categoryName.get(String(template.category)) || 'No category'
          : 'Deleted template';
      const row = perCategory.get(category) || { category, orders: 0, delivered: 0, failed: 0, revenue: 0 };
      row.orders += 1;
      if (status === 'delivered') row.delivered += 1;
      if (status === 'failed') row.failed += 1;
      row.revenue += amount;
      perCategory.set(category, row);

      if (PROBLEM.includes(status)) {
        problems.push({
          id: String(order._id),
          kind: order.kind === 'custom' ? 'Custom wish' : 'Template order',
          status,
          customerName: order.customerName || '',
          recipientName: order.recipientName || '',
          item: order.kind === 'custom' ? order.artistName || order.requestedArtist || '' : template?.title || '',
          deliveryChannel: order.deliveryChannel || '',
          scheduledFor: order.scheduledFor || null,
          amount: money(order.amount),
          reason: order.statusReason || '',
          statusChangedAt: order.statusChangedAt || null,
          createdAt: order.createdAt || null,
        });
      }
    }

    const byCategory = Array.from(perCategory.values())
      .map((row) => ({ ...row, revenue: round2(row.revenue), successRate: percent(row.delivered, row.delivered + row.failed) }))
      .sort((a, b) => b.orders - a.orders || a.category.localeCompare(b.category));

    const channelRows = CHANNELS.map((key) => ({
      channel: key,
      ...byChannel[key],
      successRate: percent(byChannel[key].delivered, byChannel[key].delivered + byChannel[key].failed),
    }));

    const totalRevenue = round2(revenue);

    /* ---- The same figures, counted again straight from the documents ---- */
    const base: Record<string, any> = range.condition ? { createdAt: range.condition } : {};
    const wishOrders = db.collection('wishOrders');
    const count = (extra: Record<string, any>) => wishOrders.countDocuments({ ...base, ...extra });
    const paidNow = { paidAt: { $ne: null }, status: { $nin: ['refunded', 'cancelled'] } };
    const sumAmount = async (extra: Record<string, any>) => {
      const rows = await wishOrders
        .aggregate([
          { $match: { ...base, ...extra } },
          { $group: { _id: null, total: { $sum: { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } } } } },
        ])
        .toArray();
      return round2(rows[0]?.total || 0);
    };

    const checks: Check[] = [];
    const add = (group: string, metric: string, report: number | null, independent: number | null, unit: Check['unit'] = 'count') =>
      checks.push({
        group,
        metric,
        report,
        independent,
        unit,
        matches: report === null || independent === null ? report === independent : Math.abs(report - independent) < 0.005,
      });

    const templateFilter = { kind: { $ne: 'custom' } };
    const [allCount, templateCount, customCount, paidCount, revenueAgain] = await Promise.all([
      count({}),
      count(templateFilter),
      count({ kind: 'custom' }),
      count(paidNow),
      sumAmount(paidNow),
    ]);
    add('Totals', 'Orders', orders.length, allCount);
    add('Totals', 'Template orders', byKind.template, templateCount);
    add('Totals', 'Custom wishes', byKind.custom, customCount);

    const statusAgain: Record<string, number> = {};
    for (const status of STATUSES) {
      statusAgain[status] = await count({ status });
      add('Orders by status', STATUS_LABEL[status], byStatus[status], statusAgain[status]);
    }
    add(
      'Orders by status',
      'All statuses added up',
      STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
      STATUSES.reduce((sum, status) => sum + statusAgain[status], 0)
    );
    add(
      'Delivery',
      'Delivery success rate',
      percent(byStatus.delivered, byStatus.delivered + byStatus.failed),
      percent(statusAgain.delivered, statusAgain.delivered + statusAgain.failed),
      'percent'
    );

    for (const key of CHANNELS) {
      add('Orders by channel', `${CHANNEL_LABEL[key]}: orders`, byChannel[key].orders, await count({ deliveryChannel: key }));
      add('Orders by channel', `${CHANNEL_LABEL[key]}: delivered`, byChannel[key].delivered, await count({ deliveryChannel: key, status: 'delivered' }));
      add('Orders by channel', `${CHANNEL_LABEL[key]}: failed`, byChannel[key].failed, await count({ deliveryChannel: key, status: 'failed' }));
    }

    const allTemplateIds = templates.map((t) => String(t._id));
    const knownCategoryIds = new Set(categories.map((c) => String(c._id)));
    for (const row of byCategory) {
      let filter: Record<string, any>;
      if (row.category === 'Custom wishes') filter = { kind: 'custom' };
      else if (row.category === 'Deleted template') filter = { ...templateFilter, template: { $nin: allTemplateIds } };
      else if (row.category === 'No category') {
        filter = { ...templateFilter, template: { $in: templates.filter((t) => !knownCategoryIds.has(String(t.category))).map((t) => String(t._id)) } };
      } else {
        const ids = categories.filter((c) => c.name === row.category).map((c) => String(c._id));
        filter = { ...templateFilter, template: { $in: templates.filter((t) => ids.includes(String(t.category))).map((t) => String(t._id)) } };
      }
      add('Orders by category', `${row.category}: orders`, row.orders, await count(filter));
      add('Orders by category', `${row.category}: revenue`, row.revenue, await sumAmount({ ...filter, ...paidNow }), 'money');
    }

    add('Revenue', 'Paid orders counted in revenue', paidOrders, paidCount);
    add('Revenue', 'Revenue from paid orders', totalRevenue, revenueAgain, 'money');
    add('Revenue', 'Revenue against the finance ledger (payments less refunds)', totalRevenue, ledger.net, 'money');

    const exportKind = request.nextUrl.searchParams.get('export');
    if (exportKind) {
      let csv: string | null = null;
      if (exportKind === 'status') {
        csv = toCsv(STATUSES.map((status) => ({ status, orders: byStatus[status] })), [
          { key: 'status', label: 'Status' },
          { key: 'orders', label: 'Orders' },
        ]);
      } else if (exportKind === 'categories') {
        csv = toCsv(byCategory, [
          { key: 'category', label: 'Category' },
          { key: 'orders', label: 'Orders' },
          { key: 'delivered', label: 'Delivered' },
          { key: 'failed', label: 'Failed' },
          { key: 'successRate', label: 'Delivery success %' },
          { key: 'revenue', label: 'Revenue from paid orders' },
        ]);
      } else if (exportKind === 'channels') {
        csv = toCsv(channelRows, [
          { key: 'channel', label: 'Channel' },
          { key: 'orders', label: 'Orders' },
          { key: 'delivered', label: 'Delivered' },
          { key: 'failed', label: 'Failed' },
          { key: 'successRate', label: 'Delivery success %' },
        ]);
      } else if (exportKind === 'problems') {
        csv = toCsv(problems, [
          { key: 'status', label: 'Status' },
          { key: 'kind', label: 'Type' },
          { key: 'customerName', label: 'Customer' },
          { key: 'recipientName', label: 'Recipient' },
          { key: 'item', label: 'Template or artist' },
          { key: 'deliveryChannel', label: 'Channel' },
          { key: 'scheduledFor', label: 'Scheduled for' },
          { key: 'amount', label: 'Amount' },
          { key: 'reason', label: 'Reason' },
          { key: 'statusChangedAt', label: 'Status changed at' },
          { key: 'createdAt', label: 'Created' },
        ]);
      } else if (exportKind === 'check') {
        csv = toCsv(
          checks.map((row) => ({ ...row, matches: row.matches ? 'Yes' : 'NO' })),
          [
            { key: 'group', label: 'Section' },
            { key: 'metric', label: 'Figure' },
            { key: 'report', label: 'Report' },
            { key: 'independent', label: 'Counted again from the records' },
            { key: 'matches', label: 'Agree' },
          ]
        );
      }
      if (csv === null) return fail('Unknown export');
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'wishes',
        entityType: 'wishes-report',
        meta: { report: exportKind, from: range.from, to: range.to },
        request,
      });
      return csvResponse(csv, `wishes-${exportKind}-${today()}.csv`);
    }

    return ok({
      range: { from: range.from, to: range.to },
      totals: {
        orders: orders.length,
        templateOrders: byKind.template,
        customWishes: byKind.custom,
        delivered: byStatus.delivered,
        failed: byStatus.failed,
        delayed: byStatus.delayed,
        disputed: byStatus.disputed,
        successRate: percent(byStatus.delivered, byStatus.delivered + byStatus.failed),
        paidOrders,
        revenue: totalRevenue,
      },
      checks,
      allChecksAgree: checks.every((row) => row.matches),
      // Commission, GST, gateway fees and what is owed to artists are finance
      // figures: they are left out for an admin who may not view Finance.
      ledger: can(check.admin, 'finance:view')
        ? ledger
        : { ...ledger, commission: null, gst: null, gatewayFee: null, owedToArtistsGross: null },
      canSeeFinance: can(check.admin, 'finance:view'),
      canManage: can(check.admin, 'wishes:manage'),
      byStatus: STATUSES.map((status) => ({ status, orders: byStatus[status] })),
      byCategory,
      byChannel: channelRows,
      problems,
    });
  } catch (error) {
    console.error('Wishes report failed:', error);
    return fail('Failed to build the wishes report', 500);
  }
}
