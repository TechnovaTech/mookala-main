'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download, Eye, RotateCcw } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DELIVERY } from '@/components/communications/AnnouncementActions'

type Entry = Record<string, any>

const CHANNELS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
]

const KINDS = [
  { value: 'message', label: 'Messages' },
  { value: 'otp', label: 'One-time passwords' },
  { value: 'test', label: 'Test messages' },
  { value: 'campaign', label: 'Campaign summaries' },
]

const RETRY_FILTERS = [
  { value: 'retried', label: 'Retried entries' },
  { value: 'attempts', label: 'Second and later attempts' },
  { value: 'scheduled', label: 'Waiting for an automatic retry' },
]

const EVENT_SOURCES: Record<string, string> = { system: 'Mookalaa', provider: 'Provider answer', webhook: 'Provider receipt', admin: 'Admin', scheduler: 'Scheduler' }

const EMPTY_FILTERS = { channel: '', status: '', template: '', campaign: '', kind: '', retry: '', from: '', to: '', q: '' }

const channelLabel = (value: string) => CHANNELS.find((c) => c.value === value)?.label || value
const shortTo = (entry: Entry) => (entry.channel === 'push' && entry.to && !String(entry.to).startsWith('account') ? `device …${String(entry.to).slice(-8)}` : entry.to || '—')

export default function Page() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [viewing, setViewing] = useState<{ item: Entry; attempts: Entry[] } | null>(null)
  const [retrying, setRetrying] = useState<Entry | null>(null)
  const [busy, setBusy] = useState(false)
  const limit = 25

  // ?campaign= (from an announcement's results) opens the log already filtered.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const campaign = params.get('campaign')
    if (campaign) setFilters((f) => ({ ...f, campaign }))
    setReady(true)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<any>('/api/admin/communications/logs?' + query({ page: String(page), limit: String(limit) })))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the delivery log.' })
    } finally {
      setLoading(false)
    }
  }, [query, page])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load, ready])

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  const open = async (id: string) => {
    try {
      const detail = await api<any>(`/api/admin/communications/logs/${id}`)
      setViewing({ item: detail.item, attempts: detail.attempts || [] })
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not open the entry.' })
    }
  }

  const retry = async (reason: string) => {
    if (!retrying) return
    setBusy(true)
    try {
      const result = await api<any>(`/api/admin/communications/logs/${retrying._id}/retry`, { method: 'POST', body: { reason } })
      setNotice(
        result.status === 'accepted'
          ? { type: 'success', text: 'The provider accepted the message on this attempt. It is recorded as a new entry with the next attempt number.' }
          : { type: 'error', text: `The retry was ${result.status === 'failed' ? 'refused by the provider' : 'not sent'}: ${result.error}. It is recorded as a new entry.` }
      )
      setRetrying(null)
      await load()
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not retry the message.' })
      setRetrying(null)
    } finally {
      setBusy(false)
    }
  }

  const items: Entry[] = data?.items || []
  const total: number = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / limit))
  const counts = data?.counts || {}
  const canManage = Boolean(data?.canManage)
  const filtered = Object.values(filters).some(Boolean)
  const canRetry = (entry: Entry) =>
    canManage &&
    ['failed', 'not_sent'].includes(entry.status) &&
    !['otp', 'campaign', 'test'].includes(entry.kind) &&
    (entry.templateKey || entry.channel === 'push') &&
    !(entry.channel === 'push' && String(entry.to || '').startsWith('account')) &&
    !entry.retryLogId &&
    !entry.deviceTokenInvalid

  return (
    <AdminShell
      title="Delivery Logs"
      subtitle="Every SMS, email, WhatsApp message and push notification: queued, sent, delivered, read, failed and retried"
      actions={
        <a
          href={'/api/admin/communications/logs?' + query({ export: 'csv' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <Download size={16} />
          Export CSV
        </a>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: '"Sent" means the provider accepted the message. "Delivered", "Read / opened" and later "Failed" come from the provider\'s own delivery receipts (SendGrid, Resend and WhatsApp webhooks); push (FCM) and 2Factor OTP send no receipts, so those stay at Sent. "Not sent" means nothing was handed to a provider, with the reason. Temporary provider errors are retried automatically by the scheduler, up to 3 attempts.',
        }}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {Object.entries(DELIVERY).map(([key, s]) => (
          <StatCard key={key} label={s.label} value={counts[key] ?? 0} />
        ))}
        <StatCard label="Retried" value={data?.retried ?? 0} />
        <StatCard label="Automatic retry pending" value={data?.retryScheduled ?? 0} />
      </div>

      <Card>
        <div className="p-4 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="log-q" className="block text-xs font-medium text-gray-600 mb-1">Recipient or reference</label>
            <input id="log-q" type="search" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} className={inputClass} placeholder="Phone, email, name or provider reference" />
          </div>
          <div>
            <label htmlFor="log-channel" className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
            <select id="log-channel" value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)} className={inputClass}>
              <option value="">All channels</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-status" className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select id="log-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={inputClass}>
              <option value="">All statuses</option>
              {Object.entries(DELIVERY).map(([value, s]) => (
                <option key={value} value={value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-retry" className="block text-xs font-medium text-gray-600 mb-1">Retries</label>
            <select id="log-retry" value={filters.retry} onChange={(e) => setFilter('retry', e.target.value)} className={inputClass}>
              <option value="">All entries</option>
              {RETRY_FILTERS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-template" className="block text-xs font-medium text-gray-600 mb-1">Template</label>
            <select id="log-template" value={filters.template} onChange={(e) => setFilter('template', e.target.value)} className={inputClass}>
              <option value="">All templates</option>
              {(data?.templates || []).map((key: string) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-campaign" className="block text-xs font-medium text-gray-600 mb-1">Campaign or announcement</label>
            <select id="log-campaign" value={filters.campaign} onChange={(e) => setFilter('campaign', e.target.value)} className={inputClass}>
              <option value="">All</option>
              {filters.campaign && !(data?.campaigns || []).some((c: any) => c.id === filters.campaign) && (
                <option value={filters.campaign}>Selected campaign</option>
              )}
              {(data?.campaigns || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.type === 'announcement' ? 'announcement' : 'push campaign'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-kind" className="block text-xs font-medium text-gray-600 mb-1">Kind</label>
            <select id="log-kind" value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)} className={inputClass}>
              <option value="">All kinds</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="log-from" className="block text-xs font-medium text-gray-600 mb-1">From date</label>
              <input id="log-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="log-to" className="block text-xs font-medium text-gray-600 mb-1">To date</label>
              <input id="log-to" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }} disabled={!filtered}>
              Clear filters
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No entries match these filters.' : 'Nothing has been sent or attempted yet.'}
            hint={
              filtered
                ? 'Clear the filters to see everything.'
                : 'Entries appear when a one-time password is requested, an announcement, reminder or push campaign is sent, a security alert is emailed, or a test is sent from Channels & Providers.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-4 py-3 font-medium">Time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Channel</th>
                  <th scope="col" className="px-4 py-3 font-medium">To</th>
                  <th scope="col" className="px-4 py-3 font-medium">Template</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reason or provider reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Attempt</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((entry) => (
                  <tr key={entry._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                    <td className="px-4 py-3 text-gray-800">{channelLabel(entry.channel)}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[14rem] truncate" title={entry.to}>
                      {shortTo(entry)}
                      {entry.recipient?.name && <span className="block text-xs text-gray-500">{entry.recipient.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{entry.templateKey || (entry.kind === 'test' ? 'test' : '—')}</td>
                    <td className="px-4 py-3">
                      <Badge tone={DELIVERY[entry.status]?.tone || 'gray'}>{DELIVERY[entry.status]?.label || entry.status}</Badge>
                      {entry.deliveredAt && entry.status !== 'delivered' && (
                        <span className="block text-xs text-gray-500 mt-1">delivered {formatDate(entry.deliveredAt, true)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={entry.error || entry.providerMessageId || ''}>
                      {entry.error || entry.providerMessageId || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {entry.attempt || 1}
                      {entry.retryLogId ? ` → retried (${entry.retryMode || 'manual'})` : ''}
                      {!entry.retryLogId && entry.nextRetryAt ? (
                        <span className="block text-xs text-gray-500">auto retry {formatDate(entry.nextRetryAt, true)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => open(entry._id)} aria-label="View entry" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                          <Eye size={16} />
                        </button>
                        {canRetry(entry) && (
                          <button onClick={() => setRetrying(entry)} aria-label="Retry this message" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={Boolean(viewing)} wide title="Delivery log entry" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Queued or recorded', formatDate(viewing.item.createdAt, true)],
                ['Channel', channelLabel(viewing.item.channel)],
                ['To', viewing.item.channel === 'push' ? shortTo(viewing.item) : viewing.item.to || '—'],
                ['Recipient', viewing.item.recipient?.name ? `${viewing.item.recipient.name} (${viewing.item.recipient.type})` : '—'],
                ['Status', DELIVERY[viewing.item.status]?.label || viewing.item.status],
                ['Provider', viewing.item.provider || '—'],
                ['Provider reference', viewing.item.providerMessageId || '—'],
                ['Last provider event', viewing.item.providerStatus || '—'],
                ['Sent (accepted)', formatDate(viewing.item.acceptedAt, true)],
                ['Delivered', formatDate(viewing.item.deliveredAt, true)],
                ['Read / opened', formatDate(viewing.item.readAt, true)],
                ['Failed', formatDate(viewing.item.failedAt, true)],
                ['Template', viewing.item.templateKey || '—'],
                ['Attempt', String(viewing.item.attempt || 1)],
                ['Automatic retry at', viewing.item.retryLogId ? 'retried' : formatDate(viewing.item.nextRetryAt, true)],
                ['Requested by', viewing.item.requestedBy || '—'],
                ['Part of', viewing.item.campaignType ? `${viewing.item.campaignType} ${viewing.item.campaignId}` : 'A single message'],
                ['Bulk / emergency', `${viewing.item.bulk ? 'bulk' : 'single'}${viewing.item.emergency ? ', emergency' : ''}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-gray-900 break-words">{value}</dd>
                </div>
              ))}
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">Reason</dt>
                <dd className="text-gray-900 break-words">{viewing.item.error || '—'}</dd>
              </div>
              {viewing.item.subject && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Subject or title</dt>
                  <dd className="text-gray-900 break-words">{viewing.item.subject}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">Message</dt>
                <dd className="text-gray-900 whitespace-pre-wrap break-words">{viewing.item.body || '—'}</dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">History</h3>
              {(viewing.item.events || []).length === 0 ? (
                <p className="text-gray-500">This entry was recorded before history was kept.</p>
              ) : (
                <ol className="space-y-2">
                  {(viewing.item.events || []).map((event: any, index: number) => (
                    <li key={index} className="flex flex-wrap items-start gap-2">
                      <span className="text-xs text-gray-500 w-36 shrink-0">{formatDate(event.at, true)}</span>
                      <Badge tone={DELIVERY[event.status]?.tone || 'gray'}>{DELIVERY[event.status]?.label || event.status}</Badge>
                      <span className="text-xs text-gray-600">
                        {EVENT_SOURCES[event.source] || event.source}
                        {event.providerEvent ? ` "${event.providerEvent}"` : ''}
                        {event.detail ? `: ${event.detail}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {viewing.attempts.length > 1 && (
              <div>
                <h3 className="text-sm font-semibold text-deep-blue mb-2">Every attempt of this message</h3>
                <ul className="space-y-1">
                  {viewing.attempts.map((attempt) => (
                    <li key={attempt._id} className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`text-sm underline ${attempt._id === viewing.item._id ? 'font-semibold text-deep-blue' : 'text-teal'}`}
                        onClick={() => open(attempt._id)}
                      >
                        Attempt {attempt.attempt || 1}
                      </button>
                      <Badge tone={DELIVERY[attempt.status]?.tone || 'gray'}>{DELIVERY[attempt.status]?.label || attempt.status}</Badge>
                      <span className="text-xs text-gray-600">
                        {formatDate(attempt.createdAt, true)}
                        {attempt.retryMode ? `, retried ${attempt.retryMode === 'automatic' ? 'automatically' : 'by an admin'}` : ''}
                        {attempt.error ? `: ${attempt.error}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(retrying)}
        title="Retry this message"
        message={
          retrying ? (
            <>
              Try again to send the <strong>{retrying.templateKey || 'push'}</strong> message to <strong>{shortTo(retrying)}</strong> by{' '}
              {channelLabel(retrying.channel)}? This is attempt {(retrying.attempt || 1) + 1}, recorded as its own entry. If the channel is still
              not connected it will again be recorded as not sent.
            </>
          ) : null
        }
        confirmLabel="Retry"
        askReason
        busy={busy}
        onConfirm={retry}
        onClose={() => setRetrying(null)}
      />
    </AdminShell>
  )
}
