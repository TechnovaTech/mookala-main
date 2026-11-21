'use client'
import React, { useState } from 'react'
import { Send, Users } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, NoticeBar, api, type Notice } from '@/components/ui'
import { RecordSelect, useRecords } from '@/components/platform/RecordSelect'

export interface CampaignPanelState {
  selected: string
  preview: any | null
  notice: Notice
}

export const EMPTY_CAMPAIGN_PANEL: CampaignPanelState = { selected: '', preview: null, notice: null }

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

/**
 * Audience preview and "Send now" for push campaigns. Shown above the list.
 * The state lives in the page so it survives the list being reloaded.
 */
export default function CampaignActions({
  state,
  onState,
  onChanged,
}: {
  state: CampaignPanelState
  onState: (next: CampaignPanelState) => void
  /** Called after a send attempt so the page can reload the list. */
  onChanged: () => void
}) {
  const canManage = useCan('marketing:manage')
  const { records, loading, reload } = useRecords('push-campaigns')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const campaign = records.find((r) => r._id === state.selected)
  const sendable = campaign && ['approved', 'scheduled', 'failed'].includes(campaign.status) && campaign.approvedBy

  const preview = async () => {
    if (!state.selected) return
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/marketing/push-campaigns/${state.selected}/audience`)
      onState({ ...state, preview: data, notice: null })
    } catch (e: any) {
      onState({ ...state, preview: null, notice: { type: 'error', text: e.message || 'Could not work out the audience.' } })
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/marketing/push-campaigns/${state.selected}/send`, { method: 'POST', body: {} })
      onState({
        ...state,
        notice: data.sent
          ? { type: 'success', text: `Accepted by the provider for ${data.accepted} of ${data.audience.total} accounts.` }
          : { type: 'error', text: `The campaign was not sent and is now marked Failed. ${data.reason}. ${data.audience.total} accounts matched the audience.` },
      })
      setConfirming(false)
      await reload()
      onChanged()
    } catch (e: any) {
      onState({ ...state, notice: { type: 'error', text: e.message || 'Could not send the campaign.' } })
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Preview audience and send</h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        A campaign must be approved before it can be scheduled or sent. Approval needs the Marketing approve permission, which only a
        Super Admin holds today. Nothing sends a scheduled campaign automatically yet: an admin presses &ldquo;Send now&rdquo; at or
        after the scheduled time.
      </p>
      <NoticeBar notice={state.notice} onClose={() => onState({ ...state, notice: null })} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <RecordSelect
          id="push-campaign-pick"
          label="Campaign"
          records={records}
          value={state.selected}
          onChange={(id) => onState({ selected: id, preview: null, notice: null })}
          onReload={reload}
          loading={loading}
          describe={(r) => `${r.title} (${STATUS_LABELS[r.status] || r.status})`}
          emptyText="No campaigns yet"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={preview} disabled={!state.selected} loading={busy && !confirming}>
            <Users size={16} />
            Preview audience
          </Button>
          {canManage && (
            <Button onClick={() => setConfirming(true)} disabled={!sendable || busy}>
              <Send size={16} />
              Send now
            </Button>
          )}
        </div>
      </div>
      {campaign && !sendable && canManage && (
        <p className="text-xs text-gray-500 mt-2">
          &ldquo;Send now&rdquo; is available once this campaign is approved. It is currently {STATUS_LABELS[campaign.status] || campaign.status}.
        </p>
      )}

      {state.preview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Accounts matching the audience now</p>
            <p className="text-2xl font-bold text-deep-blue mt-1">{state.preview.audience.total}</p>
            <ul className="text-sm text-gray-700 mt-2 space-y-1">
              {state.preview.audience.breakdown.map((part: any) => (
                <li key={part.label}>
                  {part.label}: {part.count}
                </li>
              ))}
            </ul>
            <p className="text-xs uppercase tracking-wide text-gray-500 mt-4">Accounts that can receive a push today</p>
            <p className="text-2xl font-bold text-deep-blue mt-1">{state.preview.reachable}</p>
            <p className="text-sm text-gray-600 mt-1">{state.preview.reachableNote}</p>
            {state.preview.provider.problem && (
              <p className="text-sm text-red-700 mt-2">Provider: {state.preview.provider.problem}.</p>
            )}
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Message preview</p>
            <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">{state.preview.preview.title}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{state.preview.preview.message}</p>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              Opens: {state.preview.preview.deepLink ? <span className="break-all">{state.preview.preview.deepLink}</span> : 'the app home screen (no deep link set)'}
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Send this campaign now"
        message={
          <>
            <p>
              Send <strong>{campaign?.title}</strong> to its audience now?
            </p>
            <p className="mt-2">
              No push provider is connected and the apps do not register device tokens, so the attempt will be recorded in the delivery
              log as &ldquo;not sent&rdquo; and the campaign will be marked Failed with that reason. It will not be shown as sent.
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
