'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Badge, Button, Card, Modal, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { AuditHistory } from './RulesShared'

/**
 * GST registration, approval thresholds, payout schedule and settlement
 * eligibility. The thresholds, schedule and eligibility have one value for
 * every service and may be set separately for a single service.
 * Nothing has a built-in value: each line says "Not set" until an admin sets it.
 */

interface ServiceRule {
  refundSecondApprovalAbove: number | null
  payoutSchedule: string | null
  settlementEligibilityDays: number | null
}

interface Settings {
  refundSecondApprovalAbove: number | null
  payoutSecondApprovalAbove: number | null
  payoutSchedule: string | null
  settlementEligibilityDays: number | null
  gstNumber: string | null
  gstLegalName: string | null
  serviceRules: Record<string, ServiceRule>
  updatedAt: string | null
  updatedBy: string | null
}

interface Effective {
  service: string
  label: string
  refundApproval: { amount: number | null; source: string }
  settlement: { payoutSchedule: string | null; scheduleSource: string; eligibilityDays: number | null; eligibilitySource: string }
}

const SCHEDULES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'manual', label: 'Manual (no fixed cycle)' },
]

const notSet = <Badge tone="amber">Not set</Badge>

function scheduleName(value: string | null): string {
  return SCHEDULES.find((s) => s.value === value)?.label || ''
}

function days(value: number | null): string {
  return value === null ? '' : `${value} day${value === 1 ? '' : 's'} after the event`
}

/** Marks whether a value is the service's own or comes from the global setting. */
function Source({ source }: { source: string }) {
  if (source === 'service') return <Badge tone="blue">Set for this service</Badge>
  if (source === 'global') return <span className="text-xs text-gray-500">global value</span>
  return null
}

const EMPTY_GLOBAL = { refund: '', payout: '', schedule: '', days: '', gstNumber: '', gstLegalName: '', reason: '' }
const EMPTY_SERVICE = { refund: '', schedule: '', days: '', reason: '' }

export default function RulesFinanceSettings({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [effective, setEffective] = useState<Effective[]>([])
  const [gstText, setGstText] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_GLOBAL })
  const [serviceOpen, setServiceOpen] = useState<Effective | null>(null)
  const [serviceForm, setServiceForm] = useState({ ...EMPTY_SERVICE })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/finance/settings')
      setSettings(data.settings)
      setEffective(data.effective || [])
      setGstText(data.gstTreatmentText || '')
      setHistory(data.history || [])
      setCanManage(Boolean(data.canManage))
      setLoadError('')
    } catch (error: any) {
      setLoadError(error.message || 'Could not load the finance settings.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))

  const openForm = () => {
    if (!settings) return
    setForm({
      refund: text(settings.refundSecondApprovalAbove),
      payout: text(settings.payoutSecondApprovalAbove),
      schedule: settings.payoutSchedule || '',
      days: text(settings.settlementEligibilityDays),
      gstNumber: settings.gstNumber || '',
      gstLegalName: settings.gstLegalName || '',
      reason: '',
    })
    setFormError('')
    setOpen(true)
  }

  const openService = (row: Effective) => {
    const own = settings?.serviceRules[row.service]
    setServiceForm({
      refund: text(own?.refundSecondApprovalAbove),
      schedule: own?.payoutSchedule || '',
      days: text(own?.settlementEligibilityDays),
      reason: '',
    })
    setFormError('')
    setServiceOpen(row)
  }

  const put = async (body: Record<string, any>, done: () => void) => {
    setSaving(true)
    setFormError('')
    try {
      const data = await api<any>('/api/admin/finance/settings', { method: 'PUT', body })
      done()
      onNotice({ type: data.unchanged ? 'info' : 'success', text: data.unchanged ? 'Nothing was changed.' : 'Finance settings saved.' })
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    put(
      {
        refundSecondApprovalAbove: form.refund,
        payoutSecondApprovalAbove: form.payout,
        payoutSchedule: form.schedule,
        settlementEligibilityDays: form.days,
        gstNumber: form.gstNumber,
        gstLegalName: form.gstLegalName,
        reason: form.reason,
      },
      () => setOpen(false)
    )
  }

  const saveService = (event: React.FormEvent) => {
    event.preventDefault()
    if (!serviceOpen) return
    put(
      {
        serviceRules: {
          [serviceOpen.service]: {
            refundSecondApprovalAbove: serviceForm.refund,
            payoutSchedule: serviceForm.schedule,
            settlementEligibilityDays: serviceForm.days,
          },
        },
        reason: serviceForm.reason,
      },
      () => setServiceOpen(null)
    )
  }

  if (loadError) {
    return (
      <Card className="p-5">
        <p className="text-sm text-red-700">{loadError}</p>
      </Card>
    )
  }
  if (!settings) return <Spinner />

  const formErrorBox = formError && (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {formError}
    </p>
  )

  return (
    <Card>
      <div id="gst" className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-deep-blue">GST, approval limits and settlement rules</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Used by the Refunds, Settlements and Statements screens. Nothing here has a default: a line that is not set is not
            enforced.
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" onClick={openForm}>
            <Pencil size={16} />
            Change
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Platform GST number (GSTIN)</p>
          <p className="mt-1 text-lg font-semibold text-deep-blue font-mono">{settings.gstNumber || notSet}</p>
          <p className="text-xs text-gray-500 mt-1">
            {settings.gstNumber
              ? `Printed on every commission statement${settings.gstLegalName ? `, registered to ${settings.gstLegalName}` : ''}.`
              : 'Statements are printed without a GST number until it is set.'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">GST treatment</p>
          <p className="mt-1 text-sm text-gray-900">{gstText}</p>
          <p className="text-xs text-gray-500 mt-1">The GST rate itself is part of each commission rule above.</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Refund needs a second approver above</p>
          <p className="mt-1 text-lg font-semibold text-deep-blue">
            {settings.refundSecondApprovalAbove === null ? notSet : formatMoney(settings.refundSecondApprovalAbove)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {settings.refundSecondApprovalAbove === null
              ? 'Every refund is approved by one admin, unless a service has its own limit below.'
              : 'A refund above this amount needs two different approvers. A service may have its own limit below.'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Payout needs a second approver above</p>
          <p className="mt-1 text-lg font-semibold text-deep-blue">
            {settings.payoutSecondApprovalAbove === null ? notSet : formatMoney(settings.payoutSecondApprovalAbove)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {settings.payoutSecondApprovalAbove === null
              ? 'Every settlement is approved by one admin.'
              : 'A settlement above this amount needs two different approvers.'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Payout schedule</p>
          <p className="mt-1 text-lg font-semibold text-deep-blue">{scheduleName(settings.payoutSchedule) || notSet}</p>
          <p className="text-xs text-gray-500 mt-1">
            {!settings.payoutSchedule
              ? 'New settlements get no due date.'
              : settings.payoutSchedule === 'manual'
                ? 'Settlements are paid when finance decides; no due date is set.'
                : 'A new settlement is due one payout cycle after the end of its period.'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Settlement eligibility</p>
          <p className="mt-1 text-lg font-semibold text-deep-blue">{days(settings.settlementEligibilityDays) || notSet}</p>
          <p className="text-xs text-gray-500 mt-1">
            {settings.settlementEligibilityDays === null
              ? 'Earnings can be settled as soon as the payment is in the ledger.'
              : 'Earnings of an event are left out of a settlement until this many days after the event ends.'}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <h3 className="text-sm font-semibold text-deep-blue">Rules for each service</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          What applies to each service. A value marked &quot;Set for this service&quot; replaces the global value above for that
          service only.
        </p>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm" data-testid="service-rules">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Refund second approver above</th>
                <th className="px-3 py-2 font-medium">Payout schedule</th>
                <th className="px-3 py-2 font-medium">Settlement eligibility</th>
                {canManage && (
                  <th className="px-3 py-2 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {effective.map((row) => (
                <tr key={row.service} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                  <td className="px-3 py-2">
                    {row.refundApproval.amount === null ? <span className="text-gray-500">Not set</span> : formatMoney(row.refundApproval.amount)}{' '}
                    <Source source={row.refundApproval.source} />
                  </td>
                  <td className="px-3 py-2">
                    {scheduleName(row.settlement.payoutSchedule) || <span className="text-gray-500">Not set</span>} <Source source={row.settlement.scheduleSource} />
                  </td>
                  <td className="px-3 py-2">
                    {days(row.settlement.eligibilityDays) || <span className="text-gray-500">Not set</span>} <Source source={row.settlement.eligibilitySource} />
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" className="px-2 py-1" onClick={() => openService(row)} aria-label={`Change the rules for ${row.label}`}>
                        Change
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="mt-4">
          <summary className="text-sm font-medium text-gray-700 cursor-pointer">Settings change history ({history.length})</summary>
          <div className="mt-3">
            <AuditHistory entries={history} emptyText="These settings have never been changed." />
          </div>
        </details>
        {settings.updatedAt && (
          <p className="text-xs text-gray-500 mt-3">
            Last changed {formatDate(settings.updatedAt, true)} by {settings.updatedBy || 'unknown admin'}.
          </p>
        )}
      </div>

      <Modal
        open={open}
        title="Change GST, approval limits and settlement rules"
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="finance-settings-form" loading={saving} disabled={form.reason.trim().length < 5}>
              Save
            </Button>
          </>
        }
      >
        <form id="finance-settings-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fs-gstin" className="block text-sm font-medium text-gray-700 mb-1">
                Platform GST number (GSTIN)
              </label>
              <input
                id="fs-gstin"
                type="text"
                maxLength={15}
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                className={inputClass + ' font-mono'}
                placeholder="15 characters"
              />
              <p className="text-xs text-gray-500 mt-1">Printed on statements. Leave empty if the platform is not registered.</p>
            </div>
            <div>
              <label htmlFor="fs-gstname" className="block text-sm font-medium text-gray-700 mb-1">
                Registered name
              </label>
              <input id="fs-gstname" type="text" maxLength={200} value={form.gstLegalName} onChange={(e) => setForm({ ...form, gstLegalName: e.target.value })} className={inputClass} />
              <p className="text-xs text-gray-500 mt-1">The legal name the GST number belongs to.</p>
            </div>
            <div>
              <label htmlFor="fs-refund" className="block text-sm font-medium text-gray-700 mb-1">
                Refund needs a second approver above (₹)
              </label>
              <input id="fs-refund" type="number" min={0} step="0.01" value={form.refund} onChange={(e) => setForm({ ...form, refund: e.target.value })} className={inputClass} />
              <p className="text-xs text-gray-500 mt-1">Leave empty for no second approval.</p>
            </div>
            <div>
              <label htmlFor="fs-payout" className="block text-sm font-medium text-gray-700 mb-1">
                Payout needs a second approver above (₹)
              </label>
              <input id="fs-payout" type="number" min={0} step="0.01" value={form.payout} onChange={(e) => setForm({ ...form, payout: e.target.value })} className={inputClass} />
              <p className="text-xs text-gray-500 mt-1">Leave empty for no second approval.</p>
            </div>
            <div>
              <label htmlFor="fs-schedule" className="block text-sm font-medium text-gray-700 mb-1">
                Payout schedule
              </label>
              <select id="fs-schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className={inputClass}>
                <option value="">Not set</option>
                {SCHEDULES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fs-days" className="block text-sm font-medium text-gray-700 mb-1">
                Days after the event before earnings can be settled
              </label>
              <input id="fs-days" type="number" min={0} step={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className={inputClass} />
              <p className="text-xs text-gray-500 mt-1">Leave empty for no waiting period.</p>
            </div>
          </div>
          <div>
            <label htmlFor="fs-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for this change
            </label>
            <textarea id="fs-reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} placeholder="Saved in the activity log with the old and new values" />
          </div>
          {open && formErrorBox}
        </form>
      </Modal>

      <Modal
        open={Boolean(serviceOpen)}
        title={`Rules for ${serviceOpen?.label || ''}`}
        onClose={() => setServiceOpen(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setServiceOpen(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="service-rules-form" loading={saving} disabled={serviceForm.reason.trim().length < 5}>
              Save
            </Button>
          </>
        }
      >
        <form id="service-rules-form" onSubmit={saveService} className="space-y-4">
          <p className="text-sm text-gray-600">Leave a line empty to use the global value for this service.</p>
          <div>
            <label htmlFor="sr-refund" className="block text-sm font-medium text-gray-700 mb-1">
              Refund needs a second approver above (₹)
            </label>
            <input id="sr-refund" type="number" min={0} step="0.01" value={serviceForm.refund} onChange={(e) => setServiceForm({ ...serviceForm, refund: e.target.value })} className={inputClass} />
            <p className="text-xs text-gray-500 mt-1">
              Global value: {settings.refundSecondApprovalAbove === null ? 'not set' : formatMoney(settings.refundSecondApprovalAbove)}.
            </p>
          </div>
          <div>
            <label htmlFor="sr-schedule" className="block text-sm font-medium text-gray-700 mb-1">
              Payout schedule
            </label>
            <select id="sr-schedule" value={serviceForm.schedule} onChange={(e) => setServiceForm({ ...serviceForm, schedule: e.target.value })} className={inputClass}>
              <option value="">Use the global value ({scheduleName(settings.payoutSchedule) || 'not set'})</option>
              {SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sr-days" className="block text-sm font-medium text-gray-700 mb-1">
              Days after the event before earnings can be settled
            </label>
            <input id="sr-days" type="number" min={0} step={1} value={serviceForm.days} onChange={(e) => setServiceForm({ ...serviceForm, days: e.target.value })} className={inputClass} />
            <p className="text-xs text-gray-500 mt-1">
              Global value: {settings.settlementEligibilityDays === null ? 'not set' : days(settings.settlementEligibilityDays)}. Enter 0 for no wait
              for this service.
            </p>
          </div>
          <div>
            <label htmlFor="sr-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for this change
            </label>
            <textarea id="sr-reason" rows={3} value={serviceForm.reason} onChange={(e) => setServiceForm({ ...serviceForm, reason: e.target.value })} className={inputClass} placeholder="Saved in the activity log with the old and new values" />
          </div>
          {serviceOpen && formErrorBox}
        </form>
      </Modal>
    </Card>
  )
}
