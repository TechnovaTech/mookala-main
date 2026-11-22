'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, ConfirmDialog, Modal, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import {
  CASE_STATUSES,
  DONE_CASE_STATUSES,
  OPEN_CASE_STATUSES,
  REPLY_CHANNELS,
  caseResourceName,
} from '@/lib/resources/support'
import { AssignDialog, CaseFormDialog, EscalateDialog, type CaseFormValues } from './CaseDialogs'
import {
  CaseStatusBadge,
  DeliveryBadge,
  EscalatedFlag,
  HISTORY_ACTIONS,
  PriorityBadge,
  SlaBadge,
  formatMinutes,
  hoursLabel,
  optionLabel,
  serviceLabel,
  teamName,
  whenText,
  type CaseRowView,
} from './shared'

interface CaseDetailData {
  item: CaseRowView & {
    description: string
    resolution: string
    statusReason: string | null
    assignedAt: string | null
    assignedBy: string | null
    escalations: any[]
    firstResponseBy: string | null
    firstResponseType: string | null
    resolvedBy: string | null
    reopenCount: number
    timingSource: string | null
    createdBy: string | null
    notes: { text: string; by: string | null; byName: string | null; at: string }[]
    replies: { id: string; text: string; by: string | null; byName: string | null; at: string; channel: string; to: string | null; delivery: { status: string; error: string | null; logId: string | null } }[]
  }
  slaConfigured: boolean
  history: any[]
  account: { id: string; name: string; email: string; phone: string; accountStatus: string } | null
  booking: { _id: string; eventTitle: string; eventDate: string | null; status: string; paymentStatus: string; amountPaid: number } | null
  bookingMissing: boolean
  refunds: { _id: string; status: string; refundAmount: number; amountPaid: number; deductionAmount: number; reason: string; disputeReason: string | null; disputedAt: string | null; rejectionReason: string | null; processedAt: string | null; createdAt: string | null }[]
  linkedRefundId: string | null
  canViewRefunds: boolean
  canManage: boolean
  computedAt: string
}

const REFUND_TONES: Record<string, 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple'> = {
  requested: 'amber',
  awaiting_second_approval: 'amber',
  approved: 'blue',
  processing: 'blue',
  processed: 'green',
  rejected: 'gray',
  failed: 'red',
  disputed: 'purple',
}

const RESPONSE_KIND: Record<string, string> = { status: 'status change', note: 'internal note', reply: 'reply to the customer' }

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-deep-blue">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function historyText(entry: any): string {
  const verb = HISTORY_ACTIONS[entry.action] || String(entry.action || '').replace(/_/g, ' ')
  const who = entry.adminName || entry.adminEmail || (entry.meta?.raisedBy === 'customer' ? 'The customer (in the app)' : 'System')
  let detail = ''
  const after = entry.after && typeof entry.after === 'object' ? entry.after : null
  const before = entry.before && typeof entry.before === 'object' ? entry.before : {}
  if (after && entry.action !== 'create' && entry.action !== 'note' && entry.action !== 'reply') {
    const keys = Object.keys(after).filter((k) => !['firstResponseBy', 'firstResponseType', 'escalations', 'resolvedBy', 'escalatedBy', 'escalatedAt', 'reopenedAt', 'statusChangedAt'].includes(k))
    detail = keys
      .map((k) => {
        const show = (v: any) => (v === null || v === undefined || v === '' ? 'empty' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDate(v, true) : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v))
        return `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${show(before[k])} → ${show(after[k])}`
      })
      .join(', ')
  }
  if (entry.action === 'note' && after?.note) detail = `"${String(after.note).slice(0, 160)}"`
  if (entry.action === 'reply' && after?.reply) detail = `via ${after.channel || 'app'} (${after.delivery || '—'}): "${String(after.reply).slice(0, 160)}"`
  if (entry.action === 'create' && after?.source === 'app') detail = 'raised in the app'
  return `${who} ${verb}${detail ? ': ' + detail : ''}`
}

/**
 * The full case: SLA state, assignment and escalation, replies to the
 * customer, internal notes, the linked booking and refund, and the complete
 * activity history. Every action goes through the server, which checks
 * support:manage again.
 */
export default function CaseDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<CaseDetailData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')
  const [channel, setChannel] = useState('app')
  const [dialog, setDialog] = useState<'' | 'assign' | 'escalate' | 'edit' | 'delete'>('')
  const [pendingStatus, setPendingStatus] = useState<string>('')

  const load = useCallback(async () => {
    try {
      setData(await api<CaseDetailData>(`/api/admin/support/cases/${id}`))
      setLoadError('')
    } catch (e: any) {
      setLoadError(e.message || 'Could not open the case.')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const done = async (message: string, type: 'success' | 'info' = 'success') => {
    setDialog('')
    setNotice({ type, text: message })
    await load()
    onChanged()
  }

  const post = async (body: Record<string, any>, after: () => void) => {
    setBusy(true)
    try {
      const result = await api<{ message: string; delivery?: { status: string } }>(`/api/admin/support/cases/${id}`, { method: 'POST', body })
      after()
      const delivered = !result.delivery || result.delivery.status === 'in_app' || result.delivery.status === 'accepted'
      await done(result.message, delivered ? 'success' : 'info')
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (reason: string) => {
    if (!data || !pendingStatus) return
    setBusy(true)
    try {
      await api(`/api/admin/r/${caseResourceName(data.item.kind)}/${id}`, { method: 'PATCH', body: { status: pendingStatus, reason } })
      const label = optionLabel(CASE_STATUSES, pendingStatus)
      setPendingStatus('')
      await done(`The case is now "${label}".`)
    } catch (e: any) {
      setPendingStatus('')
      setNotice({ type: 'error', text: e.message || 'Could not change the status.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (reason: string) => {
    if (!data) return
    setBusy(true)
    try {
      await api(`/api/admin/r/${caseResourceName(data.item.kind)}/${id}`, { method: 'DELETE', body: { reason } })
      onChanged()
      onClose()
    } catch (e: any) {
      setDialog('')
      setNotice({ type: 'error', text: e.message || 'Could not delete the case.' })
    } finally {
      setBusy(false)
    }
  }

  const item = data?.item
  const reopening = Boolean(item && pendingStatus && DONE_CASE_STATUSES.includes(item.status) && OPEN_CASE_STATUSES.includes(pendingStatus))
  const singular = item?.kind === 'complaint' ? 'Complaint' : 'Ticket'
  const formInitial: CaseFormValues | null = item
    ? {
        subject: item.subject,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        service: item.service,
        priority: item.priority || 'normal',
        bookingId: item.bookingId || '',
        aboutRefund: item.aboutRefund,
        refundId: item.refundId || '',
        description: item.description,
        resolution: item.resolution,
      }
    : null

  return (
    <>
      <Modal
        open
        wide
        title={item ? item.subject || singular : 'Case'}
        onClose={() => {
          if (!dialog && !pendingStatus) onClose()
        }}
        footer={
          item && data?.canManage ? (
            <>
              <Button variant="ghost" className="mr-auto text-red-700" onClick={() => setDialog('delete')}>
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setDialog('edit')}>
                Edit
              </Button>
            </>
          ) : undefined
        }
      >
        {!data && !loadError && <Spinner label="Opening the case..." />}
        {loadError && <NoticeBar notice={{ type: 'error', text: loadError }} />}
        {data && item && (
          <div className="space-y-6" data-case-id={item._id}>
            <NoticeBar notice={notice} onClose={() => setNotice(null)} />

            <div className="flex flex-wrap items-center gap-2">
              <CaseStatusBadge value={item.status} />
              <PriorityBadge value={item.priority} />
              <EscalatedFlag escalated={item.escalated} level={item.escalationLevel} />
              <Badge tone={item.source === 'app' ? 'blue' : 'gray'}>{item.source === 'app' ? 'Raised in the app' : 'Recorded by staff'}</Badge>
              <span className="text-sm text-gray-600">
                {item.kind === 'complaint' ? 'Complaint' : 'Ticket'} · Ref {item._id.slice(-8).toUpperCase()}
              </span>
            </div>
            {item.statusReason && <p className="text-sm text-gray-600 -mt-4">Status reason: {item.statusReason}</p>}

            <div className="rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-3" data-testid="case-assignment">
              <div className="text-sm">
                <span className="text-gray-500">Assigned to </span>
                <strong className="text-gray-900">{teamName(item.assignedTeam)}</strong>
                {item.assignedToName ? <span className="text-gray-900">: {item.assignedToName}</span> : item.assignedTeam ? <span className="text-gray-500"> (no person yet)</span> : null}
                {data.item.assignedAt && <span className="block text-xs text-gray-500">since {whenText(data.item.assignedAt)} by {data.item.assignedBy || '—'}</span>}
              </div>
              {data.canManage && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setDialog('assign')}>
                    {item.assignedTeam || item.assignedToId ? 'Reassign' : 'Assign'}
                  </Button>
                  {!DONE_CASE_STATUSES.includes(item.status) && (
                    <Button variant="danger" onClick={() => setDialog('escalate')}>
                      Escalate
                    </Button>
                  )}
                  <select
                    id="case-status-change"
                    aria-label="Change status"
                    value=""
                    onChange={(e) => e.target.value && setPendingStatus(e.target.value)}
                    className={inputClass.replace('w-full ', 'w-auto ')}
                  >
                    <option value="">Change status...</option>
                    {CASE_STATUSES.filter((s) => s.value !== item.status && s.value !== 'escalated').map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <Section title="Response and resolution time">
              {!data.slaConfigured && (
                <p className="text-xs text-gray-500 mb-2">
                  No SLA targets have been set, so no case can be past target. Set them on{' '}
                  <Link href="/support/overview#sla" className="text-teal underline">
                    Support Overview
                  </Link>
                  .
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3" data-testid="sla-response">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">First response (target {hoursLabel(item.sla.response.targetHours)})</p>
                  <SlaBadge clock={item.sla.response} />
                  <p className="text-sm text-gray-800 mt-1">
                    {item.firstResponseAt
                      ? `${whenText(item.firstResponseAt)} · ${formatMinutes(item.responseMinutes)} after the case was raised${data.item.firstResponseType ? ` · by ${RESPONSE_KIND[data.item.firstResponseType] || data.item.firstResponseType}` : ''}`
                      : item.status === 'open'
                        ? 'Waiting for a first response'
                        : 'Not recorded (the case was handled before response times were kept)'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3" data-testid="sla-resolution">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Resolution (target {hoursLabel(item.sla.resolution.targetHours)})</p>
                  <SlaBadge clock={item.sla.resolution} />
                  <p className="text-sm text-gray-800 mt-1">
                    {item.resolvedAt
                      ? `${whenText(item.resolvedAt)} · ${formatMinutes(item.resolutionMinutes)} after the case was raised`
                      : DONE_CASE_STATUSES.includes(item.status)
                        ? 'Not recorded (finished before resolution times were kept)'
                        : 'Not resolved yet'}
                    {data.item.reopenCount ? ` · reopened ${data.item.reopenCount} time${data.item.reopenCount === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
              </div>
              {data.item.timingSource === 'derived' && (
                <p className="text-xs text-gray-500 mt-1">Some of these times were taken from the case&apos;s notes and activity log.</p>
              )}
            </Section>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Customer">
                {item.customerName || '—'} · {item.customerPhone}
                {data.account ? (
                  <>
                    {' '}
                    <Link href={`/users/${data.account.id}`} className="text-teal underline">
                      Open customer history
                    </Link>
                    {data.account.accountStatus !== 'active' && <span className="text-red-700"> (account {data.account.accountStatus})</span>}
                  </>
                ) : (
                  <span className="block text-xs text-gray-500">No customer account has this phone number.</span>
                )}
              </Field>
              <Field label="Service">{serviceLabel(item.service)}</Field>
              <Field label="Related booking">
                {item.bookingId ? (
                  <>
                    <span className="font-mono text-xs">{item.bookingId}</span>
                    {data.booking && (
                      <span className="block text-xs text-gray-600">
                        {data.booking.eventTitle || 'Event'} · {data.booking.status} · payment {data.booking.paymentStatus || '—'} · {formatMoney(data.booking.amountPaid)}
                      </span>
                    )}
                    {data.bookingMissing && <span className="block text-xs text-red-700">No booking has this ID.</span>}
                  </>
                ) : (
                  '—'
                )}
              </Field>
              <Field label={item.aboutRefund ? 'Refund (this case is about it)' : 'Related refund'}>
                {!item.refundId && data.refunds.length === 0 ? (
                  '—'
                ) : !data.canViewRefunds ? (
                  <span className="text-gray-600">
                    {item.refundId ? <span className="font-mono text-xs">{item.refundId}</span> : null} Refund details need the refunds permission.
                  </span>
                ) : (
                  <ul className="space-y-1" data-testid="case-refunds">
                    {data.refunds.map((r) => (
                      <li key={r._id}>
                        <Badge tone={REFUND_TONES[r.status] || 'gray'}>{r.status.replace(/_/g, ' ')}</Badge>{' '}
                        {formatMoney(r.refundAmount)} of {formatMoney(r.amountPaid)}
                        {r._id === data.linkedRefundId ? ' · linked' : ''}{' '}
                        <Link href={`/finance/refunds?open=${r._id}`} className="text-teal underline">
                          Open in Finance
                        </Link>
                        {r.disputeReason && <span className="block text-xs text-purple-800">Dispute: {r.disputeReason}</span>}
                        {r.rejectionReason && <span className="block text-xs text-gray-600">Rejected: {r.rejectionReason}</span>}
                      </li>
                    ))}
                    {item.refundId && !data.refunds.some((r) => r._id === item.refundId) && <li className="text-red-700 text-xs">The linked refund {item.refundId} was not found.</li>}
                  </ul>
                )}
              </Field>
              <Field label="Description" wide>
                {data.item.description || '—'}
              </Field>
              <Field label="Resolution" wide>
                {data.item.resolution || '—'}
              </Field>
              <Field label="Raised">
                {whenText(item.createdAt)}
                {data.item.createdBy ? ` · ${data.item.createdBy.startsWith('customer:') ? 'by the customer in the app' : 'by ' + data.item.createdBy}` : ''}
              </Field>
              <Field label="Last updated">{whenText(item.updatedAt)}</Field>
            </dl>

            <Section title={`Replies to the customer (${data.item.replies.length})`} aside={<span className="text-xs text-gray-500">The customer sees these in the app</span>}>
              {data.item.replies.length === 0 && <p className="text-sm text-gray-500">No reply has been sent yet.</p>}
              <ul className="space-y-2" data-testid="case-replies">
                {data.item.replies.map((r) => (
                  <li key={r.id} className="border border-blue-100 bg-blue-50 rounded-lg px-3 py-2 text-sm">
                    <p className="text-gray-800 whitespace-pre-wrap">{r.text}</p>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                      {r.byName || r.by} · {whenText(r.at)} · {optionLabel(REPLY_CHANNELS, r.channel)}
                      <DeliveryBadge status={r.delivery?.status} />
                    </p>
                    {r.delivery?.error && <p className="text-xs text-amber-800 mt-0.5">{r.delivery.error}</p>}
                  </li>
                ))}
              </ul>
              {data.canManage && (
                <div className="mt-3 space-y-2">
                  <label htmlFor="case-reply" className="block text-sm font-medium text-gray-700">
                    Reply to the customer
                  </label>
                  <textarea id="case-reply" rows={3} value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} className={inputClass} placeholder="Written to the customer. Not an internal note." />
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="case-reply-channel" className="text-sm text-gray-700">
                      Send through
                    </label>
                    <select id="case-reply-channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass.replace('w-full ', 'w-auto ')}>
                      {REPLY_CHANNELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Button className="ml-auto" disabled={!reply.trim()} loading={busy} onClick={() => post({ action: 'reply', text: reply, channel }, () => setReply(''))}>
                      Send reply
                    </Button>
                  </div>
                </div>
              )}
            </Section>

            <Section title={`Internal notes (${data.item.notes.length})`} aside={<span className="text-xs text-gray-500">Never shown to the customer</span>}>
              {data.item.notes.length === 0 && <p className="text-sm text-gray-500">No notes yet.</p>}
              <ul className="space-y-2" data-testid="case-notes">
                {data.item.notes.map((n, index) => (
                  <li key={index} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <p className="text-gray-800 whitespace-pre-wrap">{n.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {n.byName || n.by} · {whenText(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
              {data.canManage && (
                <div className="flex gap-2 mt-3">
                  <input id="case-note" aria-label="Add an internal note" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" className={inputClass} />
                  <Button variant="secondary" disabled={!note.trim()} loading={busy} onClick={() => post({ action: 'note', text: note }, () => setNote(''))}>
                    Add
                  </Button>
                </div>
              )}
            </Section>

            {data.item.escalations.length > 0 && (
              <Section title={`Escalations (${data.item.escalations.length})`}>
                <ul className="space-y-1 text-sm" data-testid="case-escalations">
                  {data.item.escalations.map((e: any, index: number) => (
                    <li key={index} className="border-l-2 border-red-300 pl-3">
                      <span className="text-gray-900">
                        {e.byName || e.by} · {whenText(e.at)}: priority {e.fromPriority} → {e.toPriority}
                        {e.toTeam !== e.fromTeam ? `, team ${teamName(e.fromTeam)} → ${teamName(e.toTeam)}` : ''}
                        {e.toAssignee !== e.fromAssignee ? `, person ${e.fromAssignee || 'none'} → ${e.toAssignee || 'none'}` : ''}
                      </span>
                      <span className="block text-xs text-gray-600">Reason: {e.reason}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title={`Case activity history (${data.history.length})`} aside={<span className="text-xs text-gray-500">Every change, oldest first</span>}>
              {data.history.length === 0 && <p className="text-sm text-gray-500">No activity recorded.</p>}
              <ol className="space-y-2" data-testid="case-history">
                {data.history.map((entry) => (
                  <li key={entry._id} className="text-sm border-l-2 border-gray-200 pl-3" data-action={entry.action}>
                    <p className="text-gray-800">{historyText(entry)}</p>
                    <p className="text-xs text-gray-500">
                      {whenText(entry.createdAt)}
                      {entry.reason ? ` · Reason: ${entry.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        )}
      </Modal>

      {item && (
        <>
          <AssignDialog open={dialog === 'assign'} item={item} onClose={() => setDialog('')} onDone={(message) => done(message)} />
          <EscalateDialog open={dialog === 'escalate'} item={item} onClose={() => setDialog('')} onDone={(message) => done(message)} />
          {formInitial && (
            <CaseFormDialog
              open={dialog === 'edit'}
              resource={caseResourceName(item.kind)}
              singular={singular}
              editing={{ _id: item._id }}
              initial={formInitial}
              onClose={() => setDialog('')}
              onSaved={(message) => done(message, message.startsWith('Nothing') ? 'info' : 'success')}
            />
          )}
          <ConfirmDialog
            open={Boolean(pendingStatus)}
            title="Change status"
            message={
              <>
                Mark <strong>{item.subject}</strong> as <strong>{optionLabel(CASE_STATUSES, pendingStatus)}</strong>?
                {reopening && <span className="block mt-2 text-amber-800">This reopens a finished case: its resolution time is cleared.</span>}
                {pendingStatus === 'resolved' && !data?.item.resolution && <span className="block mt-2 text-gray-600">Tip: write what was done under Edit → Resolution.</span>}
              </>
            }
            askReason
            reasonRequired={pendingStatus === 'closed' || reopening}
            busy={busy}
            onConfirm={changeStatus}
            onClose={() => setPendingStatus('')}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            title={`Delete ${singular.toLowerCase()}`}
            message={
              <>
                Delete <strong>{item.subject}</strong>? This cannot be undone. Its activity history stays in the audit log.
              </>
            }
            confirmLabel="Delete"
            danger
            askReason
            reasonRequired
            busy={busy}
            onConfirm={remove}
            onClose={() => setDialog('')}
          />
        </>
      )}
    </>
  )
}
