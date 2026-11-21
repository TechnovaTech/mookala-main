'use client'
import React, { useEffect, useState } from 'react'
import { Badge, Button, Modal, formatDate, formatMoney, inputClass } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'
import type { Tone } from '@/lib/resource-types'

/* Building blocks shared by the commission, refund and settlement screens. */

export function serviceLabel(value: any): string {
  if (value === 'mixed') return 'Several services'
  return FINANCE_SERVICES.find((s) => s.value === value)?.label || (value ? String(value) : '—')
}

/**
 * A settlement period or due date. Periods are whole days in India time; the
 * settlements created before that was recorded used whole UTC days, so those
 * are shown in UTC.
 */
export function formatDay(value: any, timezone?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone || 'UTC' })
}

export function payeeTypeLabel(value: any): string {
  const labels: Record<string, string> = {
    organizer: 'Organiser',
    artist: 'Artist',
    instructor: 'Instructor',
    cinema: 'Cinema',
    advertiser: 'Advertiser',
    platform: 'Platform',
  }
  return labels[String(value)] || (value ? String(value) : '—')
}

const SCHEDULE_TEXT: Record<string, string> = {
  weekly: 'weekly payout',
  fortnightly: 'payout every two weeks',
  monthly: 'monthly payout',
  manual: 'manual payout, no due date',
}

const SOURCE_TEXT: Record<string, string> = { service: 'rule for this service', global: 'global rule' }

/** One line per service: the settlement rule that was applied, and where it came from. */
export function SettlementRulesApplied({ rules, timezone }: { rules?: any[] | null; timezone?: string | null }) {
  if (!rules || rules.length === 0) return null
  return (
    <ul className="text-sm space-y-1" data-testid="settlement-rules-applied">
      {rules.map((rule) => (
        <li key={rule.service}>
          <span className="font-medium text-gray-900">{serviceLabel(rule.service)}:</span>{' '}
          {rule.payoutSchedule ? `${SCHEDULE_TEXT[rule.payoutSchedule] || rule.payoutSchedule} (${SOURCE_TEXT[rule.scheduleSource] || 'not set'})` : 'no payout schedule set'}
          {'; '}
          {rule.eligibilityDays === null || rule.eligibilityDays === undefined
            ? 'no eligibility wait'
            : `payable ${rule.eligibilityDays} day${rule.eligibilityDays === 1 ? '' : 's'} after the event (${SOURCE_TEXT[rule.eligibilitySource] || 'not set'})`}
          {rule.dueDate ? `; due ${formatDay(rule.dueDate, timezone)}` : ''}
        </li>
      ))}
    </ul>
  )
}

export function StatusBadge({ value, options }: { value: string; options: { value: string; label: string; tone: Tone }[] }) {
  const option = options.find((o) => o.value === value)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || value || '—'}</Badge>
}

/** One "label: value" line in a detail view. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-100 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right break-words min-w-0">{children}</span>
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{children}</h3>
}

const FIELD_LABELS: Record<string, string> = {
  ratePercent: 'Commission rate (%)',
  minFee: 'Minimum fee',
  maxFee: 'Maximum commission',
  gstPercent: 'GST (%)',
  gatewayFeePercent: 'Gateway fee (%)',
  effectiveFrom: 'Effective from',
  notes: 'Notes',
  status: 'Status',
  service: 'Service',
  refundSecondApprovalAbove: 'Refund second-approval threshold',
  payoutSecondApprovalAbove: 'Payout second-approval threshold',
  payoutSchedule: 'Payout schedule',
  settlementEligibilityDays: 'Settlement eligibility (days after event)',
  gstNumber: 'Platform GST number',
  changeAppliesFrom: 'Change applies from',
  activatedAt: 'Activated',
  activatedBy: 'Activated by',
  retiredAt: 'Retired',
  retiredBy: 'Retired by',
  effectiveFromRequested: 'Effective date first entered',
  gstLegalName: 'GST registered name',
  minHoursBefore: 'Cancelled at least (hours before)',
  maxHoursBefore: 'And no more than (hours before)',
  refundPercent: 'Refund (%)',
  deductionFlat: 'Flat cancellation charge',
  name: 'Rule name',
  bookingPaymentStatus: 'Booking payment status',
  firstApprover: 'First approver',
  secondApprover: 'Second approver',
  manualReference: 'Refund reference',
  bankReference: 'Bank reference',
  gatewayRefundId: 'Gateway refund ID',
  failureMessage: 'Gateway message',
  ledgerReference: 'Ledger reference',
  refundAmount: 'Refund amount',
  netAmount: 'Net payable',
}

const HIDDEN_KEYS = new Set(['changeReason', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', '_id', 'ruleSnapshot', 'entryReferences'])

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  status_change: 'Status changed',
  delete: 'Deleted',
  export: 'Exported',
  note: 'Note added',
  approve: 'Approved',
  second_approve: 'Second approval given',
  reject: 'Rejected',
  dispute: 'Marked as disputed',
  process: 'Sent to the gateway',
  process_failed: 'Gateway refund failed',
  record_ledger: 'Ledger entries recorded',
  manual_refund: 'Marked as refunded manually',
  hold: 'Put on hold',
  release: 'Released from hold',
  paid: 'Marked as paid',
  failed: 'Marked as failed',
  check_status: 'Checked with the gateway',
  mark_failed: 'Marked as failed by an admin',
}

/** "ticketing.payoutSchedule" is a per-service finance setting. */
function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const dot = key.indexOf('.')
  if (dot > 0 && FIELD_LABELS[key.slice(dot + 1)]) return `${serviceLabel(key.slice(0, dot))}: ${FIELD_LABELS[key.slice(dot + 1)]}`
  return key
}

function showValue(value: any): string {
  if (value === null || value === undefined || value === '') return 'not set'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value, true)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).replace(/_/g, ' ')
}

/** Activity-log entries for a record: who, when, old value, new value and the reason. */
export function AuditHistory({ entries, emptyText }: { entries: any[]; emptyText?: string }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText || 'No changes have been recorded yet.'}</p>
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const before = entry.before && typeof entry.before === 'object' ? entry.before : {}
        const after = entry.after && typeof entry.after === 'object' ? entry.after : {}
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((k) => !HIDDEN_KEYS.has(k))
        const isCreate = entry.action === 'create'
        const reason = entry.reason || after.changeReason || null

        return (
          <li key={entry._id} className="text-sm border-l-2 border-gray-200 pl-3">
            <p className="text-gray-900">
              <span className="font-medium">{ACTION_LABELS[entry.action] || String(entry.action).replace(/_/g, ' ')}</span>
              <span className="text-gray-500">
                {' '}
                by {entry.adminName || entry.adminEmail || 'unknown admin'} on {formatDate(entry.createdAt, true)}
              </span>
            </p>
            {!isCreate && keys.length > 0 && (
              <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                {keys.slice(0, 12).map((key) => (
                  <li key={key}>
                    {fieldLabel(key)}: <span className="text-gray-500">{showValue(before[key])}</span> →{' '}
                    <span className="font-medium text-gray-800">{showValue(after[key])}</span>
                  </li>
                ))}
              </ul>
            )}
            {isCreate && keys.length > 0 && (
              <p className="mt-1 text-xs text-gray-600">
                {keys
                  .filter((k) => FIELD_LABELS[k] && after[k] !== null && after[k] !== undefined && after[k] !== '')
                  .slice(0, 8)
                  .map((k) => `${FIELD_LABELS[k]}: ${showValue(after[k])}`)
                  .join(' · ')}
              </p>
            )}
            {reason ? (
              <p className="mt-1 text-xs text-gray-700">
                <span className="text-gray-500">Reason:</span> {reason}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export interface ActionRequest {
  title: string
  message: React.ReactNode
  confirmLabel: string
  danger?: boolean
  /** 'required', 'optional' or absent for no reason box. */
  reason?: 'required' | 'optional'
  /** When set, a reference box with this label is shown and must be filled. */
  referenceLabel?: string
  referenceHelp?: string
  run: (values: { reason: string; reference: string }) => Promise<void>
}

/**
 * Confirmation for a money action. Collects the written reason and, where
 * needed, a bank or UPI reference. Errors from the server stay in the dialog.
 */
export function ActionDialog({ request, onClose }: { request: ActionRequest | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setReason('')
    setReference('')
    setError('')
    setBusy(false)
  }, [request])

  if (!request) return null

  const blocked =
    (request.reason === 'required' && reason.trim().length < 5) || (Boolean(request.referenceLabel) && reference.trim().length < 3)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await request.run({ reason: reason.trim(), reference: reference.trim() })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={request.title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={request.danger ? 'danger' : 'primary'} loading={busy} disabled={blocked} onClick={submit}>
            {request.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        <div>{request.message}</div>
        {request.referenceLabel && (
          <div>
            <label htmlFor="action-reference" className="block text-sm font-medium text-gray-700 mb-1">
              {request.referenceLabel}
            </label>
            <input
              id="action-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClass}
              maxLength={120}
            />
            {request.referenceHelp && <p className="text-xs text-gray-500 mt-1">{request.referenceHelp}</p>}
          </div>
        )}
        {request.reason && (
          <div>
            <label htmlFor="action-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason {request.reason === 'optional' ? '(optional)' : ''}
            </label>
            <textarea
              id="action-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder="This is saved in the activity log"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** A compact money breakdown: one line per ledger concept, never one merged number. */
export function MoneyLines({ lines }: { lines: { label: string; value: any; minus?: boolean; strong?: boolean; hint?: string }[] }) {
  return (
    <dl className="text-sm">
      {lines.map((line) => (
        <div
          key={line.label}
          className={`flex justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0 ${line.strong ? 'font-semibold text-deep-blue' : 'text-gray-700'}`}
        >
          <dt>
            {line.label}
            {line.hint && <span className="block text-xs font-normal text-gray-500">{line.hint}</span>}
          </dt>
          <dd className="whitespace-nowrap">
            {(line.minus && Number(line.value) > 0) || Number(line.value) < 0 ? '− ' : ''}
            {formatMoney(Math.abs(Number(line.value) || 0))}
          </dd>
        </div>
      ))}
    </dl>
  )
}
