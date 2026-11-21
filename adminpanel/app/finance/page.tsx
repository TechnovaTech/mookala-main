'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatMoney, type Notice } from '@/components/ui'
import OverviewRangeFilter, { rangeQuery, type RangeValue } from '@/components/finance/OverviewRangeFilter'
import OverviewTrendChart, { type TrendPoint } from '@/components/finance/OverviewTrendChart'
import ReportDefinitions from '@/components/finance/ReportDefinitions'
import { LedgerExportLink, td, tdRight, th, thRight } from '@/components/finance/LedgerLabels'

interface Figures {
  payments: number
  gtv: number
  commission: number
  refundDeductions: number
  platformRevenue: number
  gst: number
  gatewayFees: number
  refunds: number
  refundCount: number
  settlementsPaid: number
  netToPayees: number
}

interface Overview {
  range: { preset: string; from: string; to: string; days: number; label: string }
  generatedAt: string
  ledgerEntries: number
  entriesInRange: number
  totals: Figures
  membershipRevenue: number
  advertisingRevenue: number
  failedPayments: { count: number; value: number }
  disputedPayments: { count: number; value: number }
  pendingPayments: { count: number; value: number }
  refundedPayments: { count: number; value: number }
  disputesOpen: { gross: number; heldFromPayees: number; commissionSetAside: number }
  pendingSettlements: {
    payeeBalances: { payees: number; payeesOwed: number; owed: number; payeesOverpaid: number; overpaid: number }
    unpaidSettlements: { count: number; total: number; byStatus: { status: string; count: number; total: number }[] }
  }
  unverifiedBookings: { count: number; value: number; capped?: boolean }
  trendBucket: 'day' | 'month'
  trend: TrendPoint[]
  services: (Figures & { service: string; label: string; entries: number })[]
}

const LINKS = [
  { href: '/finance/payments', label: 'Payments', hint: 'Successful, failed, pending, refunded and disputed' },
  { href: '/finance/ledger', label: 'Ledger', hint: 'Every entry behind these figures' },
  { href: '/finance/refunds', label: 'Refunds', hint: 'Requests, approvals and processing' },
  { href: '/finance/settlements', label: 'Settlements', hint: 'Payouts to organisers and artists' },
  { href: '/finance/commissions', label: 'Commission settings', hint: 'Rates, GST and gateway fee rules' },
  { href: '/finance/reconciliation', label: 'Reconciliation', hint: 'Gateway against ledger, webhook health' },
  { href: '/reports', label: 'Reports & exports', hint: 'Statements, GST and service reports' },
]

export default function FinanceOverviewPage() {
  const [range, setRange] = useState<RangeValue>({ preset: 'month', from: '', to: '' })
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<Overview>('/api/admin/finance/overview?' + rangeQuery(range)))
      setNotice(null)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the finance overview.' })
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  const totals = data?.totals
  const pending = data?.pendingSettlements
  const ledgerEmpty = data ? data.ledgerEntries === 0 : false

  return (
    <AdminShell
      title="Finance Overview"
      subtitle="Figures computed from the transaction ledger"
      actions={<LedgerExportLink href={'/api/admin/reports?type=daily_statement&format=csv&' + rangeQuery(range)} label="Daily statement (CSV)" />}
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="p-4 mb-4">
        <OverviewRangeFilter value={range} onChange={setRange} disabled={loading} />
        {data && (
          <p className="text-sm text-gray-600 mt-3">
            Showing <span className="font-medium text-gray-800">{data.range.label}</span> ({data.range.days}{' '}
            {data.range.days === 1 ? 'day' : 'days'}), Asia/Kolkata (IST).
          </p>
        )}
      </Card>

      {data && data.unverifiedBookings.count > 0 && (
        <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-4" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold" data-unverified-banner>
              {data.unverifiedBookings.count}
              {data.unverifiedBookings.capped ? '+' : ''} {data.unverifiedBookings.count === 1 ? 'ticket' : 'tickets'} claiming{' '}
              {formatMoney(data.unverifiedBookings.value)} {data.unverifiedBookings.count === 1 ? 'was' : 'were'} issued without gateway confirmation
            </p>
            <p className="mt-0.5">
              Their payment is &lsquo;unverified&rsquo; (old app versions or demonstration mode). They are not in the ledger, so they are not counted as
              revenue or in any figure on this page (all dates, not only the selected range).{' '}
              <Link href="/bookings?paymentStatus=unverified" className="underline font-medium">
                Review and resolve them
              </Link>
            </p>
          </div>
        </div>
      )}

      {loading && !data && <Spinner label="Loading figures..." />}

      {data && ledgerEmpty && (
        <Card className="mb-4">
          <EmptyState
            title="The ledger has no entries yet"
            hint="Figures appear here once payments are verified through the payment gateway. Each verified payment writes a ledger entry, with its commission, GST and gateway fee, and every number on this page is the sum of those entries."
          />
        </Card>
      )}

      {data && totals && pending && !ledgerEmpty && (
        <div className={loading ? 'opacity-60' : ''}>
          {data.entriesInRange === 0 && (
            <NoticeBar notice={{ type: 'info', text: 'There are no ledger entries in this date range, so the figures for the range are zero.' }} />
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
            <StatCard label="Gross transaction value" value={formatMoney(totals.gtv)} hint={`${totals.payments} successful payments`} tone="blue" />
            <StatCard label="Platform revenue" value={formatMoney(totals.platformRevenue)} hint="Commission + refund deductions" tone="green" />
            <StatCard label="Commission" value={formatMoney(totals.commission)} hint={`Refund deductions ${formatMoney(totals.refundDeductions)}`} tone="gray" />
            <StatCard label="GST collected" value={formatMoney(totals.gst)} hint="Not part of revenue" tone="gray" />
            <StatCard label="Gateway fees" value={formatMoney(totals.gatewayFees)} hint="Not part of revenue" tone="gray" />
            <StatCard label="Refunds" value={formatMoney(totals.refunds)} hint={`${totals.refundCount} refund entries`} tone="amber" />
            <StatCard label="Membership revenue" value={formatMoney(data.membershipRevenue)} hint="Service: membership" tone="gray" />
            <StatCard label="Advertisement revenue" value={formatMoney(data.advertisingRevenue)} hint="Service: advertising" tone="gray" />
            <StatCard
              label="Pending settlements (payee balances)"
              value={formatMoney(pending.payeeBalances.owed)}
              hint={`${pending.payeeBalances.payeesOwed} payees owed, all dates`}
              tone="amber"
            />
            <StatCard
              label="Settlement records not yet paid"
              value={formatMoney(pending.unpaidSettlements.total)}
              hint={`${pending.unpaidSettlements.count} records, all dates`}
              tone="amber"
            />
            <StatCard
              label="Pending payments"
              value={data.pendingPayments.count}
              hint={`${formatMoney(data.pendingPayments.value)} awaiting payment right now`}
              tone={data.pendingPayments.count ? 'amber' : 'gray'}
            />
            <StatCard
              label="Failed payments"
              value={data.failedPayments.count}
              hint={`Value ${formatMoney(data.failedPayments.value)}; no money received`}
              tone={data.failedPayments.count ? 'red' : 'gray'}
            />
            <StatCard
              label="Refunded payments"
              value={data.refundedPayments.count}
              hint={`${formatMoney(data.refundedPayments.value)} paid in this range and returned in full`}
              tone="gray"
            />
            <StatCard
              label="Disputed payments"
              value={data.disputedPayments.count}
              hint={`Value ${formatMoney(data.disputedPayments.value)}; not in any figure above`}
              tone={data.disputedPayments.count ? 'red' : 'gray'}
            />
          </div>

          {data.disputesOpen.gross > 0 && (
            <p className="text-sm text-gray-600 mb-4" data-disputes-open>
              Open disputes (all dates): payments worth {formatMoney(data.disputesOpen.gross)} are set aside with their commission (
              {formatMoney(data.disputesOpen.commissionSetAside)}), GST and gateway fees. {formatMoney(data.disputesOpen.heldFromPayees)} is held back from payee
              balances until the disputes are cleared or lost.
            </p>
          )}

          {(pending.unpaidSettlements.byStatus.length > 0 || pending.payeeBalances.payeesOverpaid > 0) && (
            <p className="text-sm text-gray-600 mb-4">
              {pending.unpaidSettlements.byStatus.length > 0 && (
                <>
                  Settlement records not yet paid, by status:{' '}
                  {pending.unpaidSettlements.byStatus.map((row) => `${row.status.replace(/_/g, ' ')} ${formatMoney(row.total)} (${row.count})`).join(', ')}.{' '}
                </>
              )}
              {pending.payeeBalances.payeesOverpaid > 0 && (
                <>
                  {pending.payeeBalances.payeesOverpaid} {pending.payeeBalances.payeesOverpaid === 1 ? 'payee has' : 'payees have'} been paid{' '}
                  {formatMoney(pending.payeeBalances.overpaid)} more than earned; this is not netted against the amount owed.
                </>
              )}
            </p>
          )}

          <Card className="p-5 mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-deep-blue">Revenue trend</h2>
              <p className="text-sm text-gray-500">
                {data.trendBucket === 'day' ? 'Daily' : 'Monthly'} totals, IST. Ranges longer than 60 days are shown by month.
              </p>
            </div>
            {data.entriesInRange === 0 ? (
              <EmptyState title="Nothing to chart" hint="There are no ledger entries in this date range." />
            ) : (
              <OverviewTrendChart data={data.trend} />
            )}
          </Card>

          <Card className="mb-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">By service</h2>
              <p className="text-sm text-gray-500">Net to payees = GTV less commission, GST, gateway fees and refunds.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={th}>Service</th>
                    <th className={thRight}>GTV</th>
                    <th className={thRight}>Commission</th>
                    <th className={thRight}>Refunds</th>
                    <th className={thRight}>Net to payees</th>
                    <th className={thRight}>Platform revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.services.map((row) => (
                    <tr key={row.service} className={row.entries === 0 ? 'text-gray-400' : ''}>
                      <td className={td}>
                        {row.label}
                        {row.entries === 0 && <span className="block text-xs text-gray-400">No entries in this range</span>}
                      </td>
                      <td className={tdRight}>{formatMoney(row.gtv)}</td>
                      <td className={tdRight}>{formatMoney(row.commission)}</td>
                      <td className={tdRight}>{formatMoney(row.refunds)}</td>
                      <td className={tdRight}>{formatMoney(row.netToPayees)}</td>
                      <td className={tdRight}>{formatMoney(row.platformRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className={td}>Total</td>
                    <td className={tdRight}>{formatMoney(totals.gtv)}</td>
                    <td className={tdRight}>{formatMoney(totals.commission)}</td>
                    <td className={tdRight}>{formatMoney(totals.refunds)}</td>
                    <td className={tdRight}>{formatMoney(totals.netToPayees)}</td>
                    <td className={tdRight}>{formatMoney(totals.platformRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="group bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-teal">
            <span className="flex items-center justify-between text-sm font-semibold text-deep-blue">
              {link.label}
              <ArrowRight size={16} className="text-gray-400 group-hover:text-teal" />
            </span>
            <span className="block text-xs text-gray-500 mt-1">{link.hint}</span>
          </Link>
        ))}
      </div>

      <ReportDefinitions rangeLabel={data?.range.label} generatedAt={data?.generatedAt} />
    </AdminShell>
  )
}
