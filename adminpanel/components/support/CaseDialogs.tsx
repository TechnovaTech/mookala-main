'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, NoticeBar, api, inputClass } from '@/components/ui'
import { CASE_PRIORITIES, CASE_SERVICES, CASE_TEAMS, PRIORITY_ORDER } from '@/lib/resources/support'
import { PriorityBadge, teamName, useAssignees, type Assignee } from './shared'

const label = 'block text-sm font-medium text-gray-700 mb-1'

function AssigneeSelect({
  id,
  team,
  value,
  onChange,
  allowNone = true,
}: {
  id: string
  team: string
  value: string
  onChange: (value: string) => void
  allowNone?: boolean
}) {
  const { list, loading, error } = useAssignees(team)
  // A person chosen for another team is cleared when the team changes.
  useEffect(() => {
    if (value && !loading && list.length && !list.some((a) => a.id === value)) onChange('')
  }, [list, loading, value, onChange])
  return (
    <>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!team || loading}
        className={inputClass}
        data-assignee-count={list.length}
      >
        <option value="">{!team ? 'Choose a team first' : loading ? 'Loading...' : allowNone ? 'Anyone in the team (no person yet)' : 'Choose...'}</option>
        {list.map((a: Assignee) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.roleLabel}{a.canAct ? '' : ', can view only'})
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {team && !loading && !error && list.length === 0 && (
        <p className="text-xs text-amber-700 mt-1">
          No active admin of this team can open support cases. A Super Admin can grant support access under Security &amp; Audit → Admins &amp; Roles.
        </p>
      )}
      {team && list.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">Only active {teamName(team)} admins and Super Admins who can open support cases are listed.</p>
      )}
    </>
  )
}

export function AssignDialog({
  open,
  item,
  onClose,
  onDone,
}: {
  open: boolean
  item: { _id: string; assignedTeam: string | null; assignedToId: string | null; assignedToName: string | null }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [team, setTeam] = useState('')
  const [assignee, setAssignee] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const wasAssigned = Boolean(item.assignedTeam || item.assignedToId)

  useEffect(() => {
    if (!open) return
    setTeam(item.assignedTeam || '')
    setAssignee(item.assignedToId || '')
    setReason('')
    setError('')
  }, [open, item.assignedTeam, item.assignedToId])

  const submit = async (action: 'assign' | 'unassign') => {
    setBusy(true)
    setError('')
    try {
      const data = await api<{ message: string }>(`/api/admin/support/cases/${item._id}`, {
        method: 'POST',
        body: action === 'assign' ? { action, team, assigneeId: assignee, reason } : { action, reason },
      })
      onDone(data.message)
    } catch (e: any) {
      setError(e.message || 'Could not save the assignment.')
    } finally {
      setBusy(false)
    }
  }

  const reasonMissing = wasAssigned && reason.trim().length < 5

  return (
    <Modal
      open={open}
      title={wasAssigned ? 'Reassign case' : 'Assign case'}
      onClose={onClose}
      footer={
        <>
          {wasAssigned && (
            <Button variant="ghost" className="mr-auto text-red-700" disabled={busy || reasonMissing} onClick={() => submit('unassign')}>
              Remove assignment
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => submit('assign')} loading={busy} disabled={!team || reasonMissing}>
            {wasAssigned ? 'Reassign' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
        {wasAssigned && (
          <p className="text-gray-600">
            Now with <strong>{teamName(item.assignedTeam)}</strong>
            {item.assignedToName ? `: ${item.assignedToName}` : ' (no person yet)'}.
          </p>
        )}
        <div>
          <label htmlFor="assign-team" className={label}>
            Team
          </label>
          <select id="assign-team" value={team} onChange={(e) => setTeam(e.target.value)} className={inputClass}>
            <option value="">Choose a team...</option>
            {CASE_TEAMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="assign-person" className={label}>
            Person
          </label>
          <AssigneeSelect id="assign-person" team={team} value={assignee} onChange={setAssignee} />
        </div>
        <div>
          <label htmlFor="assign-reason" className={label}>
            Reason {wasAssigned ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-500">(optional)</span>}
          </label>
          <textarea
            id="assign-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder={wasAssigned ? 'Why the case moves (at least 5 characters). Saved in the activity history.' : 'Saved in the activity history'}
          />
        </div>
      </div>
    </Modal>
  )
}

export function EscalateDialog({
  open,
  item,
  onClose,
  onDone,
}: {
  open: boolean
  item: { _id: string; priority: string; assignedTeam: string | null; assignedToId: string | null; assignedToName: string | null; escalationLevel: number }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [team, setTeam] = useState('')
  const [assignee, setAssignee] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTeam(item.assignedTeam || '')
    setAssignee('')
    setReason('')
    setError('')
  }, [open, item.assignedTeam])

  const index = PRIORITY_ORDER.indexOf(item.priority)
  const next = PRIORITY_ORDER[Math.min((index === -1 ? 1 : index) + 1, PRIORITY_ORDER.length - 1)]
  const teamChanged = team !== (item.assignedTeam || '')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api<{ message: string }>(`/api/admin/support/cases/${item._id}`, {
        method: 'POST',
        body: { action: 'escalate', reason, team: team || undefined, assigneeId: assignee || undefined },
      })
      onDone(data.message)
    } catch (e: any) {
      setError(e.message || 'Could not escalate the case.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Escalate case"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={reason.trim().length < 5}>
            Escalate
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
        <p className="text-gray-700 flex flex-wrap items-center gap-2">
          Priority goes from <PriorityBadge value={item.priority} /> to <PriorityBadge value={next} />
          {item.priority === 'urgent' && <span className="text-gray-500">(already the highest)</span>}. The case is marked as escalated
          {item.escalationLevel ? ` (escalated ${item.escalationLevel} time${item.escalationLevel === 1 ? '' : 's'} before)` : ''}.
        </p>
        <div>
          <label htmlFor="escalate-team" className={label}>
            Team
          </label>
          <select id="escalate-team" value={team} onChange={(e) => setTeam(e.target.value)} className={inputClass}>
            <option value="">{item.assignedTeam ? 'Keep the current team' : 'No team'}</option>
            {CASE_TEAMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
                {t.value === item.assignedTeam ? ' (current)' : ''}
              </option>
            ))}
          </select>
          {teamChanged && team && <p className="text-xs text-gray-500 mt-1">The case moves to {teamName(team)}.</p>}
        </div>
        <div>
          <label htmlFor="escalate-person" className={label}>
            Person
          </label>
          <AssigneeSelect id="escalate-person" team={team} value={assignee} onChange={setAssignee} />
          {!teamChanged && item.assignedToName && !assignee && (
            <p className="text-xs text-gray-500 mt-1">Leave empty to keep {item.assignedToName}.</p>
          )}
        </div>
        <div>
          <label htmlFor="escalate-reason" className={label}>
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="escalate-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="Why this case needs more attention (at least 5 characters)"
          />
        </div>
      </div>
    </Modal>
  )
}

export interface CaseFormValues {
  subject: string
  customerName: string
  customerPhone: string
  service: string
  priority: string
  bookingId: string
  aboutRefund: boolean
  refundId: string
  description: string
  resolution: string
}

export const emptyCaseForm: CaseFormValues = {
  subject: '',
  customerName: '',
  customerPhone: '',
  service: '',
  priority: 'normal',
  bookingId: '',
  aboutRefund: false,
  refundId: '',
  description: '',
  resolution: '',
}

/**
 * Create or edit a case through the generic resource API, whose hooks check
 * the booking and refund links. A new case can be assigned in the same step.
 */
export function CaseFormDialog({
  open,
  resource,
  singular,
  editing,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  resource: 'complaints' | 'support-tickets'
  singular: string
  editing: { _id: string } | null
  initial: CaseFormValues
  onClose: () => void
  onSaved: (message: string, id: string) => void
}) {
  const [form, setForm] = useState<CaseFormValues>(initial)
  const [team, setTeam] = useState('')
  const [assignee, setAssignee] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setTeam('')
    setAssignee('')
    setReason('')
    setError('')
    // `initial` is a new object on every render of the parent; only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (key: keyof CaseFormValues, value: any) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.subject.trim() || !form.customerPhone.trim() || !form.service || !form.description.trim()) {
      setError('Subject, customer phone, service and description are required.')
      return
    }
    setBusy(true)
    setError('')
    const body: Record<string, any> = {
      subject: form.subject,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      service: form.service,
      priority: form.priority,
      bookingId: form.bookingId,
      aboutRefund: form.aboutRefund,
      refundId: form.refundId,
      description: form.description,
    }
    try {
      if (editing) {
        body.resolution = form.resolution
        if (reason.trim()) body._reason = reason.trim()
        const result = await api<any>(`/api/admin/r/${resource}/${editing._id}`, { method: 'PUT', body })
        onSaved(result?.unchanged ? 'Nothing was changed.' : `${singular} updated.`, editing._id)
      } else {
        const created = await api<{ id: string }>(`/api/admin/r/${resource}`, { method: 'POST', body })
        let message = `${singular} added.`
        if (team) {
          try {
            const assigned = await api<{ message: string }>(`/api/admin/support/cases/${created.id}`, {
              method: 'POST',
              body: { action: 'assign', team, assigneeId: assignee },
            })
            message += ' ' + assigned.message
          } catch (e: any) {
            message += ` It could not be assigned: ${e.message}`
          }
        }
        onSaved(message, created.id)
      }
    } catch (e: any) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} wide title={editing ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4" id="case-form">
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="case-subject" className={label}>
              Subject <span className="text-red-600">*</span>
            </label>
            <input id="case-subject" value={form.subject} maxLength={200} onChange={(e) => set('subject', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="case-customer-name" className={label}>
              Customer name
            </label>
            <input id="case-customer-name" value={form.customerName} onChange={(e) => set('customerName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="case-customer-phone" className={label}>
              Customer phone <span className="text-red-600">*</span>
            </label>
            <input id="case-customer-phone" type="tel" value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="case-service" className={label}>
              Service <span className="text-red-600">*</span>
            </label>
            <select id="case-service" value={form.service} onChange={(e) => set('service', e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {CASE_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="case-priority" className={label}>
              Priority
            </label>
            <select id="case-priority" value={form.priority} onChange={(e) => set('priority', e.target.value)} className={inputClass}>
              {CASE_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="case-booking" className={label}>
              Related booking ID
            </label>
            <input id="case-booking" value={form.bookingId} onChange={(e) => set('bookingId', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="case-refund" className={label}>
              Related refund ID
            </label>
            <input id="case-refund" value={form.refundId} onChange={(e) => set('refundId', e.target.value)} className={inputClass} placeholder="Filled in from the booking when it has a refund" />
          </div>
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input id="case-about-refund" type="checkbox" checked={form.aboutRefund} onChange={(e) => set('aboutRefund', e.target.checked)} />
              This case is about a refund (it must then be linked to the refund)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="case-description" className={label}>
              Description <span className="text-red-600">*</span>
            </label>
            <textarea id="case-description" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputClass} />
          </div>
          {editing && (
            <div className="sm:col-span-2">
              <label htmlFor="case-resolution" className={label}>
                Resolution
              </label>
              <textarea id="case-resolution" rows={3} value={form.resolution} onChange={(e) => set('resolution', e.target.value)} className={inputClass} placeholder="What was done to close the case" />
            </div>
          )}
          {!editing && (
            <>
              <div>
                <label htmlFor="case-team" className={label}>
                  Assign to team <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <select id="case-team" value={team} onChange={(e) => setTeam(e.target.value)} className={inputClass}>
                  <option value="">Not yet</option>
                  {CASE_TEAMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="case-assignee" className={label}>
                  Person
                </label>
                <AssigneeSelect id="case-assignee" team={team} value={assignee} onChange={setAssignee} />
              </div>
            </>
          )}
          {editing && (
            <div className="sm:col-span-2">
              <label htmlFor="case-edit-reason" className={label}>
                Reason for this change <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input id="case-edit-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Saved in the activity history" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? 'Save changes' : `Add ${singular.toLowerCase()}`}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
