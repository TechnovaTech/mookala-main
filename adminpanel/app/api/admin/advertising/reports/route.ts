import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv } from '@/lib/http';
import { money, percent, rangeIsInvalid, readRange, round2, today } from '../../learning/_lib/report';
import { dayKey, effectiveStatus, syncCampaignStatuses, syncInvoiceStatuses } from '../_lib/campaigns';

export const dynamic = 'force-dynamic';

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'live', 'paused', 'completed', 'rejected'];
const INVOICE_STATUSES = ['invoiced', 'paid', 'overdue', 'refunded'] as const;

interface Check {
  label: string;
  /** The figure shown in the report above. */
  reported: number;
  /** The same figure counted again, directly from the stored documents. */
  raw: number;
  source: string;
  money?: boolean;
}

/**
 * Advertising report from `adCampaigns`, `adCampaignStats`, `advertisers`,
 * `adPayments` and the finance ledger.
 *
 * Performance: every counted impression and click moves the campaign's
 * lifetime counter and that day's row in `adCampaignStats` (UTC days). The
 * date range selects daily rows; with no range every daily row is used.
 * Events counted before daily counting existed are only in the lifetime
 * counters and are reported as such.
 *
 * Billing: an invoice is placed by its "Paid on" date when it has one,
 * otherwise by the date it was raised. Billing amounts include GST. Revenue
 * by month counts invoices that were paid (including ones refunded later,
 * shown in their own column).
 *
 * Every headline figure is also counted a second time straight from the
 * database (`checks`), so the two can be compared on the screen.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'ads:view');
  if (!check.ok) return check.response;
  if (rangeIsInvalid(request)) return fail('The date range is not valid.');

  try {
    const { db } = await connectToDatabase();
    const range = readRange(request);

    const context = { admin: null, request, trigger: 'ads report opened' };
    await syncCampaignStatuses(db, context);
    await syncInvoiceStatuses(db, context);

    const statsFilter: Record<string, any> = {};
    if (range.from || range.to) {
      statsFilter.date = {};
      if (range.from) statsFilter.date.$gte = dayKey(range.from);
      if (range.to) statsFilter.date.$lte = dayKey(range.to);
    }

    const [campaigns, advertisers, allPayments, stats] = await Promise.all([
      db
        .collection('adCampaigns')
        .find({})
        .project({ name: 1, advertiser: 1, placement: 1, status: 1, startDate: 1, endDate: 1, impressions: 1, clicks: 1, targetLocations: 1 })
        .toArray(),
      db.collection('advertisers').find({}).project({ businessName: 1, status: 1 }).toArray(),
      db.collection('adPayments').find({}).project({ invoiceNumber: 1, advertiser: 1, amount: 1, gstAmount: 1, paidOn: 1, status: 1, createdAt: 1 }).toArray(),
      db.collection('adCampaignStats').find(statsFilter).sort({ date: 1 }).toArray(),
    ]);

    const now = new Date();
    const advertiserName = new Map(advertisers.map((a) => [String(a._id), a.businessName]));

    /* --------------------------- performance --------------------------- */

    const periodOf = new Map<string, { impressions: number; clicks: number }>();
    const perDay = new Map<string, { date: string; impressions: number; clicks: number; campaigns: Set<string> }>();
    for (const row of stats) {
      const impressions = Number(row.impressions) || 0;
      const clicks = Number(row.clicks) || 0;
      const own = periodOf.get(String(row.campaignId)) || { impressions: 0, clicks: 0 };
      own.impressions += impressions;
      own.clicks += clicks;
      periodOf.set(String(row.campaignId), own);

      const dayRow = perDay.get(row.date) || { date: String(row.date), impressions: 0, clicks: 0, campaigns: new Set<string>() };
      dayRow.impressions += impressions;
      dayRow.clicks += clicks;
      dayRow.campaigns.add(String(row.campaignId));
      perDay.set(row.date, dayRow);
    }

    const campaignName = new Map(campaigns.map((c) => [String(c._id), c.name || '']));
    const dailyRows = Array.from(perDay.values())
      .map((row) => ({ date: row.date, campaigns: row.campaigns.size, impressions: row.impressions, clicks: row.clicks, ctr: percent(row.clicks, row.impressions) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dailyByCampaign = stats
      .map((row) => ({
        date: String(row.date),
        campaignId: String(row.campaignId),
        campaign: campaignName.get(String(row.campaignId)) || 'Deleted campaign',
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        ctr: percent(Number(row.clicks) || 0, Number(row.impressions) || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign));

    const campaignRows = campaigns
      .map((c) => {
        const period = periodOf.get(String(c._id)) || { impressions: 0, clicks: 0 };
        const lifetimeImpressions = Number(c.impressions) || 0;
        const lifetimeClicks = Number(c.clicks) || 0;
        return {
          campaignId: String(c._id),
          campaign: c.name || '',
          advertiserId: String(c.advertiser || ''),
          advertiser: advertiserName.get(String(c.advertiser)) || 'Deleted advertiser',
          placement: c.placement || '',
          status: effectiveStatus(c, now),
          startDate: c.startDate || null,
          endDate: c.endDate || null,
          targetLocations: Array.isArray(c.targetLocations) ? c.targetLocations.join('; ') : '',
          impressions: period.impressions,
          clicks: period.clicks,
          ctr: percent(period.clicks, period.impressions),
          lifetimeImpressions,
          lifetimeClicks,
          lifetimeCtr: percent(lifetimeClicks, lifetimeImpressions),
        };
      })
      .sort((a, b) => b.impressions - a.impressions || b.lifetimeImpressions - a.lifetimeImpressions || a.campaign.localeCompare(b.campaign));

    const byStatus = CAMPAIGN_STATUSES.map((status) => ({ status, campaigns: campaignRows.filter((c) => c.status === status).length }));

    const perPlacement = new Map<string, { placement: string; campaigns: number; liveCampaigns: number; impressions: number; clicks: number; lifetimeImpressions: number; lifetimeClicks: number }>();
    for (const row of campaignRows) {
      const entry = perPlacement.get(row.placement) || { placement: row.placement, campaigns: 0, liveCampaigns: 0, impressions: 0, clicks: 0, lifetimeImpressions: 0, lifetimeClicks: 0 };
      entry.campaigns += 1;
      if (row.status === 'live') entry.liveCampaigns += 1;
      entry.impressions += row.impressions;
      entry.clicks += row.clicks;
      entry.lifetimeImpressions += row.lifetimeImpressions;
      entry.lifetimeClicks += row.lifetimeClicks;
      perPlacement.set(row.placement, entry);
    }
    const placementRows = Array.from(perPlacement.values())
      .map((row) => ({ ...row, ctr: percent(row.clicks, row.impressions), lifetimeCtr: percent(row.lifetimeClicks, row.lifetimeImpressions) }))
      .sort((a, b) => b.impressions - a.impressions || a.placement.localeCompare(b.placement));

    /* ----------------------------- billing ----------------------------- */

    const dateOf = (payment: any): Date | null => {
      const value = payment.paidOn || payment.createdAt;
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    const payments = allPayments.filter((payment) => {
      if (!range.from && !range.to) return true;
      const date = dateOf(payment);
      if (!date) return false;
      if (range.from && date < range.from) return false;
      if (range.to && date > range.to) return false;
      return true;
    });

    const perAdvertiser = new Map(
      advertisers.map((a) => [
        String(a._id),
        {
          advertiserId: String(a._id),
          advertiser: a.businessName as string,
          status: a.status as string,
          campaigns: 0,
          liveCampaigns: 0,
          impressions: 0,
          clicks: 0,
          lifetimeImpressions: 0,
          lifetimeClicks: 0,
          invoiced: 0,
          paid: 0,
          overdue: 0,
          refunded: 0,
        },
      ])
    );
    for (const c of campaignRows) {
      const row = perAdvertiser.get(c.advertiserId);
      if (!row) continue;
      row.campaigns += 1;
      if (c.status === 'live') row.liveCampaigns += 1;
      row.impressions += c.impressions;
      row.clicks += c.clicks;
      row.lifetimeImpressions += c.lifetimeImpressions;
      row.lifetimeClicks += c.lifetimeClicks;
    }

    const billing = {
      invoiced: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
      refunded: { count: 0, amount: 0 },
    };
    const perMonth = new Map<string, { month: string; invoices: number; amount: number; gst: number; total: number; refundedInvoices: number; refunded: number }>();

    for (const payment of payments) {
      const total = money(payment.amount) + money(payment.gstAmount);
      const bucket = billing[payment.status as keyof typeof billing];
      if (bucket) {
        bucket.count += 1;
        bucket.amount += total;
      }
      const row = perAdvertiser.get(String(payment.advertiser));
      if (row && bucket) row[payment.status as (typeof INVOICE_STATUSES)[number]] += total;

      if (payment.status === 'paid' || payment.status === 'refunded') {
        const date = dateOf(payment);
        const month = date ? date.toISOString().slice(0, 7) : 'No date';
        const entry = perMonth.get(month) || { month, invoices: 0, amount: 0, gst: 0, total: 0, refundedInvoices: 0, refunded: 0 };
        entry.invoices += 1;
        entry.amount += money(payment.amount);
        entry.gst += money(payment.gstAmount);
        entry.total += total;
        if (payment.status === 'refunded') {
          entry.refundedInvoices += 1;
          entry.refunded += money(payment.amount);
        }
        perMonth.set(month, entry);
      }
    }

    const advertiserRows = Array.from(perAdvertiser.values())
      .map((row) => ({
        ...row,
        ctr: percent(row.clicks, row.impressions),
        invoiced: round2(row.invoiced),
        paid: round2(row.paid),
        overdue: round2(row.overdue),
        refunded: round2(row.refunded),
      }))
      .sort((a, b) => b.impressions - a.impressions || b.paid - a.paid || a.advertiser.localeCompare(b.advertiser));

    const revenueByMonth = Array.from(perMonth.values())
      .map((row) => ({
        ...row,
        amount: round2(row.amount),
        gst: round2(row.gst),
        total: round2(row.total),
        refunded: round2(row.refunded),
        net: round2(row.amount - row.refunded),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    /* ----------------------------- exports ----------------------------- */

    const exportKind = request.nextUrl.searchParams.get('export');
    if (exportKind) {
      let csv: string | null = null;
      if (exportKind === 'campaigns') {
        csv = toCsv(campaignRows, [
          { key: 'campaign', label: 'Campaign' },
          { key: 'advertiser', label: 'Advertiser' },
          { key: 'placement', label: 'Placement' },
          { key: 'status', label: 'Status' },
          { key: 'startDate', label: 'Start date' },
          { key: 'endDate', label: 'End date' },
          { key: 'targetLocations', label: 'Target locations' },
          { key: 'impressions', label: 'Impressions in period' },
          { key: 'clicks', label: 'Clicks in period' },
          { key: 'ctr', label: 'Click-through rate in period %' },
          { key: 'lifetimeImpressions', label: 'Lifetime impressions' },
          { key: 'lifetimeClicks', label: 'Lifetime clicks' },
          { key: 'lifetimeCtr', label: 'Lifetime click-through rate %' },
        ]);
      } else if (exportKind === 'daily') {
        csv = toCsv(dailyByCampaign, [
          { key: 'date', label: 'Date (UTC)' },
          { key: 'campaign', label: 'Campaign' },
          { key: 'impressions', label: 'Impressions' },
          { key: 'clicks', label: 'Clicks' },
          { key: 'ctr', label: 'Click-through rate %' },
        ]);
      } else if (exportKind === 'placements') {
        csv = toCsv(placementRows, [
          { key: 'placement', label: 'Placement' },
          { key: 'campaigns', label: 'Campaigns' },
          { key: 'liveCampaigns', label: 'Live campaigns' },
          { key: 'impressions', label: 'Impressions in period' },
          { key: 'clicks', label: 'Clicks in period' },
          { key: 'ctr', label: 'Click-through rate in period %' },
          { key: 'lifetimeImpressions', label: 'Lifetime impressions' },
          { key: 'lifetimeClicks', label: 'Lifetime clicks' },
        ]);
      } else if (exportKind === 'advertisers') {
        csv = toCsv(advertiserRows, [
          { key: 'advertiser', label: 'Advertiser' },
          { key: 'status', label: 'Status' },
          { key: 'campaigns', label: 'Campaigns' },
          { key: 'liveCampaigns', label: 'Live campaigns' },
          { key: 'impressions', label: 'Impressions in period' },
          { key: 'clicks', label: 'Clicks in period' },
          { key: 'ctr', label: 'Click-through rate in period %' },
          { key: 'lifetimeImpressions', label: 'Lifetime impressions' },
          { key: 'lifetimeClicks', label: 'Lifetime clicks' },
          { key: 'invoiced', label: 'Invoiced, not yet paid (incl. GST)' },
          { key: 'overdue', label: 'Overdue (incl. GST)' },
          { key: 'paid', label: 'Paid (incl. GST)' },
          { key: 'refunded', label: 'Refunded invoices (incl. GST)' },
        ]);
      } else if (exportKind === 'revenue') {
        csv = toCsv(revenueByMonth, [
          { key: 'month', label: 'Month' },
          { key: 'invoices', label: 'Invoices paid' },
          { key: 'amount', label: 'Received before GST' },
          { key: 'gst', label: 'GST' },
          { key: 'total', label: 'Total received' },
          { key: 'refundedInvoices', label: 'Of which refunded later (invoices)' },
          { key: 'refunded', label: 'Refunded (before GST)' },
          { key: 'net', label: 'Net revenue before GST' },
        ]);
      }
      if (csv === null) return fail('Unknown export');
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'ads',
        entityType: 'ads-report',
        meta: { report: exportKind, from: range.from, to: range.to },
        request,
      });
      return csvResponse(csv, `ads-${exportKind}-${today()}.csv`);
    }

    /* ------------------- second count, from the database ------------------- */

    const paidDate = { $ifNull: ['$paidOn', '$createdAt'] };
    const paymentMatch: Record<string, any>[] = [];
    if (range.from) paymentMatch.push({ $expr: { $gte: [paidDate, range.from] } });
    if (range.to) paymentMatch.push({ $expr: { $lte: [paidDate, range.to] } });

    const [rawCampaignCount, rawLive, rawLifetime, rawPeriod, rawAllDaily, rawBilling, rawInvoiceMoney, rawLedger] = await Promise.all([
      db.collection('adCampaigns').countDocuments({}),
      db.collection('adCampaigns').countDocuments({ status: 'live' }),
      db
        .collection('adCampaigns')
        .aggregate([{ $group: { _id: null, impressions: { $sum: { $ifNull: ['$impressions', 0] } }, clicks: { $sum: { $ifNull: ['$clicks', 0] } } } }])
        .toArray(),
      db
        .collection('adCampaignStats')
        .aggregate([{ $match: statsFilter }, { $group: { _id: null, impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } }])
        .toArray(),
      db
        .collection('adCampaignStats')
        .aggregate([{ $group: { _id: null, impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } }])
        .toArray(),
      db
        .collection('adPayments')
        .aggregate([
          ...(paymentMatch.length ? [{ $match: { $and: paymentMatch } }] : []),
          { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $add: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$gstAmount', 0] }] } } } },
        ])
        .toArray(),
      // All time: what invoices say was received and refunded.
      db
        .collection('adPayments')
        .aggregate([
          { $match: { status: { $in: ['paid', 'refunded'] } } },
          { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$amount', 0] } }, gst: { $sum: { $ifNull: ['$gstAmount', 0] } } } },
        ])
        .toArray(),
      // All time: what the finance ledger holds for the advertising service.
      db
        .collection('transactions')
        .aggregate([
          { $match: { service: 'advertising', status: 'success', type: { $in: ['payment', 'gst', 'refund'] } } },
          {
            $group: {
              _id: { type: '$type', fromInvoice: { $regexMatch: { input: { $ifNull: ['$meta.recordKey', ''] }, regex: '^ad-payment:' } } },
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
            },
          },
        ])
        .toArray(),
    ]);

    const totals = {
      campaigns: campaignRows.length,
      liveCampaigns: campaignRows.filter((c) => c.status === 'live').length,
      impressions: campaignRows.reduce((sum, row) => sum + row.impressions, 0) + orphanTotal(stats, campaignName, 'impressions'),
      clicks: campaignRows.reduce((sum, row) => sum + row.clicks, 0) + orphanTotal(stats, campaignName, 'clicks'),
      lifetimeImpressions: campaignRows.reduce((sum, row) => sum + row.lifetimeImpressions, 0),
      lifetimeClicks: campaignRows.reduce((sum, row) => sum + row.lifetimeClicks, 0),
    };

    const rawStatus = (status: string) => rawBilling.find((row) => row._id === status) || { count: 0, amount: 0 };
    const invoiceMoney = (status: string, key: 'amount' | 'gst' | 'count') => Number(rawInvoiceMoney.find((row) => row._id === status)?.[key]) || 0;
    const ledger = (type: string, fromInvoice: boolean | null, key: 'amount' | 'count' = 'amount') =>
      rawLedger.filter((row) => row._id.type === type && (fromInvoice === null || row._id.fromInvoice === fromInvoice)).reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

    // All-time figures from invoices, counted in code from the invoice list.
    const everPaid = allPayments.filter((p) => p.status === 'paid' || p.status === 'refunded');
    const revenueAllTime = {
      invoices: everPaid.length,
      received: round2(everPaid.reduce((sum, p) => sum + money(p.amount), 0)),
      gst: round2(everPaid.reduce((sum, p) => sum + money(p.gstAmount), 0)),
      refundedInvoices: everPaid.filter((p) => p.status === 'refunded').length,
      refunded: round2(everPaid.filter((p) => p.status === 'refunded').reduce((sum, p) => sum + money(p.amount), 0)),
    };

    // Paid invoices that never reached the ledger (recorded before invoices wrote to it).
    const ledgerKeys = new Set(
      (
        await db
          .collection('transactions')
          .find({ service: 'advertising', type: 'payment', 'meta.recordKey': { $regex: '^ad-payment:' } })
          .project({ 'meta.recordKey': 1 })
          .toArray()
      ).map((row) => String(row.meta?.recordKey))
    );
    const notInLedger = everPaid
      .filter((p) => !ledgerKeys.has(`ad-payment:${p._id}`))
      .map((p) => ({ _id: String(p._id), invoiceNumber: p.invoiceNumber || '', amount: money(p.amount), status: p.status }));

    const periodLabel = range.from || range.to ? 'in the period' : 'on all daily rows';
    const checks: Check[] = [
      { label: 'Campaigns', reported: totals.campaigns, raw: rawCampaignCount, source: 'count of adCampaigns' },
      { label: 'Live campaigns', reported: totals.liveCampaigns, raw: rawLive, source: 'count of adCampaigns with status "live"' },
      { label: `Impressions ${periodLabel}`, reported: totals.impressions, raw: Number(rawPeriod[0]?.impressions) || 0, source: 'sum of adCampaignStats.impressions' },
      { label: `Clicks ${periodLabel}`, reported: totals.clicks, raw: Number(rawPeriod[0]?.clicks) || 0, source: 'sum of adCampaignStats.clicks' },
      { label: 'Lifetime impressions', reported: totals.lifetimeImpressions, raw: Number(rawLifetime[0]?.impressions) || 0, source: 'sum of adCampaigns.impressions' },
      { label: 'Lifetime clicks', reported: totals.lifetimeClicks, raw: Number(rawLifetime[0]?.clicks) || 0, source: 'sum of adCampaigns.clicks' },
      ...INVOICE_STATUSES.flatMap((status) => [
        { label: `Invoices ${status} (count)`, reported: billing[status].count, raw: rawStatus(status).count, source: `count of adPayments with status "${status}"` },
        { label: `Invoices ${status} (incl. GST)`, reported: round2(billing[status].amount), raw: round2(rawStatus(status).amount), source: 'sum of adPayments amount + gstAmount', money: true },
      ]),
      {
        label: 'Received before GST, all time',
        reported: revenueAllTime.received,
        raw: round2(invoiceMoney('paid', 'amount') + invoiceMoney('refunded', 'amount')),
        source: 'sum of adPayments.amount with status "paid" or "refunded"',
        money: true,
      },
      {
        label: 'GST collected, all time',
        reported: revenueAllTime.gst,
        raw: round2(invoiceMoney('paid', 'gst') + invoiceMoney('refunded', 'gst')),
        source: 'sum of adPayments.gstAmount with status "paid" or "refunded"',
        money: true,
      },
      { label: 'Refunded before GST, all time', reported: revenueAllTime.refunded, raw: round2(invoiceMoney('refunded', 'amount')), source: 'sum of adPayments.amount with status "refunded"', money: true },
      {
        label: 'Ledger payments written from invoices',
        reported: round2(revenueAllTime.received - notInLedger.reduce((sum, row) => sum + row.amount, 0)),
        raw: round2(ledger('payment', true)),
        source: 'finance ledger: advertising payments with an invoice key (invoices paid, less those listed as not in the ledger)',
        money: true,
      },
      {
        label: 'Invoices ever paid, all time',
        reported: revenueAllTime.invoices,
        raw: invoiceMoney('paid', 'count') + invoiceMoney('refunded', 'count'),
        source: 'count of adPayments with status "paid" or "refunded"',
      },
    ];

    return ok({
      range: { from: range.from, to: range.to },
      totals: { ...totals, ctr: percent(totals.clicks, totals.impressions), lifetimeCtr: percent(totals.lifetimeClicks, totals.lifetimeImpressions) },
      // Events counted before the daily rows existed are only in the lifetime counters.
      beforeDailyCounting: {
        impressions: Math.max(0, totals.lifetimeImpressions - (Number(rawAllDaily[0]?.impressions) || 0)),
        clicks: Math.max(0, totals.lifetimeClicks - (Number(rawAllDaily[0]?.clicks) || 0)),
      },
      billing: {
        invoiced: { count: billing.invoiced.count, amount: round2(billing.invoiced.amount) },
        paid: { count: billing.paid.count, amount: round2(billing.paid.amount) },
        overdue: { count: billing.overdue.count, amount: round2(billing.overdue.amount) },
        refunded: { count: billing.refunded.count, amount: round2(billing.refunded.amount) },
      },
      byStatus,
      daily: dailyRows,
      dailyByCampaign,
      campaigns: campaignRows,
      placements: placementRows,
      advertisers: advertiserRows,
      revenueByMonth,
      revenueAllTime,
      ledger: {
        // What the dashboard and Finance show as advertisement revenue: every advertising payment in the ledger.
        payments: round2(ledger('payment', null)),
        paymentEntries: ledger('payment', null, 'count'),
        gst: round2(ledger('gst', null)),
        refunds: round2(ledger('refund', null)),
        // Advertising ledger entries that did not come from an advertiser invoice.
        otherPayments: round2(ledger('payment', false)),
        otherPaymentEntries: ledger('payment', false, 'count'),
        fromInvoices: round2(ledger('payment', true)),
        notInLedger,
        notInLedgerAmount: round2(notInLedger.reduce((sum, row) => sum + row.amount, 0)),
      },
      checks: checks.map((row) => ({ ...row, match: Math.abs(row.reported - row.raw) < 0.005 })),
    });
  } catch (error) {
    console.error('Ads report failed:', error);
    return fail('Failed to build the advertising report', 500);
  }
}

/** Daily rows whose campaign has since been deleted still count towards the period totals. */
function orphanTotal(stats: any[], known: Map<string, string>, field: 'impressions' | 'clicks'): number {
  return stats.filter((row) => !known.has(String(row.campaignId))).reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}
