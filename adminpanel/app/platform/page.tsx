'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { ApprovalHeldNotice, apiOrHeld, type HeldForApproval } from '@/components/security/approval'
import WaitingApprovals from '@/components/security/WaitingApprovals'
import SystemSummary from '@/components/platform/SystemSummary'
import { refreshMaintenanceBanner } from '@/components/platform/MaintenanceBanner'
import { NOTICE_STATUS_LABEL, formatIst, fromIstInput, toIstInput } from '@/components/platform/time'

interface WindowForm {
  id: string
  startsAt: string
  endsAt: string
  message: string
  notifyInAdvance: boolean
  notifyHoursBefore: string
}

interface Form {
  platformName: string
  supportEmail: string
  supportPhone: string
  contactAddress: string
  generalEmail: string
  partnershipsEmail: string
  websiteUrl: string
  maintenance: { enabled: boolean; message: string }
  maintenanceWindows: WindowForm[]
  advanceNotice: { channels: string[]; templateKey: string }
}

interface Meta {
  maintenance: { active: boolean; source: 'switch' | 'window' | null; message: string; endsAt: string | null }
  policies: Record<string, { id: string; title: string; version: string; effectiveDate: string | null; publishedAt: string | null }>
  notices: Record<string, { _id: string; title: string; status: string; scheduledFor: string | null; statusReason?: string }[]>
  noticeTemplates: { channel: string; status: string }[]
  enforcement: { blocked: { route: string; what: string }[]; allowed: { route: string; why: string }[]; notCovered: { route: string; what: string }[] }
}

const POLICY_ROWS: { key: string; label: string; path: string; nothing: string; note?: string }[] = [
  { key: 'terms', label: 'Terms of use', path: '/terms', nothing: 'Nothing published: the website shows its built-in text dated 9 August 2026, marked as such.' },
  { key: 'privacy', label: 'Privacy policy', path: '/privacy', nothing: 'Nothing published: the website shows its built-in text dated 9 August 2026, marked as such.' },
  { key: 'refund', label: 'Refund policy', path: '/refund-policy', nothing: 'Nothing published: the page shows only the cancellation and refund rules set under Finance.' },
  {
    key: 'cancellation',
    label: 'Cancellation policy',
    path: '/refund-policy',
    nothing: 'Nothing published: the refund policy page lists the cancellation rules.',
    note: 'The website shows the cancellation rules on the refund policy page; a published cancellation policy text is shown in the user app.',
  },
]

const CHANNELS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
]

function toForm(config: any): Form {
  return {
    platformName: config.platformName || '',
    supportEmail: config.supportEmail || '',
    supportPhone: config.supportPhone || '',
    contactAddress: config.contactAddress || '',
    generalEmail: config.generalEmail || '',
    partnershipsEmail: config.partnershipsEmail || '',
    websiteUrl: config.websiteUrl || '',
    maintenance: { enabled: Boolean(config.maintenance?.enabled), message: config.maintenance?.message || '' },
    maintenanceWindows: (config.maintenanceWindows || []).map((w: any) => ({
      id: w.id,
      startsAt: toIstInput(w.startsAt),
      endsAt: toIstInput(w.endsAt),
      message: w.message || '',
      notifyInAdvance: Boolean(w.notifyInAdvance),
      notifyHoursBefore: String(w.notifyHoursBefore ?? 24),
    })),
    advanceNotice: {
      channels: Array.isArray(config.advanceNotice?.channels) ? config.advanceNotice.channels : [],
      templateKey: config.advanceNotice?.templateKey || 'maintenance_notice',
    },
  }
}

/** Whether maintenance would be active at `now` with these values (switch on, or a window covering now). */
function activeAt(enabled: boolean, windows: { startsAt: string; endsAt: string }[], now: number) {
  if (enabled) return 'switch'
  return windows.some((w) => {
    const s = Date.parse(w.startsAt)
    const e = Date.parse(w.endsAt)
    return Number.isFinite(s) && Number.isFinite(e) && s <= now && e > now
  })
    ? 'window'
    : null
}

function Field({ id, label, help, children }: { id: string; label: string; help?: React.ReactNode; children: React.ReactNode }) {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-deep-blue">{children}</h2>
}

/** Link to an announcement for admins who may open Communications; plain text for the others. */
function AnnouncementLink({ id, children }: { id: string; children: React.ReactNode }) {
  const canOpen = useCan('communications:view')
  return canOpen ? (
    <Link href={`/communications/announcements?id=${id}`} className="text-teal underline">
      {children}
    </Link>
  ) : (
    <>{children}</>
  )
}

function ManagePoliciesLink({ type }: { type: string }) {
  const canOpen = useCan('legal:view')
  if (!canOpen) return null
  return (
    <Link href={`/legal/policies?f_type=${type}`} className="text-teal underline whitespace-nowrap">
      Manage versions
    </Link>
  )
}

/** What happens to the advance notice of one window, as saved and as it would be after saving. */
function WindowNotice({ w, notices }: { w: WindowForm; notices: Meta['notices'][string] | undefined }) {
  const start = Date.parse(fromIstInput(w.startsAt))
  const hours = parseInt(w.notifyHoursBefore, 10)
  const latest = notices?.[0]
  const now = Date.now()

  let plan: string
  if (!w.notifyInAdvance) plan = latest && !['sent', 'cancelled'].includes(latest.status) ? 'Saving cancels the announcement below.' : 'Not announced in advance.'
  else if (!Number.isFinite(start)) plan = 'Enter the start time to see when the announcement is due.'
  else if (start <= now) plan = 'This window has started, so no advance notice is created.'
  else if (!Number.isFinite(hours) || hours < 1) plan = 'Enter how many hours before the start the announcement is due.'
  else {
    const due = start - hours * 3600 * 1000
    plan =
      due > now
        ? `The announcement to customers, artists and organisers is due ${formatIst(new Date(due))}, once it is approved.`
        : 'The notice time has already passed: the announcement is due as soon as it is approved.'
  }

  return (
    <div className="text-xs text-gray-600 mt-2 space-y-1" data-window-notice={w.id || 'new'}>
      <p>{plan}</p>
      {latest && (
        <p>
          Announcement:{' '}
          <AnnouncementLink id={latest._id}>
            <span className="font-medium">{latest.title}</span>
          </AnnouncementLink>{' '}
          <Badge tone={latest.status === 'cancelled' ? 'gray' : latest.status === 'sent' ? 'green' : latest.status === 'failed' ? 'red' : 'amber'}>
            {NOTICE_STATUS_LABEL[latest.status] || latest.status}
          </Badge>
          {latest.scheduledFor && !['sent', 'cancelled'].includes(latest.status) ? ` due ${formatIst(latest.scheduledFor)}` : ''}
        </p>
      )}
    </div>
  )
}

function Enforcement({ enforcement }: { enforcement: Meta['enforcement'] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 text-sm" id="maintenance-enforcement">
      <div className="border border-red-200 rounded-lg p-3">
        <h3 className="font-semibold text-red-800 mb-2">Refused while maintenance is active</h3>
        <p className="text-xs text-gray-600 mb-2">These answer 503 with code MAINTENANCE and your message.</p>
        <ul className="space-y-1.5">
          {enforcement.blocked.map((item) => (
            <li key={item.route}>
              <span className="text-gray-800">{item.what}</span>
              <span className="block text-xs text-gray-500 font-mono">{item.route}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-green-200 rounded-lg p-3">
        <h3 className="font-semibold text-green-800 mb-2">Keeps working</h3>
        <ul className="space-y-1.5">
          {enforcement.allowed.map((item) => (
            <li key={item.route}>
              <span className="text-gray-800">{item.why}</span>
              <span className="block text-xs text-gray-500 font-mono">{item.route}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-amber-200 rounded-lg p-3">
        <h3 className="font-semibold text-amber-800 mb-2">Not stopped yet</h3>
        <p className="text-xs text-gray-600 mb-2">Other app actions that maintenance does not refuse today.</p>
        <ul className="space-y-1.5">
          {enforcement.notCovered.map((item) => (
            <li key={item.route}>
              <span className="text-gray-800">{item.what}</span>
              <span className="block text-xs text-gray-500 font-mono">{item.route}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function Page() {
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState<any>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [held, setHeld] = useState<HeldForApproval | null>(null)
  const [confirming, setConfirming] = useState<null | { startsNow: 'switch' | 'window' | null }>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/platform')
      setForm(toForm(data.config))
      setSaved(data.config)
      setMeta({
        maintenance: data.maintenance,
        policies: data.policies || {},
        notices: data.notices || {},
        noticeTemplates: data.noticeTemplates || [],
        enforcement: data.enforcement,
      })
      setCanManage(Boolean(data.canManage))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the platform configuration.' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!form || !meta) {
    return (
      <AdminShell title="Platform Configuration" subtitle="Platform name, contacts, policy links, currency, timezone and maintenance">
        <NoticeBar notice={notice} />
        {!notice && <Spinner />}
      </AdminShell>
    )
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const setWindow = (index: number, patch: Partial<WindowForm>) =>
    set({ maintenanceWindows: form.maintenanceWindows.map((w, i) => (i === index ? { ...w, ...patch } : w)) })

  const windowsAsIso = form.maintenanceWindows.map((w) => ({ ...w, startsAt: fromIstInput(w.startsAt), endsAt: fromIstInput(w.endsAt) }))
  const website = form.websiteUrl.trim().replace(/\/+$/, '')
  const maintenance = meta.maintenance

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)
    const now = Date.now()
    const before = activeAt(Boolean(saved?.maintenance?.enabled), saved?.maintenanceWindows || [], now)
    const afterSave = activeAt(form.maintenance.enabled, windowsAsIso, now)
    setConfirming({ startsNow: !before && afterSave ? afterSave : null })
  }

  const save = async (reason: string) => {
    setBusy(true)
    setHeld(null)
    try {
      const result = await apiOrHeld<any>('/api/admin/platform', {
        method: 'PUT',
        body: {
          reason,
          confirmMaintenance: Boolean(confirming?.startsNow),
          config: {
            ...form,
            maintenanceWindows: windowsAsIso.map((w) => ({
              ...w,
              notifyHoursBefore: w.notifyHoursBefore.trim() === '' ? '' : Number(w.notifyHoursBefore),
            })),
          },
        },
      })
      setConfirming(null)
      if (result.held) {
        // Nothing was saved: the form keeps the proposed values so they can be compared with what is live.
        setHeld(result)
        return
      }
      const data = result.data
      if (data.unchanged) {
        setNotice({ type: 'info', text: 'Nothing was changed, so nothing was saved.' })
      } else if (data.noticeError) {
        setNotice({ type: 'error', text: data.noticeError })
      } else {
        const counts = (data.notices || []).reduce((acc: Record<string, number>, n: any) => ({ ...acc, [n.action]: (acc[n.action] || 0) + 1 }), {})
        const parts = [
          counts.created && `${counts.created} created`,
          counts.updated && `${counts.updated} updated`,
          counts.needs_approval_again && `${counts.needs_approval_again} sent back for approval`,
          counts.cancelled && `${counts.cancelled} cancelled`,
        ].filter(Boolean)
        setNotice({
          type: 'success',
          text:
            'Platform configuration saved. The change and your reason are in the activity log.' +
            (parts.length ? ` Advance notice announcements: ${parts.join(', ')}.` : ''),
        })
      }
      refreshMaintenanceBanner()
      await load()
    } catch (e: any) {
      setConfirming(null)
      setNotice({ type: 'error', text: e.message || 'Could not save the configuration.' })
    } finally {
      setBusy(false)
    }
  }

  const switchingOff = Boolean(saved?.maintenance?.enabled) && !form.maintenance.enabled

  return (
    <AdminShell title="Platform Configuration" subtitle="Platform name, contacts, policy links, currency, timezone and maintenance">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ApprovalHeldNotice held={held} onClose={() => setHeld(null)} />
      <WaitingApprovals key={held?.approvalId || 'none'} actions={['platform_config']} title="Platform configuration changes waiting for a second approver" />

      <Card className="p-5 mb-4">
        <SectionTitle>System status</SectionTitle>
        <div className="mt-3">
          <SystemSummary />
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm border-t border-gray-100 pt-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Maintenance right now</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2" id="maintenance-now">
              <Badge tone={maintenance.active ? 'red' : 'green'}>{maintenance.active ? 'Active: public changes are refused' : 'Not under maintenance'}</Badge>
              {maintenance.active && (
                <span className="text-gray-600">
                  {maintenance.source === 'window' ? `Scheduled window, ends ${formatIst(maintenance.endsAt)}` : 'Switched on by an admin'}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Next scheduled window</dt>
            <dd className="mt-1 text-gray-800">
              {(() => {
                const next = (saved?.maintenanceWindows || []).find((w: any) => Date.parse(w.startsAt) > Date.now())
                return next ? `${formatIst(next.startsAt)} to ${formatIst(next.endsAt)}` : 'None'
              })()}
            </dd>
          </div>
        </dl>
      </Card>

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canManage} className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Platform and contact details</SectionTitle>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Published at GET /api/public/platform. The website shows them in its footer, on the terms and privacy pages and on its
              maintenance screen; the user app under Help and policies; the organiser app under Help &amp; Support. Leave a field
              empty to hide it.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="platform-name" label="Platform name">
                <input id="platform-name" required maxLength={80} value={form.platformName} onChange={(e) => set({ platformName: e.target.value })} className={inputClass} />
              </Field>
              <Field id="support-email" label="Support email">
                <input id="support-email" type="email" value={form.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} className={inputClass} />
              </Field>
              <Field id="support-phone" label="Support phone" help="Digits with an optional leading +, for example +919876500000.">
                <input id="support-phone" type="tel" value={form.supportPhone} onChange={(e) => set({ supportPhone: e.target.value })} className={inputClass} />
              </Field>
              <Field id="general-email" label="General enquiries email" help="Shown on the website under Partnerships.">
                <input id="general-email" type="email" value={form.generalEmail} onChange={(e) => set({ generalEmail: e.target.value })} className={inputClass} />
              </Field>
              <Field id="partnerships-email" label="Partnerships and sponsorship email" help="Shown on the website under Partnerships.">
                <input id="partnerships-email" type="email" value={form.partnershipsEmail} onChange={(e) => set({ partnershipsEmail: e.target.value })} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="contact-address" label="Contact address">
                  <textarea id="contact-address" rows={2} maxLength={500} value={form.contactAddress} onChange={(e) => set({ contactAddress: e.target.value })} className={inputClass} />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Currency and timezone</SectionTitle>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Default currency</dt>
                <dd className="mt-1 font-medium text-gray-900" id="currency-value">
                  INR (Indian rupee)
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Timezone</dt>
                <dd className="mt-1 font-medium text-gray-900" id="timezone-value">
                  Asia/Kolkata (IST, UTC+05:30)
                </dd>
              </div>
            </dl>
            <p className="text-sm text-gray-600 mt-3">
              Fixed for this India-only platform, so they cannot be changed here. Razorpay orders, the ledger, statements and every amount
              are in rupees. Reports, statements, the dashboard, booking cut-offs, membership dates and the activity log all count whole
              days in India time with a fixed +05:30 offset; a timezone setting would not change any of them. Maintenance window times on
              this page are also entered in India time.
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Website and policy links</SectionTitle>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              The links published to the apps are the website&rsquo;s own policy pages, which show the version published under{' '}
              <Link href="/legal/policies" className="text-teal underline">
                Policies
              </Link>{' '}
              (publishing a new version archives the previous one).
            </p>
            <Field id="website-url" label="Website address" help="The public address of the Mookalaa website. The policy links below are built from it; leave it empty to publish no links.">
              <input id="website-url" type="url" placeholder="https://" value={form.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} className={inputClass} />
            </Field>
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full text-sm" id="policy-links">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th scope="col" className="py-2 pr-4 font-medium">Policy</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Link</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Published version</th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">Manage</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {POLICY_ROWS.map((row) => {
                    const policy = meta.policies[row.key]
                    const href = website ? website + row.path : ''
                    return (
                      <tr key={row.key} data-policy={row.key}>
                        <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{row.label}</td>
                        <td className="py-2 pr-4 break-all">
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal underline">
                              {href}
                            </a>
                          ) : (
                            <span className="text-gray-500">Set the website address</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-700">
                          {policy ? (
                            <span>
                              {policy.title}, version {policy.version}
                              {policy.effectiveDate ? `, effective ${formatDate(policy.effectiveDate)}` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-500">{row.nothing}</span>
                          )}
                          {row.note && <span className="block text-xs text-gray-500 mt-0.5">{row.note}</span>}
                        </td>
                        <td className="py-2 text-right">
                          <ManagePoliciesLink type={row.key} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Maintenance mode</SectionTitle>
            <p className="text-sm text-gray-600 mt-1">
              While maintenance is active, switched on here or inside a scheduled window, the website and the apps show the message and the
              server refuses the changes listed below. The admin panel is never blocked.
            </p>
            <div className="space-y-4 mt-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  id="maintenance-enabled"
                  checked={form.maintenance.enabled}
                  onChange={(e) => set({ maintenance: { ...form.maintenance, enabled: e.target.checked } })}
                />
                Maintenance mode is on
              </label>
              <Field id="maintenance-message" label="Message shown to people" help="Required when maintenance mode is on. Windows use their own message.">
                <textarea
                  id="maintenance-message"
                  rows={2}
                  maxLength={500}
                  value={form.maintenance.message}
                  onChange={(e) => set({ maintenance: { ...form.maintenance, message: e.target.value } })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Enforcement enforcement={meta.enforcement} />
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Scheduled maintenance windows</SectionTitle>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  set({
                    maintenanceWindows: [
                      ...form.maintenanceWindows,
                      { id: '', startsAt: '', endsAt: '', message: '', notifyInAdvance: true, notifyHoursBefore: '24' },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Add window
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Maintenance is active automatically from a window&rsquo;s start to its end, with the window&rsquo;s message; nothing has to
              be switched. Times are India time (IST). A window announced in advance is published to the apps and website as the upcoming
              window, and saving creates an announcement to all customers, artists and organisers, waiting for approval under
              Communications. Editing the window updates that announcement; deleting the window cancels it.
            </p>
            {form.maintenanceWindows.length === 0 ? (
              <p className="text-sm text-gray-500">No maintenance windows are scheduled.</p>
            ) : (
              <ul className="space-y-4">
                {form.maintenanceWindows.map((w, index) => {
                  const s = Date.parse(fromIstInput(w.startsAt))
                  const e = Date.parse(fromIstInput(w.endsAt))
                  const now = Date.now()
                  const state = !Number.isFinite(s) || !Number.isFinite(e) ? null : e <= now ? 'Ended' : s <= now ? 'In progress' : 'Upcoming'
                  return (
                    <li key={w.id || `new-${index}`} className="border border-gray-200 rounded-lg p-4" data-window={w.id || 'new'}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-sm font-medium text-gray-800">Window {index + 1}</span>
                        {state && <Badge tone={state === 'In progress' ? 'red' : state === 'Ended' ? 'gray' : 'blue'}>{state}</Badge>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field id={`window-${index}-start`} label="Starts at (IST)">
                          <input id={`window-${index}-start`} type="datetime-local" required value={w.startsAt} onChange={(ev) => setWindow(index, { startsAt: ev.target.value })} className={inputClass} />
                        </Field>
                        <Field id={`window-${index}-end`} label="Ends at (IST)">
                          <input id={`window-${index}-end`} type="datetime-local" required value={w.endsAt} onChange={(ev) => setWindow(index, { endsAt: ev.target.value })} className={inputClass} />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field id={`window-${index}-message`} label="Message">
                            <input id={`window-${index}-message`} required maxLength={500} value={w.message} onChange={(ev) => setWindow(index, { message: ev.target.value })} className={inputClass} />
                          </Field>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
                        <div className="flex flex-wrap items-end gap-4">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              id={`window-${index}-notify`}
                              checked={w.notifyInAdvance}
                              onChange={(ev) => setWindow(index, { notifyInAdvance: ev.target.checked })}
                            />
                            Announce in advance
                          </label>
                          {w.notifyInAdvance && (
                            <div className="w-40">
                              <Field id={`window-${index}-hours`} label="Hours before the start">
                                <input
                                  id={`window-${index}-hours`}
                                  type="number"
                                  min={1}
                                  max={336}
                                  step={1}
                                  required
                                  value={w.notifyHoursBefore}
                                  onChange={(ev) => setWindow(index, { notifyHoursBefore: ev.target.value })}
                                  className={inputClass}
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => set({ maintenanceWindows: form.maintenanceWindows.filter((_, i) => i !== index) })}
                          aria-label={`Remove maintenance window ${index + 1}`}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:text-gray-300"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <WindowNotice w={w} notices={w.id ? meta.notices[w.id] : undefined} />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Advance notice announcements</SectionTitle>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              How the announcements for windows announced in advance are sent. The communications team can still change the channels and
              template of an announcement before approving it. Nothing is sent from this page.
            </p>
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-1">Channels</legend>
              <div className="flex flex-wrap gap-4">
                {CHANNELS.map((c) => (
                  <label key={c.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      id={`notice-channel-${c.value}`}
                      checked={form.advanceNotice.channels.includes(c.value)}
                      onChange={(ev) =>
                        set({
                          advanceNotice: {
                            ...form.advanceNotice,
                            channels: ev.target.checked
                              ? [...form.advanceNotice.channels, c.value]
                              : form.advanceNotice.channels.filter((x) => x !== c.value),
                          },
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4 max-w-sm">
              <Field id="notice-template" label="Template key" help="An approved message template with this key is needed on every chosen channel before the announcement can be sent.">
                <input
                  id="notice-template"
                  value={form.advanceNotice.templateKey}
                  onChange={(ev) => set({ advanceNotice: { ...form.advanceNotice, templateKey: ev.target.value } })}
                  className={inputClass}
                />
              </Field>
            </div>
            {meta.noticeTemplates.length > 0 && (
              <ul className="mt-3 text-sm space-y-1" id="notice-templates">
                {meta.noticeTemplates.map((t) => (
                  <li key={t.channel} className="flex items-center gap-2">
                    <Badge tone={t.status === 'approved' ? 'green' : 'amber'}>
                      {t.status === 'approved' ? 'Approved' : t.status === 'missing' ? 'No template' : `Template ${t.status.replace('_', ' ')}`}
                    </Badge>
                    <span className="text-gray-700">
                      {CHANNELS.find((c) => c.value === t.channel)?.label || t.channel} template &ldquo;{saved?.advanceNotice?.templateKey}&rdquo;
                    </span>
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
        open={Boolean(confirming)}
        title={confirming?.startsNow ? 'Start maintenance now' : 'Save platform configuration'}
        danger={Boolean(confirming?.startsNow)}
        confirmLabel={confirming?.startsNow ? 'Start maintenance' : 'Save'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={save}
        onClose={() => setConfirming(null)}
        message={
          confirming?.startsNow ? (
            <div className="space-y-2">
              <p>
                <strong>
                  {confirming.startsNow === 'window'
                    ? 'A maintenance window covers the current time, so saving starts maintenance immediately.'
                    : 'You are switching maintenance mode on.'}
                </strong>{' '}
                From the moment you confirm:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>The website and both apps show the maintenance message.</li>
                <li>
                  The server refuses: {Array.from(new Set(meta.enforcement.blocked.map((b) => b.what.toLowerCase()))).join('; ')}.
                </li>
                <li>Payments already taken, Razorpay notifications, gate check-in, staff sign-in, every read and the admin panel keep working.</li>
                <li>
                  {confirming.startsNow === 'window'
                    ? 'It ends by itself when the window ends.'
                    : 'It stays on until an admin switches it off here.'}{' '}
                  The change is recorded in the activity log with your reason.
                </li>
              </ul>
            </div>
          ) : (
            <p>
              {switchingOff ? 'Maintenance mode will be switched off and public changes accepted again. ' : ''}
              Every change to the platform configuration is recorded in the activity log with the old and new values. Give the reason for
              this change.
            </p>
          )
        }
      />
    </AdminShell>
  )
}
