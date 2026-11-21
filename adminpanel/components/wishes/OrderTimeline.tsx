'use client'
import React, { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '@/components/ui'
import { ORDER_STATUS, StatusBadge, formatDuration } from './shared'

interface Stage {
  status: string
  enteredAt: string
  leftAt: string | null
  durationMs: number
  current: boolean
  by: string | null
  reason: string | null
}
interface TimelineEvent {
  at: string
  kind: string
  text: string
  by: string | null
  reason: string | null
}
interface Timeline {
  order: { status: string; retryCount: number }
  source: 'audit' | 'timestamps'
  stages: Stage[]
  events: TimelineEvent[]
  stamps: { status: string; at: string | null; auditAt: string | null; agrees: boolean }[]
  summary: {
    createdToPaidMs: number | null
    paidToProcessingMs: number | null
    paidToDeliveredMs: number | null
    createdToDeliveredMs: number | null
  }
  /** null when the admin may not see finance records ('finance:view'). */
  ledger: { reference: string; type: string; amount: number; payeeType: string | null; payeeName: string | null; createdAt: string }[] | null
}

const LEDGER_TYPE: Record<string, string> = {
  payment: 'Payment',
  refund: 'Refund',
  commission: 'Commission',
  gst: 'GST on commission',
  gateway_fee: 'Gateway fee',
}

const DOT: Record<string, string> = {
  gray: 'bg-gray-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  green: 'bg-green-600',
  red: 'bg-red-600',
  purple: 'bg-purple-600',
}

/**
 * The order-level history shown at the top of an order's detail view: each
 * stage with when it started, who moved the order there, the reason and how
 * long the order stayed in it, then the edits, notes and ledger entries.
 */
export default function OrderTimeline({ item }: { item: Record<string, any> }) {
  const [data, setData] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  const version = `${item._id}|${item.status}|${item.statusChangedAt || ''}|${item.updatedAt || ''}|${(item.notes || []).length}`

  useEffect(() => {
    let cancelled = false
    setError('')
    api<Timeline>(`/api/admin/wishes/orders/${item._id}/timeline`)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((problem: any) => {
        if (!cancelled) setError(problem.message || 'Could not load the order history.')
      })
    return () => {
      cancelled = true
    }
  }, [version, item._id])

  if (error) return <p className="text-sm text-red-600" role="alert">{error}</p>
  if (!data) return <p className="text-sm text-gray-500">Loading the order history...</p>

  const summary: [string, number | null][] = [
    ['Created → paid', data.summary.createdToPaidMs],
    ['Paid → processing', data.summary.paidToProcessingMs],
    ['Paid → delivered', data.summary.paidToDeliveredMs],
    ['Created → delivered', data.summary.createdToDeliveredMs],
  ]
  const disagreeing = data.stamps.filter((stamp) => !stamp.agrees)

  return (
    <section className="border border-gray-200 rounded-lg p-4 bg-gray-50" data-order-timeline={item._id}>
      <h3 className="text-sm font-semibold text-deep-blue mb-3">Order timeline</h3>

      <ol className="space-y-3">
        {data.stages.map((stage, index) => (
          <li key={index} className="flex gap-3" data-stage={stage.status}>
            <span
              className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${DOT[ORDER_STATUS[stage.status]?.tone || 'gray']}`}
              aria-hidden="true"
            />
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-800">
                <StatusBadge status={stage.status} />
                <span>{formatDate(stage.enteredAt, true)}</span>
                {stage.by && <span className="text-gray-500">by {stage.by}</span>}
              </p>
              <p className="text-xs text-gray-600 mt-0.5" data-stage-duration>
                {stage.current
                  ? stage.status === 'delivered' || stage.status === 'cancelled' || stage.status === 'refunded'
                    ? 'Final stage'
                    : `In this stage for ${formatDuration(stage.durationMs)} so far`
                  : `Stayed ${formatDuration(stage.durationMs)}`}
                {stage.reason ? ` · Reason: ${stage.reason}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4" data-timeline-summary>
        {summary.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
            <dd className="text-sm text-gray-900">{formatDuration(value)}</dd>
          </div>
        ))}
      </dl>
      {data.order.retryCount > 0 && (
        <p className="text-xs text-gray-600 mt-2">
          Retried {data.order.retryCount} time{data.order.retryCount === 1 ? '' : 's'} after a failed, delayed or disputed delivery.
        </p>
      )}
      {data.source === 'timestamps' && (
        <p className="text-xs text-gray-600 mt-2">
          This order has no audited status changes, so the stages are taken from the timestamps stored on the order.
        </p>
      )}
      {disagreeing.length > 0 && (
        <p className="text-xs text-amber-800 mt-2" data-timeline-mismatch>
          The stored timestamp for {disagreeing.map((stamp) => ORDER_STATUS[stamp.status]?.label || stamp.status).join(', ')} does not
          match the audit trail. The audit trail is shown above.
        </p>
      )}

      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1">Ledger entries</h4>
      {data.ledger === null ? (
        <p className="text-sm text-gray-500" data-ledger-hidden>
          Ledger entries are shown to admins who can view Finance.
        </p>
      ) : data.ledger.length === 0 ? (
        <p className="text-sm text-gray-500" data-ledger-empty>
          None. A payment entry is written when the order is marked "Paid" and a refund entry when it is marked "Refunded".
        </p>
      ) : (
        <ul className="text-sm text-gray-800 space-y-1" data-ledger-entries>
          {data.ledger.map((entry) => (
            <li key={entry.reference}>
              <span className="font-medium">{LEDGER_TYPE[entry.type] || entry.type.replace(/_/g, ' ')}</span> {formatMoney(entry.amount)}{' '}
              <span className="text-gray-500">
                {entry.reference} · {formatDate(entry.createdAt, true)}
                {entry.type === 'payment'
                  ? ` · owed to ${entry.payeeType === 'platform' ? 'the platform' : entry.payeeName || entry.payeeType || 'payee'}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {data.events.filter((event) => event.kind !== 'ledger').length > 0 && (
        <>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1">Edits, notes and assignments</h4>
          <ul className="text-sm text-gray-800 space-y-1" data-timeline-events>
            {data.events
              .filter((event) => event.kind !== 'ledger')
              .map((event, index) => (
                <li key={index}>
                  {event.text}{' '}
                  <span className="text-gray-500">
                    · {formatDate(event.at, true)}
                    {event.by ? ` · ${event.by}` : ''}
                    {event.reason ? ` · Reason: ${event.reason}` : ''}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  )
}
