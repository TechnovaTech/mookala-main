'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, Spinner, api, formatMoney } from '@/components/ui'

/**
 * The refund policy in force for each service, worked out on the server from
 * the active rules with the code a real cancellation uses: the window a
 * customer falls into, the rule that wins where windows overlap, the approval
 * limit and the steps a refund goes through.
 */

interface Window {
  fromHours: number
  toHours: number | null
  rule: { id: string; name: string; refundPercent: number; deductionFlat: number } | null
}

interface Overlap {
  winner: string
  loser: string
  fromHours: number
  toHours: number | null
  ambiguous: boolean
}

interface ServicePolicy {
  service: string
  label: string
  activeRules: { _id: string; name: string }[]
  windows: Window[]
  overlaps: Overlap[]
  approvalLimit: { amount: number | null; source: string }
}

const STEPS = [
  { label: 'Requested', text: 'Opened when a customer cancels a paid booking, or raised by an admin. The rule in force is applied and copied onto the refund and the booking.' },
  { label: 'Awaiting second approval', text: 'Only when the refund is above the approval limit of its service: a second, different admin must approve it.' },
  { label: 'Approved', text: 'Approved by an admin with refund approval rights. No money has moved yet.' },
  { label: 'Processing', text: 'Sent to the payment gateway, which returns the money to the original payment method.' },
  { label: 'Processed', text: 'The money has been returned. The refund and the amount kept are separate ledger entries, and the booking is marked refunded.' },
]

const SIDE_STEPS = [
  { label: 'Failed', text: 'The gateway did not send the refund and nothing is written to the ledger. It can be tried again, or paid by bank transfer and recorded with its reference.' },
  { label: 'Rejected', text: 'Refused with a written reason. No money is returned; the booking stays cancelled and paid, and shows the rejection.' },
  { label: 'Disputed', text: 'Taken out of the queue with a written reason until it is approved again or rejected. Any approval already given is cleared.' },
]

function hours(value: number): string {
  if (value >= 48 && value % 24 === 0) return `${value} hours (${value / 24} days)`
  return `${value} hour${value === 1 ? '' : 's'}`
}

function windowLabel(w: Window): string {
  if (w.toHours === null) return w.fromHours === 0 ? 'Any time before the event' : `${hours(w.fromHours)} or more before the event`
  if (w.fromHours === 0) return `Less than ${hours(w.toHours)} before the event`
  return `From ${hours(w.fromHours)} up to ${hours(w.toHours)} before the event`
}

function overlapLabel(o: Overlap): string {
  return o.toHours === null ? `${hours(o.fromHours)} or more before the event` : `between ${hours(o.fromHours)} and ${hours(o.toHours)} before the event`
}

export default function RulesRefundPolicy() {
  const [services, setServices] = useState<ServicePolicy[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const data = await api<any>('/api/admin/finance/rules/refund-policy')
      setServices(data.services || [])
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not load the policy in force.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const configured = (services || []).filter((s) => s.activeRules.length > 0)
  const without = (services || []).filter((s) => s.activeRules.length === 0)

  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-deep-blue">Policy in force</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            What the active rules give at every cancellation time. The ticketing policy is what customers are shown before they pay.
            After changing a rule below, refresh this card.
          </p>
        </div>
        <Button variant="secondary" onClick={load} loading={busy}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700 mt-3">
          {error}
        </p>
      ) : services === null ? (
        <Spinner />
      ) : (
        <div className="mt-4 space-y-4">
          {configured.map((s) => (
            <section key={s.service} className="rounded-lg border border-gray-200 p-4" data-testid={`policy-${s.service}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-deep-blue">{s.label}</h3>
                <p className="text-sm text-gray-600">
                  Second approver needed above:{' '}
                  <span className="font-medium text-gray-900">{s.approvalLimit.amount === null ? 'not set' : formatMoney(s.approvalLimit.amount)}</span>{' '}
                  {s.approvalLimit.source === 'service' ? (
                    <Badge tone="blue">Set for this service</Badge>
                  ) : s.approvalLimit.source === 'global' ? (
                    <span className="text-xs text-gray-500">global value</span>
                  ) : null}
                </p>
              </div>

              <table className="min-w-full text-sm mt-3">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4 font-medium">Customer cancels</th>
                    <th className="py-2 pr-4 font-medium">Rule that applies</th>
                    <th className="py-2 pr-4 font-medium text-right">Refund</th>
                    <th className="py-2 font-medium text-right">Flat charge</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.windows].reverse().map((w) => (
                    <tr key={w.fromHours} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 pr-4 text-gray-900">{windowLabel(w)}</td>
                      <td className="py-1.5 pr-4">{w.rule ? w.rule.name : <Badge tone="amber">No rule: no refund</Badge>}</td>
                      <td className="py-1.5 pr-4 text-right">{w.rule ? `${w.rule.refundPercent}%` : '0%'}</td>
                      <td className="py-1.5 text-right">{w.rule && w.rule.deductionFlat > 0 ? formatMoney(w.rule.deductionFlat) : 'none'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {s.overlaps.length > 0 && (
                <div role="alert" className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="font-medium">Overlapping windows</p>
                  <ul className="mt-1 space-y-1 list-disc pl-5">
                    {s.overlaps.map((o, index) => (
                      <li key={index}>
                        {o.ambiguous ? (
                          <>
                            &quot;{o.winner}&quot; and &quot;{o.loser}&quot; start at the same hours, so nothing decides between them. Change
                            the hours of one of them or retire it.
                          </>
                        ) : (
                          <>
                            &quot;{o.winner}&quot; and &quot;{o.loser}&quot; both cover {overlapLabel(o)}. &quot;{o.winner}&quot; applies there
                            because it starts at the higher hours; the table above shows the result.
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}

          {configured.length === 0 && (
            <p className="text-sm text-gray-600">
              <Badge tone="amber">No active refund rule</Badge> A cancellation gives no automatic refund for any service until a rule is
              made active.
            </p>
          )}
          {configured.length > 0 && without.length > 0 && (
            <p className="text-sm text-gray-600">
              No active rule, so a cancellation gives no automatic refund: {without.map((s) => s.label).join(', ')}.
            </p>
          )}

          <details>
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">Processing steps of a refund</summary>
            <ol className="mt-3 space-y-2 text-sm list-decimal pl-5">
              {STEPS.map((step) => (
                <li key={step.label}>
                  <span className="font-medium text-gray-900">{step.label}.</span> <span className="text-gray-600">{step.text}</span>
                </li>
              ))}
            </ol>
            <ul className="mt-3 space-y-2 text-sm list-disc pl-5">
              {SIDE_STEPS.map((step) => (
                <li key={step.label}>
                  <span className="font-medium text-gray-900">{step.label}.</span> <span className="text-gray-600">{step.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              The approval limits are set under{' '}
              <Link href="/finance/commissions#gst" className="text-deep-blue hover:underline">
                Commission Settings
              </Link>
              , for all services or for one service. Refunds are worked on the{' '}
              <Link href="/finance/refunds" className="text-deep-blue hover:underline">
                Refunds
              </Link>{' '}
              screen.
            </p>
          </details>
        </div>
      )}
    </Card>
  )
}
