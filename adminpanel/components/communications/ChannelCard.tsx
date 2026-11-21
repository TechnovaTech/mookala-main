'use client'
import React, { useEffect, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, Modal, NoticeBar, api, formatDate, inputClass, type Notice } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

export interface ChannelView {
  channel: string
  label: string
  provider: string
  providerFixed: boolean
  enabled: boolean
  secretLabel: string
  secretMasked: string
  hasSecret: boolean
  secretDecryptFailed: boolean
  fields: { key: string; label: string; help?: string; value: string }[]
  state: 'connected' | 'disabled' | 'not_configured' | 'adapter_missing'
  capability: string
  updatedAt: string | null
  updatedBy: string | null
  lastProviderResult: { status: string; error: string | null; at: string } | null
}

const STATE: Record<ChannelView['state'], { label: string; tone: Tone; line: string }> = {
  connected: {
    label: 'Connected',
    tone: 'green',
    line: 'Credentials are saved and the channel is switched on.',
  },
  disabled: {
    label: 'Switched off',
    tone: 'amber',
    line: 'Credentials are saved but the channel is switched off, so nothing is sent.',
  },
  not_configured: {
    label: 'Not configured',
    tone: 'gray',
    line: 'No credentials have been saved, so nothing is sent.',
  },
  adapter_missing: {
    label: 'Adapter not implemented yet',
    tone: 'red',
    line: 'There is no code that talks to a provider for this channel. Details saved here are kept for when it is written.',
  },
}

const PROVIDER_NAMES: Record<string, string> = { '2factor': '2Factor', fcm: 'Firebase Cloud Messaging (FCM)' }

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
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(channel.enabled)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')

  const [testOpen, setTestOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testConfirmed, setTestConfirmed] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<Notice>(null)

  useEffect(() => {
    setProvider(channel.provider)
    setEnabled(channel.enabled)
    setValues(Object.fromEntries(channel.fields.map((f) => [f.key, f.value])))
    setSecret('')
  }, [channel])

  const state = STATE[channel.state]
  const id = (name: string) => `${channel.channel}-${name}`

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api('/api/admin/communications/channels', {
        method: 'PUT',
        body: { channel: channel.channel, provider, secret, enabled, values, reason: reason.trim() },
      })
      setNotice({ type: 'success', text: `${channel.label} settings saved.` })
      setReason('')
      onSaved()
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const removeSecret = async (removeReason: string) => {
    setSaving(true)
    try {
      await api('/api/admin/communications/channels', {
        method: 'PUT',
        body: { channel: channel.channel, provider, clearSecret: true, enabled: false, values, reason: removeReason },
      })
      setNotice({ type: 'success', text: `The saved ${channel.secretLabel.toLowerCase()} was removed and the channel switched off.` })
      setRemoving(false)
      onSaved()
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not remove the key.' })
      setRemoving(false)
    } finally {
      setSaving(false)
    }
  }

  const openTest = () => {
    setTestPhone('')
    setTestConfirmed(false)
    setTestResult(null)
    setTestOpen(true)
  }

  const sendTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const data = await api<any>('/api/admin/communications/channels/test-sms', {
        method: 'POST',
        body: { phone: testPhone, confirm: testConfirmed },
      })
      setTestResult(
        data.accepted
          ? { type: 'success', text: '2Factor accepted the request. The SMS should arrive shortly; this is not a delivery confirmation.' }
          : { type: 'error', text: `Not sent: ${data.error}` }
      )
      setTestConfirmed(false)
      onSaved()
    } catch (e: any) {
      setTestResult({ type: 'error', text: e.message || 'Could not send the test SMS.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-deep-blue">{channel.label}</h2>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="text-sm text-gray-700 mt-2">{state.line}</p>
      <p className="text-sm text-gray-600 mt-1">{channel.capability}</p>
      <p className="text-sm text-gray-600 mt-1">
        Last response from the provider:{' '}
        {channel.lastProviderResult
          ? `${channel.lastProviderResult.status === 'accepted' ? 'accepted a message' : `refused a message (${channel.lastProviderResult.error || 'no reason given'})`} on ${formatDate(channel.lastProviderResult.at, true)}`
          : 'none yet. Nothing has been handed to a provider on this channel.'}
      </p>
      {channel.secretDecryptFailed && (
        <p className="text-sm text-red-700 mt-2">
          A {channel.secretLabel.toLowerCase()} is stored but cannot be read with the current encryption key. Type it again and save.
        </p>
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
              <input id={id('provider')} value={PROVIDER_NAMES[channel.provider] || channel.provider} disabled className={inputClass} />
            ) : (
              <input
                id={id('provider')}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={!canManage}
                maxLength={40}
                className={inputClass}
                placeholder="Name of the provider"
              />
            )}
          </div>
          <div>
            <label htmlFor={id('secret')} className="block text-sm font-medium text-gray-700 mb-1">
              {channel.secretLabel}
            </label>
            <input
              id={id('secret')}
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={!canManage}
              className={inputClass}
              placeholder={channel.hasSecret ? `Saved: ${channel.secretMasked}` : 'Not saved yet'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {channel.hasSecret
                ? 'Stored encrypted. Leave empty to keep the saved key, or type a new one to replace it.'
                : 'Stored encrypted and never shown again in full.'}
            </p>
          </div>
          {channel.fields.map((field) => (
            <div key={field.key}>
              <label htmlFor={id(field.key)} className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
              </label>
              <input
                id={id(field.key)}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                disabled={!canManage}
                className={inputClass}
              />
              {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
            </div>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            id={id('enabled')}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canManage}
          />
          Channel switched on
        </label>

        {canManage && (
          <div>
            <label htmlFor={id('reason')} className="block text-sm font-medium text-gray-700 mb-1">
              Reason for this change <span className="text-red-600">*</span>
            </label>
            <input
              id={id('reason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder="Saved in the activity log"
            />
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              {channel.hasSecret && (
                <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
                  Remove saved key
                </Button>
              )}
              {channel.channel === 'sms' && (
                <Button type="button" variant="secondary" onClick={openTest}>
                  Send test OTP
                </Button>
              )}
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
        open={removing}
        title={`Remove the saved ${channel.secretLabel.toLowerCase()}`}
        message={`This removes the stored ${channel.secretLabel.toLowerCase()} for ${channel.label} and switches the channel off. Nothing can be sent on it until a key is saved again.`}
        confirmLabel="Remove key"
        danger
        askReason
        reasonRequired
        busy={saving}
        onConfirm={removeSecret}
        onClose={() => setRemoving(false)}
      />

      <Modal
        open={testOpen}
        title="Send a test OTP by SMS"
        onClose={() => setTestOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(false)} disabled={testing}>
              Close
            </Button>
            <Button onClick={sendTest} loading={testing} disabled={!testConfirmed || !/^\+?\d{10,13}$/.test(testPhone.replace(/[\s\-()]/g, ''))}>
              Send real SMS
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700">
          <NoticeBar notice={testResult} />
          <p>
            This asks 2Factor to send a real one-time password SMS using the saved API key. It uses SMS credits from the 2Factor account
            and the person at this number will receive the message.
          </p>
          <div>
            <label htmlFor="test-sms-phone" className="block text-sm font-medium text-gray-700 mb-1">
              Send to phone number
            </label>
            <input
              id="test-sms-phone"
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className={inputClass}
              placeholder="10-digit mobile number"
            />
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              id="test-sms-confirm"
              className="mt-1"
              checked={testConfirmed}
              onChange={(e) => setTestConfirmed(e.target.checked)}
            />
            <span>I understand that a real SMS will be sent to this number and charged to the 2Factor account.</span>
          </label>
        </div>
      </Modal>
    </Card>
  )
}
