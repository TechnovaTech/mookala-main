'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, api, formatDate, formatMoney, inputClass } from '@/components/ui'
import { MoneyLines, Row, SectionTitle, serviceLabel } from './RulesShared'

/**
 * An admin raises a refund for a booking. The booking is looked up first so
 * the admin sees what was paid and what the active refund rules give before
 * anything is saved. The refund then needs approval like any other.
 */
export default function RefundRaiseDialog({
  open,
  onClose,
  onRaised,
}: {
  open: boolean
  onClose: () => void
  onRaised: (refundId: string) => void
}) {
  const [bookingId, setBookingId] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setBookingId('')
      setPreview(null)
      setAmount('')
      setReason('')
      setError('')
    }
  }, [open])

  const lookUp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!bookingId.trim()) return
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const data = await api<any>('/api/admin/finance/refunds?preview=' + encodeURIComponent(bookingId.trim()))
      setPreview(data)
      setAmount(data.quote?.refundAmount > 0 ? String(data.quote.refundAmount) : '')
    } catch (err: any) {
      setError(err.message || 'Could not find the booking.')
    } finally {
      setBusy(false)
    }
  }

  const raise = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api<any>('/api/admin/finance/refunds', {
        method: 'POST',
        body: { bookingId: preview.booking._id, reason: reason.trim(), refundAmount: amount },
      })
      onRaised(data.id)
    } catch (err: any) {
      setError(err.message || 'Could not raise the refund.')
    } finally {
      setBusy(false)
    }
  }

  const quote = preview?.quote
  const entered = parseFloat(amount)
  const amountOk = Number.isFinite(entered) && entered > 0 && preview && entered <= preview.amountPaid
  const canRaise = Boolean(preview && !preview.problem && amountOk && reason.trim().length >= 5)

  return (
    <Modal
      open={open}
      title="Raise a refund"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={raise} loading={busy && Boolean(preview)} disabled={!canRaise}>
            Raise refund
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <form onSubmit={lookUp} className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="raise-booking" className="block text-sm font-medium text-gray-700 mb-1">
              Booking ID
            </label>
            <input
              id="raise-booking"
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className={inputClass}
              placeholder="Copy it from the Bookings screen"
              maxLength={64}
            />
          </div>
          <Button type="submit" variant="secondary" loading={busy && !preview} disabled={!bookingId.trim()}>
            Look up
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {preview && (
          <>
            {preview.problem && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {preview.problem}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <SectionTitle>Booking</SectionTitle>
                <Row label="Customer">{preview.booking.userPhone || '—'}</Row>
                <Row label="Event">{preview.booking.eventTitle || '—'}</Row>
                <Row label="Event starts">{preview.eventStartsAt ? formatDate(preview.eventStartsAt, true) : 'date not readable'}</Row>
                <Row label="Service">{serviceLabel(preview.service)}</Row>
                <Row label="Booking status">{String(preview.booking.status || '—').replace(/_/g, ' ')}</Row>
                <Row label="Payment status">{String(preview.booking.paymentStatus || '—').replace(/_/g, ' ')}</Row>
                <Row label="In the ledger">{preview.inLedger ? `Yes (${preview.paymentReference})` : 'No: never verified with the gateway'}</Row>
              </div>
              <div>
                <SectionTitle>What the refund rules give now</SectionTitle>
                <MoneyLines
                  lines={[
                    { label: 'Amount paid', value: preview.amountPaid },
                    { label: 'Kept under the rule', value: quote.deductionAmount, minus: true },
                    { label: 'Refund under the rule', value: quote.refundAmount, strong: true },
                  ]}
                />
                <p className="text-xs text-gray-500 mt-2">
                  {quote.ruleName
                    ? `Rule: ${quote.ruleName} (${quote.refundPercent}%).`
                    : preview.hoursBefore === null
                      ? 'The event date could not be read, so no rule could be applied.'
                      : preview.hoursBefore < 0
                        ? 'The event has already started, so no rule applies.'
                        : `No active refund rule covers a cancellation ${Math.round(preview.hoursBefore)} hours before the event.`}
                </p>
              </div>
            </div>

            {!preview.problem && (
              <>
                <div>
                  <label htmlFor="raise-amount" className="block text-sm font-medium text-gray-700 mb-1">
                    Amount to refund (₹)
                  </label>
                  <input
                    id="raise-amount"
                    type="number"
                    min={0}
                    max={preview.amountPaid}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Up to {formatMoney(preview.amountPaid)}. If this differs from what the rules give, the refund is marked as an
                    amount entered by you.
                  </p>
                </div>
                <div>
                  <label htmlFor="raise-reason" className="block text-sm font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    id="raise-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className={inputClass}
                    placeholder="Why this refund is being raised. Saved in the activity log."
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
