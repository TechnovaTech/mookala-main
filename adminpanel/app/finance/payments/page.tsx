'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import ReportDefinitions from '@/components/finance/ReportDefinitions'
import {
  LedgerExportLink,
  LedgerPager,
  LedgerStatusBadge,
  LedgerTypeBadge,
  SERVICE_OPTIONS,
  STATUS_OPTIONS,
  serviceName,
  td,
  tdRight,
  th,
  thRight,
} from '@/components/finance/LedgerLabels'

interface TabCount {
  count: number
  total: number
  refunded: number
  partlyRefunded: number
}

interface ListResponse {
  items: any[]
  page: number
  pageSize: number
  total: number
  counts: Record<string, TabCount>
  rangeLabel: string
  ledgerEntries: number
  unverifiedBookings: { count: number; value: number; capped: boolean }
}

interface LogLine {
  at: string | null
  source: 'payment_log' | 'webhook' | 'ledger' | 'admin'
  title: string
  detail: string
  actor: string | null
  outcome: string
}

interface Detail {
  payment: any
  derived: any[]
  booking: { _id: string; eventTitle: string; status: string | null; paymentStatus: string; totalPrice: any; amountPaid: any; confirmedVia: string | null } | null
  refunds: any[]
  gatewaySettlement: { settlementId: string; utr: string | null; settledAt: string | null; amount: number | null; status: string | null; fee: number | null; tax: number | null } | null
  log: LogLine[]
}

type DisputeAction = 'dispute' | 'clear_dispute' | 'dispute_lost'

const EMPTY_HINT: Record<string, string> = {
  success: 'A payment appears here once the gateway has confirmed it was captured.',
  failed: 'Attempts the gateway reported as failed are listed here. No money was received for them.',
  pending: 'Bookings that are awaiting payment against a gateway order are listed here while their seats are held. An unpaid order leaves this list when its hold runs out.',
  refunded: 'Payments returned to the customer in full, by a processed refund or a lost dispute, are listed here.',
  disputed: 'Payments under dispute are listed here until the dispute is cleared or lost.',
}

const STATE_RULES =
  'Successful: money received; a partly refunded payment stays here with the amount returned. Pending: a booking awaiting payment against a gateway order (seats held). Failed: an attempt the gateway rejected. Refunded: returned in full. Disputed: the payment and its commission, GST, gateway fee and refunds are set aside, counted in no figure and held back from the payee’s settlement, until the dispute is cleared (everything counts again) or lost (it becomes a full refund and the charges are reversed).'

const REFUND_STATUS: Record<string, string> = {
  requested: 'Requested',
  awaiting_second_approval: 'Awaiting second approval',
  approved: 'Approved, not sent yet',
  rejected: 'Rejected',
  processing: 'Sent to the gateway, awaiting its confirmation',
  processed: 'Processed',
  failed: 'Failed',
  disputed: 'Disputed',
}

const SOURCE_LABEL: Record<LogLine['source'], string> = { payment_log: 'Payment log', webhook: 'Webhook', ledger: 'Ledger', admin: 'Admin' }

const DISPUTE_COPY: Record<DisputeAction, { title: string; message: string; confirm: string; done: (reference: string) => string }> = {
  dispute: {
    title: 'Mark this payment as disputed?',
    message:
      'The payment and every entry derived from it (commission, GST, gateway fee and any refund) are set aside. They leave gross transaction value, revenue and the payee’s balance, so the amount cannot be settled while the dispute is open.',
    confirm: 'Mark as disputed',
    done: (reference) => `Payment ${reference} was marked as disputed. Its commission, GST and gateway fee are set aside with it.`,
  },
  clear_dispute: {
    title: 'Clear the dispute?',
    message: 'Use this when the dispute was decided in your favour or was raised by mistake. The payment and its derived entries count again, and the amount returns to the payee’s balance.',
    confirm: 'Clear dispute',
    done: (reference) => `The dispute on ${reference} was cleared. The payment and its derived entries count again.`,
  },
  dispute_lost: {
    title: 'Record the dispute as lost?',
    message:
      'Use this when the bank has taken the money back (a chargeback). A refund entry is written for the amount not already refunded, the commission, GST and gateway fee on the payment are reversed, the payee is no longer owed anything for it and the booking stops being a paid ticket. This cannot be undone.',
    confirm: 'Record as lost',
    done: (reference) => `The dispute on ${reference} was recorded as lost. The payment is now refunded in full.`,
  },
}

function stateOf(item: any): string {
  return item?.state || item?.status || ''
}

function PaymentDetail({ reference, onClose, onChanged }: { reference: string; onClose: () => void; onChanged: (text: string) => void }) {
  const canManage = useCan('finance:manage')
  const canSeeRefunds = useCan('refunds:view')
  const canSeeBookings = useCan('bookings:view')
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState<DisputeAction | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>('/api/admin/finance/payments/' + encodeURIComponent(reference)))
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not load the payment.')
    }
  }, [reference])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (reason: string) => {
    if (!action) return
    setBusy(true)
    try {
      await api('/api/admin/finance/payments/' + encodeURIComponent(reference), { method: 'POST', body: { action, reason } })
      onChanged(DISPUTE_COPY[action].done(reference))
      setAction(null)
      await load()
    } catch (err: any) {
      setError(err.message || 'Could not update the payment.')
      setAction(null)
    } finally {
      setBusy(false)
    }
  }

  const payment = data?.payment
  const state = stateOf(payment)
  const rule = payment?.ruleSnapshot
  const sum = (type: string) => (data?.derived || []).filter((e) => e.type === type && e.status === 'success').reduce((t, e) => t + (Number(e.amount) || 0), 0)
  const field = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800 break-all">{value || '—'}</dd>
    </div>
  )
  const mono = (value?: string | null) => (value ? <span className="font-mono text-xs">{value}</span> : null)
  const returned = Number(payment?.refundedAmount) || 0
  const kept = Number(payment?.refundDeductions) || 0

  return (
    <>
      <Modal
        open
        wide
        title={'Payment ' + reference}
        onClose={onClose}
        footer={
          <>
            {canManage && payment && payment.status === 'disputed' && (
              <>
                <Button onClick={() => setAction('clear_dispute')}>Clear dispute</Button>
                <Button variant="danger" onClick={() => setAction('dispute_lost')}>
                  Dispute lost
                </Button>
              </>
            )}
            {canManage && payment && state === 'success' && (
              <Button variant="danger" onClick={() => setAction('dispute')}>
                Mark as disputed
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
        {!data && !error && <Spinner />}
        {payment && data && (
          <div className="space-y-6" data-payment-detail>
            {payment.status === 'disputed' && (
              <NoticeBar
                notice={{
                  type: 'info',
                  text: 'This payment is under dispute. It and its derived entries are counted in no figure and the amount is held back from the payee’s settlement until the dispute is cleared or recorded as lost.',
                }}
              />
            )}
            {payment.dispute?.outcome === 'lost' && (
              <NoticeBar notice={{ type: 'info', text: 'This payment was lost to a dispute (chargeback). It is recorded as a full refund and its commission, GST and gateway fee were reversed.' }} />
            )}

            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {field('Amount', <span className="font-semibold">{formatMoney(payment.amount)}</span>)}
              {field('Status', <LedgerStatusBadge status={state} />)}
              {field('Date', formatDate(payment.createdAt, true))}
              {field('Service', serviceName(payment.service))}
              {field('Customer phone', payment.customerPhone)}
              {field('Payee', [payment.payeeName, payment.payeeType].filter(Boolean).join(' · '))}
              {(returned > 0 || kept > 0) &&
                field(
                  'Refunded',
                  <span data-refunded-amount>
                    {formatMoney(returned)} returned to the customer{kept > 0 ? `, ${formatMoney(kept)} kept under the refund rule` : ''} (
                    {payment.refundState === 'full' ? 'in full' : 'in part'})
                  </span>
                )}
              {payment.status === 'failed' && field('Failure reason', payment.meta?.errorDescription || payment.meta?.errorCode || 'Not given by the gateway')}
            </dl>

            <section data-references>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">References</h3>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {field('Ledger reference', mono(payment.reference))}
                {field('Gateway order ID', mono(payment.gatewayOrderId))}
                {field('Gateway payment ID', mono(payment.gatewayPaymentId))}
                {field(
                  'Booking ID',
                  payment.bookingId ? (
                    canSeeBookings ? (
                      <Link href={'/bookings?open=' + encodeURIComponent(payment.bookingId)} className="font-mono text-xs text-deep-blue underline">
                        {payment.bookingId}
                      </Link>
                    ) : (
                      mono(payment.bookingId)
                    )
                  ) : null
                )}
                {field(
                  'Gateway settlement ID',
                  data.gatewaySettlement ? mono(data.gatewaySettlement.settlementId) : payment.gatewayPaymentId ? 'Not matched to a gateway settlement yet' : null
                )}
                {field('Settlement UTR', data.gatewaySettlement ? mono(data.gatewaySettlement.utr) : null)}
                {data.gatewaySettlement && field('Settled by the gateway on', formatDate(data.gatewaySettlement.settledAt, true))}
                {field('Refund IDs', data.refunds.length ? data.refunds.map((refund) => <span key={refund._id} className="block font-mono text-xs">{refund._id}</span>) : 'No refund')}
                {field('Commission rule ID', mono(payment.ruleId))}
              </dl>
              {data.booking && (
                <p className="text-sm text-gray-600 mt-3">
                  Booking: {data.booking.eventTitle || 'event'}, {String(data.booking.status || 'no status').replace(/_/g, ' ')}, payment{' '}
                  {String(data.booking.paymentStatus).replace(/_/g, ' ')}.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Entries derived from this payment</h3>
              {data.derived.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No commission, GST, gateway fee or refund entries point to this payment.
                  {!rule && payment.status !== 'failed' && ' No commission rule was active for the service when it was recorded, so no charges were taken.'}
                </p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={th}>Type</th>
                        <th className={th}>Reference</th>
                        <th className={th}>Status</th>
                        <th className={th}>Date</th>
                        <th className={thRight}>Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.derived.map((entry) => (
                        <tr key={entry._id}>
                          <td className={td}>
                            <LedgerTypeBadge type={entry.type} />
                          </td>
                          <td className={td + ' font-mono text-xs'}>{entry.reference}</td>
                          <td className={td}>
                            <LedgerStatusBadge status={entry.status} />
                          </td>
                          <td className={td}>{formatDate(entry.createdAt, true)}</td>
                          <td className={tdRight}>{formatMoney(entry.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {payment.status === 'success' && (
                <p className="text-sm text-gray-600 mt-2">
                  Net to payee after successful derived entries:{' '}
                  <span className="font-medium text-gray-800">
                    {formatMoney(
                      Math.round((Number(payment.amount) - sum('commission') - sum('gst') - sum('gateway_fee') - sum('refund') - sum('refund_deduction')) * 100) / 100
                    )}
                  </span>{' '}
                  (amount less commission, GST, gateway fee, refunds and amounts kept under the refund rule; charges reversed by a refund no longer count).
                </p>
              )}
              {payment.status === 'disputed' && <p className="text-sm text-gray-600 mt-2">Nothing is owed to the payee for this payment while it is disputed.</p>}
            </section>

            <section data-refunds>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Refunds</h3>
              {data.refunds.length === 0 ? (
                <p className="text-sm text-gray-600">No refund has been requested for this payment.</p>
              ) : (
                <ul className="space-y-2">
                  {data.refunds.map((refund) => (
                    <li key={refund._id} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-gray-800">
                          {formatMoney(refund.refundAmount)} · {REFUND_STATUS[refund.status] || refund.status}
                          {refund.source === 'chargeback' ? ' · chargeback' : ''}
                        </span>
                        {canSeeRefunds && (
                          <Link href={'/finance/refunds?q=' + encodeURIComponent(payment.bookingId || refund._id)} className="text-deep-blue underline">
                            Open in Refunds
                          </Link>
                        )}
                      </div>
                      <p className="text-gray-600 mt-0.5">
                        Refund <span className="font-mono text-xs">{refund._id}</span>, requested {formatDate(refund.createdAt, true)} by {refund.requestedBy || 'unknown'}
                        {refund.firstApprover ? `; approved by ${[refund.firstApprover, refund.secondApprover].filter(Boolean).join(' and ')}` : ''}
                        {refund.gatewayRefundId ? `; gateway refund ${refund.gatewayRefundId}` : ''}
                        {refund.manualReference ? `; paid outside the gateway, reference ${refund.manualReference}` : ''}
                        {refund.processedAt ? `; completed ${formatDate(refund.processedAt, true)}` : ''}.
                      </p>
                      {refund.reason && <p className="text-gray-600">Reason: {refund.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Commission rule applied</h3>
              {rule ? (
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {field('Commission rate', `${rule.ratePercent}%`)}
                  {field('Minimum fee', rule.minFee === null || rule.minFee === undefined ? 'None' : formatMoney(rule.minFee))}
                  {field('Maximum fee', rule.maxFee === null || rule.maxFee === undefined ? 'None' : formatMoney(rule.maxFee))}
                  {field('GST on commission', rule.gstPercent === null || rule.gstPercent === undefined ? 'None' : `${rule.gstPercent}%`)}
                  {field('Gateway fee', rule.gatewayFeePercent === null || rule.gatewayFeePercent === undefined ? 'None' : `${rule.gatewayFeePercent}%`)}
                  {field('Effective from', formatDate(rule.effectiveFrom))}
                </dl>
              ) : (
                <p className="text-sm text-gray-600">No commission rule snapshot is stored on this payment.</p>
              )}
            </section>

            <section data-payment-log>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Transaction log</h3>
              <p className="text-sm text-gray-600 mb-2">
                Order creation, verification attempts, webhook deliveries, ledger entries, refunds and admin actions for this payment, oldest first.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={th}>When</th>
                      <th className={th}>Source</th>
                      <th className={th}>What happened</th>
                      <th className={th}>By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.log.map((line, index) => (
                      <tr key={index}>
                        <td className={td + ' whitespace-nowrap'}>{formatDate(line.at, true)}</td>
                        <td className={td}>{SOURCE_LABEL[line.source]}</td>
                        <td className={td}>
                          <span className={line.outcome === 'failed' || line.outcome === 'refused' ? 'font-medium text-red-700' : 'font-medium text-gray-800'}>{line.title}</span>
                          {line.detail && <span className="block text-gray-600">{line.detail}</span>}
                        </td>
                        <td className={td}>{line.actor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.log.some((line) => line.source === 'payment_log') && payment.status !== 'failed' && (
                <p className="text-xs text-gray-500 mt-2">
                  Order creation and verification attempts are logged for payments started after the payment log was introduced; none is stored for this one.
                </p>
              )}
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={action !== null}
        title={action ? DISPUTE_COPY[action].title : ''}
        message={action ? DISPUTE_COPY[action].message : ''}
        confirmLabel={action ? DISPUTE_COPY[action].confirm : 'Confirm'}
        danger={action !== 'clear_dispute'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={submit}
        onClose={() => setAction(null)}
      />
    </>
  )
}

/** A pending payment has no ledger entry yet, so its row opens the booking. Rendered inside the shell, where permissions are known. */
function PendingBookingLink({ bookingId }: { bookingId?: string | null }) {
  const canSeeBookings = useCan('bookings:view')
  if (!bookingId || !canSeeBookings) return <span className="text-xs text-gray-500">Not in the ledger yet</span>
  return (
    <Link href={'/bookings?open=' + encodeURIComponent(bookingId)} className="text-xs text-deep-blue underline">
      Open booking
    </Link>
  )
}

export default function PaymentsPage() {
  // `ready` waits for values from the URL (?status=, ?q=, ?open=) so the first request already uses them.
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('success')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [service, setService] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('status') || ''
    if (STATUS_OPTIONS.some((option) => option.value === wanted)) setStatus(wanted)
    const text = params.get('q') || ''
    if (text) {
      setSearch(text)
      setQ(text)
    }
    const reference = params.get('open') || ''
    if (/^[A-Za-z0-9_-]{4,60}$/.test(reference)) setOpen(reference)
    setReady(true)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ status, ...extra })
      if (q) params.set('q', q)
      if (service) params.set('service', service)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return params.toString()
    },
    [status, q, service, from, to]
  )

  // Only the answer to the newest request is shown, so a slow earlier one cannot overwrite a filter.
  const requestRef = useRef(0)
  const load = useCallback(async () => {
    if (!ready) return
    const request = ++requestRef.current
    setLoading(true)
    try {
      const result = await api<ListResponse>('/api/admin/finance/payments?' + query({ page: String(page) }))
      if (request === requestRef.current) setData(result)
    } catch (error: any) {
      if (request === requestRef.current) setNotice({ type: 'error', text: error.message || 'Could not load payments.' })
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [ready, query, page])

  useEffect(() => {
    load()
  }, [load])

  const filtered = Boolean(q || service || from || to)
  const tab = data?.counts[status]
  const unverified = data?.unverifiedBookings

  return (
    <AdminShell
      title="Payments"
      subtitle="Customer payments by state: successful, failed, pending, refunded and disputed"
      actions={<LedgerExportLink href={'/api/admin/finance/payments?format=csv&' + query()} />}
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {unverified && unverified.count > 0 && (
        <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-4" role="alert" data-unverified-banner>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              {unverified.count}
              {unverified.capped ? '+' : ''} {unverified.count === 1 ? 'ticket was' : 'tickets were'} issued without a verified payment, claiming {formatMoney(unverified.value)}
            </p>
            <p className="mt-0.5">
              They come from old app versions or demonstration mode. They are not payments: none is in the ledger or in any tab or figure here.{' '}
              <Link href="/bookings?paymentStatus=unverified" className="underline font-medium">
                Review and resolve them in Bookings
              </Link>
            </p>
          </div>
        </div>
      )}

      <Card className="mb-4">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Payment status">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                role="tab"
                aria-selected={status === option.value}
                onClick={() => {
                  setStatus(option.value)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-full text-sm ${status === option.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {option.label} ({data ? data.counts[option.value]?.count ?? 0 : '…'})
              </button>
            ))}
          </div>

          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setQ(search.trim())
              setPage(1)
            }}
          >
            <div className="flex-1 min-w-[16rem]">
              <label htmlFor="payment-search" className="block text-xs font-medium text-gray-600 mb-1">
                Search
              </label>
              <input
                id="payment-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, gateway payment / order / settlement ID, UTR, phone or booking ID"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="payment-service" className="block text-xs font-medium text-gray-600 mb-1">
                Service
              </label>
              <select
                id="payment-service"
                value={service}
                onChange={(e) => {
                  setService(e.target.value)
                  setPage(1)
                }}
                className={inputClass}
              >
                <option value="">All services</option>
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="payment-from" className="block text-xs font-medium text-gray-600 mb-1">
                From
              </label>
              <input id="payment-from" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className={inputClass} />
            </div>
            <div>
              <label htmlFor="payment-to" className="block text-xs font-medium text-gray-600 mb-1">
                To
              </label>
              <input id="payment-to" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} className={inputClass} />
            </div>
            <Button type="submit">Search</Button>
            {filtered && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('')
                  setQ('')
                  setService('')
                  setFrom('')
                  setTo('')
                  setPage(1)
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {data && tab && (
            <p className="text-sm text-gray-600" data-tab-summary>
              {data.total} {STATUS_OPTIONS.find((o) => o.value === status)?.label.toLowerCase()} payments worth{' '}
              <span className="font-medium text-gray-800">{formatMoney(tab.total)}</span>
              {status === 'success' && tab.partlyRefunded > 0 && (
                <>
                  , of which {tab.partlyRefunded} {tab.partlyRefunded === 1 ? 'was' : 'were'} refunded in part ({formatMoney(tab.refunded)} returned)
                </>
              )}
              {status === 'refunded' && <>, {formatMoney(tab.refunded)} returned to customers</>}. Dates: {data.rangeLabel}, Asia/Kolkata (IST).
            </p>
          )}
          <p className="text-xs text-gray-500" data-state-rules>
            {STATE_RULES}
          </p>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={data && data.ledgerEntries === 0 && status !== 'pending' ? 'No payments have been recorded yet' : filtered ? 'No payments match these filters' : 'No payments with this status'}
            hint={
              data && data.ledgerEntries === 0 && status !== 'pending'
                ? 'The ledger is empty. Payments appear here once they are verified through the payment gateway.'
                : EMPTY_HINT[status]
            }
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Service</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Booking</th>
                  <th className={th}>{status === 'pending' ? 'Gateway order ID' : 'Gateway payment ID'}</th>
                  <th className={th}>Status</th>
                  <th className={thRight}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50">
                    <td className={td + ' whitespace-nowrap'}>{formatDate(item.createdAt, true)}</td>
                    <td className={td}>
                      {item.reference ? (
                        <button onClick={() => setOpen(item.reference)} className="font-mono text-xs text-deep-blue underline hover:text-teal">
                          {item.reference}
                        </button>
                      ) : (
                        <PendingBookingLink bookingId={item.bookingId} />
                      )}
                    </td>
                    <td className={td}>{serviceName(item.service)}</td>
                    <td className={td}>{item.customerPhone || '—'}</td>
                    <td className={td + ' font-mono text-xs break-all'}>{item.bookingId || '—'}</td>
                    <td className={td + ' font-mono text-xs'}>
                      {(status === 'pending' ? item.gatewayOrderId : item.gatewayPaymentId) || '—'}
                      {item.gatewaySettlementId && <span className="block font-sans text-gray-500">Settled by gateway: {item.gatewaySettlementId}</span>}
                    </td>
                    <td className={td}>
                      <LedgerStatusBadge status={stateOf(item)} />
                      {item.refundState === 'partial' && (
                        <span className="block text-xs text-purple-700 mt-1" data-partial-refund>
                          {formatMoney((Number(item.refundedAmount) || 0) + (Number(item.refundDeductions) || 0))} refunded in part
                        </span>
                      )}
                      {item.refundState === 'full' && (
                        <span className="block text-xs text-gray-500 mt-1">
                          {item.dispute?.outcome === 'lost' ? 'Chargeback. ' : ''}
                          {formatMoney(item.refundedAmount)} returned
                          {Number(item.refundDeductions) > 0 ? `, ${formatMoney(item.refundDeductions)} kept` : ''}
                        </span>
                      )}
                      {status === 'pending' && item.expiresAt && <span className="block text-xs text-gray-500 mt-1">Seats held until {formatDate(item.expiresAt, true)}</span>}
                      {status === 'pending' && item.note && <span className="block text-xs text-gray-500 max-w-[14rem]">{item.note}</span>}
                      {status === 'failed' && (item.meta?.errorDescription || item.meta?.errorCode) && (
                        <span className="block text-xs text-gray-500 mt-1 max-w-[14rem]">{item.meta.errorDescription || item.meta.errorCode}</span>
                      )}
                      {status === 'disputed' && item.dispute?.reason && <span className="block text-xs text-gray-500 mt-1 max-w-[14rem]">{item.dispute.reason}</span>}
                    </td>
                    <td className={tdRight}>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <LedgerPager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>

      <ReportDefinitions rangeLabel={data?.rangeLabel} />

      {open && (
        <PaymentDetail
          reference={open}
          onClose={() => setOpen(null)}
          onChanged={(text) => {
            setNotice({ type: 'success', text })
            load()
          }}
        />
      )}
    </AdminShell>
  )
}
