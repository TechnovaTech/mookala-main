'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, Eye, EyeOff, Info, Plug, Save, Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import {
  api,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  formatDate,
  inputClass,
  Modal,
  NoticeBar,
  Spinner,
  type Notice,
} from '@/components/ui'

interface PaymentConfig {
  provider: string
  keyId: string
  keyIdMasked: string
  secretMasked: string
  secretSet: boolean
  secretDecryptFailed: boolean
  mode: 'test' | 'live' | 'unknown'
  enabled: boolean
  isConfigured: boolean
  source: 'database' | 'environment' | 'none'
  envFallbackAvailable: boolean
  webhookSecretSet: boolean
  webhookSecretMasked: string
  webhookSecretSource: 'database' | 'environment' | 'none'
  webhookSecretDecryptFailed: boolean
  updatedAt: string | null
  updatedBy: string | null
}

interface Impact {
  pendingPayments: number
  confirmedBookings: number
  refundsInProgress: number
  settlementsInProgress: number
  lastWebhook: {
    event?: string
    signatureValid?: boolean
    processed?: boolean
    error?: string | null
    receivedAt?: string
  } | null
}

interface SettingsResponse {
  config: PaymentConfig
  impact?: Impact
  message?: string
}

const WEBHOOK_EVENTS = [
  'payment.captured',
  'payment.failed',
  'refund.processed',
  'refund.failed',
  'payment.dispute.created',
  'payment.dispute.won',
  'payment.dispute.lost',
]

function Warning({ tone, children }: { tone: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const styles = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  }[tone]
  const Icon = tone === 'blue' ? Info : AlertTriangle
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 text-sm ${styles}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export default function PaymentGatewayPage() {
  return (
    <AdminShell title="Payment Gateway" subtitle="Razorpay keys, webhook and the online payments switch">
      <PaymentGateway />
    </AdminShell>
  )
}

function PaymentGateway() {
  // Changing the gateway needs 'integrations:manage'; 'integrations:view' alone shows it read-only.
  const canManage = useCan('integrations:manage')
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)

  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [forceSaveAvailable, setForceSaveAvailable] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'toggle' | 'remove' | 'webhook' | 'webhook-remove'>('')

  const [webhookSecret, setWebhookSecret] = useState('')
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmRemoveWebhook, setConfirmRemoveWebhook] = useState(false)
  const [shutdownOpen, setShutdownOpen] = useState(false)
  const [shutdownAgreed, setShutdownAgreed] = useState(false)
  const [shutdownReason, setShutdownReason] = useState('')
  // Why the keys, webhook secret or on/off switch are being changed. Stored in the activity log.
  const [changeReason, setChangeReason] = useState('')
  const reasonOk = changeReason.trim().length >= 5

  const applyConfig = useCallback((next: PaymentConfig, resetForm = true) => {
    setConfig(next)
    if (resetForm) {
      setKeyId(next.keyId || '')
      setKeySecret('')
      setShowSecret(false)
      setForceSaveAvailable(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api<SettingsResponse>('/api/settings/payment')
      applyConfig(data.config)
      setImpact(data.impact || null)
    } catch (error: any) {
      setLoadError(error?.message || 'Failed to load payment gateway settings')
    } finally {
      setLoading(false)
    }
  }, [applyConfig])

  useEffect(() => {
    setWebhookUrl(window.location.origin + '/api/payment/webhook')
    load()
  }, [load])

  const refreshImpact = async () => {
    try {
      const data = await api<SettingsResponse>('/api/settings/payment')
      setImpact(data.impact || null)
      return data.impact || null
    } catch {
      return null
    }
  }

  /* ---------------- API keys ---------------- */

  const saveKeys = async (force = false) => {
    setBusy('save')
    setNotice(null)
    try {
      // Plain fetch here, not api(): a refusal carries `canForce`, which api() drops.
      const response = await fetch('/api/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ keyId: keyId.trim(), keySecret: keySecret.trim(), force, reason: changeReason.trim() }),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        window.location.href = '/login?next=/settings'
        return
      }
      if (data?.success && data.config) {
        applyConfig(data.config)
        setChangeReason('')
        setNotice({ type: 'success', text: data.message || 'Razorpay credentials saved.' })
      } else {
        // Razorpay rejected the pair: the admin may still choose to save it.
        setForceSaveAvailable(Boolean(data?.canForce))
        setNotice({ type: 'error', text: data?.error || 'Failed to save Razorpay credentials' })
      }
    } catch {
      setNotice({ type: 'error', text: 'Failed to save Razorpay credentials' })
    } finally {
      setBusy('')
    }
  }

  const testConnection = async () => {
    setBusy('test')
    setNotice(null)
    try {
      const data = await api<{ message?: string }>('/api/settings/payment/verify', {
        method: 'POST',
        body: { keyId: keyId.trim(), keySecret: keySecret.trim() },
      })
      setNotice({ type: 'success', text: data.message || 'Connected to Razorpay' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not test the connection' })
    } finally {
      setBusy('')
    }
  }

  const removeKeys = async (reason: string) => {
    setBusy('remove')
    setNotice(null)
    try {
      const data = await api<SettingsResponse>('/api/settings/payment', { method: 'DELETE', body: { reason } })
      applyConfig(data.config)
      setNotice({ type: 'info', text: data.message || 'Credentials removed.' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Failed to remove credentials' })
    } finally {
      setBusy('')
      setConfirmRemove(false)
    }
  }

  /* ---------------- On / off switch ---------------- */

  const setEnabled = async (enabled: boolean, reason = '') => {
    setBusy('toggle')
    setNotice(null)
    try {
      const data = await api<SettingsResponse>('/api/settings/payment', {
        method: 'POST',
        body: enabled ? { enabled: true, reason: changeReason.trim() } : { enabled: false, confirm: true, reason },
      })
      applyConfig(data.config, false)
      setNotice({ type: enabled ? 'success' : 'info', text: data.message || 'Updated' })
      setShutdownOpen(false)
      refreshImpact()
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Failed to update' })
      setShutdownOpen(false)
    } finally {
      setBusy('')
    }
  }

  const onToggle = async () => {
    if (!config) return
    if (!config.enabled) {
      if (!reasonOk) {
        setNotice({ type: 'error', text: 'Write a reason for this change (at least 5 characters) in "Reason for this change" first.' })
        return
      }
      setEnabled(true)
      return
    }
    // Switching off: show what it affects first, with fresh numbers.
    setShutdownAgreed(false)
    setShutdownReason('')
    setBusy('toggle')
    await refreshImpact()
    setBusy('')
    setShutdownOpen(true)
  }

  /* ---------------- Webhook ---------------- */

  const saveWebhookSecret = async () => {
    setBusy('webhook')
    setNotice(null)
    try {
      const data = await api<SettingsResponse>('/api/settings/payment', {
        method: 'POST',
        body: { webhookSecret: webhookSecret.trim(), reason: changeReason.trim() },
      })
      applyConfig(data.config, false)
      setWebhookSecret('')
      setChangeReason('')
      setShowWebhookSecret(false)
      setNotice({ type: 'success', text: data.message || 'Webhook secret saved' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Failed to save the webhook secret' })
    } finally {
      setBusy('')
    }
  }

  const removeWebhookSecret = async (reason: string) => {
    setBusy('webhook-remove')
    setNotice(null)
    try {
      const data = await api<SettingsResponse>('/api/settings/payment', {
        method: 'POST',
        body: { removeWebhookSecret: true, reason },
      })
      applyConfig(data.config, false)
      setNotice({ type: 'info', text: data.message || 'Webhook secret removed' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Failed to remove the webhook secret' })
    } finally {
      setBusy('')
      setConfirmRemoveWebhook(false)
    }
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice({ type: 'error', text: 'Could not copy. Select the address and copy it by hand.' })
    }
  }

  /* ---------------- Derived values ---------------- */

  const typedMode: 'test' | 'live' | 'unknown' = keyId.startsWith('rzp_live_')
    ? 'live'
    : keyId.startsWith('rzp_test_')
    ? 'test'
    : 'unknown'
  const keyIdChanged = (config?.keyId || '') !== keyId.trim()
  const canSave =
    keyId.trim().length > 0 &&
    (keySecret.trim().length > 0 || (!keyIdChanged && config?.source === 'database' && Boolean(config?.secretSet)))
  const localAddress = /^https?:\/\/(localhost|127\.|10\.|192\.168\.)/.test(webhookUrl)

  if (loading && !config) return <Spinner label="Loading payment gateway settings..." />

  if (loadError && !config) {
    return (
      <Card className="p-6 max-w-2xl">
        <NoticeBar notice={{ type: 'error', text: loadError }} />
        <Button variant="secondary" onClick={load}>
          Retry
        </Button>
      </Card>
    )
  }

  if (!config) return null

  return (
    <div className="max-w-3xl space-y-6">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {!canManage && (
        <NoticeBar notice={{ type: 'info', text: 'You can see the payment gateway settings but not change them. Changes need the payment gateway (integrations) manage permission.' }} />
      )}

      {canManage && (
        <Card className="p-4">
          <label htmlFor="gateway-change-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason for this change <span className="text-red-600">*</span>
          </label>
          <input
            id="gateway-change-reason"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            className={inputClass}
            placeholder="Needed to save keys, save the webhook secret or switch payments on. Saved in the activity log."
          />
        </Card>
      )}

      {/* ---------------- Status and switch ---------------- */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-deep-blue">Online payments</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-xl">
              When this is off, customers cannot pay for tickets: paid bookings are refused on the website and in the
              apps until it is switched on again. Free events are not affected.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Badge tone={!config.isConfigured ? 'gray' : config.enabled ? 'green' : 'red'}>
                {!config.isConfigured ? 'Not configured' : config.enabled ? 'Active' : 'Switched off'}
              </Badge>
              {config.mode !== 'unknown' && (
                <Badge tone={config.mode === 'live' ? 'red' : 'amber'}>{config.mode === 'live' ? 'LIVE mode' : 'TEST mode'}</Badge>
              )}
            </div>
            <button
              onClick={onToggle}
              disabled={!canManage || busy !== '' || !config.keyId}
              role="switch"
              aria-checked={config.enabled}
              aria-label="Online payments"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                config.enabled ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
        {!config.keyId && (
          <p className="text-sm text-gray-500 mt-3">Save the Razorpay keys below before switching payments on.</p>
        )}
      </Card>

      {/* ---------------- API keys ---------------- */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-deep-blue">Razorpay API keys</h2>
        <p className="text-sm text-gray-600 mt-1 mb-5">
          Used by the server to create orders, verify payments and send refunds. Find them in the Razorpay Dashboard
          under Account &amp; Settings → API Keys.
        </p>

        <div className="space-y-5">
          <div>
            <label htmlFor="rzp-key-id" className="block text-sm font-medium text-gray-700 mb-1">
              Key ID
            </label>
            <input
              id="rzp-key-id"
              type="text"
              value={keyId}
              onChange={(e) => {
                setKeyId(e.target.value)
                setForceSaveAvailable(false)
              }}
              placeholder="rzp_test_xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
              className={inputClass + ' font-mono'}
            />
          </div>

          <div>
            <label htmlFor="rzp-key-secret" className="block text-sm font-medium text-gray-700 mb-1">
              Key Secret
            </label>
            <div className="relative">
              <input
                id="rzp-key-secret"
                type={showSecret ? 'text' : 'password'}
                value={keySecret}
                onChange={(e) => {
                  setKeySecret(e.target.value)
                  setForceSaveAvailable(false)
                }}
                placeholder={config.secretSet ? `Saved: ${config.secretMasked} - leave blank to keep` : 'Paste the Key Secret'}
                autoComplete="new-password"
                spellCheck={false}
                className={inputClass + ' font-mono pr-11'}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-deep-blue"
                aria-label={showSecret ? 'Hide the key secret' : 'Show the key secret'}
              >
                {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Stored encrypted on the server. After saving, only the last four characters are ever shown.
            </p>
          </div>

          {typedMode === 'live' && (
            <Warning tone="red">
              These are <strong>LIVE</strong> keys. Real money will be charged on every booking.
            </Warning>
          )}
          {keyId.trim().length > 0 && typedMode === 'unknown' && (
            <Warning tone="amber">
              This does not look like a Razorpay Key ID. It should start with <code className="font-mono">rzp_test_</code>{' '}
              or <code className="font-mono">rzp_live_</code>.
            </Warning>
          )}
          {config.secretDecryptFailed && (
            <Warning tone="amber">
              The saved Key Secret could not be decrypted (the server encryption key changed). Please enter the Key
              Secret again.
            </Warning>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => saveKeys(false)} loading={busy === 'save'} disabled={!canManage || busy !== '' || !canSave || !reasonOk}>
              {busy !== 'save' && <Save size={16} />} Save keys
            </Button>
            <Button
              variant="secondary"
              onClick={testConnection}
              loading={busy === 'test'}
              disabled={!canManage || busy !== '' || keyId.trim().length === 0}
            >
              {busy !== 'test' && <Plug size={16} />} Test connection
            </Button>
          </div>

          {forceSaveAvailable && canManage && (
            <button
              onClick={() => saveKeys(true)}
              disabled={busy !== ''}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50 text-sm"
            >
              <AlertTriangle size={16} />
              Save anyway (Razorpay did not accept these keys)
            </button>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-gray-100 pt-4">
            <dt className="text-gray-500">Credentials source</dt>
            <dd className="text-gray-900 text-right">
              {config.source === 'database'
                ? 'Admin panel'
                : config.source === 'environment'
                ? 'Server environment'
                : 'Not set'}
            </dd>
            <dt className="text-gray-500">Key Secret</dt>
            <dd className="text-gray-900 text-right font-mono">{config.secretSet ? config.secretMasked : 'Not set'}</dd>
            {config.updatedAt && (
              <>
                <dt className="text-gray-500">Last changed</dt>
                <dd className="text-gray-900 text-right">
                  {formatDate(config.updatedAt, true)}
                  {config.updatedBy ? ` by ${config.updatedBy}` : ''}
                </dd>
              </>
            )}
          </dl>

          {config.source === 'environment' && (
            <Warning tone="blue">
              Keys are currently read from the server environment. Saving here overrides them and makes the gateway
              fully manageable from the admin panel.
            </Warning>
          )}

          {config.source === 'database' && canManage && (
            <button
              onClick={() => setConfirmRemove(true)}
              disabled={busy !== ''}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Remove saved credentials
            </button>
          )}
        </div>
      </Card>

      {/* ---------------- Webhook ---------------- */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-deep-blue">Razorpay webhook</h2>
          <Badge tone={config.webhookSecretSet ? 'green' : 'amber'}>
            {config.webhookSecretSet ? 'Secret saved' : 'Secret not saved'}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1 mb-5">
          Razorpay calls this address when a payment is captured or fails, when a refund finishes and when a dispute is
          raised or decided. It confirms
          bookings even if the customer closes the app before returning from checkout. In the Razorpay Dashboard go to
          Account &amp; Settings → Webhooks, add this address, choose a secret and enter the same secret here.
        </p>

        <div className="space-y-5">
          <div>
            <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <div className="flex gap-2">
              <input id="webhook-url" type="text" readOnly value={webhookUrl} className={inputClass + ' font-mono'} onFocus={(e) => e.target.select()} />
              <Button variant="secondary" onClick={copyUrl} aria-label="Copy the webhook URL">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {localAddress && (
              <p className="mt-1 text-xs text-amber-700">
                This is a local address that Razorpay cannot reach. Use the address of the live admin panel.
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Events to switch on in Razorpay</p>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((name) => (
                <code key={name} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-800">
                  {name}
                </code>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="webhook-secret" className="block text-sm font-medium text-gray-700 mb-1">
              Webhook secret
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="webhook-secret"
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={
                    config.webhookSecretSet
                      ? `Saved: ${config.webhookSecretMasked} - enter a new one to replace it`
                      : 'The secret you typed in the Razorpay webhook form'
                  }
                  autoComplete="new-password"
                  spellCheck={false}
                  className={inputClass + ' font-mono pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-deep-blue"
                  aria-label={showWebhookSecret ? 'Hide the webhook secret' : 'Show the webhook secret'}
                >
                  {showWebhookSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <Button onClick={saveWebhookSecret} loading={busy === 'webhook'} disabled={!canManage || busy !== '' || webhookSecret.trim().length < 8 || !reasonOk}>
                Save secret
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Stored encrypted and never shown in full again. Deliveries whose signature does not match it are refused.
            </p>
          </div>

          {config.webhookSecretDecryptFailed && (
            <Warning tone="amber">
              The saved webhook secret could not be decrypted (the server encryption key changed). Please enter it again.
            </Warning>
          )}
          {!config.webhookSecretSet && (
            <Warning tone="amber">
              Until a webhook secret is saved, every webhook delivery is refused. Bookings are then only confirmed when
              the customer&apos;s app reports back after checkout.
            </Warning>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-gray-100 pt-4">
            <dt className="text-gray-500">Secret source</dt>
            <dd className="text-gray-900 text-right">
              {config.webhookSecretSource === 'database'
                ? 'Admin panel'
                : config.webhookSecretSource === 'environment'
                ? 'Server environment'
                : 'Not set'}
            </dd>
            <dt className="text-gray-500">Last delivery received</dt>
            <dd className="text-gray-900 text-right">
              {impact?.lastWebhook ? (
                <>
                  {impact.lastWebhook.event || 'unknown event'} · {formatDate(impact.lastWebhook.receivedAt, true)} ·{' '}
                  {impact.lastWebhook.signatureValid === false
                    ? 'signature refused'
                    : impact.lastWebhook.processed
                    ? 'processed'
                    : 'not processed'}
                </>
              ) : (
                'None yet'
              )}
            </dd>
          </dl>

          {config.webhookSecretSource === 'database' && canManage && (
            <button
              onClick={() => setConfirmRemoveWebhook(true)}
              disabled={busy !== ''}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Remove webhook secret
            </button>
          )}
        </div>
      </Card>

      {/* ---------------- Pointer to commission settings ---------------- */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-deep-blue">Commission and charges</h2>
        <p className="text-sm text-gray-600 mt-1">
          The single &quot;platform charges&quot; percentage that used to be on this page was never applied to any
          payment and has been removed. Commission, GST and gateway charges are set per service, with effective dates,
          in{' '}
          <Link href="/finance/commissions" className="text-deep-blue underline">
            Finance → Commission Settings
          </Link>
          . Cancellation refunds are set in{' '}
          <Link href="/finance/refund-rules" className="text-deep-blue underline">
            Finance → Refund Rules
          </Link>
          .
        </p>
      </Card>

      {/* ---------------- Dialogs ---------------- */}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove the saved Razorpay keys?"
        danger
        askReason
        reasonRequired
        busy={busy === 'remove'}
        confirmLabel="Remove keys"
        onClose={() => setConfirmRemove(false)}
        onConfirm={removeKeys}
        message={
          config.envFallbackAvailable
            ? 'Checkout stops using these keys immediately and falls back to the keys in the server environment.'
            : 'Checkout stops working immediately: customers will not be able to pay until new keys are saved.'
        }
      />

      <ConfirmDialog
        open={confirmRemoveWebhook}
        title="Remove the webhook secret?"
        danger
        askReason
        reasonRequired
        busy={busy === 'webhook-remove'}
        confirmLabel="Remove secret"
        onClose={() => setConfirmRemoveWebhook(false)}
        onConfirm={removeWebhookSecret}
        message="Razorpay webhook deliveries will be refused until a new secret is saved. Payments are then only confirmed when the customer's app reports back after checkout, and refund results will not update on their own."
      />

      <Modal
        open={shutdownOpen}
        title="Switch online payments off?"
        onClose={() => setShutdownOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShutdownOpen(false)} disabled={busy === 'toggle'}>
              Keep payments on
            </Button>
            <Button
              variant="danger"
              loading={busy === 'toggle'}
              disabled={!impact || !shutdownAgreed || shutdownReason.trim().length < 5}
              onClick={() => setEnabled(false, shutdownReason.trim())}
            >
              Switch payments off
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700">
          <p>While payments are off, no customer can pay for a ticket and the server cannot reach Razorpay.</p>
          {impact ? (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              <li className="flex justify-between gap-4 px-4 py-2">
                <span>
                  Bookings awaiting payment right now
                  <span className="block text-xs text-gray-500">
                    Customers who are at checkout. A payment that still succeeds is confirmed by the webhook.
                  </span>
                </span>
                <span className="font-semibold text-deep-blue">{impact.pendingPayments}</span>
              </li>
              <li className="flex justify-between gap-4 px-4 py-2">
                <span>
                  Refunds in progress
                  <span className="block text-xs text-gray-500">
                    Requested, approved or being paid. They cannot be sent through Razorpay while payments are off.
                  </span>
                </span>
                <span className="font-semibold text-deep-blue">{impact.refundsInProgress}</span>
              </li>
              <li className="flex justify-between gap-4 px-4 py-2">
                <span>
                  Settlements in progress
                  <span className="block text-xs text-gray-500">Pending or approved payouts to organisers and artists.</span>
                </span>
                <span className="font-semibold text-deep-blue">{impact.settlementsInProgress}</span>
              </li>
              <li className="flex justify-between gap-4 px-4 py-2">
                <span>
                  Confirmed bookings
                  <span className="block text-xs text-gray-500">These stay valid and can still be checked in.</span>
                </span>
                <span className="font-semibold text-deep-blue">{impact.confirmedBookings}</span>
              </li>
            </ul>
          ) : (
            <Warning tone="amber">The current numbers could not be loaded. Close this and try again.</Warning>
          )}
          <div>
            <label htmlFor="shutdown-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              id="shutdown-reason"
              rows={2}
              value={shutdownReason}
              onChange={(e) => setShutdownReason(e.target.value)}
              className={inputClass}
              placeholder="This is saved in the activity log"
            />
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={shutdownAgreed}
              onChange={(e) => setShutdownAgreed(e.target.checked)}
              className="mt-1"
            />
            <span>I understand that customers will not be able to pay until payments are switched on again.</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}
