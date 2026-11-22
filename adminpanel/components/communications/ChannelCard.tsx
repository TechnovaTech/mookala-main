'use client'
import React, { useEffect, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, Modal, NoticeBar, api, formatDate, inputClass, type Notice } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

type State = 'connected' | 'disabled' | 'not_configured' | 'adapter_missing'

export interface ChannelView {
  channel: string
  label: string
  provider: string
  providerLabel: string
  providerOptions: { value: string; label: string }[]
  providerFixed: boolean
  enabled: boolean
  secrets: {
    key: string
    label: string
    help?: string
    multiline: boolean
    providers: string[] | null
    saved: boolean
    masked: string
    decryptFailed: boolean
  }[]
  fields: { key: string; label: string; help?: string; value: string; providers: string[] | null; placeholder?: string }[]
  derived: { label: string; value: string }[]
  state: State
  capabilities: { label: string; state: State }[]
  configurationProblem: string | null
  endpoint: { url: string; overriddenBy: string | null } | null
  capability: string
  updatedAt: string | null
  updatedBy: string | null
  lastProviderResult: { status: string; error: string | null; at: string } | null
  lastReceipt: { at: string; event: string; count: number } | null
  webhooks: { label: string; url: string; note: string }[]
}

const STATE: Record<State, { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'green' },
  disabled: { label: 'Switched off', tone: 'amber' },
  not_configured: { label: 'Not configured', tone: 'gray' },
  adapter_missing: { label: 'Adapter not implemented', tone: 'red' },
}

const STATE_LINE: Record<State, string> = {
  connected: 'Everything needed is saved and the channel is switched on.',
  disabled: 'Everything needed is saved, but the channel is switched off, so nothing is sent.',
  not_configured: 'Something the provider needs is not saved yet, so nothing is sent.',
  adapter_missing: 'There is no code that sends this kind of message, so nothing is sent.',
}

const TEST_TARGET: Record<string, { label: string; placeholder: string; type: string }> = {
  email: { label: 'Send to email address', placeholder: 'name@example.com', type: 'email' },
  whatsapp: { label: 'Send to WhatsApp number', placeholder: '10-digit mobile number or with country code', type: 'tel' },
  push: { label: 'Send to device token', placeholder: 'FCM registration token of a test device', type: 'text' },
}

const applies = (item: { providers: string[] | null }, provider: string) => !item.providers || item.providers.includes(provider)

/** Settings form for one notification channel. Secrets are write-only: only a masked value is ever shown. */
export default function ChannelCard({
  channel,
  canManage,
  onSaved,
}: {
  channel: ChannelView
  canManage: boolean
  onSaved: () => void
}) {
  const [provider, setProvider] = useState(channel.provider)
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState(channel.enabled)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [removing, setRemoving] = useState<null | { key: string | 'all'; label: string }>(null)
  const [reason, setReason] = useState('')

  const [testOpen, setTestOpen] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [waTemplate, setWaTemplate] = useState('hello_world')
  const [waLanguage, setWaLanguage] = useState('en_US')
  const [testConfirmed, setTestConfirmed] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<Notice>(null)

  useEffect(() => {
    setProvider(channel.provider)
    setEnabled(channel.enabled)
    setValues(Object.fromEntries(channel.fields.map((f) => [f.key, f.value])))
    setSecrets({})
  }, [channel])

  const id = (name: string) => `${channel.channel}-${name}`
  const isSms = channel.channel === 'sms'
  const visibleSecrets = channel.secrets.filter((s) => applies(s, provider))
  const visibleFields = channel.fields.filter((f) => applies(f, provider))

  const report = (e: any, fallback: string) =>
    setNotice({ type: e?.approvalRequired ? 'info' : 'error', text: e?.message || fallback })

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const typed = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim()))
      await api('/api/admin/communications/channels', {
        method: 'PUT',
        body: { channel: channel.channel, provider, secrets: typed, enabled, values, reason: reason.trim() },
      })
      setNotice({ type: 'success', text: `${channel.label} settings saved.` })
      setReason('')
      onSaved()
    } catch (e: any) {
      report(e, 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const removeSecret = async (removeReason: string) => {
    if (!removing) return
    setSaving(true)
    try {
      const all = removing.key === 'all'
      await api('/api/admin/communications/channels', {
        method: 'PUT',
        body: {
          channel: channel.channel,
          provider,
          clearSecrets: all ? true : [removing.key],
          // Without its credential a channel cannot stay on.
          enabled: all || removing.key === channel.secrets[0]?.key ? false : enabled,
          values,
          reason: removeReason,
        },
      })
      setNotice({ type: 'success', text: `${removing.label} removed.` })
      onSaved()
    } catch (e: any) {
      report(e, 'Could not remove it.')
    } finally {
      setRemoving(null)
      setSaving(false)
    }
  }

  const openTest = () => {
    setTestTo('')
    setTestConfirmed(false)
    setTestResult(null)
    setTestOpen(true)
  }

  const sendTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const data = isSms
        ? await api<any>('/api/admin/communications/channels/test-sms', { method: 'POST', body: { phone: testTo, confirm: testConfirmed } })
        : await api<any>('/api/admin/communications/channels/test', {
            method: 'POST',
            body: { channel: channel.channel, to: testTo, confirm: testConfirmed, whatsappTemplate: waTemplate, whatsappLanguage: waLanguage },
          })
      setTestResult(
        data.accepted
          ? {
              type: 'success',
              text: `${channel.providerLabel || 'The provider'} accepted the message${data.providerMessageId ? ` (reference ${data.providerMessageId})` : ''}. This is not a delivery confirmation: delivery shows in the delivery log when the provider reports it.`,
            }
          : { type: 'error', text: `${data.status === 'failed' ? 'Refused by the provider' : 'Not sent'}: ${data.error}` }
      )
      setTestConfirmed(false)
      onSaved()
    } catch (e: any) {
      setTestResult({ type: 'error', text: e.message || 'Could not send the test.' })
    } finally {
      setTesting(false)
    }
  }

  const testDisabled =
    !testConfirmed ||
    !testTo.trim() ||
    (isSms && !/^\+?\d{10,13}$/.test(testTo.replace(/[\s\-()]/g, ''))) ||
    (channel.channel === 'whatsapp' && !waTemplate.trim())

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-deep-blue">{channel.label}</h2>
        <Badge tone={STATE[channel.state].tone}>{STATE[channel.state].label}</Badge>
      </div>
      <p className="text-sm text-gray-700 mt-2">{STATE_LINE[channel.state]}</p>
      <ul className="mt-2 space-y-1">
        {channel.capabilities.map((cap) => (
          <li key={cap.label} className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <span>{cap.label}:</span>
            <Badge tone={STATE[cap.state].tone}>{STATE[cap.state].label}</Badge>
          </li>
        ))}
      </ul>
      {channel.configurationProblem && <p className="text-sm text-amber-800 mt-2">Missing: {channel.configurationProblem}.</p>}
      <p className="text-sm text-gray-600 mt-2">{channel.capability}</p>
      {channel.endpoint && (
        <p className="text-xs text-gray-500 mt-1 break-words">
          Requests go to {channel.endpoint.url}
          {channel.endpoint.overriddenBy ? ` (test override set by ${channel.endpoint.overriddenBy}: not the real provider)` : ''}
        </p>
      )}
      <p className="text-sm text-gray-600 mt-1">
        Last response from the provider:{' '}
        {channel.lastProviderResult
          ? `${channel.lastProviderResult.status === 'accepted' ? 'accepted a message' : `refused a message (${channel.lastProviderResult.error || 'no reason given'})`} on ${formatDate(channel.lastProviderResult.at, true)}`
          : 'none yet. Nothing has been handed to a provider on this channel.'}
      </p>
      {channel.webhooks.length > 0 && (
        <p className="text-sm text-gray-600 mt-1">
          Last status update received:{' '}
          {channel.lastReceipt ? `"${channel.lastReceipt.event}" on ${formatDate(channel.lastReceipt.at, true)} (${channel.lastReceipt.count} in all)` : 'none yet.'}
        </p>
      )}
      {channel.derived.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {channel.derived.map((d) => (
            <div key={d.label}>
              <dt className="text-xs uppercase tracking-wide text-gray-500">{d.label}</dt>
              <dd className="text-gray-900 break-all">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={id('provider')} className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            {channel.providerFixed ? (
              <input id={id('provider')} value={channel.providerOptions[0]?.label || channel.provider} disabled className={inputClass} />
            ) : (
              <select id={id('provider')} value={provider} onChange={(e) => setProvider(e.target.value)} disabled={!canManage} className={inputClass}>
                <option value="">Choose a provider</option>
                {channel.providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {visibleFields.map((field) => (
            <div key={field.key}>
              <label htmlFor={id(field.key)} className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
              </label>
              <input
                id={id(field.key)}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                disabled={!canManage}
                placeholder={field.placeholder}
                className={inputClass}
              />
              {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {visibleSecrets.map((secret) => (
            <div key={secret.key}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor={id(secret.key)} className="block text-sm font-medium text-gray-700">
                  {secret.label}
                </label>
                {canManage && secret.saved && (
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:underline"
                    onClick={() => setRemoving({ key: secret.key, label: `The saved ${secret.label.toLowerCase()}` })}
                  >
                    Remove saved value
                  </button>
                )}
              </div>
              {secret.multiline ? (
                <textarea
                  id={id(secret.key)}
                  rows={4}
                  autoComplete="off"
                  spellCheck={false}
                  value={secrets[secret.key] || ''}
                  onChange={(e) => setSecrets({ ...secrets, [secret.key]: e.target.value })}
                  disabled={!canManage}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder={secret.saved ? `${secret.masked}. Paste a new file to replace it.` : 'Not saved yet'}
                />
              ) : (
                <input
                  id={id(secret.key)}
                  type="password"
                  autoComplete="new-password"
                  value={secrets[secret.key] || ''}
                  onChange={(e) => setSecrets({ ...secrets, [secret.key]: e.target.value })}
                  disabled={!canManage}
                  className={inputClass}
                  placeholder={secret.saved ? `Saved: ${secret.masked}` : 'Not saved yet'}
                />
              )}
              {secret.decryptFailed && (
                <p className="text-xs text-red-700 mt-1">A value is stored but cannot be read with the current encryption key. Type it again and save.</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {secret.help ? `${secret.help} ` : ''}
                Stored encrypted and never shown again in full{secret.saved ? '; leave empty to keep the saved value' : ''}.
              </p>
            </div>
          ))}
        </div>

        {channel.webhooks.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-sm font-medium text-gray-800">Delivery status webhooks</p>
            {channel.webhooks.map((hook) => (
              <div key={hook.url} className="text-xs text-gray-700">
                <p className="font-medium">{hook.label}</p>
                <p className="font-mono break-all">{hook.url}</p>
                <p className="text-gray-500">{hook.note}</p>
              </div>
            ))}
          </div>
        )}

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" id={id('enabled')} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canManage} />
          Channel switched on
        </label>

        {canManage && (
          <div>
            <label htmlFor={id('reason')} className="block text-sm font-medium text-gray-700 mb-1">
              Reason for this change <span className="text-red-600">*</span>
            </label>
            <input id={id('reason')} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Saved in the activity log" />
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              {channel.secrets.some((s) => s.saved) && (
                <Button type="button" variant="ghost" onClick={() => setRemoving({ key: 'all', label: 'Every saved key for this channel' })}>
                  Remove all saved keys
                </Button>
              )}
              {channel.state !== 'adapter_missing' || isSms ? (
                <Button type="button" variant="secondary" onClick={openTest}>
                  {isSms ? 'Send test OTP' : 'Send test message'}
                </Button>
              ) : null}
            </div>
            <Button type="submit" loading={saving} disabled={reason.trim().length < 5}>
              Save {channel.label}
            </Button>
          </div>
        )}
        {channel.updatedAt && (
          <p className="text-xs text-gray-500">
            Last saved {formatDate(channel.updatedAt, true)}
            {channel.updatedBy ? ` by ${channel.updatedBy}` : ''}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.key === 'all' ? `Remove every saved key for ${channel.label}` : `Remove ${removing?.label.toLowerCase() || ''}`}
        message={
          removing?.key === 'all' || removing?.key === channel.secrets[0]?.key
            ? `This removes the stored value and switches ${channel.label} off. Nothing can be sent on it until a key is saved again.`
            : 'This removes the stored value. Status updates that need it will be refused until it is saved again.'
        }
        confirmLabel="Remove"
        danger
        askReason
        reasonRequired
        busy={saving}
        onConfirm={removeSecret}
        onClose={() => setRemoving(null)}
      />

      <Modal
        open={testOpen}
        title={isSms ? 'Send a test OTP by SMS' : `Send a test ${channel.label.toLowerCase()} message`}
        onClose={() => setTestOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(false)} disabled={testing}>
              Close
            </Button>
            <Button onClick={sendTest} loading={testing} disabled={testDisabled}>
              Send real message
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700">
          <NoticeBar notice={testResult} />
          <p>
            {isSms
              ? 'This asks 2Factor to send a real one-time password SMS using the saved API key. It uses SMS credits and the person at this number receives the message.'
              : `This hands one real message to ${channel.providerLabel || 'the provider'} with the saved credentials, even if the channel is switched off. It may be charged by the provider and the recipient receives it. The attempt is written to the delivery log and the activity log.`}
          </p>
          <div>
            <label htmlFor={id('test-to')} className="block text-sm font-medium text-gray-700 mb-1">
              {isSms ? 'Send to phone number' : TEST_TARGET[channel.channel]?.label}
            </label>
            <input
              id={id('test-to')}
              type={isSms ? 'tel' : TEST_TARGET[channel.channel]?.type || 'text'}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              className={inputClass}
              placeholder={isSms ? '10-digit mobile number' : TEST_TARGET[channel.channel]?.placeholder}
            />
          </div>
          {channel.channel === 'whatsapp' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('test-wa-template')} className="block text-sm font-medium text-gray-700 mb-1">
                  Approved WhatsApp template
                </label>
                <input id={id('test-wa-template')} value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} className={inputClass} />
                <p className="text-xs text-gray-500 mt-1">Meta only delivers approved templates. hello_world exists in every new account.</p>
              </div>
              <div>
                <label htmlFor={id('test-wa-language')} className="block text-sm font-medium text-gray-700 mb-1">
                  Language code
                </label>
                <input id={id('test-wa-language')} value={waLanguage} onChange={(e) => setWaLanguage(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" id={id('test-confirm')} className="mt-1" checked={testConfirmed} onChange={(e) => setTestConfirmed(e.target.checked)} />
            <span>I understand that a real message will be sent to this recipient through the provider.</span>
          </label>
        </div>
      </Modal>
    </Card>
  )
}
