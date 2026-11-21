'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass } from '@/components/ui'
import { NewUsersChart, RevenueTrendChart, periodLabel } from '@/components/dashboard/TrendChart'
import { MODULE_LABELS } from '@/lib/permissions'

type RangeKey = 'today' | '7d' | 'month' | 'year' | 'custom'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
]

const GRANULARITY_LABEL: Record<string, string> = { day: 'Daily', month: 'Monthly', year: 'Yearly' }

const BOOKING_STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  attended: 'Attended',
  pending_payment: 'Payment pending',
  cancelled: 'Cancelled',
  expired: 'Expired',
  unknown: 'No status',
}

interface HealthSummary {
  overall: string
  total: number
  problems: { key: string; label: string; status: string; summary: string }[]
}

const HEALTH_LABEL: Record<string, string> = { ok: 'Healthy', degraded: 'Degraded', down: 'Down', warning: 'Warning', failed: 'Failed' }

interface Alert {
  key: string
  label: string
  count: number
  href: string
  severity: 'info' | 'warning' | 'critical'
}

function number(value: any): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-IN') : '—'
}

function Tile({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-deep-blue mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {href && <p className="text-xs font-medium text-teal mt-2">View details</p>}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30">
        {body}
      </Link>
    )
  }
  return <Card className="p-5">{body}</Card>
}

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-deep-blue">{title}</h2>
        {note && <p className="text-xs text-gray-500">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function DashboardBody() {
  const canUsers = useCan('users:view')
  const canArtists = useCan('artists:view')
  const canOrganizers = useCan('organizers:view')
  const canVenues = useCan('venues:view')
  const canBookings = useCan('bookings:view')
  const canMemberships = useCan('memberships:view')
  const canSecurity = useCan('security:view')
  const canSystem = useCan('system:view')

  const [range, setRange] = useState<RangeKey>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null)
  const [granularity, setGranularity] = useState('auto')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [health, setHealth] = useState<HealthSummary | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    if (range === 'custom' && !applied) return
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ range, granularity })
      if (range === 'custom' && applied) {
        query.set('from', applied.from)
        query.set('to', applied.to)
      }
      setData(await api('/api/admin/dashboard?' + query.toString()))
    } catch (err: any) {
      setError(err.message || 'The dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [range, applied, granularity])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  useEffect(() => {
    let cancelled = false
    api<{ alerts: Alert[] }>('/api/admin/alerts')
      .then((result) => {
        if (!cancelled) setAlerts(result.alerts || [])
      })
      .catch(() => {
        if (!cancelled) setAlerts(null)
      })

    // System-health warnings, for admins who may read system health.
    setHealth(null)
    if (!canSystem) {
      return () => {
        cancelled = true
      }
    }
    fetch('/api/admin/system/health', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result || typeof result.overall !== 'string') return
        const checks: any[] = Array.isArray(result.checks) ? result.checks : []
        setHealth({
          overall: result.overall,
          total: checks.length,
          problems: checks
            .filter((item) => item && (item.status === 'warning' || item.status === 'failed'))
            .map((item) => ({
              key: String(item.key || item.label),
              label: String(item.label || item.key),
              status: String(item.status),
              summary: typeof item.summary === 'string' ? item.summary : '',
            })),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reloadKey, canSystem])

  const applyCustom = () => {
    if (!from || !to) {
      setError('Choose both a start date and an end date.')
      return
    }
    if (from > to) {
      setError('The start date must not be after the end date.')
      return
    }
    setError('')
    setApplied({ from, to })
  }

  const activity = data?.activity
  const finance = data?.finance
  const performance = data?.performance
  const recent = data?.recent
  const rangeInfo = data?.range
  const granularityLabel = rangeInfo ? GRANULARITY_LABEL[rangeInfo.granularity] : ''

  return (
    <>
      {/* ------------------------------ filter ------------------------------ */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                aria-pressed={range === item.key}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                  range === item.key ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="dash-from" className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input id="dash-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="dash-to" className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input id="dash-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </div>
              <Button onClick={applyCustom}>Apply</Button>
            </div>
          )}

          <div className="ml-auto flex items-end gap-2">
            <div>
              <label htmlFor="dash-granularity" className="block text-xs font-medium text-gray-600 mb-1">Chart periods</label>
              <select id="dash-granularity" value={granularity} onChange={(e) => setGranularity(e.target.value)} className={inputClass}>
                <option value="auto">Automatic</option>
                <option value="day">Daily</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)} loading={loading}>
              {!loading && <RefreshCw size={16} />}
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {rangeInfo
            ? `Showing ${formatDay(rangeInfo.fromDay)} to ${formatDay(rangeInfo.toDay)}. `
            : range === 'custom'
            ? 'Choose a start and end date, then Apply. '
            : ''}
          All dates use India Standard Time (Asia/Kolkata).
        </p>
      </Card>

      <NoticeBar notice={error ? { type: 'error', text: error } : null} onClose={() => setError('')} />

      {loading && !data && <Spinner label="Loading the dashboard..." />}
      {!loading && !data && !error && range === 'custom' && (
        <Card><EmptyState title="Choose a date range" hint="Pick a start and end date above and press Apply." /></Card>
      )}

      {data && (
        <div className={loading ? 'opacity-60' : ''} aria-busy={loading}>
          {data.unverifiedBookings > 0 && (
            <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-6" role="alert">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>
                <strong>{number(data.unverifiedBookings)}</strong> booking{data.unverifiedBookings === 1 ? ' was' : 's were'} taken without
                confirmation from the payment gateway. Their amounts are not counted in any financial figure below.{' '}
                {canBookings && <Link href="/bookings" className="font-semibold underline">Review bookings</Link>}
              </span>
            </div>
          )}

          {/* ------------------------- platform activity ------------------------- */}
          <Section title="Platform activity" note="Totals are as of now. “In range” figures follow the date filter.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Registered users" value={number(activity.totalUsers)} hint={`${number(activity.newUsers)} new in range`} href={canUsers ? '/users' : undefined} />
              <Tile label="Active users in range" value={number(activity.activeUsers)} hint="Users with at least one booking in the range" />
              <Tile
                label="Artists approved"
                value={number(activity.artists.approved)}
                hint={`${number(activity.artists.pending)} pending review · ${number(activity.artists.total)} registered`}
                href={canArtists ? '/artists' : undefined}
              />
              <Tile label="Organisers" value={number(activity.organizers)} href={canOrganizers ? '/organizers' : undefined} />
              <Tile label="Venues" value={number(activity.venues)} href={canVenues ? '/venues' : undefined} />
              <Tile
                label="Bookings in range"
                value={number(activity.bookings.total)}
                hint={
                  Object.keys(activity.bookings.byStatus).length
                    ? Object.entries(activity.bookings.byStatus)
                        .map(([status, count]) => `${BOOKING_STATUS_LABEL[status] || status}: ${number(count)}`)
                        .join(' · ')
                    : 'No bookings in this range'
                }
                href={canBookings ? '/bookings' : undefined}
              />
              <Tile label="Tickets (seats) sold in range" value={number(activity.seatsSold)} hint="Seats on confirmed and attended bookings" />
              <Tile
                label="Active memberships"
                value={number(activity.activeMemberships)}
                hint="Subscriptions with status active"
                href={canMemberships ? '/memberships/subscriptions' : undefined}
              />
            </div>
          </Section>

          {/* -------------------------- financial snapshot ------------------------- */}
          {data.canSeeFinance && finance && (
            <Section title="Financial snapshot" note="From successful ledger entries dated within the range.">
              {finance.ledgerEmpty ? (
                <Card>
                  <EmptyState
                    title="No financial figures yet"
                    hint="Financial figures appear once payments are verified through the payment gateway. Each verified payment writes its payment, commission, GST and gateway-fee entries to the ledger, and this section reads only from that ledger."
                  />
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Tile label="Gross transaction value" value={formatMoney(finance.gtv)} hint="All verified customer payments" href="/finance/payments" />
                    <Tile label="Platform revenue" value={formatMoney(finance.platformRevenue)} hint="Commission + refund deductions kept. Membership and advertising income are listed separately." href="/finance" />
                    <Tile label="Commission revenue" value={formatMoney(finance.commissionRevenue)} hint={`Refund deductions: ${formatMoney(finance.refundDeductions)}`} href="/finance/ledger" />
                    <Tile label="Refunds" value={formatMoney(finance.refunds)} hint="Returned to customers" href="/finance/refunds" />
                    <Tile label="Membership revenue" value={formatMoney(finance.membershipRevenue)} hint="Verified membership payments" />
                    <Tile label="Advertisement revenue" value={formatMoney(finance.advertisementRevenue)} hint="Verified advertising payments" />
                    <Tile
                      label="Pending settlements"
                      value={formatMoney(finance.pendingSettlements.amount)}
                      hint={`${number(finance.pendingSettlements.count)} awaiting payout right now (not date filtered)`}
                      href="/finance/settlements"
                    />
                    <Tile label="GST and gateway charges" value={formatMoney(finance.gst + finance.gatewayFees)} hint={`GST ${formatMoney(finance.gst)} · gateway ${formatMoney(finance.gatewayFees)}`} />
                  </div>
                  {finance.entriesInRange === 0 && (
                    <p className="text-sm text-gray-500 mt-3">The ledger has no successful entries in this date range.</p>
                  )}
                </>
              )}
            </Section>
          )}

          {/* ---------------------------- revenue trend --------------------------- */}
          {data.canSeeFinance && finance && !finance.ledgerEmpty && (
            <Section
              title={`Revenue trend (${granularityLabel.toLowerCase()})`}
              note={
                rangeInfo.periodsShown < rangeInfo.periodsTotal
                  ? `Showing the most recent ${rangeInfo.periodsShown} of ${rangeInfo.periodsTotal} periods.`
                  : undefined
              }
            >
              <Card className="p-5">
                {data.trend.some((point: any) => point.gtv || point.platformRevenue || point.refunds) ? (
                  <RevenueTrendChart data={data.trend} />
                ) : (
                  <EmptyState title="No verified payments in this range" hint="Choose a wider range to see the trend." />
                )}
              </Card>
            </Section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              {/* ------------------------ business performance ----------------------- */}
              <Section title="Business performance">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Booking conversion</p>
                    <p className="text-2xl font-bold text-deep-blue mt-1" data-testid="conversion-rate">
                      {performance.conversion.rate === null ? 'Not enough data' : `${performance.conversion.rate}%`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {performance.conversion.rate === null
                        ? 'No bookings were started in this range.'
                        : `${number(performance.conversion.confirmed)} confirmed of ${number(performance.conversion.started)} started (confirmed, payment pending and expired). Attended bookings count as confirmed.`}
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer retention</p>
                    <p className="text-2xl font-bold text-deep-blue mt-1" data-testid="retention-rate">
                      {performance.retention.rate === null ? 'Not enough data' : `${performance.retention.rate}%`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {performance.retention.rate === null
                        ? `${number(performance.retention.eligible)} customer${performance.retention.eligible === 1 ? '' : 's'} had a first booking before this range; at least ${number(performance.retention.minimum)} are needed for a percentage. ${number(performance.retention.returned)} of them booked again in the range.`
                        : `${number(performance.retention.returned)} of ${number(performance.retention.eligible)} customers whose first booking was before this range booked again inside it.`}{' '}
                      Abandoned and expired bookings are not counted.
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Repeat bookers</p>
                    <p className="text-2xl font-bold text-deep-blue mt-1">
                      {performance.repeatBookers.bookers > 0
                        ? `${number(performance.repeatBookers.repeatOverall)} of ${number(performance.repeatBookers.bookers)}`
                        : 'Not enough data'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {performance.repeatBookers.bookers > 0
                        ? `Customers who booked in the range and have more than one booking overall. ${number(performance.repeatBookers.repeatInRange)} booked more than once inside the range.`
                        : 'No customer placed a booking in this range.'}
                    </p>
                  </Card>
                </div>

                <Card className="p-5 mb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-deep-blue">User acquisition: new users ({granularityLabel.toLowerCase()})</h3>
                    <p className="text-xs text-gray-500" data-testid="acquisition-total">
                      {number(performance.newUsersTotal)} new user{performance.newUsersTotal === 1 ? '' : 's'} in this range
                    </p>
                  </div>
                  {performance.newUsers.some((point: any) => point.count > 0) ? (
                    <NewUsersChart data={performance.newUsers} />
                  ) : (
                    <p className="text-sm text-gray-500 py-6 text-center">No users signed up in this range.</p>
                  )}
                </Card>

                {data.canSeeFinance && finance && !finance.ledgerEmpty && (
                  <Card className="mb-4">
                  <h3 data-testid="service-profitability" className="text-sm font-semibold text-deep-blue px-5 pt-5">Service-wise profitability</h3>
                    <p className="text-xs text-gray-500 px-5 pb-3">
                      What the platform earned from each service in the range, from the ledger. For services sold through organisers,
                      artists and instructors this is the commission plus refund deductions kept. For membership, advertising and the
                      premium search pass the platform is the seller, so it is the payments received less refunds (not part of the
                      Platform revenue tile above, which counts commission). Operating costs such as staff, hosting and marketing are
                      not recorded in this panel, so these are earnings before those costs.
                    </p>
                    {data.revenueByService.length === 0 ? (
                      <p className="text-sm text-gray-500 px-5 pb-5">No ledger entries in this range.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                              <th scope="col" className="px-4 py-3 font-medium">Service</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Payments</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Gross value</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Commission</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Refund deductions</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Platform earnings</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Share of gross</th>
                              <th scope="col" className="px-4 py-3 font-medium text-right">Refunds paid</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {data.revenueByService.map((row: any) => (
                              <tr key={row.service}>
                                <td className="px-4 py-3 text-gray-800">
                                  {row.label}
                                  <span className="block text-xs text-gray-500">{row.basis === 'direct' ? 'Sold by the platform' : 'Commission based'}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-800">{number(row.payments)}</td>
                                <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.gtv)}</td>
                                <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.commission)}</td>
                                <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.refundDeductions)}</td>
                                <td className="px-4 py-3 text-right font-medium text-deep-blue">{formatMoney(row.earnings)}</td>
                                <td className="px-4 py-3 text-right text-gray-800">{row.earningsShare === null ? '—' : `${row.earningsShare}%`}</td>
                                <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.refunds)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                )}

                <Card className="mb-4">
                  <h3 data-testid="state-performance" className="text-sm font-semibold text-deep-blue px-5 pt-5">Performance by state</h3>
                  <p className="text-xs text-gray-500 px-5 pb-3">
                    Confirmed and attended bookings in the range, grouped by the state of the event.
                    {data.canSeeFinance ? ' Value is the verified payments recorded in the ledger for those events.' : ''}
                  </p>
                  {performance.states.length === 0 ? (
                    <p className="text-sm text-gray-500 px-5 pb-5">No confirmed bookings in this range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <th scope="col" className="px-4 py-3 font-medium">State</th>
                            <th scope="col" className="px-4 py-3 font-medium text-right">Cities</th>
                            <th scope="col" className="px-4 py-3 font-medium text-right">Bookings</th>
                            <th scope="col" className="px-4 py-3 font-medium text-right">Seats</th>
                            {data.canSeeFinance && <th scope="col" className="px-4 py-3 font-medium text-right">Verified value</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {performance.states.map((row: any) => (
                            <tr key={row.state || 'none'}>
                              <td className="px-4 py-3 text-gray-800">
                                {row.state || <span className="text-gray-500">State not recorded on the event (older events), or event removed</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-800">{number(row.cities)}</td>
                              <td className="px-4 py-3 text-right text-gray-800">{number(row.bookings)}</td>
                              <td className="px-4 py-3 text-right text-gray-800">{number(row.seats)}</td>
                              {data.canSeeFinance && <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.value)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card className="mb-4">
                  <h3 data-testid="city-performance" className="text-sm font-semibold text-deep-blue px-5 pt-5">Performance by city</h3>
                  <p className="text-xs text-gray-500 px-5 pb-3">
                    The same bookings grouped by the city of the event (top 25 cities).
                  </p>
                  {performance.cities.length === 0 ? (
                    <p className="text-sm text-gray-500 px-5 pb-5">No confirmed bookings in this range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <th scope="col" className="px-4 py-3 font-medium">City</th>
                            <th scope="col" className="px-4 py-3 font-medium">State</th>
                            <th scope="col" className="px-4 py-3 font-medium text-right">Bookings</th>
                            <th scope="col" className="px-4 py-3 font-medium text-right">Seats</th>
                            {data.canSeeFinance && <th scope="col" className="px-4 py-3 font-medium text-right">Verified value</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {performance.cities.map((row: any) => (
                            <tr key={`${row.city}|${row.state}`}>
                              <td className="px-4 py-3 text-gray-800">{row.city || <span className="text-gray-500">City not recorded on the event, or event removed</span>}</td>
                              <td className="px-4 py-3 text-gray-800">{row.state || '—'}</td>
                              <td className="px-4 py-3 text-right text-gray-800">{number(row.bookings)}</td>
                              <td className="px-4 py-3 text-right text-gray-800">{number(row.seats)}</td>
                              {data.canSeeFinance && <td className="px-4 py-3 text-right text-gray-800">{formatMoney(row.value)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card className="p-5">
                  <h3 data-testid="performance-gaps" className="text-sm font-semibold text-deep-blue mb-2">Not available yet</h3>
                  <ul className="text-sm text-gray-600 space-y-2">
                    {performance.notAvailable.map((entry: any) => (
                      <li key={entry.item}>
                        <span className="font-medium text-gray-800">{entry.item}:</span> {entry.why}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Section>
            </div>

            <div>
              {/* -------------------------- operational alerts ------------------------ */}
              <Section title="Operational alerts">
                <Card>
                  {alerts === null && <p className="px-5 py-4 text-sm text-gray-500">Alerts could not be loaded.</p>}
                  {alerts && alerts.length === 0 && <p className="px-5 py-4 text-sm text-gray-500">Nothing is waiting for action.</p>}
                  {alerts &&
                    alerts.map((alert) => (
                      <Link key={alert.key} href={alert.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <span className="text-gray-800">{alert.label}</span>
                        <Badge tone={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'blue'}>{number(alert.count)}</Badge>
                      </Link>
                    ))}
                  {health && (
                    <div className="border-t border-gray-200" data-testid="system-health">
                      <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="text-gray-800">
                          {health.problems.length > 0
                            ? `System health: ${health.problems.length} of ${health.total} checks need attention`
                            : `System health: all ${health.total} checks healthy`}{' '}
                          {canSystem && <Link href="/system" className="text-teal font-medium">Open</Link>}
                        </span>
                        <Badge tone={health.overall === 'ok' ? 'green' : health.overall === 'degraded' ? 'amber' : 'red'}>
                          {HEALTH_LABEL[health.overall] || health.overall}
                        </Badge>
                      </div>
                      {health.problems.length > 0 && (
                        <ul className="px-5 pb-3 space-y-2">
                          {health.problems.map((problem) => (
                            <li key={problem.key} className="flex items-start justify-between gap-3 text-sm">
                              <span className="min-w-0">
                                <span className="block font-medium text-gray-800">{problem.label}</span>
                                {problem.summary && <span className="block text-xs text-gray-600 break-words">{problem.summary}</span>}
                              </span>
                              <Badge tone={problem.status === 'failed' ? 'red' : 'amber'}>{HEALTH_LABEL[problem.status] || problem.status}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              </Section>

              {/* ---------------------------- recent activity -------------------------- */}
              <Section title="Recent activity">
                <Card className="mb-4">
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <h3 className="text-sm font-semibold text-deep-blue">{recent.auditScope === 'all' ? 'Admin actions' : 'Your actions'}</h3>
                    {canSecurity && <Link href="/security/audit" className="text-xs font-medium text-teal">Activity log</Link>}
                  </div>
                  {recent.audit.length === 0 && <p className="px-5 pb-4 text-sm text-gray-500">No admin actions recorded yet.</p>}
                  <ul>
                    {recent.audit.map((row: any) => (
                      <li key={row._id} className="px-5 py-2.5 border-t border-gray-100 text-sm">
                        <p className="text-gray-800">
                          <span className="font-medium">{row.adminName || row.adminEmail || 'System'}</span>{' '}
                          {String(row.action || '').replace(/_/g, ' ')} · {row.entityLabel || row.entityType}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(MODULE_LABELS as Record<string, string>)[row.module] || row.module} · {formatDate(row.createdAt, true)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>

                {recent.bookings && (
                  <Card className="mb-4">
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                      <h3 className="text-sm font-semibold text-deep-blue">Latest bookings</h3>
                      <Link href="/bookings" className="text-xs font-medium text-teal">All bookings</Link>
                    </div>
                    {recent.bookings.length === 0 && <p className="px-5 pb-4 text-sm text-gray-500">No bookings yet.</p>}
                    <ul>
                      {recent.bookings.map((row: any) => (
                        <li key={row._id} className="px-5 py-2.5 border-t border-gray-100 text-sm flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-gray-800 truncate">{row.eventTitle || 'Event'}</span>
                            <span className="block text-xs text-gray-500">
                              {row.userPhone || 'Unknown customer'} · {number(row.totalSeats)} seat{Number(row.totalSeats) === 1 ? '' : 's'} · {formatDate(row.createdAt, true)}
                            </span>
                          </span>
                          <Badge tone={row.status === 'confirmed' || row.status === 'attended' ? 'green' : row.status === 'cancelled' ? 'red' : 'amber'}>
                            {BOOKING_STATUS_LABEL[row.status] || row.status || 'No status'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {recent.signups && (
                  <Card>
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                      <h3 className="text-sm font-semibold text-deep-blue">Latest signups</h3>
                      <Link href="/users" className="text-xs font-medium text-teal">All users</Link>
                    </div>
                    {recent.signups.length === 0 && <p className="px-5 pb-4 text-sm text-gray-500">No users have signed up yet.</p>}
                    <ul>
                      {recent.signups.map((row: any) => (
                        <li key={row._id} className="px-5 py-2.5 border-t border-gray-100 text-sm">
                          <span className="block text-gray-800">{row.name || 'Name not provided'}</span>
                          <span className="block text-xs text-gray-500">
                            {row.city ? `${row.city} · ` : ''}{formatDate(row.createdAt, true)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </Section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatDay(day: string): string {
  const parts = day.split('-')
  return parts.length === 3 ? `${periodLabel(day)} ${parts[0]}` : day
}

export default function DashboardPage() {
  return (
    <AdminShell title="Dashboard" subtitle="Platform activity, finances and items that need attention">
      <DashboardBody />
    </AdminShell>
  )
}
