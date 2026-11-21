'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { Field } from '@/components/security/shared'
import { ApprovalHeldNotice, apiOrHeld, type HeldForApproval } from '@/components/security/approval'

interface SensitiveAction {
  key: string
  label: string
  description: string
  superOnly: boolean
  permission: string
  defaultOn: boolean
}

interface Settings {
  sessionHours: number
  idleTimeoutMinutes: number
  maxSessions: number
  twoFactorRequiredRoles: string[]
  ipAllowlistEnabled: boolean
  ipAllowlist: string[]
  ipAllowlistRoles: string[]
  approvalActions: Record<string, boolean>
  updatedAt: string | null
  updatedBy: string | null
}

interface Data {
  settings: Settings
  defaults: Settings
  limits: Record<string, { min?: number; max: number }>
  roles: { value: string; label: string }[]
  sensitiveActions: SensitiveAction[]
  activeSuperAdmins: number
  breakGlass: { variable: string; value: string; active: boolean }
  you: { ip: string; role: string | null; ipOnList: boolean }
  pendingApprovals: { id: string; reference: string; status: string; requestedBy: string; createdAt: string; expiresAt: string }[]
  history: { id: string; adminName: string; adminEmail: string; before: any; after: any; reason: string; createdAt: string }[]
  canManage: boolean
}

interface Form {
  sessionHours: string
  idleTimeoutMinutes: string
  maxSessions: string
  twoFactorRequiredRoles: string[]
  ipAllowlistEnabled: boolean
  ipAllowlist: string
  ipAllowlistRoles: string[]
  approvalActions: Record<string, boolean>
}

function toForm(settings: Settings): Form {
  return {
    sessionHours: String(settings.sessionHours),
    idleTimeoutMinutes: String(settings.idleTimeoutMinutes),
    maxSessions: String(settings.maxSessions),
    twoFactorRequiredRoles: [...settings.twoFactorRequiredRoles],
    ipAllowlistEnabled: settings.ipAllowlistEnabled,
    ipAllowlist: settings.ipAllowlist.join('\n'),
    ipAllowlistRoles: [...settings.ipAllowlistRoles],
    approvalActions: { ...settings.approvalActions },
  }
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
      {hint && <div className="text-sm text-gray-600 mt-1 mb-4">{hint}</div>}
      {!hint && <div className="mb-4" />}
      {children}
    </Card>
  )
}

function RoleChecks({ id, roles, value, onChange }: { id: string; roles: Data['roles']; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-labelledby={id}>
      {roles.map((role) => (
        <label key={role.value} className="inline-flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" className="h-4 w-4 accent-teal" checked={value.includes(role.value)} onChange={() => onChange(toggle(value, role.value))} />
          {role.label}
        </label>
      ))}
    </div>
  )
}

function SettingsBody() {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [held, setHeld] = useState<HeldForApproval | null>(null)
  const [lockout, setLockout] = useState<{ ip: string; message: string } | null>(null)
  const [confirmLockout, setConfirmLockout] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<Data>('/api/admin/security/settings')
      setData(result)
      setForm(toForm(result.settings))
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!data || !form) return notice ? <NoticeBar notice={notice} /> : <Spinner />

  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch })
    // A changed allow-list is checked again on the next save.
    if ('ipAllowlist' in patch || 'ipAllowlistEnabled' in patch || 'ipAllowlistRoles' in patch) {
      setLockout(null)
      setConfirmLockout(false)
    }
  }
  const readOnly = !data.canManage
  const roleLabel = (value: string) => data.roles.find((role) => role.value === value)?.label || value
  const entries = form.ipAllowlist.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean)
  const coversYou = form.ipAllowlistEnabled && Boolean(data.you.role && form.ipAllowlistRoles.includes(data.you.role))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)
    setHeld(null)
    if (reason.trim().length < 5) {
      setNotice({ type: 'error', text: 'Write a reason of at least 5 characters. It is saved in the activity log.' })
      return
    }
    setBusy(true)
    try {
      const result = await apiOrHeld<{ message?: string; unchanged?: boolean }>('/api/admin/security/settings', {
        method: 'PUT',
        body: {
          reason: reason.trim(),
          confirmLockout: lockout ? confirmLockout : false,
          settings: {
            sessionHours: Number(form.sessionHours),
            idleTimeoutMinutes: Number(form.idleTimeoutMinutes),
            maxSessions: Number(form.maxSessions),
            twoFactorRequiredRoles: form.twoFactorRequiredRoles,
            ipAllowlistEnabled: form.ipAllowlistEnabled,
            ipAllowlist: entries,
            ipAllowlistRoles: form.ipAllowlistRoles,
            approvalActions: form.approvalActions,
          },
        },
      })
      if (result.held) {
        setHeld(result)
      } else {
        setNotice({ type: result.data.unchanged ? 'info' : 'success', text: result.data.message || 'Saved.' })
        setReason('')
      }
      setLockout(null)
      setConfirmLockout(false)
      await load()
    } catch (err: any) {
      if (err.data?.code === 'would_lock_out') {
        setLockout({ ip: err.data.ip, message: err.message })
      } else {
        setNotice({ type: 'error', text: err.message })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ApprovalHeldNotice held={held} onClose={() => setHeld(null)} />
      {readOnly && <NoticeBar notice={{ type: 'info', text: 'You can view these settings. Only a Super Admin can change them.' }} />}

      {data.pendingApprovals.length > 0 && (
        <Card className="p-4 mb-4">
          <p className="text-sm font-medium text-deep-blue">Changes to these settings waiting for a second Super Admin</p>
          <ul className="text-sm text-gray-700 mt-2 space-y-1">
            {data.pendingApprovals.map((item) => (
              <li key={item.id}>
                <Link href={`/security/approvals?id=${item.id}`} className="text-teal underline">
                  {item.reference}
                </Link>{' '}
                <Badge tone={item.status === 'approved' ? 'green' : 'amber'}>{item.status === 'approved' ? 'Approved, not carried out yet' : 'Waiting'}</Badge>{' '}
                requested by {item.requestedBy} on {formatDate(item.createdAt, true)}, expires {formatDate(item.expiresAt, true)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form onSubmit={save} className="space-y-4 max-w-5xl">
        <fieldset disabled={readOnly || busy} className="space-y-4">
          <Section title="Sessions" hint="How long a sign-in lasts and when an unused session is ended. Sessions already open keep the expiry they were given at sign-in.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Session length (hours)" htmlFor="sec-session-hours" hint={`${data.limits.sessionHours.min} to ${data.limits.sessionHours.max}. Default ${data.defaults.sessionHours}.`}>
                <input id="sec-session-hours" type="number" min={data.limits.sessionHours.min} max={data.limits.sessionHours.max} step={1} required value={form.sessionHours} onChange={(e) => set({ sessionHours: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Idle timeout (minutes)" htmlFor="sec-idle" hint={`${data.limits.idleTimeoutMinutes.min} to ${data.limits.idleTimeoutMinutes.max}. Default ${data.defaults.idleTimeoutMinutes}.`}>
                <input id="sec-idle" type="number" min={data.limits.idleTimeoutMinutes.min} max={data.limits.idleTimeoutMinutes.max} step={1} required value={form.idleTimeoutMinutes} onChange={(e) => set({ idleTimeoutMinutes: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Maximum sessions per admin" htmlFor="sec-max-sessions" hint={`At sign-in the least recently used sessions above this number are ended. Default ${data.defaults.maxSessions}.`}>
                <input id="sec-max-sessions" type="number" min={data.limits.maxSessions.min} max={data.limits.maxSessions.max} step={1} required value={form.maxSessions} onChange={(e) => set({ maxSessions: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </Section>

          <Section
            title="Two-factor authentication"
            hint="Admins of the roles ticked here must turn 2FA on before they can use the panel. Until they do, every page leads to My Account and every other API answers 403."
          >
            <p id="sec-2fa-roles" className="text-sm font-medium text-gray-700 mb-2">2FA is required for</p>
            <RoleChecks id="sec-2fa-roles" roles={data.roles} value={form.twoFactorRequiredRoles} onChange={(next) => set({ twoFactorRequiredRoles: next })} />
            {data.you.role && form.twoFactorRequiredRoles.includes(data.you.role) && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                This includes your own role ({roleLabel(data.you.role)}). If 2FA is not on for your account you will be sent to My Account to turn it on.
              </p>
            )}
          </Section>

          <Section
            title="IP allow-list"
            hint={
              <>
                When it is on, admins of the chosen roles can only sign in and use the panel from these addresses. A session from any
                other address is ended and the refusal is recorded as a high-severity security event. IPv4 addresses and ranges only,
                for example <code>203.0.113.7</code> or <code>203.0.113.0/24</code>.
              </>
            }
          >
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 mb-4">
              <input type="checkbox" id="sec-ip-enabled" className="h-4 w-4 accent-teal" checked={form.ipAllowlistEnabled} onChange={(e) => set({ ipAllowlistEnabled: e.target.checked })} />
              The IP allow-list is on
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Allowed addresses (one per line)" htmlFor="sec-ip-list" hint={`${entries.length} of at most ${data.limits.ipAllowlist.max} entries.`}>
                <textarea id="sec-ip-list" rows={5} value={form.ipAllowlist} onChange={(e) => set({ ipAllowlist: e.target.value })} className={`${inputClass} font-mono`} />
              </Field>
              <div>
                <p id="sec-ip-roles" className="text-sm font-medium text-gray-700 mb-2">The allow-list applies to</p>
                <RoleChecks id="sec-ip-roles" roles={data.roles} value={form.ipAllowlistRoles} onChange={(next) => set({ ipAllowlistRoles: next })} />
                <dl className="text-sm mt-4 space-y-1">
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Your address now:</dt>
                    <dd className="font-mono text-gray-800">{data.you.ip}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">On the saved list:</dt>
                    <dd className="text-gray-800">{data.you.ipOnList ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
                {coversYou && (
                  <p className="text-xs text-amber-800 mt-2">The rule covers your own role: make sure your address is on the list.</p>
                )}
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="font-medium text-gray-800">If a wrong list locks every admin out</p>
              <p className="mt-1">
                Set the server environment variable <code className="font-mono">{data.breakGlass.variable}={data.breakGlass.value}</code> and restart or
                redeploy the panel. The IP rule is then off whatever is saved here, so a Super Admin can sign in and correct the list.
              </p>
              <p className="mt-1">
                Right now the variable is{' '}
                {data.breakGlass.active ? <Badge tone="amber">set: the IP rule is switched off by the server</Badge> : <Badge tone="gray">not set</Badge>}
              </p>
            </div>
            {lockout && (
              <div className="mt-4 border border-red-200 bg-red-50 rounded-lg px-3 py-3 text-sm text-red-700" role="alert">
                <p>{lockout.message}</p>
                <label className="inline-flex items-start gap-2 mt-2 font-medium">
                  <input type="checkbox" id="sec-confirm-lockout" className="h-4 w-4 mt-0.5 accent-teal" checked={confirmLockout} onChange={(e) => setConfirmLockout(e.target.checked)} />
                  I understand that I will be signed out and cannot sign in again from {lockout.ip}. Save anyway.
                </label>
              </div>
            )}
          </Section>

          <Section
            title="Actions that need a second approver"
            hint={
              <>
                A change switched on here is not made straight away: it is sent for approval and waits under{' '}
                <Link href="/security/approvals" className="text-teal underline">Approvals</Link> for 48 hours. The admin who asked can never approve it.
                Active Super Admins: <strong>{data.activeSuperAdmins}</strong>.
              </>
            }
          >
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {data.sensitiveActions.map((action) => {
                const on = Boolean(form.approvalActions[action.key])
                const savedOn = Boolean(data.settings.approvalActions[action.key])
                const cannotTurnOn = action.superOnly && data.activeSuperAdmins < 2 && !savedOn
                const notEnforced = action.superOnly && data.activeSuperAdmins < 2 && savedOn
                return (
                  <li key={action.key} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      id={`sec-approval-${action.key}`}
                      className="h-4 w-4 mt-1 accent-teal"
                      checked={on}
                      disabled={cannotTurnOn && !on}
                      onChange={(e) => set({ approvalActions: { ...form.approvalActions, [action.key]: e.target.checked } })}
                    />
                    <label htmlFor={`sec-approval-${action.key}`} className="flex-1 text-sm">
                      <span className="font-medium text-gray-900">{action.label}</span>
                      {action.defaultOn && <span className="ml-2"><Badge tone="gray">On by default</Badge></span>}
                      <span className="block text-gray-600">{action.description}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        Approved by {action.superOnly ? 'a different Super Admin' : `a different admin who holds ${action.permission}`}.
                      </span>
                      {cannotTurnOn && (
                        <span className="block text-xs text-amber-800 mt-1">
                          Cannot be switched on while fewer than two Super Admins are active: nobody could approve it.
                        </span>
                      )}
                      {notEnforced && (
                        <span className="block text-xs text-amber-800 mt-1">
                          Switched on, but not enforced while only one Super Admin is active: that Super Admin can make this change alone.
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          </Section>

          <Card className="p-5">
            <Field label="Reason for this change" htmlFor="sec-reason" hint="Required. Saved in the activity log with the old and new values, and shown to the approver when a second approver is needed.">
              <textarea id="sec-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <p className="text-xs text-gray-500">
                {data.settings.updatedAt
                  ? `Last saved ${formatDate(data.settings.updatedAt, true)}${data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ''}`
                  : 'Never saved: these are the defaults.'}
              </p>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setForm(toForm(data.settings)); setLockout(null); setConfirmLockout(false) }}>
                    Undo my edits
                  </Button>
                  <Button type="submit" loading={busy} disabled={Boolean(lockout) && !confirmLockout}>
                    Save security settings
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </fieldset>
      </form>

      <Card className="mt-6 max-w-5xl">
        <h2 className="text-base font-semibold text-deep-blue px-5 pt-5 pb-2">Recent changes</h2>
        {data.history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-500">No change to the security settings has been recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.history.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <p className="text-gray-800">
                  <span className="font-medium">{entry.adminName || entry.adminEmail}</span> · {formatDate(entry.createdAt, true)}
                </p>
                {entry.reason && <p className="text-gray-600">Reason: {entry.reason}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">Old: {JSON.stringify(entry.before, null, 1)}</pre>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">New: {JSON.stringify(entry.after, null, 1)}</pre>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

export default function SecuritySettingsPage() {
  return (
    <AdminShell title="Security Settings" subtitle="Sessions, required 2FA, the IP allow-list and the actions that need a second approver">
      <SettingsBody />
    </AdminShell>
  )
}
