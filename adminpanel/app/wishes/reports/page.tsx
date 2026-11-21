'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import { DateRangeBar, ReportTable, formatCount, formatPercent, rangeQuery, useReport } from '@/components/learning/ReportKit'
import { APPS_NOT_WIRED, CHANNEL, ORDER_STATUS as STATUS, StatusBadge } from '@/components/wishes/shared'

interface StatusRow {
  status: string
  orders: number
}
interface CategoryRow {
  category: string
  orders: number
  delivered: number
  failed: number
  revenue: number
  successRate: number | null
}
interface ChannelRow {
  channel: string
  orders: number
  delivered: number
  failed: number
  successRate: number | null
}
interface ProblemRow {
  id: string
  kind: string
  status: string
  customerName: string
  recipientName: string
  item: string
  deliveryChannel: string
  scheduledFor: string | null
  amount: number
  reason: string
  statusChangedAt: string | null
}
interface CheckRow {
  group: string
  metric: string
  report: number | null
  independent: number | null
  unit: 'count' | 'money' | 'percent'
  matches: boolean
}
interface LedgerGap {
  id: string
  kind: 'template' | 'custom'
  status: string
  customerName: string
  recipientName: string
  amount: number
  missing: 'payment' | 'refund'
  blocked: string | null
}
interface Ledger {
  payments: number
  refunds: number
  /** The four finance figures are null for an admin who may not view Finance. */
  commission: number | null
  gst: number | null
  gatewayFee: number | null
  net: number
  owedToArtistsGross: number | null
  entries: number
  gaps: LedgerGap[]
}
interface Report {
  checks: CheckRow[]
  allChecksAgree: boolean
  ledger: Ledger
  canManage: boolean
  totals: {
    orders: number
    templateOrders: number
    customWishes: number
    delivered: number
    failed: number
    delayed: number
    disputed: number
    successRate: number | null
    paidOrders: number
    revenue: number
  }
  byStatus: StatusRow[]
  byCategory: CategoryRow[]
  byChannel: ChannelRow[]
  problems: ProblemRow[]
}

const API = '/api/admin/wishes/reports'

function figure(row: CheckRow, value: number | null) {
  if (value === null) return '—'
  if (row.unit === 'money') return formatMoney(value)
  if (row.unit === 'percent') return formatPercent(value)
  return formatCount(value)
}

export default function Page() {
  const report = useReport<Report>(API)
  const data = report.data
  const ranged = Boolean(report.range.from || report.range.to)
  const emptyHint = ranged
    ? 'No order was created in this date range. Widen the range or choose "All dates".'
    : 'The mobile apps cannot place wish orders yet. Numbers appear here once the team adds orders on the Orders & Delivery or Custom Wishes screens.'
  const hasOrders = Boolean(data && data.totals.orders > 0)
  const [notice, setNotice] = useState<Notice>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const fixable = data ? data.ledger.gaps.filter((gap) => !gap.blocked).length : 0

  const sync = async (reason: string) => {
    setSyncing(true)
    try {
      const result = await api<{ payments: number; refunds: number; skipped: { id: string; why: string }[] }>('/api/admin/wishes/ledger-sync', {
        method: 'POST',
        body: { reason },
      })
      setNotice({
        type: 'success',
        text: `Recorded ${result.payments} payment${result.payments === 1 ? '' : 's'} and ${result.refunds} refund${
          result.refunds === 1 ? '' : 's'
        } in the ledger.${result.skipped.length ? ` ${result.skipped.length} could not be recorded and are still listed below.` : ''}`,
      })
      setSyncOpen(false)
      await report.reload()
    } catch (problem: any) {
      setNotice({ type: 'error', text: problem.message || 'Could not record the missing entries.' })
      setSyncOpen(false)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AdminShell title="Wishes Reports" subtitle="Orders, delivery results and revenue for wishes and greetings">
      {report.error && <NoticeBar notice={{ type: 'error', text: report.error }} />}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar notice={{ type: 'info', text: APPS_NOT_WIRED }} />
      <DateRangeBar
        idPrefix="wishes-report"
        draft={report.draft}
        onChange={report.setDraft}
        onApply={report.apply}
        onClear={report.clear}
        note='The range selects orders by the date they were created, template orders and custom wishes together. Delivery success rate is delivered ÷ (delivered + failed). Revenue counts the amount of orders that were marked "Paid" at some point and are not refunded or cancelled now; payments are confirmed by the team, written to the finance ledger as recorded by an admin, and are not connected to the payment gateway.'
      />

      {report.loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <StatCard
              label="Orders"
              value={formatCount(data.totals.orders)}
              hint={hasOrders ? `${formatCount(data.totals.templateOrders)} template, ${formatCount(data.totals.customWishes)} custom` : undefined}
            />
            <StatCard label="Delivered" value={formatCount(data.totals.delivered)} />
            <StatCard label="Delivery success" value={formatPercent(data.totals.successRate)} />
            <StatCard label="Failed" value={formatCount(data.totals.failed)} />
            <StatCard label="Delayed or disputed" value={formatCount(data.totals.delayed + data.totals.disputed)} />
            <StatCard
              label="Revenue from paid orders"
              value={formatMoney(data.totals.revenue)}
              hint={hasOrders ? `${formatCount(data.totals.paidOrders)} paid order${data.totals.paidOrders === 1 ? '' : 's'}` : undefined}
              tone="green"
            />
          </div>

          <ReportTable<StatusRow>
            title="Orders by status"
            columns={[
              { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'orders', label: 'Orders', align: 'right', render: (row) => formatCount(row.orders) },
            ]}
            rows={hasOrders ? data.byStatus : []}
            rowKey={(row) => row.status}
            emptyTitle="No orders to report."
            emptyHint={emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'status' })}
          />

          <ReportTable<CategoryRow>
            title="Orders by category"
            description="Template orders are grouped by their template's category. Custom wishes are shown as one group."
            columns={[
              { key: 'category', label: 'Category' },
              { key: 'orders', label: 'Orders', align: 'right', render: (row) => formatCount(row.orders) },
              { key: 'delivered', label: 'Delivered', align: 'right', render: (row) => formatCount(row.delivered) },
              { key: 'failed', label: 'Failed', align: 'right', render: (row) => formatCount(row.failed) },
              { key: 'successRate', label: 'Delivery success', align: 'right', render: (row) => formatPercent(row.successRate) },
              { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => formatMoney(row.revenue) },
            ]}
            rows={data.byCategory}
            rowKey={(row) => row.category}
            emptyTitle="No orders to report."
            emptyHint={emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'categories' })}
          />

          <ReportTable<ChannelRow>
            title="Orders by delivery channel"
            columns={[
              { key: 'channel', label: 'Channel', render: (row) => CHANNEL[row.channel] || row.channel },
              { key: 'orders', label: 'Orders', align: 'right', render: (row) => formatCount(row.orders) },
              { key: 'delivered', label: 'Delivered', align: 'right', render: (row) => formatCount(row.delivered) },
              { key: 'failed', label: 'Failed', align: 'right', render: (row) => formatCount(row.failed) },
              { key: 'successRate', label: 'Delivery success', align: 'right', render: (row) => formatPercent(row.successRate) },
            ]}
            rows={hasOrders ? data.byChannel : []}
            rowKey={(row) => row.channel}
            emptyTitle="No orders to report."
            emptyHint={emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'channels' })}
          />

          <ReportTable<ProblemRow>
            title="Failed, delayed and disputed orders"
            description="Open an order to see its timeline, notes and full history. The Delivery monitor lists the same orders across all dates, with their age and the retry and resolve actions."
            columns={[
              { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              {
                key: 'kind',
                label: 'Type',
                render: (row) => (
                  <Link href={`${row.kind === 'Custom wish' ? '/wishes/custom' : '/wishes/orders'}?id=${row.id}`} className="text-teal underline">
                    {row.kind}
                  </Link>
                ),
              },
              { key: 'customerName', label: 'Customer' },
              { key: 'recipientName', label: 'Recipient' },
              { key: 'item', label: 'Template or artist', render: (row) => row.item || '—' },
              { key: 'deliveryChannel', label: 'Channel', render: (row) => CHANNEL[row.deliveryChannel] || row.deliveryChannel || '—' },
              { key: 'scheduledFor', label: 'Scheduled for', render: (row) => formatDate(row.scheduledFor, true) },
              { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatMoney(row.amount) },
              { key: 'reason', label: 'Reason', render: (row) => row.reason || '—' },
              { key: 'statusChangedAt', label: 'Since', render: (row) => formatDate(row.statusChangedAt, true) },
            ]}
            rows={data.problems}
            rowKey={(row) => row.id}
            emptyTitle="No failed, delayed or disputed orders."
            emptyHint={hasOrders ? 'Every order in this range is on track or finished.' : emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'problems' })}
          />

          <Card className="mb-6" >
            <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-deep-blue">Revenue against the finance ledger</h2>
                <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
                  The ledger entries written for the orders in this range when they were marked "Paid" or "Refunded". A template order is
                  the platform's own sale; a custom wish is owed to its artist, less the commission rule for wishes.
                </p>
              </div>
              {data.canManage && fixable > 0 && (
                <Button variant="secondary" onClick={() => setSyncOpen(true)}>
                  Record {fixable} missing {fixable === 1 ? 'entry' : 'entries'}
                </Button>
              )}
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4" data-ledger-summary>
              {(
                [
                  ['Payments in the ledger', data.ledger.payments],
                  ['Refunds in the ledger', data.ledger.refunds],
                  ['Payments less refunds', data.ledger.net],
                  ['Report revenue', data.totals.revenue],
                  ['Of the payments: custom wishes, owed to artists (gross)', data.ledger.owedToArtistsGross],
                  ['Commission kept', data.ledger.commission],
                  ['GST on commission', data.ledger.gst],
                  ['Gateway fees', data.ledger.gatewayFee],
                ] as [string, number | null][]
              )
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900 tabular-nums">{formatMoney(value as number)}</dd>
                </div>
              ))}
            </dl>
            {data.ledger.commission === null && (
              <p className="px-4 pb-3 text-xs text-gray-500" data-ledger-finance-hidden>
                Commission, GST, gateway fees and the amounts owed to artists are shown to admins who can view Finance.
              </p>
            )}
            {data.ledger.gaps.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-green-800" data-ledger-gaps="0">
                {hasOrders ? 'Every paid order in this range has its payment in the ledger, and every refunded one its refund.' : 'No orders in this range.'}
              </p>
            ) : (
              <div className="px-4 pb-4" data-ledger-gaps={data.ledger.gaps.length}>
                <p className="text-sm text-amber-800 mb-2">
                  {data.ledger.gaps.length} order{data.ledger.gaps.length === 1 ? ' is' : 's are'} marked paid or refunded without the matching
                  ledger entry (entered before payments were written to the ledger, or the ledger write failed).
                </p>
                <ul className="text-sm text-gray-800 space-y-1">
                  {data.ledger.gaps.map((gap) => (
                    <li key={gap.id + gap.missing}>
                      <Link href={`${gap.kind === 'custom' ? '/wishes/custom' : '/wishes/orders'}?id=${gap.id}`} className="text-teal underline">
                        {gap.recipientName || 'Order'}
                      </Link>{' '}
                      ({gap.customerName || 'customer'}, {formatMoney(gap.amount)}, {STATUS[gap.status]?.label || gap.status}): no {gap.missing} entry.
                      {gap.blocked ? <span className="text-gray-500"> Cannot be recorded automatically: {gap.blocked}</span> : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <ReportTable<CheckRow>
            title={data.allChecksAgree ? 'Cross-check: every figure agrees' : 'Cross-check: some figures do not agree'}
            description='Each figure above is worked out by reading the orders one by one ("Report"). "Counted again" asks the database for the same figure with a separate count or sum on the raw records, and revenue is also compared with the finance ledger. The two columns must be equal.'
            columns={[
              { key: 'group', label: 'Section' },
              { key: 'metric', label: 'Figure' },
              { key: 'report', label: 'Report', align: 'right', render: (row) => figure(row, row.report) },
              { key: 'independent', label: 'Counted again', align: 'right', render: (row) => figure(row, row.independent) },
              {
                key: 'matches',
                label: 'Agree',
                render: (row) => <Badge tone={row.matches ? 'green' : 'red'}>{row.matches ? 'Yes' : 'No'}</Badge>,
              },
            ]}
            rows={data.checks}
            rowKey={(row) => row.group + row.metric}
            emptyTitle="Nothing to check."
            exportHref={API + rangeQuery(report.range, { export: 'check' })}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={syncOpen}
        title="Record missing ledger entries"
        message={
          <>
            Write the payment (and, for refunded orders, the refund) to the finance ledger for the {fixable} order{fixable === 1 ? '' : 's'}{' '}
            listed as missing one? This covers all dates, not only the range shown. Each entry is written once and is marked as recorded
            by an admin.
          </>
        }
        confirmLabel="Record entries"
        askReason
        reasonRequired
        busy={syncing}
        onConfirm={sync}
        onClose={() => setSyncOpen(false)}
      />
    </AdminShell>
  )
}
