'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, Modal, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'
import RulesFinanceSettings from '@/components/finance/RulesFinanceSettings'
import { ActionDialog, AuditHistory, StatusBadge, type ActionRequest } from '@/components/finance/RulesShared'
import { FIGURE_COLUMNS, FigureLink, entriesHref, type StatementServiceRow } from '@/components/finance/StatementServiceTable'
import { ApprovalHeldNotice, apiOrHeld, type HeldForApproval } from '@/components/security/approval'
import WaitingApprovals from '@/components/security/WaitingApprovals'

type Rule = Record<string, any>

interface ServiceBlock {
  service: string
  label: string
  current: Rule | null
  next: Rule | null
  rules: Rule[]
  history: any[]
}

const RULE_STATUS = [
  { value: 'draft', label: 'Draft', tone: 'gray' as const },
  { value: 'active', label: 'Active', tone: 'green' as const },
  { value: 'retired', label: 'Retired', tone: 'amber' as const },
]

const EMPTY_FORM = {
  service: '',
  ratePercent: '',
  minFee: '',
  maxFee: '',
  gstPercent: '',
  gatewayFeePercent: '',
  effectiveFrom: '',
  notes: '',
  reason: '',
}

/** A stored date as the value of a datetime-local input, in the admin's own time zone. */
function toLocalInput(value: any): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function percent(value: any): string {
  return value === null || value === undefined || value === '' ? 'none' : `${value}%`
}

function money(value: any): string {
  return value === null || value === undefined || value === '' ? 'none' : formatMoney(value)
}

function RuleNumbers({ rule }: { rule: Rule }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 text-sm mt-2">
      <div>
        <dt className="text-xs text-gray-500">Commission</dt>
        <dd className="font-semibold text-deep-blue">{percent(rule.ratePercent)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">Minimum fee</dt>
        <dd className="text-gray-900">{money(rule.minFee)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">Maximum commission</dt>
        <dd className="text-gray-900">{money(rule.maxFee)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">GST on commission</dt>
        <dd className="text-gray-900">{percent(rule.gstPercent)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">Gateway fee</dt>
        <dd className="text-gray-900">{percent(rule.gatewayFeePercent)}</dd>
      </div>
    </dl>
  )
}

/** Gross, each charge and net for one service, all time. Each figure opens its ledger entries. */
function ServiceMoney({ row }: { row?: StatementServiceRow }) {
  if (!row) return null
  if (row.entries === 0) {
    return <p className="px-5 pb-4 text-sm text-gray-500">No payment for this service is in the ledger yet.</p>
  }
  const cell = 'rounded-lg border border-gray-200 px-3 py-2'
  return (
    <div className="px-5 pb-4" data-testid={`money-${row.service}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        In the ledger, all time ({row.payments} {row.payments === 1 ? 'payment' : 'payments'})
      </p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-sm">
        {FIGURE_COLUMNS.map((c) => (
          <div key={c.key} className={cell}>
            <dt className="text-xs text-gray-500">{c.label}</dt>
            <dd>
              <FigureLink value={row[c.key]} href={entriesHref({ service: row.service, type: c.type })} label={`${c.label} for ${row.label}: open the ledger entries`} />
            </dd>
          </div>
        ))}
        <div className={cell}>
          <dt className="text-xs text-gray-500">Net revenue</dt>
          <dd>
            <FigureLink value={row.netRevenue} href={entriesHref({ service: row.service })} label={`Net revenue for ${row.label}: open the ledger entries`} />
          </dd>
        </div>
        <div className={cell}>
          <dt className="text-xs text-gray-500">Net payable to payees</dt>
          <dd>
            <FigureLink strong value={row.netPayable} href={entriesHref({ service: row.service })} label={`Net payable for ${row.label}: open the ledger entries`} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default function CommissionSettingsPage() {
  const [services, setServices] = useState<ServiceBlock[] | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [totals, setTotals] = useState<Record<string, StatementServiceRow>>({})
  const [notice, setNotice] = useState<Notice>(null)
  const [held, setHeld] = useState<HeldForApproval | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [action, setAction] = useState<ActionRequest | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/finance/rules')
      setServices(data.services || [])
      setCanManage(Boolean(data.canManage))
      // Gross, charges and net of each service, all time, from the ledger.
      try {
        const statement = await api<any>('/api/admin/finance/statements')
        setTotals(Object.fromEntries((statement.services || []).map((row: StatementServiceRow) => [row.service, row])))
      } catch {
        setTotals({})
      }
    } catch (error: any) {
      setServices([])
      setNotice({ type: 'error', text: error.message || 'Could not load the commission rules.' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = (service = '') => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, service })
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (rule: Rule) => {
    const text = (value: any) => (value === null || value === undefined ? '' : String(value))
    setEditing(rule)
    setForm({
      service: rule.service,
      ratePercent: text(rule.ratePercent),
      minFee: text(rule.minFee),
      maxFee: text(rule.maxFee),
      gstPercent: text(rule.gstPercent),
      gatewayFeePercent: text(rule.gatewayFeePercent),
      effectiveFrom: toLocalInput(rule.effectiveFrom),
      notes: rule.notes || '',
      reason: '',
    })
    setFormError('')
    setFormOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const reason = form.reason.trim()
      if (!form.effectiveFrom) throw new Error('Effective from is required')
      const body = {
        service: form.service,
        ratePercent: form.ratePercent,
        minFee: form.minFee,
        maxFee: form.maxFee,
        gstPercent: form.gstPercent,
        gatewayFeePercent: form.gatewayFeePercent,
        // An untouched date keeps its exact stored value: the form only shows minutes.
        effectiveFrom:
          editing && form.effectiveFrom === toLocalInput(editing.effectiveFrom)
            ? new Date(editing.effectiveFrom).toISOString()
            : new Date(form.effectiveFrom).toISOString(),
        notes: form.notes,
        changeReason: reason,
        _reason: reason,
      }
      setHeld(null)
      const result = editing
        ? await apiOrHeld(`/api/admin/r/commission-rules/${editing._id}`, { method: 'PUT', body })
        : await apiOrHeld('/api/admin/r/commission-rules', { method: 'POST', body })
      setFormOpen(false)
      if (result.held) {
        setNotice(null)
        setHeld(result)
        return
      }
      setNotice({
        type: 'success',
        text: !editing
          ? 'Commission rule saved as a draft. It has no effect until it is activated.'
          : editing.status === 'active'
            ? 'Commission rule saved. The new numbers apply to payments taken from now on; payments already taken keep the rate they were charged.'
            : 'Commission rule saved.',
      })
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = (rule: Rule, status: 'active' | 'retired' | 'draft') => {
    const service = FINANCE_SERVICES.find((s) => s.value === rule.service)?.label || rule.service
    const past = new Date(rule.effectiveFrom).getTime() <= Date.now()
    const copy = {
      active: {
        title: 'Activate commission rule',
        confirmLabel: 'Activate',
        message: (
          <>
            <p>
              Activate the {rule.ratePercent}% rule for <strong>{service}</strong>?
            </p>
            <p className="mt-2 text-gray-600">
              {past
                ? 'Its effective date has passed, so it takes effect now. It applies to payments taken from this moment, never to earlier ones.'
                : `It takes effect on ${formatDate(rule.effectiveFrom, true)} and applies to payments taken from then on.`}{' '}
              You can still edit or delete it later; every change is logged.
            </p>
          </>
        ),
      },
      retired: {
        title: 'Retire commission rule',
        confirmLabel: 'Retire',
        message: (
          <>
            <p>
              Retire the {rule.ratePercent}% rule for <strong>{service}</strong>?
            </p>
            <p className="mt-2 text-gray-600">
              A retired rule is no longer applied and cannot be brought back. If no other active rule is in force for this
              service, no commission is deducted.
            </p>
          </>
        ),
      },
      draft: {
        title: 'Move rule back to draft',
        confirmLabel: 'Move to draft',
        message: <p>This scheduled rule has not taken effect yet. Moving it back to draft cancels the scheduled change.</p>,
      },
    }[status]

    setAction({
      ...copy,
      danger: status === 'retired',
      reason: 'required',
      run: async ({ reason }) => {
        setHeld(null)
        const result = await apiOrHeld(`/api/admin/r/commission-rules/${rule._id}`, { method: 'PATCH', body: { status, reason } })
        if (result.held) {
          setNotice(null)
          setHeld(result)
          return
        }
        setNotice({ type: 'success', text: `Commission rule for ${service} updated.` })
        await load()
      },
    })
  }

  const removeRule = (rule: Rule) => {
    const service = FINANCE_SERVICES.find((s) => s.value === rule.service)?.label || rule.service
    setAction({
      title: 'Delete commission rule',
      confirmLabel: 'Delete',
      danger: true,
      reason: 'required',
      message: (
        <>
          <p>
            Delete the {rule.ratePercent}% rule for <strong>{service}</strong>?
          </p>
          <p className="mt-2 text-gray-600">
            {rule.status === 'active'
              ? 'This rule is active. Once it is deleted, the previous active rule for this service applies again; if there is none, no commission is deducted from new payments.'
              : 'This cannot be undone.'}{' '}
            Payments already taken are not changed. The deletion is kept in the activity log.
          </p>
        </>
      ),
      run: async ({ reason }) => {
        setHeld(null)
        const result = await apiOrHeld(`/api/admin/r/commission-rules/${rule._id}`, { method: 'DELETE', body: { reason } })
        if (result.held) {
          setNotice(null)
          setHeld(result)
          return
        }
        setNotice({ type: 'success', text: `Commission rule for ${service} deleted.` })
        await load()
      },
    })
  }

  const field = (key: keyof typeof EMPTY_FORM, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => (
    <div>
      <label htmlFor={`cr-${key}`} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={`cr-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={inputClass}
        {...props}
      />
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  )

  return (
    <AdminShell
      title="Commission Settings"
      subtitle="Commission, GST and gateway charges for each service, with GST registration, approval limits and settlement rules"
      actions={
        canManage ? (
          <Button onClick={() => openCreate()}>
            <Plus size={16} />
            New commission rule
          </Button>
        ) : undefined
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ApprovalHeldNotice held={held} onClose={() => setHeld(null)} />
      <WaitingApprovals key={held?.approvalId || 'none'} actions={['commission_rules', 'finance_settings']} title="Commission and finance settings changes waiting for a second approver" />

      <NoticeBar
        notice={{
          type: 'info',
          text: 'Add, edit or delete commission rules here. Every change needs a written reason and is kept in the activity log with the old and new values. A change applies to payments taken from then on: payments already taken keep the rate they were charged.',
        }}
      />

      {services === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {services.map((block) => (
            <Card key={block.service}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                <h2 className="text-lg font-semibold text-deep-blue">{block.label}</h2>
                {canManage && (
                  <Button variant="secondary" onClick={() => openCreate(block.service)}>
                    <Plus size={16} />
                    New rule for this service
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">In force now</p>
                  {block.current ? (
                    <>
                      <RuleNumbers rule={block.current} />
                      <p className="text-xs text-gray-500 mt-3">In force since {formatDate(block.current.effectiveFrom, true)}</p>
                    </>
                  ) : (
                    <div className="mt-2">
                      <Badge tone="amber">Not configured: no commission is deducted</Badge>
                      <p className="text-xs text-gray-500 mt-2">
                        Payments for this service are passed to the payee in full until a rule is activated.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next scheduled change</p>
                  {block.next ? (
                    <>
                      <RuleNumbers rule={block.next} />
                      <p className="text-xs text-gray-500 mt-3">Takes effect {formatDate(block.next.effectiveFrom, true)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">No change is scheduled.</p>
                  )}
                </div>
              </div>

              <ServiceMoney row={totals[block.service]} />

              <div className="px-5 pb-5 space-y-3">
                <details>
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer">All rules for this service ({block.rules.length})</summary>
                  {block.rules.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-3">No rule has been created for this service.</p>
                  ) : (
                    <div className="overflow-x-auto mt-3">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                            <th className="py-2 pr-4 font-medium">Status</th>
                            <th className="py-2 pr-4 font-medium">Effective from</th>
                            <th className="py-2 pr-4 font-medium">Commission</th>
                            <th className="py-2 pr-4 font-medium">Min fee</th>
                            <th className="py-2 pr-4 font-medium">Max</th>
                            <th className="py-2 pr-4 font-medium">GST</th>
                            <th className="py-2 pr-4 font-medium">Gateway</th>
                            <th className="py-2 pr-4 font-medium">Notes</th>
                            {canManage && <th className="py-2 font-medium text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rules.map((rule) => {
                            const future = new Date(rule.effectiveFrom).getTime() > Date.now()
                            return (
                              <tr key={rule._id} className="border-b border-gray-100 last:border-0 align-top">
                                <td className="py-2 pr-4">
                                  <StatusBadge value={rule.status} options={RULE_STATUS} />
                                  {rule.status === 'active' && block.current?._id === rule._id && (
                                    <span className="block text-xs text-green-700 mt-1">in force</span>
                                  )}
                                  {rule.status === 'active' && future && <span className="block text-xs text-blue-700 mt-1">scheduled</span>}
                                  {rule.status === 'active' && !future && block.current?._id !== rule._id && (
                                    <span className="block text-xs text-gray-500 mt-1">replaced</span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 whitespace-nowrap">{formatDate(rule.effectiveFrom, true)}</td>
                                <td className="py-2 pr-4">{percent(rule.ratePercent)}</td>
                                <td className="py-2 pr-4">{money(rule.minFee)}</td>
                                <td className="py-2 pr-4">{money(rule.maxFee)}</td>
                                <td className="py-2 pr-4">{percent(rule.gstPercent)}</td>
                                <td className="py-2 pr-4">{percent(rule.gatewayFeePercent)}</td>
                                <td className="py-2 pr-4 text-gray-600 max-w-xs">{rule.notes || '—'}</td>
                                {canManage && (
                                  <td className="py-2 text-right whitespace-nowrap">
                                    {rule.status === 'draft' && (
                                      <>
                                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(rule)}>
                                          Edit
                                        </Button>
                                        <Button variant="ghost" className="px-2 py-1" onClick={() => changeStatus(rule, 'active')}>
                                          Activate
                                        </Button>
                                        <Button variant="ghost" className="px-2 py-1" onClick={() => changeStatus(rule, 'retired')}>
                                          Retire
                                        </Button>
                                      </>
                                    )}
                                    {rule.status === 'active' && (
                                      <>
                                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(rule)}>
                                          Edit
                                        </Button>
                                        {future && (
                                          <Button variant="ghost" className="px-2 py-1" onClick={() => changeStatus(rule, 'draft')}>
                                            Back to draft
                                          </Button>
                                        )}
                                        <Button variant="ghost" className="px-2 py-1" onClick={() => changeStatus(rule, 'retired')}>
                                          Retire
                                        </Button>
                                      </>
                                    )}
                                    {rule.status === 'retired' && (
                                      <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(rule)}>
                                        Edit
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      className="px-2 py-1 text-red-600"
                                      onClick={() => removeRule(rule)}
                                    >
                                      Delete
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>

                <details>
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer">Change history ({block.history.length})</summary>
                  <div className="mt-3">
                    <AuditHistory entries={block.history} emptyText="No commission change has been recorded for this service." />
                  </div>
                </details>
              </div>
            </Card>
          ))}

          <RulesFinanceSettings onNotice={setNotice} />
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.status} commission rule` : 'New commission rule'}
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="commission-rule-form" loading={saving} disabled={form.reason.trim().length < 5}>
              {editing ? 'Save' : 'Save as draft'}
            </Button>
          </>
        }
      >
        <form id="commission-rule-form" onSubmit={save} className="space-y-4">
          {editing?.status === 'active' && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This rule is active. The new numbers apply to payments taken from the moment you save. Payments already taken keep
              the rate they were charged: every ledger entry stores its own copy of the rule. The old and new values are kept in
              the activity log with your reason.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cr-service" className="block text-sm font-medium text-gray-700 mb-1">
                Service
              </label>
              <select
                id="cr-service"
                required
                value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
                className={inputClass}
              >
                <option value="">Choose a service</option>
                {FINANCE_SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {field('effectiveFrom', 'Effective from', { type: 'datetime-local', required: true }, 'The rule applies to payments taken from this moment.')}
            {field('ratePercent', 'Commission rate (%)', { type: 'number', min: 0, max: 100, step: '0.01', required: true })}
            {field('gstPercent', 'GST on commission (%)', { type: 'number', min: 0, max: 100, step: '0.01' }, 'Leave empty if no GST is charged.')}
            {field('minFee', 'Minimum fee (₹)', { type: 'number', min: 0, step: '0.01' }, 'Charged when the percentage comes to less. Leave empty for none.')}
            {field('maxFee', 'Maximum commission (₹)', { type: 'number', min: 0, step: '0.01' }, 'Leave empty for no limit.')}
            {field('gatewayFeePercent', 'Gateway fee (%)', { type: 'number', min: 0, max: 100, step: '0.01' }, 'Share of the payment kept by the payment gateway.')}
          </div>
          <div>
            <label htmlFor="cr-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea id="cr-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="cr-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for this change
            </label>
            <textarea
              id="cr-reason"
              rows={3}
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className={inputClass}
              placeholder="Saved in the activity log with the old and new values"
            />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      <ActionDialog request={action} onClose={() => setAction(null)} />
    </AdminShell>
  )
}
