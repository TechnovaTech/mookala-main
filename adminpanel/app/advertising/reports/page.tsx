'use client'
import React from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Card, NoticeBar, Spinner, StatCard, formatDate, formatMoney } from '@/components/ui'
import { DateRangeBar, ReportTable, formatCount, formatPercent, rangeQuery, useReport } from '@/components/learning/ReportKit'
import { ADVERTISER_STATUS, CAMPAIGN_STATUS, PLACEMENT_LABEL, linkClass } from '@/components/advertising/shared'

interface StatusRow {
  status: string
  campaigns: number
}
interface DailyRow {
  date: string
  campaigns: number
  impressions: number
  clicks: number
  ctr: number | null
}
interface DailyCampaignRow {
  date: string
  campaignId: string
  campaign: string
  impressions: number
  clicks: number
  ctr: number | null
}
interface CampaignRow {
  campaignId: string
  campaign: string
  advertiserId: string
  advertiser: string
  placement: string
  status: string
  startDate: string | null
  endDate: string | null
  impressions: number
  clicks: number
  ctr: number | null
  lifetimeImpressions: number
  lifetimeClicks: number
  lifetimeCtr: number | null
}
interface PlacementRow {
  placement: string
  campaigns: number
  liveCampaigns: number
  impressions: number
  clicks: number
  ctr: number | null
  lifetimeImpressions: number
  lifetimeClicks: number
}
interface AdvertiserRow {
  advertiserId: string
  advertiser: string
  status: string
  campaigns: number
  liveCampaigns: number
  impressions: number
  clicks: number
  ctr: number | null
  lifetimeImpressions: number
  lifetimeClicks: number
  invoiced: number
  paid: number
  overdue: number
  refunded: number
}
interface MonthRow {
  month: string
  invoices: number
  amount: number
  gst: number
  total: number
  refundedInvoices: number
  refunded: number
  net: number
}
interface Bucket {
  count: number
  amount: number
}
interface CheckRow {
  label: string
  reported: number
  raw: number
  source: string
  money?: boolean
  match: boolean
}
interface Report {
  totals: {
    campaigns: number
    liveCampaigns: number
    impressions: number
    clicks: number
    ctr: number | null
    lifetimeImpressions: number
    lifetimeClicks: number
    lifetimeCtr: number | null
  }
  beforeDailyCounting: { impressions: number; clicks: number }
  billing: { invoiced: Bucket; paid: Bucket; overdue: Bucket; refunded: Bucket }
  byStatus: StatusRow[]
  daily: DailyRow[]
  dailyByCampaign: DailyCampaignRow[]
  campaigns: CampaignRow[]
  placements: PlacementRow[]
  advertisers: AdvertiserRow[]
  revenueByMonth: MonthRow[]
  revenueAllTime: { invoices: number; received: number; gst: number; refundedInvoices: number; refunded: number }
  ledger: {
    payments: number
    paymentEntries: number
    gst: number
    refunds: number
    otherPayments: number
    otherPaymentEntries: number
    notInLedger: { _id: string; invoiceNumber: string; amount: number; status: string }[]
  }
  checks: CheckRow[]
}

const API = '/api/admin/advertising/reports'

function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month
  return new Date(month + '-01T00:00:00Z').toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function dayLabel(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return new Date(date + 'T00:00:00Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function invoices(bucket: Bucket): string {
  return `${formatCount(bucket.count)} invoice${bucket.count === 1 ? '' : 's'}`
}

function statusBadge(status: string) {
  return <Badge tone={CAMPAIGN_STATUS[status]?.tone || 'gray'}>{CAMPAIGN_STATUS[status]?.label || status}</Badge>
}

export default function Page() {
  const report = useReport<Report>(API)
  const data = report.data
  const ranged = Boolean(report.range.from || report.range.to)
  const hasCampaigns = Boolean(data && data.totals.campaigns > 0)
  const noCampaigns = 'Campaigns are created by approving an application on the Applications screen, or added on the Campaigns screen.'
  const periodWord = ranged ? 'in the period' : 'on all daily rows'
  const failed = data ? data.checks.filter((row) => !row.match) : []

  return (
    <AdminShell title="Ads Reports" subtitle="Campaign performance by day, advertiser and placement, advertiser billing and advertising revenue">
      {report.error && <NoticeBar notice={{ type: 'error', text: report.error }} />}
      <DateRangeBar
        idPrefix="ads-report"
        draft={report.draft}
        onChange={report.setDraft}
        onApply={report.apply}
        onClear={report.clear}
        note='Performance: the range selects the daily impression and click rows (days are counted in UTC); with no range every day is included. Billing: an invoice is placed by its "Paid on" date, or by the date it was raised when it has none. Billing amounts include GST and are payments recorded by the team, not gateway payments.'
      />

      {report.loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-report="performance-totals">
            <StatCard
              label="Campaigns"
              value={formatCount(data.totals.campaigns)}
              hint={hasCampaigns ? `${formatCount(data.totals.liveCampaigns)} live` : undefined}
              tone="green"
            />
            <StatCard label={`Impressions ${periodWord}`} value={formatCount(data.totals.impressions)} hint={`${formatCount(data.totals.lifetimeImpressions)} lifetime`} />
            <StatCard label={`Clicks ${periodWord}`} value={formatCount(data.totals.clicks)} hint={`${formatCount(data.totals.lifetimeClicks)} lifetime`} />
            <StatCard label="Click-through rate" value={formatPercent(data.totals.ctr)} hint={`${formatPercent(data.totals.lifetimeCtr)} lifetime`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-report="billing-totals">
            <StatCard label="Invoiced, not yet paid" value={formatMoney(data.billing.invoiced.amount)} hint={invoices(data.billing.invoiced)} />
            <StatCard label="Paid" value={formatMoney(data.billing.paid.amount)} hint={invoices(data.billing.paid)} tone="green" />
            <StatCard label="Overdue" value={formatMoney(data.billing.overdue.amount)} hint={invoices(data.billing.overdue)} tone="red" />
            <StatCard label="Refunded" value={formatMoney(data.billing.refunded.amount)} hint={invoices(data.billing.refunded)} tone="purple" />
          </div>

          {(data.beforeDailyCounting.impressions > 0 || data.beforeDailyCounting.clicks > 0) && (
            <NoticeBar
              notice={{
                type: 'info',
                text: `${formatCount(data.beforeDailyCounting.impressions)} impressions and ${formatCount(data.beforeDailyCounting.clicks)} clicks were counted before daily counting began. They are in the lifetime figures but belong to no day, so they are not in any date range.`,
              }}
            />
          )}

          <ReportTable<DailyRow>
            title="Performance by day"
            description="Impressions and clicks reported by the user app, per UTC day."
            columns={[
              { key: 'date', label: 'Day', render: (row) => dayLabel(row.date) },
              { key: 'campaigns', label: 'Campaigns shown', align: 'right', render: (row) => formatCount(row.campaigns) },
              { key: 'impressions', label: 'Impressions', align: 'right', render: (row) => formatCount(row.impressions) },
              { key: 'clicks', label: 'Clicks', align: 'right', render: (row) => formatCount(row.clicks) },
              { key: 'ctr', label: 'Click-through rate', align: 'right', render: (row) => formatPercent(row.ctr) },
            ]}
            rows={data.daily}
            rowKey={(row) => row.date}
            emptyTitle={ranged ? 'No impressions or clicks were counted in this date range.' : 'No impressions or clicks have been counted yet.'}
            emptyHint="A row appears for each day on which the user app showed a live campaign. Only campaigns that are live, inside their dates and have a creative are shown in the app."
            exportHref={API + rangeQuery(report.range, { export: 'daily' })}
            exportLabel="Export CSV (by day and campaign)"
          />

          <ReportTable<CampaignRow>
            title="Performance by campaign"
            columns={[
              {
                key: 'campaign',
                label: 'Campaign',
                render: (row) => (
                  <Link href={`/advertising/campaigns?id=${row.campaignId}`} className={linkClass}>
                    {row.campaign || 'Unnamed campaign'}
                  </Link>
                ),
              },
              { key: 'advertiser', label: 'Advertiser' },
              { key: 'placement', label: 'Placement', render: (row) => PLACEMENT_LABEL[row.placement] || row.placement || '—' },
              { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
              { key: 'dates', label: 'Runs', render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
              { key: 'impressions', label: `Impressions ${periodWord}`, align: 'right', render: (row) => formatCount(row.impressions) },
              { key: 'clicks', label: `Clicks ${periodWord}`, align: 'right', render: (row) => formatCount(row.clicks) },
              { key: 'ctr', label: 'Click-through rate', align: 'right', render: (row) => formatPercent(row.ctr) },
              { key: 'lifetimeImpressions', label: 'Lifetime impressions', align: 'right', render: (row) => formatCount(row.lifetimeImpressions) },
              { key: 'lifetimeClicks', label: 'Lifetime clicks', align: 'right', render: (row) => formatCount(row.lifetimeClicks) },
            ]}
            rows={data.campaigns}
            rowKey={(row) => row.campaignId}
            emptyTitle="No campaigns yet."
            emptyHint={noCampaigns}
            exportHref={API + rangeQuery(report.range, { export: 'campaigns' })}
          />

          <ReportTable<PlacementRow>
            title="Performance by placement"
            columns={[
              { key: 'placement', label: 'Placement', render: (row) => PLACEMENT_LABEL[row.placement] || row.placement || '—' },
              { key: 'campaigns', label: 'Campaigns', align: 'right', render: (row) => formatCount(row.campaigns) },
              { key: 'liveCampaigns', label: 'Live', align: 'right', render: (row) => formatCount(row.liveCampaigns) },
              { key: 'impressions', label: `Impressions ${periodWord}`, align: 'right', render: (row) => formatCount(row.impressions) },
              { key: 'clicks', label: `Clicks ${periodWord}`, align: 'right', render: (row) => formatCount(row.clicks) },
              { key: 'ctr', label: 'Click-through rate', align: 'right', render: (row) => formatPercent(row.ctr) },
              { key: 'lifetimeImpressions', label: 'Lifetime impressions', align: 'right', render: (row) => formatCount(row.lifetimeImpressions) },
              { key: 'lifetimeClicks', label: 'Lifetime clicks', align: 'right', render: (row) => formatCount(row.lifetimeClicks) },
            ]}
            rows={data.placements}
            rowKey={(row) => row.placement}
            emptyTitle="No campaigns yet."
            emptyHint={noCampaigns}
            exportHref={API + rangeQuery(report.range, { export: 'placements' })}
          />

          <ReportTable<AdvertiserRow>
            title="Performance and billing by advertiser"
            description="Billing columns follow the date range above and include GST."
            columns={[
              {
                key: 'advertiser',
                label: 'Advertiser',
                render: (row) => (
                  <Link href={`/advertising/advertisers/${row.advertiserId}`} className={linkClass}>
                    {row.advertiser}
                  </Link>
                ),
              },
              {
                key: 'status',
                label: 'Account',
                render: (row) => <Badge tone={ADVERTISER_STATUS[row.status]?.tone || 'gray'}>{ADVERTISER_STATUS[row.status]?.label || row.status}</Badge>,
              },
              { key: 'campaigns', label: 'Campaigns', align: 'right', render: (row) => formatCount(row.campaigns) },
              { key: 'liveCampaigns', label: 'Live', align: 'right', render: (row) => formatCount(row.liveCampaigns) },
              { key: 'impressions', label: `Impressions ${periodWord}`, align: 'right', render: (row) => formatCount(row.impressions) },
              { key: 'clicks', label: `Clicks ${periodWord}`, align: 'right', render: (row) => formatCount(row.clicks) },
              { key: 'ctr', label: 'Click-through rate', align: 'right', render: (row) => formatPercent(row.ctr) },
              { key: 'invoiced', label: 'Invoiced, not yet paid', align: 'right', render: (row) => formatMoney(row.invoiced) },
              { key: 'overdue', label: 'Overdue', align: 'right', render: (row) => formatMoney(row.overdue) },
              { key: 'paid', label: 'Paid', align: 'right', render: (row) => formatMoney(row.paid) },
            ]}
            rows={data.advertisers}
            rowKey={(row) => row.advertiserId}
            emptyTitle="No advertisers yet."
            emptyHint="Advertisers are registered by the team on the Advertisers screen."
            exportHref={API + rangeQuery(report.range, { export: 'advertisers' })}
          />

          <ReportTable<StatusRow>
            title="Campaigns by status"
            columns={[
              { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
              { key: 'campaigns', label: 'Campaigns', align: 'right', render: (row) => formatCount(row.campaigns) },
            ]}
            rows={hasCampaigns ? data.byStatus : []}
            rowKey={(row) => row.status}
            emptyTitle="No campaigns yet."
            emptyHint={noCampaigns}
          />

          <ReportTable<MonthRow>
            title="Billing and revenue by month"
            description="Invoices that were paid, grouped by the month of their payment date. An invoice refunded later stays in its month and is shown in the refunded columns."
            columns={[
              { key: 'month', label: 'Month', render: (row) => monthLabel(row.month) },
              { key: 'invoices', label: 'Invoices paid', align: 'right', render: (row) => formatCount(row.invoices) },
              { key: 'amount', label: 'Received before GST', align: 'right', render: (row) => formatMoney(row.amount) },
              { key: 'gst', label: 'GST', align: 'right', render: (row) => formatMoney(row.gst) },
              { key: 'total', label: 'Total received', align: 'right', render: (row) => formatMoney(row.total) },
              { key: 'refunded', label: 'Refunded (before GST)', align: 'right', render: (row) => formatMoney(row.refunded) },
              { key: 'net', label: 'Net revenue before GST', align: 'right', render: (row) => formatMoney(row.net) },
            ]}
            rows={data.revenueByMonth}
            rowKey={(row) => row.month}
            emptyTitle="No paid invoices to report."
            emptyHint={ranged ? 'No invoice was paid in this date range.' : 'Revenue appears here once an invoice on the Ad Payments screen is marked "Paid".'}
            exportHref={API + rangeQuery(report.range, { export: 'revenue' })}
          />

          <Card className="mb-6" >
            <div className="px-5 py-4 border-b border-gray-200" data-report="ledger">
              <h2 className="text-base font-semibold text-deep-blue">Revenue against the finance ledger (all time)</h2>
              <p className="text-sm text-gray-500 mt-1">
                Marking an invoice Paid writes its amount and GST to the ledger, and Refunded writes the refund. The dashboard and Finance show
                advertisement revenue from the ledger, dated by the day the payment was recorded here, before GST.
              </p>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Invoices: received before GST</dt>
                <dd className="text-lg font-semibold text-deep-blue" data-figure="invoice-received">{formatMoney(data.revenueAllTime.received)}</dd>
                <dd className="text-xs text-gray-500">{formatCount(data.revenueAllTime.invoices)} invoices paid</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Ledger: advertising payments</dt>
                <dd className="text-lg font-semibold text-deep-blue" data-figure="ledger-payments">{formatMoney(data.ledger.payments)}</dd>
                <dd className="text-xs text-gray-500">{formatCount(data.ledger.paymentEntries)} entries (the dashboard figure)</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">GST: invoices / ledger</dt>
                <dd className="text-lg font-semibold text-deep-blue">
                  {formatMoney(data.revenueAllTime.gst)} / {formatMoney(data.ledger.gst)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Refunded: invoices / ledger</dt>
                <dd className="text-lg font-semibold text-deep-blue">
                  {formatMoney(data.revenueAllTime.refunded)} / {formatMoney(data.ledger.refunds)}
                </dd>
              </div>
            </dl>
            {data.ledger.otherPaymentEntries > 0 && (
              <p className="px-5 pb-3 text-sm text-amber-700">
                {formatCount(data.ledger.otherPaymentEntries)} advertising payment{data.ledger.otherPaymentEntries === 1 ? '' : 's'} in the ledger (
                {formatMoney(data.ledger.otherPayments)}) did not come from an advertiser invoice, so the ledger total is higher than the invoices by
                that amount.
              </p>
            )}
            {data.ledger.notInLedger.length > 0 && (
              <div className="px-5 pb-4 text-sm text-amber-700" data-report="not-in-ledger">
                <p>
                  {formatCount(data.ledger.notInLedger.length)} paid invoice{data.ledger.notInLedger.length === 1 ? ' is' : 's are'} not in the ledger
                  (marked paid before invoices wrote to it), so {data.ledger.notInLedger.length === 1 ? 'it is' : 'they are'} missing from the
                  dashboard and Finance:
                </p>
                <ul className="list-disc list-inside mt-1">
                  {data.ledger.notInLedger.map((row) => (
                    <li key={row._id}>
                      <Link href={`/advertising/payments?id=${row._id}`} className={linkClass}>
                        {row.invoiceNumber || row._id}
                      </Link>{' '}
                      · {formatMoney(row.amount)} · {row.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="mb-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Check: report figure against a second count</h2>
              <p className="text-sm text-gray-500 mt-1">
                Each figure above is counted again straight from the stored records. The two columns must be equal.{' '}
                {failed.length === 0 ? 'They all are.' : `${failed.length} ${failed.length === 1 ? 'is' : 'are'} not: see the rows marked below.`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-report="checks">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Figure</th>
                    <th className="px-4 py-3 font-medium text-right">In this report</th>
                    <th className="px-4 py-3 font-medium text-right">Second count</th>
                    <th className="px-4 py-3 font-medium">Counted from</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.checks.map((row) => (
                    <tr key={row.label} data-check={row.match ? 'ok' : 'differs'}>
                      <td className="px-4 py-2.5 text-gray-900">{row.label}</td>
                      <td className="px-4 py-2.5 text-right">{row.money ? formatMoney(row.reported) : formatCount(row.reported)}</td>
                      <td className="px-4 py-2.5 text-right">{row.money ? formatMoney(row.raw) : formatCount(row.raw)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{row.source}</td>
                      <td className="px-4 py-2.5">
                        {row.match ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <CheckCircle2 size={15} /> Equal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700">
                            <AlertTriangle size={15} /> Differs
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </AdminShell>
  )
}
