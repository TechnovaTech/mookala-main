'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'
import { payeeTypeLabel, serviceLabel } from '@/components/finance/RulesShared'
import StatementServiceTable, { FIGURE_COLUMNS, FigureLink, entriesHref, type StatementFigures, type StatementServiceRow } from '@/components/finance/StatementServiceTable'
import StatementEntries from '@/components/finance/StatementEntries'

interface PayeeRow extends StatementFigures {
  payeeType: string
  payeeId: string
  payeeName: string | null
}

interface StatementData {
  period: { from: string | null; to: string | null; label: string; timezone: string }
  service: string | null
  generatedAt: string
  gstNumber: string | null
  gstLegalName: string | null
  gstTreatmentText: string
  services: StatementServiceRow[]
  payees: PayeeRow[]
  total: StatementFigures
  raw: StatementFigures
  matches: boolean
  differences: { figure: string; statement: number; raw: number }[]
  excluded: { status: string; count: number; amount: number }[]
  rawTruncated: boolean
}

interface Filters {
  from: string
  to: string
  service: string
}

/** Today's date in India, as YYYY-MM-DD. */
function indiaDay(offsetDays = 0): string {
  const now = new Date(Date.now() + 330 * 60000 + offsetDays * 86400000)
  return now.toISOString().slice(0, 10)
}

function monthRange(monthsBack: number): { from: string; to: string } {
  const today = indiaDay()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1 - monthsBack
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  const day = (d: Date) => d.toISOString().slice(0, 10)
  return { from: day(first), to: monthsBack === 0 ? today : day(last) }
}

const CHECK_ROWS: { key: keyof StatementFigures; label: string; count?: boolean }[] = [
  { key: 'entries', label: 'Ledger entries counted', count: true },
  { key: 'payments', label: 'Payments', count: true },
  { key: 'gross', label: 'Gross' },
  { key: 'commission', label: 'Commission' },
  { key: 'gstOnCommission', label: 'GST on commission' },
  { key: 'gatewayFees', label: 'Gateway fees' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'refundDeductions', label: 'Refund deductions kept' },
  { key: 'netPayable', label: 'Net payable to payees' },
  { key: 'netRevenue', label: 'Net revenue (gross less refunds)' },
  { key: 'gstOnSales', label: 'GST collected on sales' },
  { key: 'settled', label: 'Paid out in the period' },
]

function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
    >
      <Download size={16} />
      {children}
    </a>
  )
}

export default function StatementsPage() {
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState<Filters>({ from: '', to: '', service: '' })
  const [filters, setFilters] = useState<Filters>({ from: '', to: '', service: '' })
  const [drill, setDrill] = useState<{ type: string; payeeType: string; payeeId: string } | null>(null)
  const [data, setData] = useState<StatementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  // The period, service and the figure to open come from the address, so every figure on the
  // commission and settlement screens can link straight to its ledger entries.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hasPeriod = params.has('from') || params.has('to') || params.has('entries')
    const month = monthRange(0)
    const next = {
      from: hasPeriod ? params.get('from') || '' : month.from,
      to: hasPeriod ? params.get('to') || '' : month.to,
      service: params.get('service') || '',
    }
    setDraft(next)
    setFilters(next)
    if (params.get('entries') === '1') {
      setDrill({ type: params.get('type') || '', payeeType: params.get('payeeType') || '', payeeId: params.get('payeeId') || '' })
    }
    setReady(true)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.service) params.set('service', filters.service)
      for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    if (!ready) return
    setLoading(true)
    try {
      setData(await api<StatementData>('/api/admin/finance/statements?' + query()))
      setNotice(null)
    } catch (error: any) {
      setData(null)
      setNotice({ type: 'error', text: error.message || 'Could not build the statement.' })
    } finally {
      setLoading(false)
    }
  }, [ready, query])

  useEffect(() => {
    load()
  }, [load])

  const apply = (next: Filters) => {
    setDraft(next)
    setFilters(next)
    setDrill(null)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    apply(draft)
  }

  const csv = (kind: string, service?: string) => '/api/admin/finance/statements?' + query({ format: 'csv', kind, ...(service ? { service } : {}) })
  const from = filters.from || null
  const to = filters.to || null
  const hasEntries = Boolean(data && data.total.entries > 0)

  return (
    <AdminShell
      title="Statements"
      subtitle="Commission statements for each service and each payee, from the ledger"
      actions={
        hasEntries ? (
          <>
            <DownloadLink href={csv('services')}>By service (CSV)</DownloadLink>
            <DownloadLink href={csv('payees')}>By payee (CSV)</DownloadLink>
          </>
        ) : undefined
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="p-4 mb-4">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="st-from" className="block text-xs font-medium text-gray-600 mb-1">
              Period from
            </label>
            <input id="st-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="st-to" className="block text-xs font-medium text-gray-600 mb-1">
              Period to
            </label>
            <input id="st-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="st-service" className="block text-xs font-medium text-gray-600 mb-1">
              Service
            </label>
            <select id="st-service" value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value })} className={inputClass}>
              <option value="">All services</option>
              {FINANCE_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={loading && ready}>
            Show statement
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => apply({ ...draft, ...monthRange(0) })}>
              This month
            </Button>
            <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => apply({ ...draft, ...monthRange(1) })}>
              Last month
            </Button>
            <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => apply({ ...draft, from: '', to: '' })}>
              All time
            </Button>
          </div>
        </form>
        <p className="text-xs text-gray-500 mt-3">
          Whole days in India time (Asia/Kolkata), by the date each entry was written to the ledger. Only successful entries are
          counted.
        </p>
      </Card>

      {loading || !data ? (
        loading ? (
          <Spinner />
        ) : null
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-deep-blue">Commission statement: {data.period.label}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {data.service ? `${serviceLabel(data.service)} only. ` : ''}Time zone {data.period.timezone}. Generated{' '}
                  {formatDate(data.generatedAt, true)}.
                </p>
              </div>
              <div className="text-sm text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Platform GST number</p>
                {data.gstNumber ? (
                  <p className="font-mono font-semibold text-deep-blue" data-testid="statement-gstin">
                    {data.gstNumber}
                  </p>
                ) : (
                  <p>
                    <Badge tone="amber">Not configured</Badge>{' '}
                    <Link href="/finance/commissions#gst" className="text-deep-blue hover:underline">
                      Set it in Commission Settings
                    </Link>
                  </p>
                )}
                {data.gstLegalName && <p className="text-xs text-gray-500">{data.gstLegalName}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">{data.gstTreatmentText}</p>
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-lg font-semibold text-deep-blue">By service</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Commission, GST, gateway fees, refunds and refund deductions are separate ledger entries. Select a figure to see the
                entries that add up to it.
              </p>
            </div>
            {!hasEntries ? (
              <EmptyState
                title="The ledger has no successful entry in this period."
                hint="Entries are written when a customer payment is verified with the payment gateway, when a payment is recorded by the team, and when a refund or payout is made."
              />
            ) : (
              <>
                <StatementServiceTable rows={data.services} total={data.total} from={from} to={to} hideEmpty />
                <div className="px-5 py-4 border-t border-gray-200">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                    Download a service statement with every transaction
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.services
                      .filter((s) => s.entries > 0)
                      .map((s) => (
                        <DownloadLink key={s.service} href={csv('service', s.service)}>
                          {s.label}
                        </DownloadLink>
                      ))}
                  </div>
                </div>
              </>
            )}
          </Card>

          {hasEntries && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-deep-blue">Check against the raw ledger</h2>
                <span data-testid="statement-check">
                  {data.matches ? <Badge tone="green">The two totals are equal</Badge> : <Badge tone="red">The totals differ</Badge>}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                The statement totals are grouped by the database. The second column reads every ledger entry of the period one by one
                and adds it up separately. The two must be the same.
              </p>
              {data.rawTruncated && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                  The period holds too many entries to add up one by one. Choose a shorter period.
                </p>
              )}
              <div className="overflow-x-auto mt-3">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4 font-medium">Figure</th>
                      <th className="py-2 pr-4 font-medium text-right">Statement total</th>
                      <th className="py-2 pr-4 font-medium text-right">Sum of raw ledger entries</th>
                      <th className="py-2 font-medium text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHECK_ROWS.map((row) => {
                      const a = data.total[row.key]
                      const b = data.raw[row.key]
                      const gap = Math.round((a - b) * 100) / 100
                      const show = (value: number) => (row.count ? String(value) : formatMoney(value))
                      return (
                        <tr key={row.key} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-4 text-gray-700">{row.label}</td>
                          <td className="py-1.5 pr-4 text-right whitespace-nowrap">{show(a)}</td>
                          <td className="py-1.5 pr-4 text-right whitespace-nowrap">{show(b)}</td>
                          <td className={`py-1.5 text-right whitespace-nowrap ${gap === 0 ? 'text-gray-500' : 'text-red-700 font-semibold'}`}>
                            {gap === 0 ? 'none' : show(gap)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {data.excluded.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  Not counted in this period:{' '}
                  {data.excluded.map((e) => `${e.count} ${e.status} ${e.count === 1 ? 'entry' : 'entries'} (${formatMoney(e.amount)})`).join(', ')}.
                </p>
              )}
            </Card>
          )}

          {hasEntries && (
            <Card>
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-lg font-semibold text-deep-blue">By payee</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Organisers, artists, instructors and cinemas with ledger entries in this period. Sales the platform makes for itself
                  have no payee and are not listed.
                </p>
              </div>
              {data.payees.length === 0 ? (
                <EmptyState title="No payee has a ledger entry in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                        <th className="px-4 py-3 font-medium">Payee</th>
                        <th className="px-4 py-3 font-medium text-right">Payments</th>
                        {FIGURE_COLUMNS.map((c) => (
                          <th key={c.key} className="px-4 py-3 font-medium text-right whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Net payable</th>
                        <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Paid out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payees.map((p) => {
                        const name = p.payeeName || p.payeeId
                        const link = (type?: string) => entriesHref({ service: filters.service, type, from, to, payeeType: p.payeeType, payeeId: p.payeeId })
                        return (
                          <tr key={`${p.payeeType}:${p.payeeId}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className="font-medium text-gray-900">{name}</span>
                              <span className="block text-xs text-gray-500">{payeeTypeLabel(p.payeeType)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">{p.payments}</td>
                            {FIGURE_COLUMNS.map((c) => (
                              <td key={c.key} className="px-4 py-3 text-right whitespace-nowrap">
                                <FigureLink value={p[c.key]} href={link(c.type)} label={`${c.label} for ${name}: open the ledger entries`} />
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <FigureLink strong value={p.netPayable} href={link()} label={`Net payable to ${name}: open the ledger entries`} />
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <FigureLink value={p.settled} href={link('settlement')} label={`Paid out to ${name}: open the ledger entries`} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {drill && <StatementEntries from={from} to={to} service={filters.service} type={drill.type} payeeType={drill.payeeType} payeeId={drill.payeeId} />}
        </div>
      )}
    </AdminShell>
  )
}
