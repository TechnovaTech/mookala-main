'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Modal, Spinner, api, formatDate, formatMoney } from '@/components/ui'
import { ActionDialog, AuditHistory, MoneyLines, Row, SectionTitle, StatusBadge, payeeTypeLabel, serviceLabel, type ActionRequest } from './RulesShared'

export const REFUND_STATUS = [
  { value: 'requested', label: 'Requested', tone: 'blue' as const },
  { value: 'awaiting_second_approval', label: 'Awaiting second approval', tone: 'purple' as const },
  { value: 'approved', label: 'Approved', tone: 'green' as const },
  { value: 'processing', label: 'Processing', tone: 'amber' as const },
  { value: 'processed', label: 'Processed', tone: 'green' as const },
  { value: 'failed', label: 'Failed', tone: 'red' as const },
  { value: 'rejected', label: 'Rejected', tone: 'gray' as const },
  { value: 'disputed', label: 'Disputed', tone: 'red' as const },
]

/**
 * One refund: the booking, the rule that was applied, the amounts, the ledger
 * entries it produced, its full history, and the actions the signed-in admin
 * may take. Every action is checked again on the server.
 */
export default function RefundDetail({
  refundId,
  onClose,
  onChanged,
}: {
  refundId: string | null
  onClose: () => void
  onChanged: (message: string) => void
}) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState<ActionRequest | null>(null)

  const load = useCallback(async () => {
    if (!refundId) return
    try {
      setData(await api<any>(`/api/admin/finance/refunds/${refundId}`))
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not open the refund.')
    }
  }, [refundId])

  useEffect(() => {
    setData(null)
    setError('')
    if (refundId) load()
  }, [refundId, load])

  if (!refundId) return null

  const refund = data?.refund
  const booking = data?.booking
  const status: string = refund?.status || ''

  const send = (name: string, message: string) => async (values: { reason: string; reference: string }) => {
    try {
      const result = await api<any>(`/api/admin/finance/refunds/${refundId}`, {
        method: 'POST',
        body: { action: name, reason: values.reason, reference: values.reference },
      })
      onChanged(result?.message || message)
    } finally {
      // A failed gateway call still changes the refund (to "failed"), so always reload.
      await load()
    }
  }

  const amount = formatMoney(refund?.refundAmount)
  const canApproveNow =
    data?.canApprove &&
    (status === 'requested' || status === 'disputed' || (status === 'awaiting_second_approval' && !data.isFirstApprover))
  const payable = status === 'approved' || status === 'failed'
  const viaGateway = Boolean(refund?.gatewayPaymentId || booking?.gatewayPaymentId)
  const ledgerMissing = status === 'processing' && refund?.gatewayRefundId && !refund?.ledgerRecordedAt
  // "Processing" with nothing back from the gateway: the request was interrupted.
  const neverAnswered = status === 'processing' && !refund?.gatewayRefundId
  const failedAtGateway = status === 'failed' && viaGateway

  const actions: React.ReactNode[] = []
  if (refund && data.canManage) {
    if (canApproveNow) {
      const second = status === 'awaiting_second_approval'
      actions.push(
        <Button
          key="approve"
          onClick={() =>
            setAction({
              title: second ? 'Give the second approval' : 'Approve refund',
              confirmLabel: second ? 'Give second approval' : 'Approve',
              reason: 'optional',
              message: (
                <>
                  <p>
                    Approve a refund of <strong>{amount}</strong> to {refund.customerPhone || 'the customer'}?
                  </p>
                  {!second && data.needsSecondApproval && (
                    <p className="mt-2 text-gray-600">
                      This is above the {formatMoney(data.secondApprovalAbove)} threshold, so a different admin must give a second
                      approval before it can be processed.
                    </p>
                  )}
                  <p className="mt-2 text-gray-600">Approving does not move any money. Processing is a separate step.</p>
                </>
              ),
              run: send('approve', second ? 'Second approval recorded.' : 'Refund approved.'),
            })
          }
        >
          {second ? 'Give second approval' : 'Approve'}
        </Button>
      )
    }

    if (payable && viaGateway) {
      actions.push(
        <Button
          key="process"
          onClick={() =>
            setAction({
              title: status === 'failed' ? 'Try the refund again' : 'Process refund',
              confirmLabel: 'Send refund',
              reason: 'optional',
              message: (
                <p>
                  This asks the payment gateway to return <strong>{amount}</strong> to the customer&apos;s original payment method and
                  records it in the ledger. It cannot be undone.
                </p>
              ),
              run: send('process', 'Refund sent to the gateway.'),
            })
          }
        >
          {status === 'failed' ? 'Try again' : 'Process through gateway'}
        </Button>
      )
    }

    if (failedAtGateway) {
      actions.push(
        <Button
          key="manual-after-failure"
          variant="secondary"
          onClick={() =>
            setAction({
              title: 'Record a refund paid directly',
              confirmLabel: 'Mark as refunded',
              reason: 'required',
              referenceLabel: 'Bank or UPI reference of the refund',
              referenceHelp: 'The reference of the transfer you made to the customer.',
              message: (
                <p>
                  The gateway did not send this refund. If you have returned <strong>{amount}</strong> to the customer by bank
                  transfer or UPI instead, record that transfer here and say why it was paid directly. The refund is written to the
                  ledger and the booking is marked refunded. Do not also send it through the gateway.
                </p>
              ),
              run: send('mark_manual', 'Refund marked as refunded.'),
            })
          }
        >
          Paid directly: record reference
        </Button>
      )
    }

    if (status === 'processing') {
      actions.push(
        <Button
          key="check"
          onClick={() =>
            setAction({
              title: 'Check status with the gateway',
              confirmLabel: 'Check now',
              message: (
                <p>
                  This asks the payment gateway what happened to the refund. If the money was returned, the refund is completed and
                  recorded in the ledger. If the gateway shows no refund, it is marked as failed so it can be tried again. No money is
                  sent by this check.
                </p>
              ),
              run: send('check_status', 'Refund checked with the gateway.'),
            })
          }
        >
          Check status with the gateway
        </Button>
      )
    }

    if (neverAnswered) {
      actions.push(
        <Button
          key="mark-failed"
          variant="secondary"
          onClick={() =>
            setAction({
              title: 'Mark as failed',
              confirmLabel: 'Mark as failed',
              danger: true,
              reason: 'required',
              message: (
                <p>
                  Use this only when you know the refund never reached the customer, for example after confirming it in the gateway
                  dashboard. Nothing is written to the ledger, and the refund can then be tried again or paid directly.
                </p>
              ),
              run: send('mark_failed', 'Refund marked as failed.'),
            })
          }
        >
          Mark as failed
        </Button>
      )
    }

    if (payable && !viaGateway) {
      actions.push(
        <Button
          key="manual"
          onClick={() =>
            setAction({
              title: 'Mark as refunded manually',
              confirmLabel: 'Mark as refunded',
              reason: 'optional',
              referenceLabel: 'Bank or UPI reference of the refund',
              referenceHelp: 'The reference of the transfer you made to the customer.',
              message: (
                <p>
                  This booking was not paid through the gateway, so the gateway cannot return the money. Pay <strong>{amount}</strong>{' '}
                  to the customer directly, then record the transfer here. The refund is written to the ledger.
                </p>
              ),
              run: send('mark_manual', 'Refund marked as refunded.'),
            })
          }
        >
          Mark as refunded manually
        </Button>
      )
    }

    if (ledgerMissing) {
      actions.push(
        <Button
          key="ledger"
          onClick={() =>
            setAction({
              title: 'Record the ledger entries',
              confirmLabel: 'Record',
              message: <p>The gateway accepted this refund but the ledger entries were not written. This writes them; no money is sent again.</p>,
              run: send('process', 'Ledger entries recorded.'),
            })
          }
        >
          Record ledger entries
        </Button>
      )
    }

    if (['requested', 'awaiting_second_approval', 'approved', 'rejected', 'failed'].includes(status)) {
      actions.push(
        <Button
          key="dispute"
          variant="secondary"
          onClick={() =>
            setAction({
              title: 'Mark as disputed',
              confirmLabel: 'Mark as disputed',
              reason: 'required',
              message: <p>A disputed refund is taken out of the approval queue until it is approved again or rejected. Any approval already given is cleared.</p>,
              run: send('dispute', 'Refund marked as disputed.'),
            })
          }
        >
          Mark disputed
        </Button>
      )
    }

    if (['requested', 'awaiting_second_approval', 'approved', 'disputed', 'failed'].includes(status)) {
      actions.push(
        <Button
          key="reject"
          variant="danger"
          onClick={() =>
            setAction({
              title: 'Reject refund',
              confirmLabel: 'Reject',
              danger: true,
              reason: 'required',
              message: (
                <p>
                  Reject the refund of <strong>{amount}</strong>? No money is returned to the customer.
                </p>
              ),
              run: send('reject', 'Refund rejected.'),
            })
          }
        >
          Reject
        </Button>
      )
    }
  }

  const snapshot = refund?.ruleSnapshot
  const bookingQuote = booking?.refundQuote
  const hoursBefore = refund?.hoursBeforeEvent ?? bookingQuote?.hoursBeforeEvent ?? null
  const commissionRule = data?.payment?.ruleSnapshot
  const chargeLabel: Record<string, string> = { commission: 'Commission', gst: 'GST on commission', gateway_fee: 'Gateway fee' }

  return (
    <>
      <Modal open title="Refund" onClose={action ? () => undefined : onClose} wide footer={actions.length ? <>{actions}</> : undefined}>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : !refund ? (
          <Spinner />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge value={status} options={REFUND_STATUS} />
              <span className="text-2xl font-bold text-deep-blue">{amount}</span>
              <span className="text-sm text-gray-500">to {refund.customerPhone || 'the customer'}</span>
            </div>

            {data.outcome && (
              <p
                data-testid="refund-outcome"
                className={`text-sm rounded-lg px-3 py-2 border ${
                  !data.outcome.final
                    ? 'text-gray-700 bg-gray-50 border-gray-200'
                    : status === 'processed'
                      ? 'text-green-800 bg-green-50 border-green-200'
                      : 'text-gray-800 bg-gray-100 border-gray-300'
                }`}
              >
                <span className="font-medium">{data.outcome.final ? 'Final outcome' : 'Current state'}:</span> {data.outcome.text}
              </p>
            )}

            {status === 'awaiting_second_approval' && (
              <p className="text-sm text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                First approval by {refund.firstApprover}. This refund is above the second-approval threshold
                {refund.approvalThreshold != null ? ` (${formatMoney(refund.approvalThreshold)})` : ''}, so a different admin with
                refund approval rights must approve it.
                {data.isFirstApprover ? ' You gave the first approval, so you cannot give the second.' : ''}
              </p>
            )}
            {status === 'failed' && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                This refund was not sent: {String(refund.failureMessage || 'no message was returned').replace(/\.$/, '')}. Nothing was written to the ledger.
                {viaGateway ? ' Try again once the gateway is working, or pay the customer directly and record the reference.' : ''}
              </p>
            )}
            {status === 'processing' && refund.gatewayRefundId && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                The gateway has accepted this refund (ID {refund.gatewayRefundId}). It becomes &quot;Processed&quot; when the gateway
                confirms that the money has reached the customer. Use &quot;Check status with the gateway&quot; to ask now.
              </p>
            )}
            {neverAnswered && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                This refund was being sent to the gateway{refund.processingStartedAt ? ` on ${formatDate(refund.processingStartedAt, true)}` : ''} but no
                answer was recorded, so it is not known whether the money was returned. Check its status with the gateway; if you know
                it was not sent, mark it as failed.
              </p>
            )}
            {refund.ledgerError && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                The ledger entries for this refund could not be written: {refund.ledgerError}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <SectionTitle>Amounts</SectionTitle>
                <MoneyLines
                  lines={[
                    { label: 'Amount paid', value: refund.amountPaid },
                    {
                      label: 'Kept under the refund rule (deduction)',
                      value: refund.deductionAmount,
                      minus: true,
                      hint: refund.refundPercent != null ? `Refund percentage: ${refund.refundPercent}%` : undefined,
                    },
                    { label: 'Refund to customer', value: refund.refundAmount, strong: true },
                  ]}
                />
                {refund.amountOverridden && (
                  <p className="text-xs text-amber-800 mt-2">
                    The amount was entered by the admin who raised this refund. The rules alone gave {formatMoney(refund.ruleRefundAmount)}.
                  </p>
                )}
              </div>

              <div>
                <SectionTitle>Rule applied</SectionTitle>
                {snapshot ? (
                  <div>
                    <Row label="Rule">{snapshot.name || '—'}</Row>
                    <Row label="Cancelled at least">{snapshot.minHoursBefore ?? '—'} hours before</Row>
                    <Row label="And no more than">{snapshot.maxHoursBefore != null ? `${snapshot.maxHoursBefore} hours before` : 'no limit'}</Row>
                    <Row label="Refund">{snapshot.refundPercent ?? '—'}%</Row>
                    <Row label="Flat cancellation charge">{formatMoney(snapshot.deductionFlat ?? 0)}</Row>
                    {hoursBefore != null && <Row label="Cancelled">{hoursBefore} hours before the event</Row>}
                    <p className="text-xs text-gray-500 mt-2">
                      Copied from the rule when the refund was created. Editing or deleting the rule later does not change it.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No refund rule applied to this refund.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <SectionTitle>Request</SectionTitle>
                <Row label="Requested">{formatDate(refund.createdAt, true)}</Row>
                <Row label="Requested by">{refund.requestedBy === 'customer' ? 'The customer' : refund.requestedBy || '—'}</Row>
                <Row label="Reason">{refund.reason || '—'}</Row>
                <Row label="Service">{serviceLabel(refund.service)}</Row>
                <Row label="First approver">{refund.firstApprover || '—'}</Row>
                <Row label="Second approver">{refund.secondApprover || (data.needsSecondApproval ? 'needed' : 'not needed')}</Row>
                <Row label="Second approver needed above">
                  {data.secondApprovalAbove == null
                    ? 'not set'
                    : `${formatMoney(data.secondApprovalAbove)} (${data.approvalLimitSource === 'service' ? `limit for ${serviceLabel(refund.service)}` : 'global limit'})`}
                </Row>
                {refund.rejectionReason && <Row label="Rejection reason">{refund.rejectionReason}</Row>}
                {refund.disputeReason && <Row label="Dispute reason">{refund.disputeReason}</Row>}
                {refund.gatewayRefundId && <Row label="Gateway refund ID">{refund.gatewayRefundId}</Row>}
                {refund.manualReference && <Row label="Bank / UPI reference">{refund.manualReference}</Row>}
                {refund.processedAt && <Row label="Processed">{formatDate(refund.processedAt, true)}</Row>}
              </div>

              <div>
                <SectionTitle>Booking</SectionTitle>
                {booking ? (
                  <>
                    <Row label="Booking ID">
                      <span className="font-mono text-xs">{booking._id}</span>
                    </Row>
                    <Row label="Customer">{booking.userPhone || '—'}</Row>
                    <Row label="Event">{booking.eventTitle || refund.eventTitle || '—'}</Row>
                    <Row label="Event date">{[booking.eventDate, booking.eventTime].filter(Boolean).join(' ') || '—'}</Row>
                    <Row label="Seats">{booking.totalSeats ?? '—'}</Row>
                    <Row label="Booking total">{formatMoney(booking.totalPrice)}</Row>
                    <Row label="Booking status">{String(booking.status || '—').replace(/_/g, ' ')}</Row>
                    <Row label="Payment status">{String(booking.paymentStatus || '—').replace(/_/g, ' ')}</Row>
                    <Row label="Gateway payment ID">{booking.gatewayPaymentId || 'none: not paid through the gateway'}</Row>
                    {booking.cancelReason && <Row label="Cancellation reason">{booking.cancelReason}</Row>}
                    {booking.cancelledAt && (
                      <Row label="Cancelled">
                        {formatDate(booking.cancelledAt, true)} by {booking.cancelledBy === 'customer' ? 'the customer' : booking.cancelledBy || '—'}
                      </Row>
                    )}
                    {bookingQuote && (
                      <Row label="Rule stored on the booking">
                        {bookingQuote.ruleName || 'no rule'}: {bookingQuote.refundPercent ?? 0}% of {formatMoney(bookingQuote.amountPaid)}, refund{' '}
                        {formatMoney(bookingQuote.refundAmount)}, kept {formatMoney(bookingQuote.deductionAmount)}
                        {bookingQuote.hoursBeforeEvent != null ? `, ${bookingQuote.hoursBeforeEvent} hours before the event` : ''}
                      </Row>
                    )}
                    {booking.refundOutcome && <Row label="Refund outcome on the booking">{booking.refundOutcome.text}</Row>}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">The booking {refund.bookingId} could not be found.</p>
                )}
              </div>
            </div>

            <div>
              <SectionTitle>Original payment and ledger entries</SectionTitle>
              {data.payment ? (
                <p className="text-sm text-gray-700 mb-2">
                  Payment{' '}
                  <a
                    href={`/finance/payments?open=${encodeURIComponent(data.payment.reference)}`}
                    className="font-mono text-xs text-teal underline"
                  >
                    {data.payment.reference}
                  </a>{' '}
                  of {formatMoney(data.payment.amount)} on{' '}
                  {formatDate(data.payment.createdAt, true)}, owed to {payeeTypeLabel(data.payment.payeeType).toLowerCase()}{' '}
                  {data.payment.payeeName || data.payment.payeeId || ''}.{' '}
                  {commissionRule ? (
                    <>
                      Commission rule charged on it, copied when it was taken: {commissionRule.ratePercent}% commission
                      {commissionRule.minFee != null ? `, minimum ${formatMoney(commissionRule.minFee)}` : ''}
                      {commissionRule.maxFee != null ? `, maximum ${formatMoney(commissionRule.maxFee)}` : ''}
                      {commissionRule.gstPercent != null ? `, GST ${commissionRule.gstPercent}%` : ''}
                      {commissionRule.gatewayFeePercent != null ? `, gateway fee ${commissionRule.gatewayFeePercent}%` : ''}
                      {data.payment.charges?.length
                        ? ` (${data.payment.charges.map((c: any) => `${chargeLabel[c.type] || c.type} ${formatMoney(c.amount)}`).join(', ')}).`
                        : '.'}
                    </>
                  ) : (
                    'No commission rule was in force when it was taken, so nothing was deducted.'
                  )}
                </p>
              ) : (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  This booking has no payment in the ledger (it was never verified with the gateway). The organiser was never
                  credited for it, so the refund is recorded against the platform and does not reduce the organiser&apos;s balance.
                </p>
              )}
              {data.ledger.length === 0 ? (
                <p className="text-sm text-gray-500">No ledger entry has been written for this refund yet. Entries are written when the refund is sent.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-4 font-medium">Reference</th>
                        <th className="py-2 pr-4 font-medium">Type</th>
                        <th className="py-2 pr-4 font-medium text-right">Amount</th>
                        <th className="py-2 pr-4 font-medium">Charged to</th>
                        <th className="py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((entry: any) => (
                        <tr key={entry._id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-4 font-mono text-xs">{entry.reference}</td>
                          <td className="py-2 pr-4">
                            <Badge tone={entry.type === 'refund' ? 'blue' : 'gray'}>{entry.type === 'refund' ? 'Refund' : 'Refund deduction'}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-right">{formatMoney(entry.amount)}</td>
                          <td className="py-2 pr-4">{payeeTypeLabel(entry.payeeType)}</td>
                          <td className="py-2 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <SectionTitle>History</SectionTitle>
              <AuditHistory
                entries={data.history}
                emptyText={
                  refund.requestedBy === 'customer'
                    ? 'No admin has acted on this refund yet. It was created when the customer cancelled.'
                    : 'No action has been recorded yet.'
                }
              />
            </div>
          </div>
        )}
      </Modal>

      <ActionDialog request={action} onClose={() => setAction(null)} />
    </>
  )
}
