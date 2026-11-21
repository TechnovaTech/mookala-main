'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, AlertTriangle } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'

type GroupBy = 'venue' | 'event' | 'show' | 'location' | 'day'

interface Measures {
  bookings: number
  sold: number
  seats: number
  value: number
  cancellations: number
  cancelledSeats: number
  cancelledValue: number
  checkIns: number
  unpaid: number
}

interface BookingRow extends Measures {
  key: string
  label: string
  detail: string
  link: string | null
}

interface ShowRow {
  key: string
  label: string
  detail: string
  link: string | null
  showAt: string | null
  status: string
  totalSeats: number
  seatsSold: number
  remaining: number
  basePrice: number
  value: number
}

interface ShowTotals {
  shows: number
  cancelledShows: number
  totalSeats: number
  seatsSold: number
  value: number
}

interface Common {
  groupBy: GroupBy
  groupLabel: string
  range: { from: string; to: string; label: string; preset: string }
  timezone: string
  generatedAt: string
  matches: boolean
}

type Report =
  | (Common & { kind: 'bookings'; rows: BookingRow[]; totals: Measures; check: Measures; truncated: boolean })
  | (Common & { kind: 'shows'; rows: ShowRow[]; totals: ShowTotals; check: ShowTotals })

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: 'event', label: 'By event' },
  { value: 'venue', label: 'By venue' },
  { value: 'show', label: 'By cinema show' },
  { value: 'location', label: 'By city and state' },
  { value: 'day', label: 'By day' },
]

const BOOKING_COLUMNS: { key: keyof Measures; label: string; money?: boolean }[] = [
  { key: 'bookings', label: 'Bookings made' },
  { key: 'sold', label: 'Sold bookings' },
  { key: 'seats', label: 'Seats sold' },
  { key: 'value', label: 'Sales value', money: true },
  { key: 'cancellations', label: 'Cancelled bookings' },
  { key: 'cancelledSeats', label: 'Cancelled seats' },
  { key: 'cancelledValue', label: 'Cancelled value', money: true },
  { key: 'checkIns', label: 'Seats checked in' },
  { key: 'unpaid', label: 'Unpaid or expired' },
]

const SHOW_COLUMNS: { key: keyof ShowTotals; label: string; money?: boolean }[] = [
  { key: 'shows', label: 'Shows' },
  { key: 'cancelledShows', label: 'Cancelled shows' },
  { key: 'totalSeats', label: 'Total seats' },
  { key: 'seatsSold', label: 'Seats sold' },
  { key: 'value', label: 'Value at base price', money: true },
]

const SHOW_TONE: Record<string, 'blue' | 'red' | 'green' | 'gray'> = { scheduled: 'blue', cancelled: 'red', completed: 'green' }

const count = (value: number) => value.toLocaleString('en-IN')
const show = (value: number, money?: boolean) => (money ? formatMoney(value) : count(value))

/** Today in India as YYYY-MM-DD, and the day `back` days earlier. */
function indiaDay(back = 0): string {
  return new Date(Date.now() + 330 * 60000 - back * 86400000).toISOString().slice(0, 10)
}

function CheckPanel({ columns, totals, check, matches, source }: { columns: { key: string; label: string; money?: boolean }[]; totals: any; check: any; matches: boolean; source: string }) {
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-deep-blue">Check against the raw records</h2>
        <span
          data-testid="check-result"
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${matches ? 'text-green-700' : 'text-red-700'}`}
        >
          {matches ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {matches ? 'Every total matches' : 'The totals do not match'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="check-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">Figure</th>
              <th className="px-5 py-3 font-medium text-right">Report total</th>
              <th className="px-5 py-3 font-medium text-right">Counted from raw records</th>
              <th className="px-5 py-3 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {columns.map((column) => {
              const same = totals[column.key] === check[column.key]
              return (
                <tr key={column.key}>
                  <td className="px-5 py-2 text-gray-900">{column.label}</td>
                  <td className="px-5 py-2 text-right">{show(totals[column.key], column.money)}</td>
                  <td className="px-5 py-2 text-right">{show(check[column.key], column.money)}</td>
                  <td className="px-5 py-2">
                    <Badge tone={same ? 'green' : 'red'}>{same ? 'Match' : 'Different'}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">{source}</p>
    </Card>
  )
}

function TicketingReports() {
  const [groupBy, setGroupBy] = useState<GroupBy>('event')
  const [from, setFrom] = useState(() => indiaDay(29))
  const [to, setTo] = useState(() => indiaDay())
  const [applied, setApplied] = useState({ from: indiaDay(29), to: indiaDay() })
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  const query = `from=${applied.from}&to=${applied.to}&groupBy=${groupBy}`

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<Report>(`/api/admin/ticketing/reports?${query}`)
      if (current !== requestId.current) return
      setReport(result)
      setNotice(null)
    } catch (error: any) {
      if (current !== requestId.current) return
      setReport(null)
      setNotice({ type: 'error', text: error.message || 'The report could not be loaded.' })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    if (!from || !to) return setNotice({ type: 'error', text: 'Choose both a start date and an end date.' })
    if (from > to) return setNotice({ type: 'error', text: 'The start date must not be after the end date.' })
    setApplied({ from, to })
  }

  const preset = (days: number) => {
    const next = { from: indiaDay(days - 1), to: indiaDay() }
    setFrom(next.from)
    setTo(next.to)
    setApplied(next)
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="mb-4 p-4">
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="report-from" className="block text-xs font-medium text-gray-600 mb-1">
              From
            </label>
            <input id="report-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="report-to" className="block text-xs font-medium text-gray-600 mb-1">
              To
            </label>
            <input id="report-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
          <Button type="submit">Apply</Button>
          <Button type="button" variant="secondary" onClick={() => preset(1)}>
            Today
          </Button>
          <Button type="button" variant="secondary" onClick={() => preset(7)}>
            Last 7 days
          </Button>
          <Button type="button" variant="secondary" onClick={() => preset(30)}>
            Last 30 days
          </Button>
          <a
            href={`/api/admin/ticketing/reports?${query}&export=csv`}
            data-testid="export-link"
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
        </form>
        <div className="flex flex-wrap gap-2 mt-4" role="tablist" aria-label="Group the report">
          {GROUPS.map((group) => (
            <button
              key={group.value}
              role="tab"
              aria-selected={groupBy === group.value}
              onClick={() => setGroupBy(group.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                groupBy === group.value ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3" data-testid="report-scope">
          {report
            ? `${report.range.label}, ${report.timezone}. ${
                report.kind === 'shows' ? 'Shows are selected by the day of the show.' : 'Bookings are selected by the day they were made.'
              } Generated ${formatDate(report.generatedAt, true)}.`
            : 'Dates are India dates.'}
        </p>
      </Card>

      {loading && !report ? (
        <Spinner />
      ) : !report ? null : report.kind === 'bookings' ? (
        <>
          {report.truncated && (
            <NoticeBar notice={{ type: 'error', text: 'This range holds more bookings than one report can read. Choose a shorter range for exact figures.' }} />
          )}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <StatCard label="Bookings made" value={count(report.totals.bookings)} hint={`${count(report.totals.unpaid)} unpaid or expired`} tone="gray" />
            <StatCard label="Seats sold" value={count(report.totals.seats)} hint={`${count(report.totals.sold)} sold bookings`} tone="gray" />
            <StatCard label="Sales value" value={formatMoney(report.totals.value)} />
            <StatCard
              label="Cancellations"
              value={count(report.totals.cancellations)}
              hint={`${count(report.totals.cancelledSeats)} seats, ${formatMoney(report.totals.cancelledValue)}`}
              tone="red"
            />
            <StatCard label="Seats checked in" value={count(report.totals.checkIns)} />
          </div>

          <Card className="mb-4">
            {report.rows.length === 0 ? (
              <EmptyState title="No bookings were made in this range" hint="Bookings made in the apps and on the website appear here. Try a longer range." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="report-table">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-3 font-medium">{report.groupLabel}</th>
                      {BOOKING_COLUMNS.map((column) => (
                        <th key={column.key} className="px-4 py-3 font-medium text-right">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-3">
                          {row.link ? (
                            <Link href={row.link} className="font-medium text-deep-blue hover:underline">
                              {report.groupBy === 'day' ? formatDate(row.label) : row.label}
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-900">{report.groupBy === 'day' ? formatDate(row.label) : row.label}</span>
                          )}
                          {row.detail && <span className="block text-xs text-gray-500">{row.detail}</span>}
                        </td>
                        {BOOKING_COLUMNS.map((column) => (
                          <td key={column.key} className="px-4 py-3 text-right whitespace-nowrap">
                            {show(row[column.key], column.money)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 font-semibold text-deep-blue">
                    <tr data-testid="report-totals">
                      <td className="px-4 py-3">Total</td>
                      {BOOKING_COLUMNS.map((column) => (
                        <td key={column.key} className="px-4 py-3 text-right whitespace-nowrap">
                          {show(report.totals[column.key], column.money)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <CheckPanel
            columns={BOOKING_COLUMNS}
            totals={report.totals}
            check={report.check}
            matches={report.matches}
            source="The right-hand figures are counted by the database from every booking record in the range, without grouping. Sold means confirmed or attended. Seats and value count sold bookings; cancelled bookings are counted separately."
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard label="Shows" value={count(report.totals.shows)} hint={`${count(report.totals.cancelledShows)} cancelled`} tone="gray" />
            <StatCard label="Total seats" value={count(report.totals.totalSeats)} />
            <StatCard label="Seats sold" value={count(report.totals.seatsSold)} />
            <StatCard label="Value at base price" value={formatMoney(report.totals.value)} />
          </div>
          <NoticeBar
            notice={{
              type: 'info',
              text: 'Cinema tickets are not sold through the apps or the website yet. Seats sold is the figure typed in for each show on the Cinema Shows screen, so there are no bookings, cancellations or check-ins for shows.',
            }}
          />
          <Card className="mb-4">
            {report.rows.length === 0 ? (
              <EmptyState title="No cinema shows fall in this range" hint="Shows are added on the Cinema Shows screen and are listed here by the day of the show." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="report-table">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-3 font-medium">Cinema show</th>
                      <th className="px-4 py-3 font-medium">Show time</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Total seats</th>
                      <th className="px-4 py-3 font-medium text-right">Seats sold</th>
                      <th className="px-4 py-3 font-medium text-right">Remaining</th>
                      <th className="px-4 py-3 font-medium text-right">Base price</th>
                      <th className="px-4 py-3 font-medium text-right">Value at base price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-3">
                          {row.link ? (
                            <Link href={row.link} className="font-medium text-deep-blue hover:underline">
                              {row.label}
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-900">{row.label}</span>
                          )}
                          <span className="block text-xs text-gray-500">{row.detail}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.showAt, true)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={SHOW_TONE[row.status] || 'gray'}>{row.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">{count(row.totalSeats)}</td>
                        <td className="px-4 py-3 text-right">{count(row.seatsSold)}</td>
                        <td className="px-4 py-3 text-right">{count(row.remaining)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.basePrice)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 font-semibold text-deep-blue">
                    <tr data-testid="report-totals">
                      <td className="px-4 py-3" colSpan={3}>
                        Total: {count(report.totals.shows)} {report.totals.shows === 1 ? 'show' : 'shows'}
                      </td>
                      <td className="px-4 py-3 text-right">{count(report.totals.totalSeats)}</td>
                      <td className="px-4 py-3 text-right">{count(report.totals.seatsSold)}</td>
                      <td className="px-4 py-3 text-right">{count(Math.max(0, report.totals.totalSeats - report.totals.seatsSold))}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">{formatMoney(report.totals.value)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
          <CheckPanel
            columns={SHOW_COLUMNS}
            totals={report.totals}
            check={report.check}
            matches={report.matches}
            source="The right-hand figures are counted by the database from every cinema show record in the range. Value is seats sold multiplied by the base price of the show."
          />
        </>
      )}
    </>
  )
}

export default function TicketingReportsPage() {
  return (
    <AdminShell title="Ticketing Reports" subtitle="Bookings, seats, value, cancellations and check-ins by venue, event, cinema show, location and day">
      <TicketingReports />
    </AdminShell>
  )
}
