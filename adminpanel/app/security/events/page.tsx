'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, ExportLink, Field, Pager, Th } from '@/components/security/shared'

interface EventRow {
  id: string
  type: string
  label: string
  severity: 'low' | 'medium' | 'high'
  adminEmail: string | null
  adminName: string | null
  actorEmail: string | null
  ip: string | null
  device: string
  userAgent: string
  detail: string
  meta: any
  emailAlerts: { to: string; status: string; error: string | null }[]
  emailOutcome: string
  acknowledged: boolean
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  acknowledgeNote: string | null
  createdAt: string
}

interface Data {
  events: EventRow[]
  total: number
  limit: number
  openHigh: number
  types: { value: string; label: string }[]
  canAcknowledge: boolean
}

const EMPTY = { severity: '', type: '', admin: '', ack: '', q: '', from: '', to: '' }
const TONE = { low: 'gray', medium: 'amber', high: 'red' } as const

/** Filters can be opened from a link, e.g. the header bell's /security/events?severity=high&ack=open. */
function initialFilters() {
  if (typeof window === 'undefined') return EMPTY
  const params = new URLSearchParams(window.location.search)
  const out = { ...EMPTY }
  for (const key of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) out[key] = params.get(key) || ''
  return out
}

function EventsBody() {
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState<typeof EMPTY | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [detail, setDetail] = useState<EventRow | null>(null)
  const [ackFor, setAckFor] = useState<EventRow | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const start = initialFilters()
    setDraft(start)
    setFilters(start)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries({ ...(filters || EMPTY), ...extra })) if (value) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    if (!filters) return
    setLoading(true)
    try {
      setData(await api<Data>('/api/admin/security/events?' + query({ page: String(page) })))
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [filters, query, page])

  useEffect(() => {
    load()
  }, [load])

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setFilters(draft)
  }

  const acknowledge = async () => {
    if (!ackFor) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>('/api/admin/security/events', { method: 'POST', body: { action: 'acknowledge', id: ackFor.id, note } })
      setNotice({ type: 'success', text: result.message })
      setAckFor(null)
      setDetail(null)
      await load()
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setAckFor(null)
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [key]: event.target.value })

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Security alerts are shown here and in the header bell (high-severity events that nobody has acknowledged, for Super Admins). Each event also tries to email the admin concerned and every active Super Admin; those emails start going out once an email provider is connected under Communications, Email, SMS, WhatsApp & Push. Until then each attempt is recorded as not sent.',
        }}
      />

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">High severity, not acknowledged</p>
            <p className="text-2xl font-bold text-deep-blue mt-1">{data.openHigh}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Email alerts</p>
            <p className="text-sm text-gray-700 mt-2">
              Delivery depends on the email channel.{' '}
              <Link href="/communications/channels" className="text-teal underline">Open channel settings</Link>
            </p>
          </Card>
        </div>
      )}

      <Card className="p-4 mb-4">
        <form onSubmit={apply}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Severity" htmlFor="ev-severity">
              <select id="ev-severity" value={draft.severity} onChange={set('severity')} className={inputClass}>
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Event" htmlFor="ev-type">
              <select id="ev-type" value={draft.type} onChange={set('type')} className={inputClass}>
                <option value="">All events</option>
                {(data?.types || []).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Admin" htmlFor="ev-admin">
              <input id="ev-admin" type="search" value={draft.admin} onChange={set('admin')} className={inputClass} placeholder="Name or email" />
            </Field>
            <Field label="Acknowledged" htmlFor="ev-ack">
              <select id="ev-ack" value={draft.ack} onChange={set('ack')} className={inputClass}>
                <option value="">All</option>
                <option value="open">Not acknowledged</option>
                <option value="acknowledged">Acknowledged</option>
              </select>
            </Field>
            <Field label="Search" htmlFor="ev-q">
              <input id="ev-q" type="search" value={draft.q} onChange={set('q')} className={inputClass} placeholder="Detail, IP or browser" />
            </Field>
            <Field label="From" htmlFor="ev-from">
              <input id="ev-from" type="date" value={draft.from} onChange={set('from')} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="ev-to">
              <input id="ev-to" type="date" value={draft.to} onChange={set('to')} className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Button type="submit">Apply filters</Button>
            <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(1) }}>
              Clear
            </Button>
            <span className="text-xs text-gray-500">Dates use India Standard Time (Asia/Kolkata).</span>
            <div className="ml-auto">
              <ExportLink href={'/api/admin/security/events?' + query({ format: 'csv' })} />
            </div>
          </div>
        </form>
      </Card>

      <Card>
        {!data && loading ? (
          <Spinner />
        ) : !data || data.events.length === 0 ? (
          <EmptyState
            title="No security events match"
            hint="Events are recorded automatically: sign-ins from a new device or IP address, repeated failed sign-ins and locks, sign-ins refused by the IP rule, 2FA and password changes, role, permission and account changes, ended sessions and security settings changes."
          />
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>Time</Th>
                  <Th>Severity</Th>
                  <Th>Event</Th>
                  <Th>Admin</Th>
                  <Th>IP address</Th>
                  <Th>Device</Th>
                  <Th>Email alert</Th>
                  <Th>Status</Th>
                  <Th right>Actions</Th>
                </>
              }
            >
              {data.events.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.createdAt, true)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[row.severity] || 'gray'}>{row.severity}</Badge></td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="block text-gray-800">{row.label}</span>
                    <span className="block text-xs text-gray-500 truncate" title={row.detail}>{row.detail}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-gray-800">{row.adminName || row.adminEmail || '—'}</span>
                    {row.adminName && row.adminEmail && <span className="block text-xs text-gray-500">{row.adminEmail}</span>}
                    {row.actorEmail && <span className="block text-xs text-gray-500">by {row.actorEmail}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{row.ip || '—'}</td>
                  <td className="px-4 py-3 text-gray-800" title={row.userAgent}>{row.device}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[12rem]">{row.emailOutcome}</td>
                  <td className="px-4 py-3">
                    {row.acknowledged ? (
                      <span className="text-xs text-gray-600">Acknowledged by {row.acknowledgedBy}</span>
                    ) : (
                      <Badge tone="amber">Open</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <Button variant="ghost" className="!px-2 !py-1" onClick={() => setDetail(row)} aria-label={`View details of ${row.label}`}>
                        View
                      </Button>
                      {data.canAcknowledge && !row.acknowledged && (
                        <Button variant="ghost" className="!px-2 !py-1" onClick={() => { setNote(''); setAckFor(row) }}>
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={Boolean(detail)} wide title={detail?.label || ''} onClose={() => setDetail(null)} footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Time', formatDate(detail.createdAt, true)],
                ['Severity', detail.severity],
                ['Admin', [detail.adminName, detail.adminEmail].filter(Boolean).join(' · ') || '—'],
                ['Caused by', detail.actorEmail || '—'],
                ['IP address', detail.ip || '—'],
                ['Device', detail.device],
                ['Acknowledged', detail.acknowledged ? `${detail.acknowledgedBy} on ${formatDate(detail.acknowledgedAt, true)}` : 'Not yet'],
                ['Note', detail.acknowledgeNote || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-gray-800 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">What happened</p>
              <p className="text-gray-800">{detail.detail}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Email alerts</p>
              {detail.emailAlerts.length === 0 ? (
                <p className="text-gray-600">No email was attempted for this event.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.emailAlerts.map((alert, index) => (
                    <li key={index} className="text-gray-700">
                      {alert.to}: <Badge tone={alert.status === 'accepted' || alert.status === 'sent' ? 'green' : alert.status === 'failed' ? 'red' : 'gray'}>{alert.status.replace(/_/g, ' ')}</Badge>
                      {alert.error && <span className="block text-xs text-gray-500">{alert.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {detail.userAgent && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Browser (user agent)</p>
                <p className="text-xs text-gray-600 break-all">{detail.userAgent}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(ackFor)}
        title="Acknowledge this event?"
        onClose={() => setAckFor(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAckFor(null)} disabled={busy}>Cancel</Button>
            <Button onClick={acknowledge} loading={busy}>Acknowledge</Button>
          </>
        }
      >
        {ackFor && (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              <strong>{ackFor.label}</strong> for {ackFor.adminEmail || 'an unknown account'} on {formatDate(ackFor.createdAt, true)}. Acknowledging records that a
              Super Admin has looked at it; the event itself is kept unchanged.
            </p>
            <Field label="Note (optional)" htmlFor="ev-ack-note" hint="Saved with the event and in the activity log.">
              <textarea id="ev-ack-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  )
}

export default function SecurityEventsPage() {
  return (
    <AdminShell title="Security Events" subtitle="New devices, refused and failed sign-ins, locks, 2FA, password, role and settings changes">
      <EventsBody />
    </AdminShell>
  )
}
