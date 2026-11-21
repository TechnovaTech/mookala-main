'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, api, formatDate, inputClass } from '@/components/ui'

export interface PaymentTarget {
  _id: string
  memberName: string
  plan: string
  planPrice: number | null
  expiresOn: string | null
  status: string
}

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'gateway', label: 'Payment gateway' },
  { value: 'other', label: 'Other' },
]

function todayInIndia(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Records a payment for one subscription (the "retry" for a failed renewal).
 * A paid payment renews the subscription; a failed one marks it "Payment
 * failed". The record goes through the same checks as the Membership Payments
 * screen.
 */
export default function RecordPaymentModal({
  target,
  onClose,
  onDone,
}: {
  target: PaymentTarget | null
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [recordAs, setRecordAs] = useState('paid')
  const [method, setMethod] = useState('upi')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [gatewayPaymentId, setGatewayPaymentId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!target) return
    setAmount(target.planPrice ? String(target.planPrice) : '')
    setPaidOn(todayInIndia())
    setRecordAs('paid')
    setMethod('upi')
    setPeriodFrom('')
    setPeriodTo('')
    setGatewayPaymentId('')
    setError('')
  }, [target])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!target) return
    const value = parseFloat(amount)
    if (!Number.isFinite(value) || value < 0 || (recordAs === 'paid' && value <= 0)) {
      setError('Enter the amount as a number greater than zero.')
      return
    }
    if (!paidOn) {
      setError('Enter the payment date.')
      return
    }
    if (Boolean(periodFrom) !== Boolean(periodTo)) {
      setError('Enter both period dates, or leave both empty.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<any>('/api/admin/r/membership-payments', {
        method: 'POST',
        body: { subscription: target._id, amount: value, paidOn, recordAs, method, periodFrom, periodTo, gatewayPaymentId },
      })
      if (result.item?.status === 'failed') {
        onDone(`Failed payment recorded for ${target.memberName}. The subscription is marked "Payment failed" and its expiry date was not changed.`)
        return
      }
      // What the payment did to the subscription is stored on the payment once it is saved.
      const saved = await api<any>(`/api/admin/r/membership-payments/${result.id}`).catch(() => null)
      const effect = saved?.item?.effect
      const period = saved?.item?.periodFrom && saved?.item?.periodTo ? ` for ${formatDate(saved.item.periodFrom)} to ${formatDate(saved.item.periodTo)}` : ''
      onDone(
        `Payment recorded for ${target.memberName}${period} and written to the finance ledger. ` +
          (effect?.extended
            ? `The expiry date moved to ${formatDate(effect.newExpiresOn)}.`
            : effect
              ? `This period does not go beyond the current expiry date, so the expiry date stays ${formatDate(effect.newExpiresOn)}. To pay for a further period, record a payment with the period dates filled in.`
              : '')
      )
    } catch (problem: any) {
      setError(problem.message || 'Could not record the payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form" loading={busy}>
            Record payment
          </Button>
        </>
      }
    >
      {target && (
        <form id="record-payment-form" onSubmit={save} className="space-y-4 text-sm text-gray-700">
          <p>
            For <strong>{target.memberName}</strong>
            {target.plan ? ` (${target.plan})` : ''}. Current expiry date: {formatDate(target.expiresOn)}. This only records a
            payment the member has already made; it does not charge anyone.
          </p>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pay-amount" className="block font-medium mb-1">
                Amount (₹)
              </label>
              <input id="pay-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pay-date" className="block font-medium mb-1">
                Payment date
              </label>
              <input id="pay-date" type="date" value={paidOn} max={todayInIndia()} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pay-result" className="block font-medium mb-1">
                Record as
              </label>
              <select id="pay-result" value={recordAs} onChange={(e) => setRecordAs(e.target.value)} className={inputClass}>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label htmlFor="pay-method" className="block font-medium mb-1">
                Payment method
              </label>
              <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
                {METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pay-from" className="block font-medium mb-1">
                Period from (optional)
              </label>
              <input id="pay-from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pay-to" className="block font-medium mb-1">
                Period to (optional)
              </label>
              <input id="pay-to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Leave the period empty to have it worked out: the first payment of a running subscription pays for the dates already
            on it; after that a renewal starts the day after the current expiry date, or today if that has passed. A paid payment
            moves the expiry date to the end of the period.
          </p>
          <div>
            <label htmlFor="pay-gateway" className="block font-medium mb-1">
              Gateway payment ID (optional)
            </label>
            <input id="pay-gateway" value={gatewayPaymentId} onChange={(e) => setGatewayPaymentId(e.target.value)} maxLength={100} className={inputClass} />
            <p className="text-xs text-gray-500 mt-1">Kept for reference only. It is not checked with the payment gateway.</p>
          </div>
        </form>
      )}
    </Modal>
  )
}
