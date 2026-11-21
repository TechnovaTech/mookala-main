'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { ApprovalHeldNotice, apiOrHeld, type HeldForApproval } from '@/components/security/approval'
import WaitingApprovals from '@/components/security/WaitingApprovals'

interface WindowForm {
  id: string
  startsAt: string
  endsAt: string
  message: string
  notifyInAdvance: boolean
}

interface Form {
  platformName: string
  supportEmail: string
  supportPhone: string
  contactAddress: string
  defaultCurrency: string
  timezone: string
  legalLinks: { terms: string; privacy: string; refund: string; cancellation: string }
  maintenance: { enabled: boolean; message: string; allowAdmins: boolean }
  maintenanceWindows: WindowForm[]
}

const LEGAL_LINKS: { key: keyof Form['legalLinks']; label: string }[] = [
  { key: 'terms', label: 'Terms of use' },
  { key: 'privacy', label: 'Privacy policy' },
  { key: 'refund', label: 'Refund policy' },
  { key: 'cancellation', label: 'Cancellation policy' },
]

/** ISO date to the value a datetime-local input expects, in the browser's timezone. */
function toLocalInput(value: any): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function toForm(config: any): Form {
  return {
    platformName: config.platformName || '',
    supportEmail: config.supportEmail || '',
    supportPhone: config.supportPhone || '',
    contactAddress: config.contactAddress || '',
    defaultCurrency: config.defaultCurrency || 'INR',
    timezone: config.timezone || 'Asia/Kolkata',
    legalLinks: { terms: '', privacy: '', refund: '', cancellation: '', ...(config.legalLinks || {}) },
    maintenance: { enabled: false, message: '', allowAdmins: true, ...(config.maintenance || {}) },
    maintenanceWindows: (config.maintenanceWindows || []).map((w: any) => ({
      id: w.id,
      startsAt: toLocalInput(w.startsAt),
      endsAt: toLocalInput(w.endsAt),
      message: w.message || '',
      notifyInAdvance: Boolean(w.notifyInAdvance),
    })),
  }
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  )
}

export default function Page() {
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState<any>(null)
  const [meta, setMeta] = useState<any>(null)
  const [canManage, setCanManage] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [held, setHeld] = useState<HeldForApproval | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/platform')
      setForm(toForm(data.config))
      setSaved(data.config)
      setMeta({ maintenance: data.maintenance, system: data.system })
      setCanManage(Boolean(data.canManage))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the platform configuration.' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!form) {
    return (
      <AdminShell title="Platform Configuration" subtitle="Platform name, contact details, currency, timezone and maintenance mode">
        <NoticeBar notice={notice} />
        {!notice && <Spinner />}
      </AdminShell>
    )
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const setWindow = (index: number, patch: Partial<WindowForm>) =>
    set({ maintenanceWindows: form.maintenanceWindows.map((w, i) => (i === index ? { ...w, ...patch } : w)) })

  const switchingOn = form.maintenance.enabled && !saved?.maintenance?.enabled
  const switchingOff = !form.maintenance.enabled && Boolean(saved?.maintenance?.enabled)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)
    setConfirming(true)
  }

  const save = async (reason: string) => {
    setBusy(true)
    setHeld(null)
    try {
      const result = await apiOrHeld<any>('/api/admin/platform', {
        method: 'PUT',
        body: {
          reason,
          confirmMaintenance: switchingOn,
          config: {
            ...form,
            maintenanceWindows: form.maintenanceWindows.map((w) => ({
              ...w,
              startsAt: w.startsAt ? new Date(w.startsAt).toISOString() : '',
              endsAt: w.endsAt ? new Date(w.endsAt).toISOString() : '',
            })),
          },
        },
      })
      setConfirming(false)
      if (result.held) {
        // Nothing was saved: the form keeps the proposed values so they can be compared with what is live.
        setHeld(result)
        return
      }
      setNotice(
        result.data.unchanged
          ? { type: 'info', text: 'Nothing was changed, so nothing was saved.' }
          : { type: 'success', text: 'Platform configuration saved. The change and your reason are in the activity log.' }
      )
      await load()
    } catch (e: any) {
      setConfirming(false)
      setNotice({ type: 'error', text: e.message || 'Could not save the configuration.' })
    } finally {
      setBusy(false)
    }
  }

  const maintenance = meta?.maintenance
  const database = meta?.system?.database

  return (
    <AdminShell title="Platform Configuration" subtitle="Platform name, contact details, currency, timezone and maintenance mode">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ApprovalHeldNotice held={held} onClose={() => setHeld(null)} />
      <WaitingApprovals key={held?.approvalId || 'none'} actions={['platform_config']} title="Platform configuration changes waiting for a second approver" />

      <Card className="p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-deep-blue">System status</h2>
          <Link href="/system" className="text-sm text-teal font-medium underline">
            Open system health
          </Link>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Database</dt>
            <dd className="mt-1 flex items-center gap-2">
              <Badge tone={database?.ok ? 'green' : 'red'}>{database?.ok ? 'Responding' : 'Not responding'}</Badge>
              {database?.ok && <span className="text-gray-600">{database.latencyMs} ms</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Maintenance right now</dt>
            <dd className="mt-1">
              <Badge tone={maintenance?.active ? 'amber' : 'green'}>{maintenance?.active ? 'Published as under maintenance' : 'Not under maintenance'}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Next announced window</dt>
            <dd className="mt-1 text-gray-800">
              {maintenance?.upcomingWindow
                ? `${formatDate(maintenance.upcomingWindow.startsAt, true)} to ${formatDate(maintenance.upcomingWindow.endsAt, true)}`
                : 'None'}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-gray-500 mt-3">
          Checked {formatDate(meta?.system?.checkedAt, true)} by this page with a live round trip to the database.
        </p>
      </Card>

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canManage} className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-deep-blue mb-4">Platform and contact details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="platform-name" label="Platform name">
                <input id="platform-name" required maxLength={80} value={form.platformName} onChange={(e) => set({ platformName: e.target.value })} className={inputClass} />
              </Field>
              <Field id="support-email" label="Support email">
                <input id="support-email" type="email" value={form.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} className={inputClass} />
              </Field>
              <Field id="support-phone" label="Support phone">
                <input id="support-phone" type="tel" value={form.supportPhone} onChange={(e) => set({ supportPhone: e.target.value })} className={inputClass} />
              </Field>
              <Field id="default-currency" label="Default currency" help="Payments are taken in Indian rupees through Razorpay, so INR is the only choice.">
                <select id="default-currency" value={form.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })} className={inputClass}>
                  <option value="INR">INR (Indian rupee)</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field id="contact-address" label="Contact address">
                  <textarea id="contact-address" rows={2} maxLength={500} value={form.contactAddress} onChange={(e) => set({ contactAddress: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <Field id="timezone" label="Timezone" help="An IANA timezone name, for example Asia/Kolkata.">
                <input id="timezone" required value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-deep-blue">Links to legal pages</h2>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Published to the apps and website as the pages to link to. The policy texts themselves are managed under{' '}
              <Link href="/legal/policies" className="text-teal underline">
                Policies
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LEGAL_LINKS.map((link) => (
                <Field key={link.key} id={`legal-${link.key}`} label={link.label}>
                  <input
                    id={`legal-${link.key}`}
                    type="url"
                    placeholder="https://"
                    value={form.legalLinks[link.key]}
                    onChange={(e) => set({ legalLinks: { ...form.legalLinks, [link.key]: e.target.value } })}
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-deep-blue">Maintenance mode</h2>
            <div className="mt-3">
              <NoticeBar
                notice={{
                  type: 'info',
                  text: 'Maintenance mode is published at GET /api/public/platform. The mobile apps and the website do not call that endpoint yet, so switching maintenance mode on does not block them today: bookings and payments keep working. It takes effect once the apps check it.',
                }}
              />
            </div>
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  id="maintenance-enabled"
                  checked={form.maintenance.enabled}
                  onChange={(e) => set({ maintenance: { ...form.maintenance, enabled: e.target.checked } })}
                />
                Maintenance mode is on
              </label>
              <Field id="maintenance-message" label="Message shown to people" help="Required when maintenance mode is on.">
                <textarea
                  id="maintenance-message"
                  rows={2}
                  maxLength={500}
                  value={form.maintenance.message}
                  onChange={(e) => set({ maintenance: { ...form.maintenance, message: e.target.value } })}
                  className={inputClass}
                />
              </Field>
              <div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    id="maintenance-allow-admins"
                    checked={form.maintenance.allowAdmins}
                    onChange={(e) => set({ maintenance: { ...form.maintenance, allowAdmins: e.target.checked } })}
                  />
                  Admins keep access during maintenance
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Stored for when maintenance mode is enforced. The admin panel itself is never blocked by maintenance mode today.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-deep-blue">Scheduled maintenance windows</h2>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  set({ maintenanceWindows: [...form.maintenanceWindows, { id: '', startsAt: '', endsAt: '', message: '', notifyInAdvance: true }] })
                }
              >
                <Plus size={16} />
                Add window
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              During a window the public endpoint reports maintenance as active with the window&rsquo;s message. A window marked
              &ldquo;announce in advance&rdquo; is also published before it starts as the upcoming window. No SMS, email or push is sent
              about a window: no notification provider is connected for that. Times are in your browser&rsquo;s timezone.
            </p>
            {form.maintenanceWindows.length === 0 ? (
              <p className="text-sm text-gray-500">No maintenance windows are scheduled.</p>
            ) : (
              <ul className="space-y-4">
                {form.maintenanceWindows.map((w, index) => (
                  <li key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field id={`window-${index}-start`} label="Starts at">
                        <input id={`window-${index}-start`} type="datetime-local" required value={w.startsAt} onChange={(e) => setWindow(index, { startsAt: e.target.value })} className={inputClass} />
                      </Field>
                      <Field id={`window-${index}-end`} label="Ends at">
                        <input id={`window-${index}-end`} type="datetime-local" required value={w.endsAt} onChange={(e) => setWindow(index, { endsAt: e.target.value })} className={inputClass} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field id={`window-${index}-message`} label="Message">
                          <input id={`window-${index}-message`} required maxLength={500} value={w.message} onChange={(e) => setWindow(index, { message: e.target.value })} className={inputClass} />
                        </Field>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          id={`window-${index}-notify`}
                          checked={w.notifyInAdvance}
                          onChange={(e) => setWindow(index, { notifyInAdvance: e.target.checked })}
                        />
                        Announce in advance
                      </label>
                      <button
                        type="button"
                        onClick={() => set({ maintenanceWindows: form.maintenanceWindows.filter((_, i) => i !== index) })}
                        aria-label={`Remove maintenance window ${index + 1}`}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:text-gray-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {saved?.updatedAt ? `Last saved ${formatDate(saved.updatedAt, true)}${saved.updatedBy ? ` by ${saved.updatedBy}` : ''}` : 'Not saved yet: these are the defaults.'}
          </p>
          {canManage ? (
            <Button type="submit">Save configuration</Button>
          ) : (
            <p className="text-sm text-gray-600">You can view this configuration but not change it.</p>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={switchingOn ? 'Switch maintenance mode on' : 'Save platform configuration'}
        danger={switchingOn}
        confirmLabel={switchingOn ? 'Switch maintenance mode on' : 'Save'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={save}
        onClose={() => setConfirming(false)}
        message={
          switchingOn ? (
            <div className="space-y-2">
              <p>
                <strong>You are switching maintenance mode on.</strong> This is what happens:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>The public platform endpoint immediately reports the platform as under maintenance, with this message: &ldquo;{form.maintenance.message || '(no message written)'}&rdquo;</li>
                <li>Any app or website that checks that endpoint is expected to stop people from browsing, booking and paying until it is switched off.</li>
                <li>The mobile apps and the website do not check it yet, so today nothing is blocked for them and bookings and payments continue.</li>
                <li>The admin panel stays available.</li>
                <li>It stays on until an admin switches it off here. The change is recorded in the activity log with your reason.</li>
              </ul>
            </div>
          ) : (
            <p>
              {switchingOff ? 'Maintenance mode will be switched off. ' : ''}
              Every change to the platform configuration is recorded in the activity log with the old and new values. Give the reason for
              this change.
            </p>
          )
        }
      />
    </AdminShell>
  )
}
