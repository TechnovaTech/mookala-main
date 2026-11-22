'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { BarChart3, Send, Users } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, api, formatDate, type Notice } from '@/components/ui'
import { RecordSelect, useRecords } from '@/components/platform/RecordSelect'

export interface CampaignPanelState {
  selected: string
  preview: any | null
  performance: any | null
  notice: Notice
}

export const EMPTY_CAMPAIGN_PANEL: CampaignPanelState = { selected: '', preview: null, performance: null, notice: null }

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

const LOG_TONE: Record<string, 'green' | 'red' | 'gray' | 'blue' | 'amber'> = {
  accepted: 'blue',
  delivered: 'green',
  read: 'green',
  failed: 'red',
  not_sent: 'gray',
  queued: 'amber',
}

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-bold text-deep-blue mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

/**
 * Audience preview, "Send now" and performance for push campaigns. Shown
 * above the list. The state lives in the page so it survives the list being
 * reloaded.
 */
export default function CampaignActions({
  state,
  onState,
  onChanged,
}: {
  state: CampaignPanelState
  onState: (next: CampaignPanelState) => void
  /** Called after a send so the page can reload the list. */
  onChanged: () => void
}) {
  const canManage = useCan('marketing:manage')
  const { records, loading, reload } = useRecords('push-campaigns')
  const [busy, setBusy] = useState<'' | 'preview' | 'send' | 'performance'>('')
  const [confirming, setConfirming] = useState(false)

  const campaign = records.find((r) => r._id === state.selected)
  const due = !campaign?.scheduledFor || new Date(campaign.scheduledFor) <= new Date()
  const sendable = campaign && campaign.approvedBy && (['approved', 'failed', 'sending'].includes(campaign.status) || (campaign.status === 'scheduled' && due))
  const hasResults = campaign && ['sending', 'sent', 'failed'].includes(campaign.status)

  const preview = async () => {
    if (!state.selected) return
    setBusy('preview')
    try {
      const data = await api<any>(`/api/admin/marketing/push-campaigns/${state.selected}/audience`)
      onState({ ...state, preview: data, notice: null })
    } catch (e: any) {
      onState({ ...state, preview: null, notice: { type: 'error', text: e.message || 'Could not work out the audience.' } })
    } finally {
      setBusy('')
    }
  }

  const performance = async (id = state.selected, base = state) => {
    if (!id) return
    setBusy('performance')
    try {
      const data = await api<any>(`/api/admin/marketing/push-campaigns/${id}/performance`)
      onState({ ...base, selected: id, performance: data })
    } catch (e: any) {
      onState({ ...base, selected: id, performance: null, notice: { type: 'error', text: e.message || 'Could not load the figures.' } })
    } finally {
      setBusy('')
    }
  }

  const send = async () => {
    setBusy('send')
    try {
      const data = await api<any>(`/api/admin/marketing/push-campaigns/${state.selected}/send`, { method: 'POST', body: {} })
      const t = data.totals
      const notice: Notice = data.sent
        ? {
            type: 'success',
            text: `Accepted by the provider for ${t.accepted} of ${t.targeted} devices${t.failed + t.notSent ? `; ${t.failed + t.notSent} not accepted` : ''}.${
              data.continuesInBackground ? ' The rest of the audience is sent by the scheduler in the next runs.' : ''
            }`,
          }
        : data.continuesInBackground
        ? { type: 'info', text: 'Sending has started. The scheduler continues every 15 minutes until every device has been tried.' }
        : { type: 'error', text: `The campaign was not sent and is now marked Failed. ${data.reason || ''}` }
      setConfirming(false)
      await reload()
      onChanged()
      await performance(state.selected, { ...state, notice })
    } catch (e: any) {
      onState({ ...state, notice: { type: 'error', text: e.message || 'Could not send the campaign.' } })
      setConfirming(false)
    } finally {
      setBusy('')
    }
  }

  const perf = state.performance

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Preview, send and results</h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        Write the campaign, then submit it for approval. A different admin with the Marketing approve permission (a Super Admin unless
        someone was given it) approves it. With &ldquo;Scheduled for&rdquo; set, approval schedules it and the scheduler sends it at that
        time (it runs every 15 minutes); without a time, press &ldquo;Send now&rdquo;. Each device receives a campaign once.
      </p>
      <NoticeBar notice={state.notice} onClose={() => onState({ ...state, notice: null })} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <RecordSelect
          id="push-campaign-pick"
          label="Campaign"
          records={records}
          value={state.selected}
          onChange={(id) => onState({ selected: id, preview: null, performance: null, notice: null })}
          onReload={reload}
          loading={loading}
          describe={(r) => `${r.title} (${STATUS_LABELS[r.status] || r.status})`}
          emptyText="No campaigns yet"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={preview} disabled={!state.selected || Boolean(busy)} loading={busy === 'preview'}>
            <Users size={16} />
            Preview audience
          </Button>
          <Button variant="secondary" onClick={() => performance()} disabled={!state.selected || Boolean(busy)} loading={busy === 'performance'}>
            <BarChart3 size={16} />
            Results
          </Button>
          {canManage && (
            <Button onClick={() => setConfirming(true)} disabled={!sendable || Boolean(busy)}>
              <Send size={16} />
              Send now
            </Button>
          )}
        </div>
      </div>
      {campaign && !sendable && canManage && (
        <p className="text-xs text-gray-500 mt-2">
          {campaign.status === 'scheduled'
            ? `Scheduled for ${formatDate(campaign.scheduledFor, true)}: the scheduler sends it then.`
            : campaign.status === 'sent'
            ? 'This campaign has been sent.'
            : `"Send now" is available once this campaign is approved. It is currently ${STATUS_LABELS[campaign.status] || campaign.status}.`}
        </p>
      )}

      {state.preview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5" data-testid="audience-preview">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Matching accounts" value={<span data-testid="preview-accounts">{state.preview.audience.accounts}</span>} />
              <Figure label="Reachable accounts" value={<span data-testid="preview-reachable">{state.preview.audience.reachableAccounts}</span>} hint="with a registered device" />
              <Figure label="Devices" value={<span data-testid="preview-devices">{state.preview.audience.devices}</span>} />
            </div>
            <ul className="text-sm text-gray-700 mt-3 space-y-1">
              {state.preview.audience.breakdown.map((part: any) => (
                <li key={part.label}>
                  {part.label} ({part.app === 'user' ? 'customer app' : 'organiser app'}): {part.accounts} accounts, {part.reachableAccounts} reachable,{' '}
                  {part.devices} devices
                </li>
              ))}
            </ul>
            <p className={`text-sm mt-3 ${state.preview.provider.connected ? 'text-green-700' : 'text-red-700'}`}>
              {state.preview.provider.connected
                ? 'Push provider connected (Firebase Cloud Messaging).'
                : `Push provider: ${state.preview.provider.problem}. Nothing can be sent until it is connected under Communications.`}
            </p>
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

      {perf && (
        <div className="mt-5" data-testid="campaign-performance">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Figure label="Devices targeted" value={<span data-testid="perf-targeted">{perf.totals.targeted}</span>} />
            <Figure label="Accepted by provider" value={<span data-testid="perf-accepted">{perf.totals.accepted}</span>} />
            <Figure label="Delivered" value={perf.totals.delivered} hint="only where the provider reports it" />
            <Figure label="Failed / not sent" value={<span data-testid="perf-failed">{perf.totals.failed + perf.totals.notSent}</span>} />
            <Figure label="Opened" value={<span data-testid="perf-opened">{perf.totals.opened}</span>} />
            <Figure label="Open rate (CTR)" value={<span data-testid="perf-ctr">{perf.rates.ctr === null ? '—' : `${perf.rates.ctr}%`}</span>} hint="opened / accepted" />
          </div>
          <p className="text-xs text-gray-500 mt-2">{perf.deliveryReceipts}</p>
          {perf.campaign.failureReason && <p className="text-sm text-gray-700 mt-2">Last result: {perf.campaign.failureReason}</p>}
          {perf.recent.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Recipient</th>
                    <th className="py-2 pr-4">Device</th>
                    <th className="py-2 pr-4">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {perf.recent.map((entry: any) => (
                    <tr key={entry.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(entry.at, true)}</td>
                      <td className="py-2 pr-4">{entry.summary ? 'Whole campaign' : entry.recipient || '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{entry.summary ? '—' : entry.device}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={LOG_TONE[entry.status] || 'gray'}>{entry.status.replace('_', ' ')}</Badge>
                        {entry.error && <span className="block text-xs text-gray-600 mt-1">{entry.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm mt-3">
            <Link href={`/communications/logs?campaign=${perf.campaign.id}`} className="text-teal font-medium underline">
              Every delivery log entry of this campaign
            </Link>
          </p>
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
              Every device that has not received it yet is sent the notification through the push provider, up to 1,000 in this run; the
              scheduler sends the rest. Each attempt is written to the delivery log.
            </p>
          </>
        }
        confirmLabel="Send now"
        busy={busy === 'send'}
        onConfirm={send}
        onClose={() => setConfirming(false)}
      />
    </Card>
  )
}
