'use client'
import React, { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { ExportLink } from '@/components/learning/ReportKit'
import { headRowClass } from '@/components/memberships/shared'

type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'datetime'
interface Column {
  key: string
  label: string
  type: ColumnType
}
interface Table {
  key: string
  title: string
  description: string
  columns: Column[]
  rows: Record<string, any>[]
  totals?: Record<string, any> | null
  emptyTitle: string
}
interface Check {
  label: string
  report: number
  independent: number
  source: string
  type: ColumnType
  match: boolean
}
interface Report {
  key: string
  name: string
  basis: string
  summary: { label: string; value: number | null; type: ColumnType }[]
  checks: Check[]
  tables: Table[]
  notes: string[]
  range: { from: string; to: string; label: string; days: number }
  timezone: string
  generatedAt: string
}

const REPORTS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'renewals', label: 'Renewals' },
  { key: 'expiries', label: 'Expiries' },
  { key: 'cancellations', label: 'Cancellations' },
]

const autoWidth = inputClass.replace('w-full ', 'w-auto max-w-full ')
const SCREEN_ROWS = 200

function todayInIndia(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function show(value: any, type: ColumnType): string {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'money') return formatMoney(value)
  if (type === 'percent') return `${value}%`
  if (type === 'number') return Number(value).toLocaleString('en-IN')
  if (type === 'datetime') return formatDate(value, true)
  return String(value)
}

export default function Page() {
  const [report, setReport] = useState('revenue')
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  // Starts on the current month, the same default range as the dashboard.
  useEffect(() => {
    const today = todayInIndia()
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('report')
    if (wanted && REPORTS.some((r) => r.key === wanted)) setReport(wanted)
    const first = { from: today.slice(0, 8) + '01', to: today }
    setDraft(first)
    setRange(first)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ report, from: range?.from || '', to: range?.to || '', ...extra })
      return '/api/admin/memberships/reports?' + params.toString()
    },
    [report, range]
  )

  useEffect(() => {
    if (!range) return
    let live = true
    setLoading(true)
    api<Report>(query())
      .then((result) => {
        if (!live) return
        setData(result)
        setNotice(null)
      })
      .catch((error: any) => {
        if (!live) return
        setData(null)
        setNotice({ type: 'error', text: error.message || 'Could not load the report.' })
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [query, range])

  const invalid = !draft.from || !draft.to || draft.from > draft.to

  return (
    <AdminShell title="Membership Reports" subtitle="Revenue, renewals, expiries and cancellations for a date range, each with a CSV export">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div role="tablist" aria-label="Report" className="flex flex-wrap gap-2 mb-4">
        {REPORTS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={report === item.key}
            data-report={item.key}
            onClick={() => setReport(item.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              report === item.key ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="p-4 mb-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!invalid) setRange({ ...draft })
          }}
        >
          <div>
            <label htmlFor="report-from" className="block text-xs font-medium text-gray-600 mb-1">
              From
            </label>
            <input id="report-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={autoWidth} />
          </div>
          <div>
            <label htmlFor="report-to" className="block text-xs font-medium text-gray-600 mb-1">
              To
            </label>
            <input id="report-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={autoWidth} />
          </div>
          <Button type="submit" disabled={invalid}>
            Apply
          </Button>
          <p className="text-xs text-gray-500 basis-full">
            {draft.from && draft.to && draft.from > draft.to ? <span className="text-red-600">The From date must be on or before the To date. </span> : null}
            Whole days in India time (Asia/Kolkata). Expiry and renewal reports may include future dates.
          </p>
        </form>
      </Card>

      {loading || !data ? (
        loading ? <Spinner /> : null
      ) : (
        <>
          <Card className="p-4 mb-4">
            <h2 className="text-base font-semibold text-deep-blue" data-report-name>
              {data.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5" data-report-range>
              {data.range.label} · {data.timezone} · generated {formatDate(data.generatedAt, true)}
            </p>
            <p className="text-sm text-gray-700 mt-2 max-w-4xl">{data.basis}</p>
            {data.notes.map((note) => (
              <p key={note} className="text-xs text-gray-500 mt-1 max-w-4xl">
                {note}
              </p>
            ))}
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4" data-summary>
            {data.summary.map((item) => (
              <StatCard key={item.label} label={item.label} value={show(item.value, item.type)} />
            ))}
          </div>

          <Card className="mb-6">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Checked against a second source</h2>
              <p className="text-xs text-gray-500 mt-0.5">Each figure of this report beside the same figure counted independently. A difference is shown, never hidden.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-checks>
                <thead>
                  <tr className={headRowClass}>
                    <th scope="col" className="px-4 py-3 font-medium">Figure</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">This report</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Independent count</th>
                    <th scope="col" className="px-4 py-3 font-medium">Counted from</th>
                    <th scope="col" className="px-4 py-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.checks.map((item) => (
                    <tr key={item.label}>
                      <td className="px-4 py-3 text-gray-900">{item.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{show(item.report, item.type)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{show(item.independent, item.type)}</td>
                      <td className="px-4 py-3 text-gray-600">{item.source}</td>
                      <td className="px-4 py-3">{item.match ? <Badge tone="green">Matches</Badge> : <Badge tone="red">Differs</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.tables.map((table) => (
            <Card key={table.key} className="mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-200">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-deep-blue">{table.title}</h2>
                  {table.description && <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">{table.description}</p>}
                </div>
                <ExportLink href={query({ export: 'csv', table: table.key })} label="Export CSV" />
              </div>
              {table.rows.length === 0 ? (
                <EmptyState title={table.emptyTitle} hint="The CSV export still states the report, the range and the timezone." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-table={table.key}>
                    <thead>
                      <tr className={headRowClass}>
                        {table.columns.map((column) => (
                          <th key={column.key} scope="col" className={`px-4 py-3 font-medium whitespace-nowrap ${column.type === 'text' || column.type === 'datetime' ? '' : 'text-right'}`}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {table.rows.slice(0, SCREEN_ROWS).map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          {table.columns.map((column) => (
                            <td key={column.key} className={`px-4 py-3 text-gray-800 ${column.type === 'text' || column.type === 'datetime' ? '' : 'text-right tabular-nums whitespace-nowrap'}`}>
                              {show(row[column.key], column.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {table.totals && (
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold text-gray-900">
                          {table.columns.map((column) => (
                            <td key={column.key} className={`px-4 py-3 ${column.type === 'text' || column.type === 'datetime' ? '' : 'text-right tabular-nums whitespace-nowrap'}`}>
                              {show(table.totals![column.key], column.type)}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
              {table.rows.length > SCREEN_ROWS && (
                <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
                  Showing the first {SCREEN_ROWS} of {table.rows.length} rows. The CSV export has all of them.
                </p>
              )}
            </Card>
          ))}
        </>
      )}
    </AdminShell>
  )
}
