'use client'
import React, { useState } from 'react'
import { Eye, Send } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, api, type Notice } from '@/components/ui'
import { RecordSelect, useRecords } from '@/components/platform/RecordSelect'

export interface AnnouncementPanelState {
  selected: string
  preview: any | null
  notice: Notice
}

export const EMPTY_ANNOUNCEMENT_PANEL: AnnouncementPanelState = { selected: '', preview: null, notice: null }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const CHANNEL_LABELS: Record<string, string> = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', push: 'Push' }

/** Preview and "Send now" for announcements. Shown above the list. */
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

  const announcement = records.find((r) => r._id === state.selected)
  const sendable = announcement && ['approved', 'scheduled', 'failed'].includes(announcement.status) && announcement.approvedBy

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
      const numbers = `This run: ${data.thisRun.accepted} accepted by a provider, ${data.thisRun.failed} refused, ${data.thisRun.notSent} not sent.`
      onState({
        ...state,
        notice:
          data.status === 'sent'
            ? { type: 'success', text: `Announcement sent. ${numbers}` }
            : data.status === 'approved'
            ? { type: 'info', text: `${data.reason} ${numbers}` }
            : { type: 'error', text: `The announcement is now marked Failed. ${data.reason}. ${numbers} Each attempt is in the delivery log.` },
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

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Preview and send</h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        An announcement is approved before it is sent, and uses an approved template on every channel. Approval needs the
        Communications approve permission; emergency announcements can only be approved by a Super Admin. Each &ldquo;Send now&rdquo;
        processes up to 200 recipients and writes one delivery log entry per recipient per channel. Nothing sends a scheduled
        announcement automatically yet.
      </p>
      <NoticeBar notice={state.notice} onClose={() => onState({ ...state, notice: null })} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <RecordSelect
          id="announcement-pick"
          label="Announcement"
          records={records}
          value={state.selected}
          onChange={(id) => onState({ selected: id, preview: null, notice: null })}
          onReload={reload}
          loading={loading}
          describe={(r) => `${r.title} (${STATUS_LABELS[r.status] || r.status}${r.priority === 'emergency' ? ', emergency' : ''})`}
          emptyText="No announcements yet"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={preview} disabled={!state.selected} loading={busy && !confirming}>
            <Eye size={16} />
            Preview
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
          &ldquo;Send now&rdquo; is available once this announcement is approved. It is currently{' '}
          {STATUS_LABELS[announcement.status] || announcement.status}.
        </p>
      )}

      {state.preview && (
        <div className="mt-5 space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Recipients matching the audience now</p>
            <p className="text-2xl font-bold text-deep-blue mt-1">{state.preview.audience.total}</p>
            <p className="text-sm text-gray-700 mt-1">
              {state.preview.audience.breakdown.map((part: any) => `${part.label}: ${part.count}`).join(' · ')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.preview.channels.map((entry: any) => (
              <div key={entry.channel} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-deep-blue">{CHANNEL_LABELS[entry.channel] || entry.channel}</p>
                  <Badge tone={entry.canSend && !entry.templateProblem ? 'green' : 'red'}>
                    {entry.canSend && !entry.templateProblem ? 'Can send' : 'Cannot send'}
                  </Badge>
                </div>
                {entry.templateProblem && <p className="text-sm text-red-700 mt-2">{entry.templateProblem}.</p>}
                {entry.problem && <p className="text-sm text-red-700 mt-2">Not connected: {entry.problem}.</p>}
                {entry.template && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    {entry.subject && <p className="text-sm font-semibold text-gray-900">{entry.subject}</p>}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.body}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Send this announcement now"
        message={
          <>
            <p>
              Send <strong>{announcement?.title}</strong> to its audience now?
            </p>
            <p className="mt-2">
              Messages only go out on channels with a connected provider. For every other channel each recipient is recorded as
              &ldquo;not sent&rdquo; in the delivery log. If no provider accepts any message, the announcement is marked Failed, not
              Sent.
            </p>
          </>
        }
        confirmLabel="Send now"
        busy={busy}
        onConfirm={send}
        onClose={() => setConfirming(false)}
      />
    </Card>
  )
}
