'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, XCircle } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { CASE_PRIORITIES, PRIORITY_ORDER, casePath } from '@/lib/resources/support'
import { CaseStatusBadge, EscalatedFlag, formatMinutes, hoursLabel } from './shared'

interface Figure {
  group: 'totals' | 'open_priority' | 'open_team' | 'sla' | 'time'
  key: string
  label: string
  value: number | null
  independent: number | null
  match: boolean
  unit?: 'cases' | 'minutes'
}

type Sla = Record<string, { responseHours: number | null; resolutionHours: number | null }>

interface Overview {
  range: { from: string | null; to: string | null; label: string; timezone: string; computedAt: string; capped: boolean }
  definitions: string[]
  figures: Figure[]
  allMatch: boolean
  sla: Sla
  slaConfigured: boolean
  slaUpdatedAt: string | null
  slaUpdatedBy: string | null
  disputes: { _id: string; bookingId: string | null; customerPhone: string; eventTitle: string; refundAmount: number; disputeReason: string; disputedAt: string | null; cases: { _id: string; kind: string; subject: string; status: string; escalated: boolean; priority: string }[] }[] | null
  pendingRatings: number
  canManage: boolean
}

const GROUPS: { key: Figure['group']; title: string }[] = [
  { key: 'totals', title: 'Cases' },
  { key: 'open_priority', title: 'Open cases by priority' },
  { key: 'open_team', title: 'Open cases by team' },
  { key: 'sla', title: 'SLA' },
  { key: 'time', title: 'Response and resolution time' },
]

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

function shift(day: string, days: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function show(f: Figure, value: number | null) {
  if (value === null) return '—'
  return f.unit === 'minutes' ? `${formatMinutes(value)} (${value} min)` : value.toLocaleString('en-IN')
}

/** A link to the cases behind a figure, when the list can show exactly them. */
function figureLink(f: Figure, kind: string): string | null {
  if (!kind) return null
  const base = casePath(kind)
  if (f.group === 'open_priority' && f.key !== 'open_other') return `${base}?status=active&priority=${f.key.replace('open_', '')}`
  if (f.group === 'open_team') return `${base}?status=active&team=${f.key.replace('team_', '')}`
  if (f.key === 'open') return `${base}?status=active`
  if (f.key === 'escalated_total') return `${base}?escalated=1`
  if (f.group === 'sla') return `${base}?sla=breached`
  return null
}

function SlaEditor({ sla, canManage, onSaved }: { sla: Sla; canManage: boolean; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, { responseHours: string; resolutionHours: string }>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  const loadHistory = useCallback(() => {
    api<any>('/api/admin/support/settings')
      .then((data) => setHistory(data.history || []))
      .catch(() => setHistory([]))
  }, [])
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const start = () => {
    setValues(
      Object.fromEntries(
        PRIORITY_ORDER.map((p) => [p, { responseHours: sla[p]?.responseHours?.toString() || '', resolutionHours: sla[p]?.resolutionHours?.toString() || '' }])
      )
    )
    setReason('')
    setError('')
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const body = {
        reason,
        sla: Object.fromEntries(
          PRIORITY_ORDER.map((p) => [p, { responseHours: values[p].responseHours.trim() || null, resolutionHours: values[p].resolutionHours.trim() || null }])
        ),
      }
      const data = await api<{ message: string }>('/api/admin/support/settings', { method: 'PUT', body })
      setEditing(false)
      loadHistory()
      onSaved(data.message)
    } catch (e: any) {
      setError(e.message || 'Could not save the targets.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <div id="sla" className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-semibold text-deep-blue">SLA targets</h2>
          <p className="text-xs text-gray-500">Hours from the moment a case is raised. Empty means no target for that priority.</p>
        </div>
        {canManage && !editing && (
          <Button variant="secondary" onClick={start}>
            Edit targets
          </Button>
        )}
      </div>
      <div className="p-5">
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
        <table className="w-full text-sm" data-testid="sla-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th scope="col" className="py-2 pr-4">Priority</th>
              <th scope="col" className="py-2 pr-4">Hours to first response</th>
              <th scope="col" className="py-2">Hours to resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CASE_PRIORITIES.map((p) => (
              <tr key={p.value}>
                <td className="py-2 pr-4"><Badge tone={p.tone}>{p.label}</Badge></td>
                {(['responseHours', 'resolutionHours'] as const).map((key) => (
                  <td key={key} className="py-2 pr-4">
                    {editing ? (
                      <input
                        id={`sla-${p.value}-${key}`}
                        aria-label={`${p.label}: ${key === 'responseHours' ? 'hours to first response' : 'hours to resolution'}`}
                        type="number"
                        min={0}
                        step="any"
                        value={values[p.value]?.[key] ?? ''}
                        onChange={(e) => setValues((cur) => ({ ...cur, [p.value]: { ...cur[p.value], [key]: e.target.value } }))}
                        className={inputClass.replace('w-full ', 'w-32 ')}
                        placeholder="No target"
                      />
                    ) : (
                      <span className={sla[p.value]?.[key] === null ? 'text-gray-400' : 'text-gray-900'}>
                        {sla[p.value]?.[key] === null ? 'No target' : `${sla[p.value][key]} h (${hoursLabel(sla[p.value][key])})`}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="sla-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason for the change <span className="text-red-600">*</span>
              </label>
              <input id="sla-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="At least 5 characters. Saved in the activity log." />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy} disabled={reason.trim().length < 5}>
                Save targets
              </Button>
            </div>
          </div>
        )}
        {history.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-deep-blue mb-2">Changes</h3>
            <ul className="space-y-1 text-sm" data-testid="sla-history">
              {history.map((h) => (
                <li key={h._id} className="border-l-2 border-gray-200 pl-3">
                  <span className="text-gray-800">
                    {h.adminName || h.adminEmail} changed{' '}
                    {Object.keys(h.after || {})
                      .map((p) =>
                        (['responseHours', 'resolutionHours'] as const)
                          .filter((key) => (h.before?.[p]?.[key] ?? null) !== (h.after[p]?.[key] ?? null))
                          .map((key) => `${p} ${key === 'responseHours' ? 'first response' : 'resolution'} ${hoursLabel(h.before?.[p]?.[key])} → ${hoursLabel(h.after[p]?.[key])}`)
                          .join(', ')
                      )
                      .filter(Boolean)
                      .join('; ')}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatDate(h.createdAt, true)} · Reason: {h.reason || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Support summary: open cases by priority and team, SLA breaches and average
 * response and resolution times for cases raised in a date range, each figure
 * next to an independent database count of the raw documents.
 */
export default function OverviewPage() {
  const [from, setFrom] = useState(shift(istToday(), -29))
  const [to, setTo] = useState(istToday())
  const [kind, setKind] = useState('')
  const [applied, setApplied] = useState({ from: shift(istToday(), -29), to: istToday(), kind: '' })
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const query = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    if (applied.from) p.set('from', applied.from)
    if (applied.to) p.set('to', applied.to)
    if (applied.kind) p.set('kind', applied.kind)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return p.toString()
  }, [applied])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<Overview>('/api/admin/support/overview?' + query()))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the summary.' })
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  const preset = (days: number | null) => {
    const today = istToday()
    const next = days === null ? { from: '', to: '', kind } : { from: shift(today, -(days - 1)), to: today, kind }
    setFrom(next.from)
    setTo(next.to)
    setApplied(next)
  }

  return (
    <AdminShell
      title="Support Overview"
      subtitle="Open cases, SLA breaches and response and resolution times, checked against the raw records"
      actions={
        <>
          <a href={'/api/admin/support/overview?' + query({ export: 'summary' })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50">
            <Download size={16} />
            Summary CSV
          </a>
          <a href={'/api/admin/support/cases?' + query({ export: 'csv' })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50">
            <Download size={16} />
            Cases CSV
          </a>
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="mb-6 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied({ from, to, kind })
          }}
        >
          <div>
            <label htmlFor="overview-from" className="block text-xs font-medium text-gray-600 mb-1">From (IST)</label>
            <input id="overview-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass.replace('w-full ', 'w-auto ')} />
          </div>
          <div>
            <label htmlFor="overview-to" className="block text-xs font-medium text-gray-600 mb-1">To (IST)</label>
            <input id="overview-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass.replace('w-full ', 'w-auto ')} />
          </div>
          <div>
            <label htmlFor="overview-kind" className="block text-xs font-medium text-gray-600 mb-1">Cases</label>
            <select id="overview-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass.replace('w-full ', 'w-auto ')}>
              <option value="">Complaints and tickets</option>
              <option value="complaint">Complaints</option>
              <option value="ticket">Tickets</option>
            </select>
          </div>
          <Button type="submit">Apply</Button>
          <div className="flex gap-2 text-sm">
            <button type="button" className="text-teal underline" onClick={() => preset(7)}>Last 7 days</button>
            <button type="button" className="text-teal underline" onClick={() => preset(30)}>Last 30 days</button>
            <button type="button" className="text-teal underline" onClick={() => preset(null)}>All time</button>
          </div>
        </form>
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : !data ? null : (
        <>
          <div className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm mb-6 ${data.allMatch ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`} role="status" data-testid="overview-check">
            {data.allMatch ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
            <span>
              {data.allMatch
                ? 'Every figure below equals the independent database count of the raw case records.'
                : 'At least one figure differs from the independent database count. The rows marked "Differs" need to be looked at.'}{' '}
              Cases raised: <strong>{data.range.label}</strong> · {data.range.timezone} · computed {formatDate(data.range.computedAt, true)}
              {data.range.capped ? ' · only the first 20,000 cases were read' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            {GROUPS.map((group) => (
              <Card key={group.key}>
                <h2 className="px-5 py-3 text-base font-semibold text-deep-blue border-b border-gray-200">{group.title}</h2>
                <table className="w-full text-sm" data-testid={`figures-${group.key}`}>
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="px-4 py-2 font-medium">Figure</th>
                      <th scope="col" className="px-4 py-2 font-medium">Shown</th>
                      <th scope="col" className="px-4 py-2 font-medium">Independent count</th>
                      <th scope="col" className="px-4 py-2 font-medium">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.figures.filter((f) => f.group === group.key).map((f) => {
                      const href = figureLink(f, applied.kind)
                      return (
                        <tr key={f.key} data-figure={f.key} data-value={f.value ?? ''} data-independent={f.independent ?? ''}>
                          <td className="px-4 py-2 text-gray-800">{href ? <Link href={href} className="text-teal underline">{f.label}</Link> : f.label}</td>
                          <td className="px-4 py-2 font-semibold text-deep-blue whitespace-nowrap">{show(f, f.value)}</td>
                          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{show(f, f.independent)}</td>
                          <td className="px-4 py-2">{f.match ? <Badge tone="green">Matches</Badge> : <Badge tone="red">Differs</Badge>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {group.key === 'sla' && !data.slaConfigured && <p className="px-5 py-3 text-xs text-gray-500">No SLA targets are set, so no case can be past target.</p>}
              </Card>
            ))}
            <Card className="p-5">
              <h2 className="text-base font-semibold text-deep-blue mb-2">How these are counted</h2>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {data.definitions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-700 mt-3">
                Ratings waiting for moderation:{' '}
                <Link href="/support/feedback?status=pending" className="text-teal underline">{data.pendingRatings}</Link>
              </p>
            </Card>
          </div>

          <SlaEditor sla={data.sla} canManage={data.canManage} onSaved={(message) => { setNotice({ type: 'success', text: message }); load() }} />

          <Card className="mb-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Refund disputes</h2>
              <p className="text-xs text-gray-500">Refunds Finance has marked as disputed, with the support cases about them (linked by refund or booking).</p>
            </div>
            {data.disputes === null ? (
              <EmptyState title="Refund details need the refunds permission." />
            ) : data.disputes.length === 0 ? (
              <EmptyState title="No refund is disputed right now." hint="Finance marks a refund as disputed on Finance → Refunds; it then appears here with its cases." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="refund-disputes">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className="px-4 py-2 font-medium">Refund</th>
                      <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                      <th scope="col" className="px-4 py-2 font-medium">Dispute</th>
                      <th scope="col" className="px-4 py-2 font-medium">Support cases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.disputes.map((d) => (
                      <tr key={d._id} className="align-top" data-refund={d._id}>
                        <td className="px-4 py-2">
                          <Link href={`/finance/refunds?open=${d._id}`} className="text-teal underline">{formatMoney(d.refundAmount)}</Link>
                          <div className="text-xs text-gray-500">{d.eventTitle || '—'}</div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{d.customerPhone || '—'}</td>
                        <td className="px-4 py-2 text-gray-700 max-w-xs">
                          {d.disputeReason || '—'}
                          <div className="text-xs text-gray-500">{formatDate(d.disputedAt, true)}</div>
                        </td>
                        <td className="px-4 py-2">
                          {d.cases.length === 0 ? (
                            <Link href={`/support/complaints?newRefund=${d._id}`} className="text-teal underline">No case yet: record a complaint</Link>
                          ) : (
                            <ul className="space-y-1">
                              {d.cases.map((c) => (
                                <li key={c._id} className="flex flex-wrap items-center gap-2">
                                  <Link href={`${casePath(c.kind)}?id=${c._id}`} className="text-teal underline">{c.subject || 'Case'}</Link>
                                  <CaseStatusBadge value={c.status} />
                                  <EscalatedFlag escalated={c.escalated} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </AdminShell>
  )
}
