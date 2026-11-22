'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, ListChecks, Send } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, api, formatDate, type Notice } from '@/components/ui'
import { RecordSelect, useRecords } from '@/components/platform/RecordSelect'
import type { Tone } from '@/lib/resource-types'

export interface AnnouncementPanelState {
  selected: string
  preview: any | null
  notice: Notice
  /** Delivery results of the selected announcement. Kept here so they survive the list reload after a send. */
  results: any | null
}

export const EMPTY_ANNOUNCEMENT_PANEL: AnnouncementPanelState = { selected: '', preview: null, notice: null, results: null }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const CHANNEL_LABELS: Record<string, string> = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', push: 'Push' }

export const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'gray' },
  accepted: { label: 'Sent (accepted)', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  read: { label: 'Read / opened', tone: 'purple' },
  failed: { label: 'Failed', tone: 'red' },
  not_sent: { label: 'Not sent', tone: 'amber' },
}

const RECIPIENT_TYPES: Record<string, string> = { user: 'Customer', artist: 'Artist', organizer: 'Organiser' }

/** Preview, "Send now" and per-recipient delivery results for announcements. Shown above the list. */
export default function AnnouncementActions({
  state,
  onState,
  onChanged,
}: {
  state: AnnouncementPanelState
  onState: (next: AnnouncementPanelState) => void
  onChanged: () => void
}) {
  const canManage = useCan('communications:manage')
  const { records, loading, reload } = useRecords('announcements')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const results = state.results
  const [resultsPage, setResultsPage] = useState(1)
  const [resultsFilter, setResultsFilter] = useState('')

  const announcement = records.find((r) => r._id === state.selected)
  const emergency = announcement?.priority === 'emergency'
  const scheduledLater = announcement?.status === 'scheduled' && announcement?.scheduledFor && new Date(announcement.scheduledFor) > new Date()
  const sendable =
    announcement && announcement.approvedBy && ['approved', 'scheduled', 'sending', 'failed'].includes(announcement.status) && (!scheduledLater || emergency)

  const fetchResults = (page: number, status: string) => {
    const query = new URLSearchParams({ page: String(page) })
    if (status) query.set('status', status)
    return api<any>(`/api/admin/communications/announcements/${state.selected}/results?${query}`)
  }

  const loadResults = async (page: number, status: string) => {
    if (!state.selected) return
    try {
      onState({ ...state, results: await fetchResults(page, status) })
    } catch (e: any) {
      onState({ ...state, results: null, notice: { type: 'error', text: e.message || 'Could not load the delivery results.' } })
    }
  }

  useEffect(() => {
    setResultsPage(1)
    setResultsFilter('')
  }, [state.selected])

  const preview = async () => {
    if (!state.selected) return
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/communications/announcements/${state.selected}/preview`)
      onState({ ...state, preview: data, notice: null })
    } catch (e: any) {
      onState({ ...state, preview: null, notice: { type: 'error', text: e.message || 'Could not build the preview.' } })
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/communications/announcements/${state.selected}/send`, { method: 'POST', body: {} })
      const numbers = `This run: ${data.processedThisRun} recipients, ${data.thisRun.accepted} messages accepted by a provider, ${data.thisRun.failed} refused, ${data.thisRun.notSent} not sent.`
      const fresh = await fetchResults(1, '').catch(() => null)
      setResultsPage(1)
      setResultsFilter('')
      onState({
        ...state,
        results: fresh,
        notice:
          data.status === 'sent'
            ? { type: 'success', text: `Announcement sent. ${numbers} Delivered and read statuses appear below as providers report them.` }
            : data.status === 'sending'
            ? { type: 'info', text: `${data.reason} ${numbers}` }
            : { type: 'error', text: `The announcement is marked ${STATUS_LABELS[data.status] || data.status}. ${data.reason}. ${numbers} Each attempt is in the delivery log.` },
      })
      setConfirming(false)
      await reload()
      onChanged()
    } catch (e: any) {
      onState({ ...state, notice: { type: 'error', text: e.message || 'Could not send the announcement.' } })
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  const p = state.preview
  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Preview, send and delivery results</h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        An announcement is approved by a different admin before it is sent (emergencies by a Super Admin), and every channel must use an approved
        template. &ldquo;Send now&rdquo; handles up to 200 recipients per run (1,000 for an emergency); the scheduler continues the rest every 15
        minutes and sends scheduled announcements when their time comes. Every message is written to the delivery log.
      </p>
      <NoticeBar notice={state.notice} onClose={() => onState({ ...state, notice: null })} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <RecordSelect
          id="announcement-pick"
          label="Announcement"
          records={records}
          value={state.selected}
          onChange={(id) => onState({ selected: id, preview: null, notice: null, results: null })}
          onReload={reload}
          loading={loading}
          describe={(r) => `${r.title} (${STATUS_LABELS[r.status] || r.status}${r.priority === 'emergency' ? ', emergency' : ''})`}
          emptyText="No announcements yet"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={preview} disabled={!state.selected} loading={busy && !confirming}>
            <Eye size={16} />
            Preview
          </Button>
          <Button variant="secondary" onClick={() => loadResults(1, resultsFilter)} disabled={!state.selected}>
            <ListChecks size={16} />
            Delivery results
          </Button>
          {canManage && (
            <Button onClick={() => setConfirming(true)} disabled={!sendable || busy}>
              <Send size={16} />
              Send now
            </Button>
          )}
        </div>
      </div>
      {announcement && !sendable && canManage && (
        <p className="text-xs text-gray-500 mt-2">
          {scheduledLater
            ? `Scheduled for ${formatDate(announcement.scheduledFor, true)}: the scheduler sends it then.`
            : `"Send now" is available once this announcement is approved. It is currently ${STATUS_LABELS[announcement.status] || announcement.status}.`}
        </p>
      )}
      {announcement && (announcement.recipientsProcessed > 0 || announcement.failureReason) && (
        <p className="text-xs text-gray-600 mt-2">
          Progress: {announcement.recipientsProcessed || 0} of {announcement.audienceCount ?? '?'} recipients processed.{' '}
          {announcement.failureReason ? `Last run: ${announcement.failureReason}` : ''}
        </p>
      )}

      {p && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Recipients matching the audience now</p>
              <p className="text-2xl font-bold text-deep-blue mt-1">{p.audience.total}</p>
              <p className="text-sm text-gray-700 mt-1">{p.audience.breakdown.map((part: any) => `${part.label}: ${part.count}`).join(' · ')}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Sample recipient used for the preview</p>
              {p.sample ? (
                <p className="text-sm text-gray-800 mt-1">
                  {p.sample.name || '(no name)'} · {RECIPIENT_TYPES[p.sample.type] || p.sample.type}
                  {p.sample.city ? ` · ${p.sample.city}` : ''}
                  <br />
                  <span className="text-gray-500">
                    Phone {p.sample.phone || 'none'} · Email {p.sample.email || 'none'}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">No account matches this audience, so nothing would be sent.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {p.channels.map((entry: any) => {
              const ready = entry.canSend && !entry.templateProblem
              return (
                <div key={entry.channel} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-deep-blue">{CHANNEL_LABELS[entry.channel] || entry.channel}</p>
                    <Badge tone={ready ? 'green' : 'red'}>{ready ? 'Can send' : 'Cannot send'}</Badge>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">
                    Reaches {entry.recipients} of {p.audience.total} recipients
                    {entry.channel === 'push' ? ` (${entry.devices ?? 0} registered devices)` : entry.channel === 'email' ? ' (with an email address)' : ' (with a phone number)'}
                    .
                  </p>
                  {entry.template && (
                    <p className="text-xs text-gray-500 mt-1">
                      Template &ldquo;{entry.template.name}&rdquo;, {String(entry.template.status).replace(/_/g, ' ')}
                      {entry.template.whatsappTemplateName ? `, Meta template ${entry.template.whatsappTemplateName}` : ''}
                      {entry.template.dltTemplateId ? `, DLT ${entry.template.dltTemplateId}` : ''}
                    </p>
                  )}
                  {entry.templateProblem && <p className="text-sm text-red-700 mt-2">{entry.templateProblem}.</p>}
                  {entry.problem && <p className="text-sm text-red-700 mt-2">Not connected: {entry.problem}.</p>}
                  {entry.missingForSample?.length > 0 && (
                    <p className="text-sm text-amber-800 mt-2">
                      The sample recipient has no value for {entry.missingForSample.join(', ')}: recipients like this are recorded as not sent.
                    </p>
                  )}
                  {entry.template && (
                    <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                      {entry.subject && <p className="text-sm font-semibold text-gray-900">{entry.subject}</p>}
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.body}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {results && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-deep-blue">Delivery results: {results.announcement.title}</h3>
            <Link href={`/communications/logs?campaign=${results.announcement.id}`} className="text-sm text-teal underline">
              Open in the delivery log
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(DELIVERY).map(([key, s]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const next = resultsFilter === key ? '' : key
                  setResultsFilter(next)
                  setResultsPage(1)
                  loadResults(1, next)
                }}
                className={`rounded-lg border px-3 py-1 text-xs ${resultsFilter === key ? 'border-teal bg-gray-100' : 'border-gray-200 bg-white'}`}
                aria-pressed={resultsFilter === key}
              >
                {s.label}: <strong>{results.counts[key] || 0}</strong>
              </button>
            ))}
          </div>
          {results.items.length === 0 ? (
            <p className="text-sm text-gray-500 mt-3">
              {resultsFilter ? 'No messages with this status.' : 'Nothing has been sent for this announcement yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-3 py-2 font-medium">Recipient</th>
                    <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                    <th scope="col" className="px-3 py-2 font-medium">To</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 font-medium">When</th>
                    <th scope="col" className="px-3 py-2 font-medium">Attempt</th>
                    <th scope="col" className="px-3 py-2 font-medium">Reason or reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.items.map((item: any) => (
                    <tr key={item._id}>
                      <td className="px-3 py-2 text-gray-800">
                        {item.recipient?.name || '(no name)'}
                        <span className="block text-xs text-gray-500">{RECIPIENT_TYPES[item.recipient?.type] || ''}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{CHANNEL_LABELS[item.channel] || item.channel}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[12rem] truncate" title={item.to}>
                        {item.channel === 'push' && item.to && !item.to.startsWith('account') ? `device …${item.to.slice(-8)}` : item.to || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={DELIVERY[item.status]?.tone || 'gray'}>{DELIVERY[item.status]?.label || item.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {item.readAt ? `Read ${formatDate(item.readAt, true)}` : item.deliveredAt ? `Delivered ${formatDate(item.deliveredAt, true)}` : item.failedAt ? `Failed ${formatDate(item.failedAt, true)}` : item.acceptedAt ? `Sent ${formatDate(item.acceptedAt, true)}` : formatDate(item.createdAt, true)}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.attempt || 1}
                        {item.retryLogId ? ' (retried)' : item.nextRetryAt ? ` (auto retry ${formatDate(item.nextRetryAt, true)})` : ''}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={item.error || item.providerMessageId || ''}>
                        {item.error || item.providerMessageId || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {results.total > results.pageSize && (
            <div className="flex items-center justify-end gap-2 mt-2 text-sm text-gray-600">
              <Button
                variant="secondary"
                disabled={resultsPage <= 1}
                onClick={() => {
                  setResultsPage(resultsPage - 1)
                  loadResults(resultsPage - 1, resultsFilter)
                }}
              >
                Previous
              </Button>
              <span>
                Page {resultsPage} of {Math.ceil(results.total / results.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={resultsPage >= Math.ceil(results.total / results.pageSize)}
                onClick={() => {
                  setResultsPage(resultsPage + 1)
                  loadResults(resultsPage + 1, resultsFilter)
                }}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={emergency ? 'Send this emergency announcement now' : 'Send this announcement now'}
        message={
          <>
            <p>
              Send <strong>{announcement?.title}</strong> to its audience now?
              {emergency && scheduledLater ? ' It is an emergency, so it goes out now even though a later time is scheduled.' : ''}
            </p>
            <p className="mt-2">
              Real messages go out on every channel whose provider is connected. On other channels each recipient is recorded as &ldquo;not sent&rdquo;
              in the delivery log. If no provider accepts any message, the announcement is marked Failed, not Sent.
            </p>
          </>
        }
        confirmLabel="Send now"
        danger={emergency}
        busy={busy}
        onConfirm={send}
        onClose={() => setConfirming(false)}
      />
    </Card>
  )
}
