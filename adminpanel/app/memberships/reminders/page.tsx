'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { MemberLink, headRowClass, tdClass, thClass } from '@/components/memberships/shared'

interface Reminder {
  at: string
  by: string | null
  byName: string | null
  kind?: string
  channel: string
  status?: string
  error?: string | null
  note: string | null
  daysBeforeExpiry: number | null
}
interface Subscription {
  _id: string
  memberName: string
  memberPhone: string
  memberEmail: string
  plan: string
  expiresOn: string
  daysLeft: number
  autoRenew: boolean
  reminderDue: boolean
  dueStep: number | null
  attemptedToday: boolean
  lastReminderAt: string | null
  reminders: Reminder[]
  reminderCount: number
}
interface Settings {
  reminderDays: number[]
  channel: string
  templateKey: string
  reminderMessage: string
  updatedAt: string | null
  updatedBy: string | null
}
interface Readiness {
  channel: string
  templateKey: string
  template: { id: string; name: string; status: string } | null
  templateApproved: boolean
  channelBlocker: string | null
}
interface Data {
  settings: Settings
  readiness: Readiness
  templateVariables: string[]
  sendAllCap: number
  windowDays: number
  subscriptions: Subscription[]
  canManage: boolean
}

const SEND_CHANNELS = [
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push notification' },
]
const MANUAL_CHANNELS = [
  { value: 'call', label: 'Phone call' },
  { value: 'whatsapp', label: 'WhatsApp (sent by hand)' },
  { value: 'sms', label: 'SMS (sent by hand)' },
  { value: 'email', label: 'Email (sent by hand)' },
  { value: 'other', label: 'Other' },
]
const CHANNEL_LABEL: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', push: 'Push', call: 'Phone call', other: 'Other' }

const API = '/api/admin/memberships/reminders'

function fillMessage(template: string, subscription: Subscription): string {
  return template
    .replace(/\{\{?\s*name\s*\}?\}/g, subscription.memberName)
    .replace(/\{\{?\s*plan\s*\}?\}/g, subscription.plan)
    .replace(/\{\{?\s*expiryDate\s*\}?\}/g, formatDate(subscription.expiresOn))
    .replace(/\{\{?\s*daysLeft\s*\}?\}/g, String(subscription.daysLeft))
}

function daysText(days: number): string {
  if (days === 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

/** What one reminder entry really was: accepted by a provider, not sent, refused, or made by hand. */
function outcome(entry: Reminder): { label: string; tone: 'green' | 'amber' | 'red' | 'blue' } {
  if (entry.kind === 'manual' || (!entry.kind && !entry.status)) return { label: 'Made by hand', tone: 'blue' }
  if (entry.status === 'accepted') return { label: 'Accepted by provider', tone: 'green' }
  if (entry.status === 'failed') return { label: 'Refused by provider', tone: 'red' }
  return { label: 'Not sent', tone: 'amber' }
}

export default function Page() {
  const [data, setData] = useState<Data | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [windowInput, setWindowInput] = useState('')
  const [windowDays, setWindowDays] = useState<number | null>(null)

  const [daysInput, setDaysInput] = useState('')
  const [channel, setChannel] = useState('sms')
  const [templateKey, setTemplateKey] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [recording, setRecording] = useState<Subscription | null>(null)
  const [manualChannel, setManualChannel] = useState('call')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<Subscription | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (resetForm: boolean) => {
      try {
        const result = await api<Data>(API + (windowDays ? `?days=${windowDays}` : ''))
        setData(result)
        setWindowInput(String(result.windowDays))
        if (resetForm) {
          setDaysInput(result.settings.reminderDays.join(', '))
          setChannel(result.settings.channel)
          setTemplateKey(result.settings.templateKey)
          setMessage(result.settings.reminderMessage)
        }
      } catch (error: any) {
        setNotice({ type: 'error', text: error.message || 'Could not load expiry reminders.' })
      }
    },
    [windowDays]
  )

  useEffect(() => {
    load(data === null)
    // The settings form is filled on the first load only, so typing is never overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault()
    const days = daysInput
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (/^\d+$/.test(part) ? parseInt(part, 10) : NaN))
    if (days.length === 0 || days.some((d) => Number.isNaN(d))) {
      setNotice({ type: 'error', text: 'Enter the reminder days as whole numbers separated by commas, for example 7, 1.' })
      return
    }
    setSaving(true)
    try {
      const result = await api<{ settings: Settings }>(API, {
        method: 'PUT',
        body: { reminderDays: days, channel, templateKey: templateKey.trim(), reminderMessage: message },
      })
      setDaysInput(result.settings.reminderDays.join(', '))
      setChannel(result.settings.channel)
      setTemplateKey(result.settings.templateKey)
      setMessage(result.settings.reminderMessage)
      setNotice({ type: 'success', text: 'Reminder settings saved.' })
      await load(false)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not save the settings.' })
    } finally {
      setSaving(false)
    }
  }

  const applyWindow = (event: React.FormEvent) => {
    event.preventDefault()
    const days = parseInt(windowInput, 10)
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      setNotice({ type: 'error', text: 'Choose between 1 and 90 days.' })
      return
    }
    setWindowDays(days)
  }

  const copyMessage = async (subscription: Subscription) => {
    const template = data?.settings.reminderMessage || ''
    if (!template) {
      setNotice({ type: 'error', text: 'Save the wording for reminders made by hand in the settings first.' })
      return
    }
    try {
      await navigator.clipboard.writeText(fillMessage(template, subscription))
      setNotice({ type: 'success', text: `Message for ${subscription.memberName} copied. Paste it into the app you send it from, then record the reminder.` })
    } catch {
      setNotice({ type: 'error', text: 'The browser did not allow copying. Select the wording in the settings and copy it by hand.' })
    }
  }

  const recordReminder = async () => {
    if (!recording) return
    setBusy(true)
    try {
      await api(API, { method: 'POST', body: { action: 'record', subscriptionId: recording._id, channel: manualChannel, note } })
      setNotice({ type: 'success', text: `Recorded: a reminder was made by hand for ${recording.memberName}. Nothing was sent from here.` })
      await load(false)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not record the reminder.' })
    } finally {
      setBusy(false)
      setRecording(null)
    }
  }

  const sendOne = async () => {
    if (!sending) return
    setBusy(true)
    try {
      const result = await api<{ reminder: Reminder }>(API, { method: 'POST', body: { action: 'send', subscriptionId: sending._id } })
      const reminder = result.reminder
      setNotice(
        reminder.status === 'accepted'
          ? { type: 'success', text: `The ${CHANNEL_LABEL[reminder.channel] || reminder.channel} provider accepted the reminder for ${sending.memberName}.` }
          : {
              type: 'error',
              text: `The reminder for ${sending.memberName} was ${reminder.status === 'failed' ? 'refused by the provider' : 'not sent'}: ${reminder.error || 'no provider accepted it'}. The attempt is recorded against the subscription and in the delivery log.`,
            }
      )
      await load(false)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not send the reminder.' })
    } finally {
      setBusy(false)
      setSending(null)
    }
  }

  const sendAll = async () => {
    setBusy(true)
    try {
      const r = await api<any>(API, { method: 'POST', body: { action: 'send_due' } })
      const parts = [
        `${r.attempted} attempted`,
        `${r.accepted} accepted by the provider`,
        `${r.notSent} not sent`,
        `${r.failed} refused`,
        ...(r.skippedAlreadyAttemptedToday ? [`${r.skippedAlreadyAttemptedToday} skipped (already attempted today)`] : []),
        ...(r.leftForNextRun ? [`${r.leftForNextRun} left for the next run (limit ${r.cap} per run)`] : []),
      ]
      setNotice({
        type: r.attempted > 0 && r.accepted === r.attempted ? 'success' : r.accepted > 0 || r.attempted === 0 ? 'info' : 'error',
        text: `Send all due: ${parts.join(', ')}.${r.firstError ? ` Reason: ${r.firstError}.` : ''}`,
      })
      await load(false)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not send the reminders.' })
    } finally {
      setBusy(false)
      setSendingAll(false)
    }
  }

  const canManage = Boolean(data?.canManage)
  const readiness = data?.readiness
  const configured = Boolean(data && data.settings.reminderDays.length > 0)
  const due = data ? data.subscriptions.filter((s) => s.reminderDue) : []
  const canSend = canManage && Boolean(readiness?.templateApproved)
  const templatesHref = `/communications/templates?q=${encodeURIComponent(data?.settings.templateKey || 'membership_expiry')}`

  return (
    <AdminShell title="Expiry Reminders" subtitle="Reminder settings, who is due, sending, and a record of every reminder attempt">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {!data || !readiness ? (
        <Spinner />
      ) : (
        <>
          <Card className="p-4 mb-4" >
            <h2 className="text-base font-semibold text-deep-blue">Can a reminder be sent right now?</h2>
            <ul className="mt-2 space-y-2 text-sm text-gray-700" data-readiness>
              <li className="flex flex-wrap items-center gap-2">
                {readiness.templateApproved ? <Badge tone="green">Template approved</Badge> : <Badge tone="red">Template missing or not approved</Badge>}
                <span>
                  {readiness.template
                    ? `The ${CHANNEL_LABEL[readiness.channel]} template "${readiness.templateKey}" (${readiness.template.name}) is ${readiness.template.status.replace(/_/g, ' ')}.`
                    : `No ${CHANNEL_LABEL[readiness.channel]} template with the key "${readiness.templateKey}" exists.`}{' '}
                  {!readiness.templateApproved && 'Reminders cannot be sent until an approved template with this key and channel exists. '}
                  <Link href={templatesHref} className="text-teal underline">
                    Communications, Templates
                  </Link>
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                {readiness.channelBlocker ? <Badge tone="amber">Provider not connected</Badge> : <Badge tone="green">Provider connected</Badge>}
                <span>
                  {readiness.channelBlocker
                    ? `${readiness.channelBlocker}. Until a provider is connected, pressing Send records the attempt as "Not sent" with this reason; no message leaves the system.`
                    : `The ${CHANNEL_LABEL[readiness.channel]} channel can hand messages to its provider.`}
                </span>
              </li>
              <li className="text-xs text-gray-500">
                Nothing is sent on a schedule: reminders go out only when someone presses Send or Send all due. &quot;Accepted by
                provider&quot; means the provider took the message; delivery to the phone is not confirmed, because delivery receipts
                are not connected.
              </li>
            </ul>
          </Card>

          <Card className="p-5 mb-6">
            <h2 className="text-base font-semibold text-deep-blue">Reminder settings</h2>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">
              {data.settings.updatedAt
                ? `Last saved ${formatDate(data.settings.updatedAt, true)}${data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ''}.`
                : 'Nothing has been saved yet.'}
            </p>
            <form onSubmit={saveSettings} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="reminder-days" className="block text-sm font-medium text-gray-700 mb-1">
                  Remind this many days before expiry
                </label>
                <input id="reminder-days" value={daysInput} onChange={(e) => setDaysInput(e.target.value)} disabled={!canManage} placeholder="e.g. 7, 1" className={inputClass} />
                <p className="text-xs text-gray-500 mt-1">Up to five whole numbers between 0 and 90, separated by commas.</p>
              </div>
              <div>
                <label htmlFor="reminder-channel" className="block text-sm font-medium text-gray-700 mb-1">
                  Channel
                </label>
                <select id="reminder-channel" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!canManage} className={inputClass}>
                  {SEND_CHANNELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Email reminders use the member email saved on the subscription.</p>
              </div>
              <div>
                <label htmlFor="reminder-template" className="block text-sm font-medium text-gray-700 mb-1">
                  Message template key
                </label>
                <input id="reminder-template" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} disabled={!canManage} maxLength={60} className={inputClass} />
                <p className="text-xs text-gray-500 mt-1">
                  The message that is sent is the approved template with this key and channel. It receives{' '}
                  {data.templateVariables.map((name) => `{{${name}}}`).join(', ')}.
                </p>
              </div>
              <div className="lg:col-span-3">
                <label htmlFor="reminder-message" className="block text-sm font-medium text-gray-700 mb-1">
                  Wording for reminders made by hand (optional)
                </label>
                <textarea
                  id="reminder-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={!canManage}
                  rows={3}
                  maxLength={1000}
                  placeholder="What the team says on a call or pastes into their own phone"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used by &quot;Copy message&quot; only, with {'{name}'}, {'{plan}'}, {'{expiryDate}'} and {'{daysLeft}'} filled in. It is
                  never sent by the system.
                </p>
              </div>
              {canManage && (
                <div className="lg:col-span-3 flex justify-end">
                  <Button type="submit" loading={saving}>
                    Save settings
                  </Button>
                </div>
              )}
            </form>
          </Card>

          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-deep-blue">
                  Active subscriptions expiring in the next {data.windowDays} day{data.windowDays === 1 ? '' : 's'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5" data-due-count>
                  {configured
                    ? `${due.length} of ${data.subscriptions.length} need a reminder now, based on the settings above.`
                    : 'Save the reminder days above to have subscriptions flagged as due.'}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <form onSubmit={applyWindow} className="flex items-end gap-2">
                  <div>
                    <label htmlFor="reminder-window" className="block text-xs font-medium text-gray-600 mb-1">
                      Days ahead
                    </label>
                    <input id="reminder-window" type="number" min={1} max={90} value={windowInput} onChange={(e) => setWindowInput(e.target.value)} className={inputClass + ' w-24'} />
                  </div>
                  <Button type="submit" variant="secondary">
                    Show
                  </Button>
                </form>
                {canManage && (
                  <Button onClick={() => setSendingAll(true)} disabled={!canSend || due.length === 0}>
                    Send all due
                  </Button>
                )}
              </div>
            </div>

            {data.subscriptions.length === 0 ? (
              <EmptyState
                title={`No active subscription expires in the next ${data.windowDays} day${data.windowDays === 1 ? '' : 's'}.`}
                hint="Subscriptions are entered by the team on the Subscriptions screen; the mobile apps do not create them yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={headRowClass}>
                      <th scope="col" className={thClass}>Member</th>
                      <th scope="col" className={thClass}>Plan</th>
                      <th scope="col" className={thClass}>Expires on</th>
                      <th scope="col" className={thClass}>Reminder</th>
                      <th scope="col" className={thClass}>Latest attempt</th>
                      <th scope="col" className={thClass + ' text-right'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.subscriptions.map((subscription) => {
                      const last = subscription.reminders[0]
                      const result = last ? outcome(last) : null
                      return (
                        <tr key={subscription._id} className="hover:bg-gray-50 align-top" data-row={subscription._id}>
                          <td className={tdClass}>
                            <MemberLink row={subscription} />
                          </td>
                          <td className={tdClass}>{subscription.plan || '—'}</td>
                          <td className={tdClass + ' whitespace-nowrap'}>
                            {formatDate(subscription.expiresOn)}
                            <p className="text-xs text-gray-500">{daysText(subscription.daysLeft)} left</p>
                          </td>
                          <td className={tdClass}>
                            {subscription.reminderDue ? (
                              <Badge tone="amber">Due ({subscription.dueStep}-day reminder)</Badge>
                            ) : !configured ? (
                              <Badge tone="gray">Not set up</Badge>
                            ) : subscription.lastReminderAt ? (
                              <Badge tone="green">Reminded</Badge>
                            ) : (
                              <Badge tone="gray">Not due yet</Badge>
                            )}
                          </td>
                          <td className={tdClass}>
                            {last && result ? (
                              <>
                                <Badge tone={result.tone}>{result.label}</Badge>
                                <p className="text-xs text-gray-500 mt-1">
                                  {formatDate(last.at, true)} · {CHANNEL_LABEL[last.channel] || last.channel}
                                  {last.byName || last.by ? ` · ${last.byName || last.by}` : ''}
                                  {subscription.reminderCount > 1 ? ` · ${subscription.reminderCount} entries in total` : ''}
                                </p>
                                {last.error && <p className="text-xs text-amber-700 mt-0.5 max-w-xs break-words">{last.error}</p>}
                                {last.note && <p className="text-xs text-gray-500 mt-0.5 max-w-xs break-words">{last.note}</p>}
                              </>
                            ) : (
                              <span className="text-gray-500">None</span>
                            )}
                          </td>
                          <td className={tdClass}>
                            <div className="flex flex-wrap justify-end gap-2">
                              {canManage && (
                                <Button onClick={() => setSending(subscription)} disabled={!canSend} className="whitespace-nowrap">
                                  Send reminder
                                </Button>
                              )}
                              <Button variant="secondary" onClick={() => copyMessage(subscription)} className="whitespace-nowrap">
                                Copy message
                              </Button>
                              {canManage && (
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setRecording(subscription)
                                    setManualChannel('call')
                                    setNote('')
                                  }}
                                  className="whitespace-nowrap"
                                >
                                  Record reminder sent manually
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(sending)}
        title="Send expiry reminder"
        message={
          sending && readiness
            ? `Send the "${readiness.templateKey}" ${CHANNEL_LABEL[readiness.channel]} template to ${sending.memberName} (${readiness.channel === 'email' ? sending.memberEmail || 'no email saved' : sending.memberPhone}).${readiness.channelBlocker ? ` The provider is not connected, so this will be recorded as "Not sent": ${readiness.channelBlocker}.` : ''}`
            : ''
        }
        confirmLabel="Send reminder"
        busy={busy}
        onConfirm={sendOne}
        onClose={() => setSending(null)}
      />

      <ConfirmDialog
        open={sendingAll}
        title="Send all due reminders"
        message={
          data && readiness
            ? `${due.length} subscription${due.length === 1 ? ' is' : 's are'} due a reminder. At most ${data.sendAllCap} are attempted in one run, and a subscription already attempted today is skipped. Every attempt is written to the activity log and the delivery log.${readiness.channelBlocker ? ` The provider is not connected, so each attempt will be recorded as "Not sent": ${readiness.channelBlocker}.` : ''}`
            : ''
        }
        confirmLabel="Send all due"
        busy={busy}
        onConfirm={sendAll}
        onClose={() => setSendingAll(false)}
      />

      <Modal
        open={Boolean(recording)}
        title="Record reminder sent manually"
        onClose={() => setRecording(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecording(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={recordReminder} loading={busy}>
              Record
            </Button>
          </>
        }
      >
        {recording && (
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              This records that you have already reminded <strong>{recording.memberName}</strong> ({recording.memberPhone}) yourself, for
              example by phone. It does not send a message.
            </p>
            <div>
              <label htmlFor="manual-channel" className="block text-sm font-medium text-gray-700 mb-1">
                How was it made?
              </label>
              <select id="manual-channel" value={manualChannel} onChange={(e) => setManualChannel(e.target.value)} className={inputClass}>
                {MANUAL_CHANNELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reminder-note" className="block text-sm font-medium text-gray-700 mb-1">
                Note (optional)
              </label>
              <textarea
                id="reminder-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                className={inputClass}
                placeholder="e.g. Member said they will renew this week"
              />
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  )
}
