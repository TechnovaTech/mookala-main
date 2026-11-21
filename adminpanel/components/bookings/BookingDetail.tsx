'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import {
  api,
  Badge,
  Button,
  ConfirmDialog,
  formatDate,
  formatMoney,
  inputClass,
  Modal,
  NoticeBar,
  Spinner,
  type Notice,
} from '@/components/ui'
import { useCan } from '@/components/AdminShell'
import { PaymentBadge, RefundBadge, seatRange, StatusBadge, type BookingRow } from './shared'

interface LedgerEntry {
  _id: string
  reference?: string
  type?: string
  amount?: number
  status?: string
  createdAt?: string
  description?: string
  ruleSnapshot?: Record<string, any> | null
}

interface HistoryEntry {
  _id: string
  adminName?: string | null
  adminEmail?: string | null
  action?: string
  reason?: string | null
  createdAt?: string
}

interface CancelQuote {
  eligible: boolean
  ruleName: string | null
  refundPercent: number
  deductionAmount: number
  refundAmount: number
  amountPaid: number
  hoursBeforeEvent: number | null
  explanation: string
}

interface Detail {
  booking: BookingRow
  qrPayload: string
  event: { id: string; name: string; status: string; startDate: string; startTime: string } | null
  /** null when the admin may not see finance records ('finance:view'). */
  ledger: LedgerEntry[] | null
  refund: (Record<string, any> & { _id: string }) | null
  history: HistoryEntry[]
  cancellable: boolean
  cancelQuote: CancelQuote | null
}

const LEDGER_LABEL: Record<string, string> = {
  payment: 'Payment received',
  commission: 'Platform commission',
  gst: 'GST on commission',
  gateway_fee: 'Gateway charge',
  refund: 'Refund paid',
  refund_deduction: 'Refund deduction kept',
  settlement: 'Settlement',
  adjustment: 'Adjustment',
}

const ACTION_LABEL: Record<string, string> = {
  cancel: 'Cancelled the booking',
  mark_attended: 'Marked as attended',
  resolve_unverified_verify: 'Verified the payment with Razorpay',
  resolve_unverified_cancel: 'Cancelled the unverified booking',
  resolve_unverified_refused: 'Tried to verify a payment; it was refused',
  reconcile_confirm_payment: 'Confirmed the payment from reconciliation',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-deep-blue mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Mono({ value }: { value?: string | null }) {
  return value ? <span className="font-mono text-xs">{value}</span> : <span className="text-gray-400">—</span>
}

/**
 * Everything recorded about one booking, with the two actions an admin can
 * take on it. `onChanged` is called after a successful action so the list
 * behind the panel can reload.
 */
export default function BookingDetail({
  bookingId,
  onClose,
  onChanged,
}: {
  bookingId: string | null
  onClose: () => void
  onChanged?: () => void
}) {
  const canManage = useCan('bookings:manage')
  const canVerifyPayment = useCan('finance:manage')
  const canSeeFinance = useCan('finance:view')
  const [resolving, setResolving] = useState<'verify' | 'cancel' | null>(null)
  const [resolvePaymentId, setResolvePaymentId] = useState('')
  const [resolveReason, setResolveReason] = useState('')
  const [resolveError, setResolveError] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirming, setConfirming] = useState<'cancel' | 'attend' | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const data = await api<Detail>('/api/admin/bookings/' + encodeURIComponent(id))
      setDetail(data)
    } catch (error: any) {
      setDetail(null)
      setNotice({ type: 'error', text: error?.message || 'Could not load the booking' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setDetail(null)
    setNotice(null)
    setConfirming(null)
    setResolving(null)
    setCopied(false)
    if (bookingId) load(bookingId)
  }, [bookingId, load])

  const act = async (kind: 'cancel' | 'attend', reason: string) => {
    if (!bookingId) return
    setBusy(true)
    try {
      const data = await api<{ message?: string }>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/${kind}`, {
        method: 'POST',
        body: { reason },
      })
      setConfirming(null)
      setNotice({ type: 'success', text: data.message || 'Done' })
      await load(bookingId)
      onChanged?.()
    } catch (error: any) {
      setConfirming(null)
      setNotice({ type: 'error', text: error?.message || 'The action failed' })
    } finally {
      setBusy(false)
    }
  }

  const openResolve = (kind: 'verify' | 'cancel') => {
    setResolvePaymentId('')
    setResolveReason('')
    setResolveError('')
    setResolving(kind)
  }

  const resolve = async () => {
    if (!bookingId || !resolving) return
    setBusy(true)
    setResolveError('')
    try {
      const data = await api<{ message?: string }>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/resolve`, {
        method: 'POST',
        body: { action: resolving, gatewayPaymentId: resolvePaymentId.trim(), reason: resolveReason.trim() },
      })
      setResolving(null)
      setNotice({ type: 'success', text: data.message || 'Resolved' })
      await load(bookingId)
      onChanged?.()
    } catch (error: any) {
      // The dialog stays open so the admin can correct the payment ID.
      setResolveError(error?.message || 'The booking could not be resolved')
    } finally {
      setBusy(false)
    }
  }

  const copyQr = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(detail.qrPayload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice({ type: 'error', text: 'Could not copy. Select the text and copy it by hand.' })
    }
  }

  const booking = detail?.booking || null
  const tickets = Array.isArray(booking?.tickets) ? booking!.tickets! : []
  const canAttend = Boolean(booking && booking.status === 'confirmed' && booking.checkedIn !== true)
  const paymentVerified = booking?.paymentStatus === 'paid'
  const unverifiedTicket = Boolean(booking && booking.paymentStatus === 'unverified' && (booking.status === 'confirmed' || booking.status === 'attended'))
  const quote = detail?.cancelQuote || null
  const storedQuote = booking?.refundQuote || null
  // The refund rule as it stood when the booking was cancelled, and the commission rule charged on the payment.
  const refundRule: Record<string, any> | null = storedQuote?.ruleSnapshot || detail?.refund?.ruleSnapshot || null
  const commissionRule: Record<string, any> | null = detail?.ledger?.find((entry) => entry.type === 'payment' && entry.ruleSnapshot)?.ruleSnapshot || null
  const refundOutcome: { text?: string; final?: boolean } | null = booking?.refundOutcome || null
  const refundRejected = detail?.refund?.status === 'rejected'

  return (
    <>
      <Modal
        open={Boolean(bookingId)}
        wide
        title={booking ? booking.eventTitle || 'Booking' : 'Booking'}
        onClose={onClose}
        footer={
          <>
            {canManage && detail?.cancellable && (
              <Button variant="danger" onClick={() => setConfirming('cancel')}>
                Cancel booking
              </Button>
            )}
            {canManage && canAttend && (
              <Button variant="primary" onClick={() => setConfirming('attend')}>
                Mark attended
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {loading && !detail ? (
          <Spinner label="Loading booking..." />
        ) : !booking ? null : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              <PaymentBadge status={booking.paymentStatus} />
              {booking.checkedIn === true && <Badge tone="blue">Checked in</Badge>}
            </div>

            {booking.paymentStatus === 'unverified' && (
              <NoticeBar
                notice={{
                  type: 'info',
                  text:
                    booking.storedPaymentStatus === 'paid'
                      ? 'This booking was saved as "paid" by an older app version, but no Razorpay payment is recorded for it. It is treated as unverified.'
                      : 'No verified Razorpay payment is recorded for this booking.',
                }}
              />
            )}

            {unverifiedTicket && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg px-4 py-3 text-sm text-amber-900" data-resolve-unverified>
                <p className="font-semibold">This ticket needs resolving</p>
                <p className="mt-0.5">
                  It was issued without the gateway confirming a payment, so it is not in the ledger and is not counted as revenue. Either attach the Razorpay
                  payment that paid for it (the server checks the payment with Razorpay before accepting it), or cancel the booking.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {canVerifyPayment && (
                    <Button variant="primary" onClick={() => openResolve('verify')}>
                      Verify with a Razorpay payment
                    </Button>
                  )}
                  {canManage && booking.status === 'confirmed' && booking.checkedIn !== true && (
                    <Button variant="danger" onClick={() => openResolve('cancel')}>
                      Cancel as unpaid
                    </Button>
                  )}
                  {!canVerifyPayment && <span className="text-xs self-center">Attaching a payment needs the finance manager permission.</span>}
                </div>
              </div>
            )}

            <Section title="Booking">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Booking ID">
                  <Mono value={booking._id} />
                </Field>
                <Field label="Booked at">{formatDate(booking.createdAt, true)}</Field>
                <Field label="Customer phone">{booking.userPhone || '—'}</Field>
                <Field label="Venue">{booking.venue || '—'}</Field>
                <Field label="Event date">
                  {[booking.eventDate, booking.eventTime].filter(Boolean).join(' at ') || '—'}
                </Field>
                <Field label="Event record">
                  {detail?.event ? `${detail.event.name || 'Event'} (${detail.event.status || 'no status'})` : 'Not found in events'}
                </Field>
                {booking.status === 'pending_payment' && (
                  <Field label="Seats held until">{formatDate(booking.expiresAt, true)}</Field>
                )}
                <Field label="Checked in at">
                  {booking.checkedIn === true ? formatDate(booking.checkedInAt, true) : 'Not checked in'}
                  {booking.checkedInBy ? ` (${booking.checkedInBy === 'scanner' ? 'gate scanner' : booking.checkedInBy})` : ''}
                </Field>
              </dl>
            </Section>

            <Section title="Tickets">
              {tickets.length === 0 ? (
                <p className="text-sm text-gray-500">No ticket lines are stored on this booking.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th scope="col" className="px-3 py-2 font-medium">Category</th>
                        <th scope="col" className="px-3 py-2 font-medium">Block</th>
                        <th scope="col" className="px-3 py-2 font-medium">Seats</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Qty</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Price</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tickets.map((line, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2">{line?.category || '—'}</td>
                          <td className="px-3 py-2">{line?.block || '—'}</td>
                          <td className="px-3 py-2">{seatRange(line || {}) || 'Unnumbered'}</td>
                          <td className="px-3 py-2 text-right">{line?.quantity ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(line?.price)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(line?.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-3 py-2" colSpan={3}>Total</td>
                        <td className="px-3 py-2 text-right">{booking.totalSeats ?? '—'}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">{formatMoney(booking.totalPrice)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Payment">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Amount paid online">{formatMoney(booking.amountPaid ?? 0)}</Field>
                <Field label="Paid at">{formatDate(booking.paidAt, true)}</Field>
                <Field label="Razorpay order">
                  <Mono value={booking.gatewayOrderId} />
                </Field>
                <Field label="Razorpay payment">
                  <Mono value={booking.gatewayPaymentId} />
                </Field>
                <Field label="Confirmed by">
                  {booking.confirmedVia === 'webhook'
                    ? 'Razorpay webhook'
                    : booking.confirmedVia === 'verify'
                    ? 'Checkout verification'
                    : booking.confirmedVia === 'reconciliation'
                    ? 'An admin, from reconciliation'
                    : booking.confirmedVia === 'admin'
                    ? `An admin, after checking the payment with Razorpay${booking.verifiedBy ? ' (' + booking.verifiedBy + ')' : ''}`
                    : booking.isFree
                    ? 'Free event, no payment'
                    : '—'}
                </Field>
                <Field label="Ledger reference">
                  {booking.ledgerReference && canSeeFinance ? (
                    <Link href={'/finance/payments?open=' + encodeURIComponent(booking.ledgerReference)} className="font-mono text-xs text-deep-blue underline">
                      {booking.ledgerReference}
                    </Link>
                  ) : (
                    <Mono value={booking.ledgerReference} />
                  )}
                </Field>
                {booking.chargebackAt && <Field label="Chargeback (dispute lost)">{formatDate(booking.chargebackAt, true)}</Field>}
                {booking.clientPaymentId && (
                  <Field label="Payment id sent by the app (not verified)">
                    <Mono value={booking.clientPaymentId} />
                  </Field>
                )}
                {!booking.gatewayPaymentId && booking.paymentId && (
                  <Field label="Payment id on the old record (not verified)">
                    <Mono value={booking.paymentId} />
                  </Field>
                )}
              </dl>
            </Section>

            <Section title="Ledger entries">
              {detail!.ledger === null ? (
                <p className="text-sm text-gray-500">Ledger entries are shown to admins who can view Finance.</p>
              ) : detail!.ledger.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No ledger entries. They are written when Razorpay confirms a payment for this booking.
                </p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th scope="col" className="px-3 py-2 font-medium">Reference</th>
                        <th scope="col" className="px-3 py-2 font-medium">Entry</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Amount</th>
                        <th scope="col" className="px-3 py-2 font-medium">Status</th>
                        <th scope="col" className="px-3 py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail!.ledger.map((entry) => (
                        <tr key={entry._id}>
                          <td className="px-3 py-2 font-mono text-xs">{entry.reference || '—'}</td>
                          <td className="px-3 py-2">{LEDGER_LABEL[entry.type || ''] || entry.type || '—'}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(entry.amount)}</td>
                          <td className="px-3 py-2">{entry.status || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {(booking.status === 'cancelled' || detail!.refund) && (
              <Section title="Cancellation and refund">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Cancelled at">{formatDate(booking.cancelledAt, true)}</Field>
                  <Field label="Cancelled by">
                    {booking.cancelledBy === 'customer'
                      ? 'Customer'
                      : booking.cancelledBy === 'system'
                      ? 'System'
                      : booking.cancelledBy || '—'}
                  </Field>
                  <Field label="Reason">{booking.cancelReason || '—'}</Field>
                  <Field label="Rule applied">
                    {storedQuote?.ruleName ||
                      (detail!.refund?.ruleSnapshot?.name as string) ||
                      (storedQuote ? 'No rule matched' : '—')}
                  </Field>
                  <Field label="Hours before the event">
                    {storedQuote?.hoursBeforeEvent === null || storedQuote?.hoursBeforeEvent === undefined
                      ? '—'
                      : String(storedQuote.hoursBeforeEvent)}
                  </Field>
                  <Field label="Refund status">
                    <RefundBadge status={detail!.refund?.status} />
                  </Field>
                  <Field label="Refund amount">
                    {detail!.refund ? formatMoney(detail!.refund.refundAmount) : formatMoney(storedQuote?.refundAmount ?? 0)}
                  </Field>
                  <Field label="Deduction kept">
                    {detail!.refund
                      ? formatMoney(detail!.refund.deductionAmount)
                      : storedQuote
                      ? formatMoney(storedQuote.deductionAmount)
                      : '—'}
                  </Field>
                </dl>
                {storedQuote?.explanation && <p className="text-sm text-gray-600 mt-3">{storedQuote.explanation}</p>}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-3" data-refund-rules>
                  <Field label="Refund rule as applied (stored at cancellation)">
                    {refundRule ? (
                      <>
                        {refundRule.name ? `${refundRule.name}: ` : ''}
                        {refundRule.maxHoursBefore === null || refundRule.maxHoursBefore === undefined
                          ? `${refundRule.minHoursBefore ?? 0} hours or more before the event`
                          : `${refundRule.minHoursBefore ?? 0} to ${refundRule.maxHoursBefore} hours before the event`}
                        , {refundRule.refundPercent ?? 0}% refunded
                        {Number(refundRule.deductionFlat) > 0 ? `, less a flat charge of ${formatMoney(refundRule.deductionFlat)}` : ', no flat charge'}
                      </>
                    ) : storedQuote ? (
                      'No rule matched when the booking was cancelled'
                    ) : (
                      'Not stored on this booking'
                    )}
                  </Field>
                  <Field label="Commission rule charged on the payment">
                    {commissionRule ? (
                      <>
                        {commissionRule.ratePercent ?? 0}% commission
                        {commissionRule.minFee != null ? `, minimum ${formatMoney(commissionRule.minFee)}` : ''}
                        {commissionRule.maxFee != null && Number(commissionRule.maxFee) > 0 ? `, maximum ${formatMoney(commissionRule.maxFee)}` : ''}
                        {commissionRule.gstPercent != null ? `, ${commissionRule.gstPercent}% GST on the commission` : ''}
                        {commissionRule.gatewayFeePercent != null ? `, ${commissionRule.gatewayFeePercent}% gateway fee` : ''}
                        {commissionRule.effectiveFrom ? ` (rule in force from ${formatDate(commissionRule.effectiveFrom)})` : ''}
                      </>
                    ) : detail!.ledger === null ? (
                      'Shown to admins who can view Finance'
                    ) : (
                      'No commission rule is stored: no payment for this booking is in the ledger, or no rule was active'
                    )}
                  </Field>
                  <Field label="Final outcome">
                    {refundOutcome?.text ? (
                      <span data-refund-outcome>{refundOutcome.text}</span>
                    ) : detail!.refund ? (
                      'Not recorded on the booking yet'
                    ) : (
                      'No refund was opened for this booking'
                    )}
                  </Field>
                </dl>
                {detail!.refund && refundRejected && (
                  <p className="text-sm text-gray-600 mt-3">
                    The refund request was rejected, so no money was returned
                    {detail!.refund.rejectionReason ? `. Reason: ${detail!.refund.rejectionReason}` : ''}. It is kept in{' '}
                    <Link href={'/finance/refunds?q=' + encodeURIComponent(booking._id)} className="text-deep-blue underline">
                      Finance → Refunds
                    </Link>
                    .
                  </p>
                )}
                {detail!.refund && !refundRejected && (
                  <p className="text-sm text-gray-600 mt-3">
                    The refund is approved and paid from{' '}
                    <Link href={'/finance/refunds?q=' + encodeURIComponent(booking._id)} className="text-deep-blue underline">
                      Finance → Refunds
                    </Link>
                    .
                  </p>
                )}
              </Section>
            )}

            <Section title="Ticket QR content">
              <p className="text-sm text-gray-600 mb-2">
                The gate scanner reads the booking ID from the QR code on the customer&apos;s ticket. This text can be
                typed or pasted into the scanner when a code will not scan.
              </p>
              <div className="flex items-start gap-2">
                <code className="flex-1 block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono break-all">
                  {detail!.qrPayload}
                </code>
                <Button variant="secondary" onClick={copyQr} aria-label="Copy the QR content">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </Section>

            <Section title="Admin history">
              {detail!.history.length === 0 ? (
                <p className="text-sm text-gray-500">No admin has changed this booking.</p>
              ) : (
                <ul className="space-y-2">
                  {detail!.history.map((entry) => (
                    <li key={entry._id} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-gray-900">
                          {ACTION_LABEL[entry.action || ''] || entry.action || 'Change'}
                        </span>
                        <span className="text-gray-500">{formatDate(entry.createdAt, true)}</span>
                      </div>
                      <div className="text-gray-600">
                        {entry.adminName || entry.adminEmail || 'Admin'}
                        {entry.reason ? ` — ${entry.reason}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirming === 'cancel'}
        title="Cancel this booking?"
        danger
        askReason
        reasonRequired
        busy={busy}
        confirmLabel="Cancel booking"
        onClose={() => setConfirming(null)}
        onConfirm={(reason) => act('cancel', reason)}
        message={
          <div className="space-y-2">
            <p>The seats are released for sale straight away. This cannot be undone.</p>
            {quote && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p>
                  <span className="font-medium">Paid online:</span> {formatMoney(quote.amountPaid)}
                </p>
                <p>
                  <span className="font-medium">Refund under the current rule:</span> {formatMoney(quote.refundAmount)}
                  {quote.ruleName ? ` (${quote.ruleName})` : ''}
                </p>
                <p className="text-gray-600">{quote.explanation}</p>
                {quote.refundAmount > 0 && (
                  <p className="text-gray-600">
                    A refund request is opened for approval in Finance → Refunds. No money moves until it is approved.
                  </p>
                )}
              </div>
            )}
          </div>
        }
      />

      <Modal
        open={resolving !== null}
        title={resolving === 'verify' ? 'Verify with a Razorpay payment' : 'Cancel this unverified booking?'}
        onClose={() => setResolving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)} disabled={busy}>
              Close
            </Button>
            <Button
              variant={resolving === 'cancel' ? 'danger' : 'primary'}
              loading={busy}
              disabled={resolveReason.trim().length < 5 || (resolving === 'verify' && !/^pay_[A-Za-z0-9]{6,40}$/.test(resolvePaymentId.trim()))}
              onClick={resolve}
            >
              {resolving === 'verify' ? 'Check with Razorpay and mark paid' : 'Cancel booking'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700">
          {resolveError && <NoticeBar notice={{ type: 'error', text: resolveError }} />}
          {resolving === 'verify' ? (
            <>
              <p>
                Enter the ID of the Razorpay payment that paid for this booking. The server fetches it from Razorpay and accepts it only if it is captured, is
                for exactly {formatMoney(booking?.totalPrice ?? 0)} and is not used by any other booking. The booking then becomes paid and the payment, commission,
                GST and gateway fee are written to the ledger.
              </p>
              <div>
                <label htmlFor="resolve-payment-id" className="block text-sm font-medium text-gray-700 mb-1">
                  Razorpay payment ID
                </label>
                <input
                  id="resolve-payment-id"
                  type="text"
                  value={resolvePaymentId}
                  onChange={(e) => setResolvePaymentId(e.target.value)}
                  placeholder="pay_..."
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass + ' font-mono'}
                />
              </div>
            </>
          ) : (
            <p>The seats are released for sale straight away. Nothing was paid online for this booking, so no refund is opened. This cannot be undone.</p>
          )}
          <div>
            <label htmlFor="resolve-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              id="resolve-reason"
              rows={3}
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
              className={inputClass}
              placeholder="This is saved in the activity log"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming === 'attend'}
        title="Mark as attended?"
        askReason
        reasonRequired={!paymentVerified}
        busy={busy}
        confirmLabel="Mark attended"
        onClose={() => setConfirming(null)}
        onConfirm={(reason) => act('attend', reason)}
        message={
          <div className="space-y-2">
            <p>This checks the ticket in, exactly as a scan at the gate would. The ticket cannot be used again.</p>
            {!paymentVerified && (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                The payment for this booking is not verified. A reason is required to admit it.
              </p>
            )}
          </div>
        }
      />
    </>
  )
}
