'use client'
import React, { useEffect, useMemo, useState } from 'react'
import AdminShell, { useAdmin } from '@/components/AdminShell'
import { Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatMoney, inputClass, type Notice } from '@/components/ui'
import OverviewRangeFilter, { rangeQuery, type RangeValue } from '@/components/finance/OverviewRangeFilter'
import ReportDefinitions from '@/components/finance/ReportDefinitions'
import { td, tdRight, th, thRight } from '@/components/finance/LedgerLabels'
import ReportExportBar from '@/components/reports/ReportExportBar'
import { can } from '@/lib/permissions'
import { DELIVERY_NOTE, REPORT_CATALOG, type ReportInfo } from '@/lib/resources/reports'

type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'datetime'

interface Report {
  key: string
  name: string
  rangeLabel: string
  timezone: string
  generatedAt: string
  columns: { key: string; label: string; type: ColumnType }[]
  rows: Record<string, any>[]
  totals: Record<string, any> | null
  summary: { label: string; value: number; type: ColumnType }[]
  notes: string[]
  counts: string
  header: { label: string; value: string }[]
  totalRows: number
}

function show(value: any, type: ColumnType): string {
  if (value === null || value === undefined || value === '') return type === 'text' || type === 'datetime' ? '' : '—'
  if (type === 'money') return typeof value === 'number' ? formatMoney(value) : String(value)
  if (type === 'percent') return typeof value === 'number' ? value + '%' : String(value)
  if (type === 'number') return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value)
  if (type === 'datetime') {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return String(value)
}

const GROUPS = Array.from(new Set(REPORT_CATALOG.map((report) => report.group)))

/** Lives inside AdminShell so it can read the signed-in admin's permissions. */
function ReportsBody() {
  const admin = useAdmin()
  const allowed = useMemo(
    () => (info: ReportInfo) => Boolean(admin) && info.permissions.every((permission) => can(admin, permission)),
    [admin]
  )

  const [type, setType] = useState('')
  const [range, setRange] = useState<RangeValue>({ preset: 'month', from: '', to: '' })
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  // Start on the first report this admin is allowed to run.
  useEffect(() => {
    if (!admin || type) return
    const first = REPORT_CATALOG.find(allowed)
    if (first) setType(first.key)
  }, [admin, type, allowed])

  const info = REPORT_CATALOG.find((item) => item.key === type)
  const permitted = info ? allowed(info) : false
  const query = `type=${encodeURIComponent(type)}&${rangeQuery(range)}`

  useEffect(() => {
    if (!info || !permitted) {
      setReport(null)
      return
    }
    let cancelled = false
    setLoading(true)
    api<{ report: Report }>('/api/admin/reports?' + query)
      .then((data) => {
        if (cancelled) return
        setReport(data.report)
        setNotice(null)
      })
      .catch((error: any) => {
        if (cancelled) return
        setReport(null)
        setNotice({ type: 'error', text: error.message || 'Could not build the report.' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, permitted])

  const noneAllowed = admin && !REPORT_CATALOG.some(allowed)

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text:
            'Every report can be exported as Excel (.xlsx), PDF or CSV. Each file starts with the report name, the date range, the timezone, what the report counts, and when and by whom it was generated. Every export and every download is recorded in the activity log. ' +
            DELIVERY_NOTE,
        }}
      />

      <Card className="p-4 mb-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="report-type" className="block text-sm font-medium text-gray-700 mb-1">
              Report
            </label>
            <select id="report-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {!type && <option value="">Choose a report</option>}
              {GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {REPORT_CATALOG.filter((item) => item.group === group).map((item) => (
                    <option key={item.key} value={item.key} disabled={!allowed(item)}>
                      {item.label}
                      {admin && !allowed(item) ? ' (no access)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 text-sm text-gray-600 md:pt-6">{info?.description}</div>
        </div>

        {info && !info.usesDateRange ? (
          <p className="text-sm text-gray-600">This report shows the position as at the time it is generated. A date range does not apply.</p>
        ) : (
          <OverviewRangeFilter value={range} onChange={setRange} disabled={loading} />
        )}

        {info && (
          <p className="text-sm text-gray-600" data-report-counts>
            <span className="font-medium text-gray-800">What this report counts:</span> {info.counts}
          </p>
        )}

        {info && permitted && (
          <>
            {report && (
              <p className="text-sm text-gray-600" data-report-range>
                {report.name}: <span className="font-medium text-gray-800">{report.rangeLabel}</span>, {report.timezone}.
                {report.header.map((line) => (
                  <span key={line.label}>
                    {' '}
                    {line.label}: <span className="font-medium text-gray-800">{line.value}</span>.
                  </span>
                ))}
              </p>
            )}
            <ReportExportBar query={query} disabled={loading} />
          </>
        )}
      </Card>

      {noneAllowed && (
        <Card>
          <EmptyState title="No reports are available to your role" hint="Each report needs access to the data it reads. Ask a Super Admin if you need a report." />
        </Card>
      )}
      {info && admin && !permitted && (
        <Card>
          <EmptyState title="You do not have access to this report" hint={`It needs these permissions: ${info.permissions.join(', ')}.`} />
        </Card>
      )}

      {loading && !report && <Spinner label="Building the report..." />}

      {report && permitted && (
        <div className={loading ? 'opacity-60' : ''}>
          {report.summary.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
              {report.summary.map((item) => (
                <StatCard key={item.label} label={item.label} value={show(item.value, item.type)} />
              ))}
            </div>
          )}

          <Card className="mb-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">{report.name}</h2>
              <p className="text-sm text-gray-500">
                {report.rows.length === report.totalRows
                  ? `${report.rows.length} rows`
                  : `Showing the first ${report.rows.length} of ${report.totalRows} rows. The total row covers every row; the Excel and CSV exports list them all.`}
              </p>
            </div>
            {report.rows.length === 0 ? (
              <EmptyState
                title="Nothing to report for this selection"
                hint="There are no source records for this report in the chosen date range. Financial reports fill in once payments are verified through the payment gateway and written to the ledger."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {report.columns.map((column) => (
                        <th key={column.key} className={column.type === 'text' || column.type === 'datetime' ? th : thRight}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.rows.map((row, index) => (
                      <tr key={index}>
                        {report.columns.map((column) => (
                          <td key={column.key} className={column.type === 'text' || column.type === 'datetime' ? td : tdRight}>
                            {show(row[column.key], column.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.totals && (
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        {report.columns.map((column) => (
                          <td key={column.key} className={column.type === 'text' || column.type === 'datetime' ? td : tdRight}>
                            {report.totals![column.key] === undefined ? '' : show(report.totals![column.key], column.type === 'datetime' ? 'text' : column.type)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {report.notes.length > 0 && (
              <ul className="px-5 py-3 border-t border-gray-200 text-xs text-gray-500 space-y-1 list-disc list-inside">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <ReportDefinitions rangeLabel={report?.rangeLabel} generatedAt={report?.generatedAt} counts={report?.counts} />
    </>
  )
}

export default function ReportsPage() {
  return (
    <AdminShell title="Reports" subtitle="Financial, GST, booking, customer and service reports with Excel, PDF and CSV export">
      <ReportsBody />
    </AdminShell>
  )
}
