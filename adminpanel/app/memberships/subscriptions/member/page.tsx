'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import RecordPaymentModal, { type PaymentTarget } from '@/components/memberships/RecordPaymentModal'
import { StatusBadge, daysLeftText, headRowClass, supportHref, tdClass, thClass, type SubscriptionRow } from '@/components/memberships/shared'

interface Payment {
  _id: string
  status: string
  kind: string | null
  amount: number
  paidOn: string
  periodFrom: string | null
  periodTo: string | null
  method: string | null
  planName: string
  planPrice: number | null
  ledgerReference: string | null
  refundReason: string | null
  refundedAt: string | null
  createdBy: string | null
}
interface TimelineEvent {
  at: string
  type: string
  title: string
  detail: string
  by: string | null
  tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
}
interface SupportCase {
  _id: string
  kind: string
  subject: string
  status: string
  priority: string
  createdAt: string | null
}
interface Data {
  subscription: SubscriptionRow
  plan: { _id: string; name: string; price: number; billingPeriod: string; audience: string; status: string } | null
  payments: Payment[]
  totals: { paidCount: number; paid: number; refundedCount: number; refunded: number; failedCount: number; renewals: number; reminders: number }
  timeline: TimelineEvent[]
  supportCases: SupportCase[]
  canSeeSupport: boolean
  canManage: boolean
  /** Recording or refunding a payment changes a Membership Payments record: 'finance:manage'. */
  canRecordPayments: boolean
}

const PAYMENT_TONE: Record<string, 'green' | 'red' | 'purple'> = { paid: 'green', failed: 'red', refunded: 'purple' }
const PAYMENT_LABEL: Record<string, string> = { paid: 'Paid', failed: 'Failed', refunded: 'Refunded' }

type Pending = { action: 'cancel' | 'reinstate' | 'reminder' } | { action: 'refund'; payment: Payment } | null

export default function Page() {
  const [id, setId] = useState<string | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [missing, setMissing] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [paying, setPaying] = useState<PaymentTarget | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('id') || ''
    if (/^[a-f0-9]{24}$/i.test(value)) setId(value)
    else setMissing('Open a member from the Subscriptions list: this address has no valid subscription id.')
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    try {
      setData(await api<Data>(`/api/admin/memberships/member/${id}`))
    } catch (error: any) {
      setMissing(error.message || 'Could not load this member.')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const run = async (reason: string) => {
    if (!pending || !data) return
    setBusy(true)
    try {
      if (pending.action === 'cancel') {
        await api(`/api/admin/r/membership-subscriptions/${data.subscription._id}`, { method: 'PATCH', body: { status: 'cancelled', reason } })
        setNotice({ type: 'success', text: 'Subscription cancelled. The reason, time and your name are stored with it.' })
      } else if (pending.action === 'reinstate') {
        const result = await api<any>(`/api/admin/r/membership-subscriptions/${data.subscription._id}`, { method: 'PATCH', body: { status: 'active', reason } })
        setNotice({
          type: 'success',
          text:
            result.status === 'expired'
              ? 'Subscription reinstated. Its expiry date has already passed, so it is now "Expired": record a payment to renew it.'
              : 'Subscription reinstated and active again.',
        })
      } else if (pending.action === 'refund') {
        await api(`/api/admin/r/membership-payments/${pending.payment._id}`, { method: 'PATCH', body: { status: 'refunded', reason } })
        setNotice({ type: 'success', text: 'Payment marked refunded and the refund written to the finance ledger. No money was sent from here.' })
      } else {
        const result = await api<any>('/api/admin/memberships/reminders', { method: 'POST', body: { action: 'send', subscriptionId: data.subscription._id } })
        const reminder = result.reminder
        setNotice(
          reminder.status === 'accepted'
            ? { type: 'success', text: `The ${reminder.channel} provider accepted the reminder.` }
            : { type: 'error', text: `The reminder was not sent: ${reminder.error || 'no provider accepted it'}. The attempt is recorded in the timeline.` }
        )
      }
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The action failed.' })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const s = data?.subscription
  const title = s ? s.memberName || 'Member' : 'Member'

  return (
    <AdminShell
      title={title}
      subtitle="One subscription: plan, status, payments, renewals, reminders, cancellations and support cases"
      actions={
        <Link href="/memberships/subscriptions" className="text-sm text-teal underline">
          Back to subscriptions
        </Link>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {missing ? (
        <Card>
          <EmptyState title="This member view cannot be shown" hint={missing} />
        </Card>
      ) : !data || !s ? (
        <Spinner />
      ) : (
        <>
          <Card className="p-5 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-deep-blue">{s.memberName}</h2>
                  <span data-member-status>
                    <StatusBadge status={s.status} />
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {s.memberPhone}
                  {s.memberEmail ? ` · ${s.memberEmail}` : ''}
                </p>
              </div>
              {(data.canManage || data.canRecordPayments) && (
                <div className="flex flex-wrap gap-2">
                  {data.canRecordPayments && s.status !== 'cancelled' && (
                    <Button
                      onClick={() =>
                        setPaying({ _id: s._id, memberName: s.memberName, plan: s.plan, planPrice: data.plan?.price ?? s.planPrice, expiresOn: s.expiresOn, status: s.status })
                      }
                    >
                      Record payment
                    </Button>
                  )}
                  {data.canManage && s.status === 'active' && (
                    <Button variant="secondary" onClick={() => setPending({ action: 'reminder' })}>
                      Send reminder
                    </Button>
                  )}
                  {data.canManage &&
                    (s.status === 'cancelled' ? (
                      <Button onClick={() => setPending({ action: 'reinstate' })}>Reinstate</Button>
                    ) : (
                      <Button variant="danger" onClick={() => setPending({ action: 'cancel' })}>
                        Cancel subscription
                      </Button>
                    ))}
                  {data.canManage && (
                    <Link
                      href={`/memberships/subscriptions?id=${s._id}`}
                      className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    >
                      Edit details
                    </Link>
                  )}
                </div>
              )}
            </div>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Plan</dt>
                <dd className="text-gray-900 font-medium">
                  {s.plan || '—'}
                  {data.plan?.status === 'retired' && <span className="text-xs text-gray-500"> (retired)</span>}
                </dd>
                <dd className="text-xs text-gray-500">
                  {s.planPrice !== null ? `${formatMoney(s.planPrice)} ${s.planBillingPeriod || ''} when taken` : 'Price when taken not recorded'}
                  {data.plan && s.planPrice !== null && Number(data.plan.price) !== Number(s.planPrice) ? `; the plan is ${formatMoney(data.plan.price)} now` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Started on</dt>
                <dd className="text-gray-900 font-medium">{formatDate(s.startedOn)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Expires on</dt>
                <dd className="text-gray-900 font-medium" data-member-expiry>
                  {formatDate(s.expiresOn)}
                </dd>
                <dd className="text-xs text-gray-500">{daysLeftText(s.daysLeft)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Last payment</dt>
                <dd className="text-gray-900 font-medium">{s.lastPaymentAmount !== null ? formatMoney(s.lastPaymentAmount) : '—'}</dd>
                <dd className="text-xs text-gray-500">
                  {s.lastPaymentAt ? formatDate(s.lastPaymentAt) : 'None recorded'}
                  {s.lastPaymentReference ? ` · ${s.lastPaymentReference}` : ''}
                </dd>
              </div>
            </dl>

            {s.status === 'cancelled' && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-cancel-info>
                Cancelled {s.cancelledAt ? formatDate(s.cancelledAt, true) : ''}
                {s.cancelledBy ? ` by ${s.cancelledBy}` : ''}. Reason: {s.cancelReason || s.statusReason || 'not recorded'}
              </p>
            )}
            {s.status === 'payment_failed' && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                The last renewal payment failed{s.lastFailedPaymentAt ? ` (${formatDate(s.lastFailedPaymentAt)})` : ''}. The expiry date
                was not extended. Record a new payment when the member has paid.
              </p>
            )}
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Paid" value={formatMoney(data.totals.paid)} hint={`${data.totals.paidCount} payment${data.totals.paidCount === 1 ? '' : 's'}`} tone="green" />
            <StatCard label="Refunded" value={formatMoney(data.totals.refunded)} hint={`${data.totals.refundedCount} refund${data.totals.refundedCount === 1 ? '' : 's'}`} tone="purple" />
            <StatCard label="Renewals" value={data.totals.renewals} hint={data.totals.failedCount > 0 ? `${data.totals.failedCount} failed payment${data.totals.failedCount === 1 ? '' : 's'}` : undefined} tone="red" />
            <StatCard label="Reminders" value={data.totals.reminders} />
          </div>

          <Card className="mb-4">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Payment history</h2>
            </div>
            {data.payments.length === 0 ? (
              <EmptyState title="No payment has been recorded for this subscription." hint="Use “Record payment” when the member has paid." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-payment-history>
                  <thead>
                    <tr className={headRowClass}>
                      <th scope="col" className={thClass}>Payment date</th>
                      <th scope="col" className={thClass}>Amount</th>
                      <th scope="col" className={thClass}>Status</th>
                      <th scope="col" className={thClass}>Period paid for</th>
                      <th scope="col" className={thClass}>Plan on the day</th>
                      <th scope="col" className={thClass}>Ledger reference</th>
                      <th scope="col" className={thClass + ' text-right'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.payments.map((payment) => (
                      <tr key={payment._id} className="hover:bg-gray-50 align-top">
                        <td className={tdClass + ' whitespace-nowrap'}>{formatDate(payment.paidOn)}</td>
                        <td className={tdClass + ' whitespace-nowrap tabular-nums'}>{formatMoney(payment.amount)}</td>
                        <td className={tdClass}>
                          <Badge tone={PAYMENT_TONE[payment.status] || 'gray'}>{PAYMENT_LABEL[payment.status] || payment.status}</Badge>
                          {payment.kind === 'renewal' && <span className="ml-2 text-xs text-gray-500">Renewal</span>}
                          {payment.refundReason && <p className="text-xs text-gray-500 mt-1">Refund reason: {payment.refundReason}</p>}
                        </td>
                        <td className={tdClass + ' whitespace-nowrap'}>
                          {payment.periodFrom && payment.periodTo ? `${formatDate(payment.periodFrom)} to ${formatDate(payment.periodTo)}` : '—'}
                        </td>
                        <td className={tdClass}>
                          {payment.planName || '—'}
                          {payment.planPrice !== null && <span className="text-xs text-gray-500"> ({formatMoney(payment.planPrice)})</span>}
                        </td>
                        <td className={tdClass + ' whitespace-nowrap font-mono text-xs'}>{payment.ledgerReference || '—'}</td>
                        <td className={tdClass}>
                          <div className="flex justify-end gap-2">
                            {data.canRecordPayments && payment.status === 'paid' && (
                              <Button variant="secondary" onClick={() => setPending({ action: 'refund', payment })}>
                                Mark refunded
                              </Button>
                            )}
                            <Link href={`/memberships/payments?id=${payment._id}`} className="text-sm text-teal underline self-center">
                              Open
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-deep-blue">Timeline</h2>
                <p className="text-xs text-gray-500 mt-0.5">Payments, renewals, reminders, status changes and edits, newest first.</p>
              </div>
              {data.timeline.length === 0 ? (
                <EmptyState title="Nothing has happened on this subscription yet." />
              ) : (
                <ol className="divide-y divide-gray-100" data-timeline>
                  {data.timeline.map((event, index) => (
                    <li key={index} className="px-4 py-3 flex gap-3">
                      <div className="w-36 shrink-0 text-xs text-gray-500 pt-0.5">{formatDate(event.at, true)}</div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          <Badge tone={event.tone}>{event.title}</Badge>
                        </p>
                        {event.detail && <p className="text-sm text-gray-700 mt-1 break-words">{event.detail}</p>}
                        {event.by && <p className="text-xs text-gray-500 mt-0.5">{event.by}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card>
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-deep-blue">Membership support cases</h2>
                <p className="text-xs text-gray-500 mt-0.5">Support tickets and complaints for this phone number with the service set to Membership.</p>
              </div>
              {!data.canSeeSupport ? (
                <EmptyState title="Your role cannot open support cases." hint="Ask an admin with access to Support." />
              ) : data.supportCases.length === 0 ? (
                <EmptyState
                  title="No membership support case for this member."
                  hint="Cases are raised under Support, Tickets with the service set to Membership and this phone number."
                />
              ) : (
                <ul className="divide-y divide-gray-100" data-support-cases>
                  {data.supportCases.map((item) => (
                    <li key={item._id} className="px-4 py-3">
                      <Link href={supportHref(item)} className="text-sm text-deep-blue font-medium hover:underline">
                        {item.subject || 'Untitled case'}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.kind === 'complaint' ? 'Complaint' : 'Ticket'} · {item.status.replace(/_/g, ' ')} · {item.priority} · {formatDate(item.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-4 py-3 border-t border-gray-200">
                <Link href={`/support/tickets?q=${encodeURIComponent(s.memberPhone)}`} className="text-sm text-teal underline">
                  All support tickets for {s.memberPhone}
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}

      <RecordPaymentModal
        target={paying}
        onClose={() => setPaying(null)}
        onDone={(message) => {
          setPaying(null)
          setNotice({ type: 'success', text: message })
          load()
        }}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        title={
          pending?.action === 'cancel'
            ? 'Cancel subscription'
            : pending?.action === 'reinstate'
              ? 'Reinstate subscription'
              : pending?.action === 'refund'
                ? 'Mark payment refunded'
                : 'Send expiry reminder'
        }
        message={
          pending?.action === 'cancel'
            ? 'The subscription will be cancelled now. The reason, the time and your name are stored and shown in reports.'
            : pending?.action === 'reinstate'
              ? 'The cancelled subscription will be opened again. If its expiry date has passed it comes back as expired, ready for a renewal payment.'
              : pending?.action === 'refund'
                ? `The payment of ${pending ? formatMoney((pending as any).payment.amount) : ''} will be marked refunded and a refund written to the finance ledger. If it paid for the current period, that period is taken back. No money is sent from here.`
                : 'The reminder is sent through the channel and template saved under Expiry Reminders. If no provider is connected for that channel, the attempt is recorded as not sent.'
        }
        confirmLabel={pending?.action === 'cancel' ? 'Cancel subscription' : pending?.action === 'reinstate' ? 'Reinstate' : pending?.action === 'refund' ? 'Mark refunded' : 'Send reminder'}
        danger={pending?.action === 'cancel'}
        askReason={pending?.action !== 'reminder'}
        reasonRequired={pending?.action !== 'reminder'}
        busy={busy}
        onConfirm={run}
        onClose={() => setPending(null)}
      />
    </AdminShell>
  )
}
