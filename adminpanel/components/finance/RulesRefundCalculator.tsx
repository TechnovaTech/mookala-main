'use client'
import React, { useState } from 'react'
import { Badge, Button, Card, api, formatMoney, inputClass } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'

/**
 * "Try it" for the refund rules. Asks the server which active rule applies to
 * a cancellation and what it refunds, using the same code as a real
 * cancellation, so what is shown here is what a customer would get.
 */
export default function RulesRefundCalculator() {
  const [service, setService] = useState('ticketing')
  const [hours, setHours] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const run = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await api<any>('/api/admin/finance/rules/quote', { method: 'POST', body: { service, hoursBefore: hours, amountPaid: amount } }))
    } catch (err: any) {
      setError(err.message || 'Could not work out the refund.')
    } finally {
      setBusy(false)
    }
  }

  const quote = result?.quote

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-lg font-semibold text-deep-blue">Try the rules</h2>
      <p className="text-sm text-gray-500 mt-0.5">
        Uses the same code as a real cancellation. Only active rules are used. When several match, the one with the highest
        &quot;at least&quot; hours wins. When none matches, no refund is offered.
      </p>

      <form onSubmit={run} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 items-end">
        <div>
          <label htmlFor="rc-service" className="block text-sm font-medium text-gray-700 mb-1">
            Service
          </label>
          <select id="rc-service" value={service} onChange={(e) => setService(e.target.value)} className={inputClass}>
            {FINANCE_SERVICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rc-hours" className="block text-sm font-medium text-gray-700 mb-1">
            Hours before the event
          </label>
          <input id="rc-hours" type="number" min={0} step="0.5" required value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="rc-amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount paid (₹)
          </label>
          <input id="rc-amount" type="number" min={0} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        <Button type="submit" loading={busy}>
          Work out refund
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
          {error}
        </p>
      )}

      {quote && (
        <div className="mt-4 rounded-lg border border-gray-200 p-4" role="status">
          {quote.ruleName ? (
            <>
              <p className="text-sm text-gray-700">
                Rule applied: <span className="font-semibold text-deep-blue">{quote.ruleName}</span>{' '}
                <Badge tone={quote.eligible ? 'green' : 'amber'}>{quote.eligible ? 'Refund due' : 'No refund'}</Badge>
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Amount paid</dt>
                  <dd className="font-medium text-gray-900">{formatMoney(result.amountPaid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Refund percentage</dt>
                  <dd className="font-medium text-gray-900">{quote.refundPercent}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Kept (deduction)</dt>
                  <dd className="font-medium text-gray-900">{formatMoney(quote.deductionAmount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Refund to customer</dt>
                  <dd className="font-semibold text-deep-blue">{formatMoney(quote.refundAmount)}</dd>
                </div>
              </dl>
              <p className="text-xs text-gray-500 mt-3">Shown to the customer as: &quot;{quote.explanation}&quot;</p>
            </>
          ) : (
            <p className="text-sm text-gray-700">
              <Badge tone="amber">No rule applies</Badge>{' '}
              {result.activeRules === 0
                ? 'There is no active refund rule for this service, so a cancellation gives no refund.'
                : `None of the ${result.activeRules} active rule${result.activeRules === 1 ? '' : 's'} for this service covers a cancellation ${result.hoursBefore} hours before the event, so no refund is offered.`}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
