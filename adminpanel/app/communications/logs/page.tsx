'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download, Eye, RotateCcw } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

type Entry = Record<string, any>

const STATUS: Record<string, { label: string; tone: Tone }> = {
  accepted: { label: 'Accepted by provider', tone: 'green' },
  failed: { label: 'Refused by provider', tone: 'red' },
  not_sent: { label: 'Not sent', tone: 'amber' },
}

const CHANNELS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
]

const EMPTY_FILTERS = { channel: '', status: '', template: '', campaign: '', from: '', to: '', q: '' }

export default function Page() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [viewing, setViewing] = useState<Entry | null>(null)
  const [retrying, setRetrying] = useState<Entry | null>(null)
  const [busy, setBusy] = useState(false)
  const limit = 25

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
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters({ ...filters, [key]: value })
    setPage(1)
  }

  const retry = async () => {
    if (!retrying) return
    setBusy(true)
    try {
      const result = await api<any>(`/api/admin/communications/logs/${retrying._id}/retry`, { method: 'POST', body: {} })
      setNotice(
        result.status === 'accepted'
          ? { type: 'success', text: 'The provider accepted the message on this attempt.' }
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
  const counts = data?.counts || { accepted: 0, failed: 0, not_sent: 0 }
  const canManage = Boolean(data?.canManage)
  const filtered = Object.values(filters).some(Boolean)
  const canRetry = (entry: Entry) =>
    canManage && entry.status !== 'accepted' && entry.kind !== 'otp' && entry.kind !== 'campaign' && entry.templateKey && !entry.retryLogId

  return (
    <AdminShell
      title="Delivery Logs"
      subtitle="Every attempt to send an SMS, email, WhatsApp message or push notification, and what happened to it"
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
          text: 'The best status available is "Accepted by provider". Showing a message as delivered needs delivery receipts from the provider, which are not connected, so no entry here says "delivered". "Not sent" means nothing was handed to a provider: the reason is shown on each entry.',
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatCard label="Accepted by provider" value={counts.accepted} />
        <StatCard label="Refused by provider" value={counts.failed} />
        <StatCard label="Not sent" value={counts.not_sent} />
      </div>

      <Card>
        <div className="p-4 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="log-q" className="block text-xs font-medium text-gray-600 mb-1">Recipient</label>
            <input id="log-q" type="search" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} className={inputClass} placeholder="Phone or email" />
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
              {Object.entries(STATUS).map(([value, s]) => (
                <option key={value} value={value}>{s.label}</option>
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
              {(data?.campaigns || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.type === 'announcement' ? 'announcement' : 'push campaign'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-from" className="block text-xs font-medium text-gray-600 mb-1">From date</label>
            <input id="log-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="log-to" className="block text-xs font-medium text-gray-600 mb-1">To date</label>
            <input id="log-to" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} />
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
                : 'Entries appear here when a one-time password is requested through 2Factor, when an announcement or push campaign is sent, or when a test SMS is sent from Channels & Providers.'
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
                    <td className="px-4 py-3 text-gray-800">{CHANNELS.find((c) => c.value === entry.channel)?.label || entry.channel}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[14rem] truncate">{entry.to || '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{entry.templateKey || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS[entry.status]?.tone || 'gray'}>{STATUS[entry.status]?.label || entry.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={entry.error || entry.providerMessageId || ''}>
                      {entry.error || entry.providerMessageId || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {entry.attempt || 1}
                      {entry.retryLogId ? ' (retried)' : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewing(entry)} aria-label="View entry" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
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
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['Time', formatDate(viewing.createdAt, true)],
              ['Channel', CHANNELS.find((c) => c.value === viewing.channel)?.label || viewing.channel],
              ['To', viewing.to || '—'],
              ['Status', STATUS[viewing.status]?.label || viewing.status],
              ['Provider', viewing.provider || '—'],
              ['Provider reference', viewing.providerMessageId || '—'],
              ['Template', viewing.templateKey || '—'],
              ['Attempt', String(viewing.attempt || 1)],
              ['Requested by', viewing.requestedBy || '—'],
              ['Part of', viewing.campaignType ? `${viewing.campaignType} ${viewing.campaignId}` : 'A single message'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                <dd className="text-gray-900 break-words">{value}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Reason</dt>
              <dd className="text-gray-900 break-words">{viewing.error || '—'}</dd>
            </div>
            {viewing.subject && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">Subject</dt>
                <dd className="text-gray-900 break-words">{viewing.subject}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Message</dt>
              <dd className="text-gray-900 whitespace-pre-wrap break-words">{viewing.body || '—'}</dd>
            </div>
          </dl>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(retrying)}
        title="Retry this message"
        message={
          retrying ? (
            <>
              Try again to send the <strong>{retrying.templateKey}</strong> message to <strong>{retrying.to || 'this recipient'}</strong> by{' '}
              {CHANNELS.find((c) => c.value === retrying.channel)?.label || retrying.channel}? The new attempt is recorded as its own entry. If
              the channel is still not connected it will again be recorded as not sent.
            </>
          ) : null
        }
        confirmLabel="Retry"
        busy={busy}
        onConfirm={retry}
        onClose={() => setRetrying(null)}
      />
    </AdminShell>
  )
}
