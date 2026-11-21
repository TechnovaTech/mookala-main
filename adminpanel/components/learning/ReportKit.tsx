'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, EmptyState, api, inputClass } from '@/components/ui'

/**
 * Building blocks for the report screens of the learning, wishes, advertising
 * and membership modules: a date range bar, a report table with a CSV link,
 * and a hook that loads a report for the chosen range.
 */

/** `inputClass` without its full width (`w-auto` cannot override the `w-full` inside it). */
const autoWidthInput = inputClass.replace('w-full ', 'w-auto max-w-full ')

export interface Range {
  from: string
  to: string
}

export function rangeQuery(range: Range, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const text = params.toString()
  return text ? '?' + text : ''
}

/** Loads `url` with the applied date range and reloads when the range changes. */
export function useReport<T>(url: string) {
  const [draft, setDraft] = useState<Range>({ from: '', to: '' })
  const [range, setRange] = useState<Range>({ from: '', to: '' })
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api<T>(url + rangeQuery(range)))
    } catch (problem: any) {
      setError(problem.message || 'Could not load the report.')
    } finally {
      setLoading(false)
    }
  }, [url, range])

  useEffect(() => {
    load()
  }, [load])

  return { draft, setDraft, range, apply: () => setRange(draft), clear: () => { setDraft({ from: '', to: '' }); setRange({ from: '', to: '' }) }, data, loading, error, reload: load }
}

export function DateRangeBar({
  idPrefix,
  draft,
  onChange,
  onApply,
  onClear,
  note,
}: {
  idPrefix: string
  draft: Range
  onChange: (range: Range) => void
  onApply: () => void
  onClear: () => void
  /** Says which date the range is applied to. */
  note: string
}) {
  const invalid = Boolean(draft.from && draft.to && draft.from > draft.to)
  return (
    <Card className="p-4 mb-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!invalid) onApply()
        }}
      >
        <div>
          <label htmlFor={`${idPrefix}-from`} className="block text-xs font-medium text-gray-600 mb-1">
            From
          </label>
          <input
            id={`${idPrefix}-from`}
            type="date"
            value={draft.from}
            onChange={(e) => onChange({ ...draft, from: e.target.value })}
            className={autoWidthInput}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-to`} className="block text-xs font-medium text-gray-600 mb-1">
            To
          </label>
          <input
            id={`${idPrefix}-to`}
            type="date"
            value={draft.to}
            onChange={(e) => onChange({ ...draft, to: e.target.value })}
            className={autoWidthInput}
          />
        </div>
        <Button type="submit" disabled={invalid}>
          Apply
        </Button>
        <Button type="button" variant="secondary" onClick={onClear} disabled={!draft.from && !draft.to}>
          All dates
        </Button>
        <p className="text-xs text-gray-500 basis-full">
          {invalid ? <span className="text-red-600">The "From" date must be on or before the "To" date. </span> : null}
          {note}
        </p>
      </form>
    </Card>
  )
}

export function ExportLink({ href, label = 'Export CSV' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 whitespace-nowrap"
    >
      <Download size={15} />
      {label}
    </a>
  )
}

export interface Column<Row> {
  key: string
  label: string
  align?: 'right'
  render?: (row: Row) => React.ReactNode
}

export function ReportTable<Row extends Record<string, any>>({
  title,
  description,
  columns,
  rows,
  rowKey,
  emptyTitle,
  emptyHint,
  exportHref,
  exportLabel,
}: {
  title: string
  description?: string
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  emptyTitle: string
  emptyHint?: string
  exportHref?: string
  exportLabel?: string
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-200">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">{description}</p>}
        </div>
        {exportHref && rows.length > 0 && <ExportLink href={exportHref} label={exportLabel} />}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-4 py-3 font-medium whitespace-nowrap ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, index) => (
                <tr key={rowKey(row, index)} className="hover:bg-gray-50">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-gray-800 ${column.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}
                    >
                      {column.render ? column.render(row) : row[column.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** "42.5%" or a dash when there is nothing to divide by. */
export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`
}

export function formatCount(value: number | null | undefined): string {
  return (Number(value) || 0).toLocaleString('en-IN')
}
