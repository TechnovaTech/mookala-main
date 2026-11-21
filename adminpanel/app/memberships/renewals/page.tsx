'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import RecordPaymentModal, { type PaymentTarget } from '@/components/memberships/RecordPaymentModal'
import { APP_NOT_WIRED, MemberLink, daysLeftText, headRowClass, supportHref, tdClass, thClass, type SubscriptionRow } from '@/components/memberships/shared'

interface FailedRow extends SubscriptionRow {
  failedPayment: { amount: number; paidOn: string; method: string | null } | null
  failedPaymentCount: number
}
interface SupportCase {
  _id: string
  kind: string
  subject: string
  customerName: string
  customerPhone: string
  status: string
  priority: string
  assignedTeam: string
  createdAt: string | null
}
interface Data {
  days: number
  counts: { failed: number; cancelled: number; expiring: number; lapsed: number; supportCases: number; openSupportCases: number }
  listLimit: number
  failed: FailedRow[]
  cancelled: SubscriptionRow[]
  expiring: SubscriptionRow[]
  lapsed: SubscriptionRow[]
  supportCases: SupportCase[]
  canSeeSupport: boolean
  canManage: boolean
  /** Recording a payment writes a Membership Payments record: 'finance:manage'. */
  canRecordPayments: boolean
}

type Tab = 'failed' | 'cancelled' | 'expiring' | 'lapsed' | 'support'

const TABS: { key: Tab; label: string }[] = [
  { key: 'failed', label: 'Failed renewals' },
  { key: 'cancelled', label: 'Cancellations' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'lapsed', label: 'Expired' },
  { key: 'support', label: 'Support cases' },
]

const CASE_TONE: Record<string, 'blue' | 'amber' | 'purple' | 'red' | 'green' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  waiting_customer: 'purple',
  escalated: 'red',
  resolved: 'green',
  closed: 'gray',
}

export default function Page() {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('failed')
  const [notice, setNotice] = useState<Notice>(null)
  const [paying, setPaying] = useState<PaymentTarget | null>(null)
  const [reinstating, setReinstating] = useState<SubscriptionRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('/api/admin/memberships/renewals'))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load renewals and cancellations.' })
    }
  }, [])

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (wanted && TABS.some((t) => t.key === wanted)) setTab(wanted as Tab)
    load()
  }, [load])

  const reinstate = async (reason: string) => {
    if (!reinstating) return
    setBusy(true)
    try {
      const result = await api<any>(`/api/admin/r/membership-subscriptions/${reinstating._id}`, { method: 'PATCH', body: { status: 'active', reason } })
      setNotice({
        type: 'success',
        text:
          result.status === 'expired'
            ? `${reinstating.memberName} was reinstated. The expiry date has already passed, so the subscription is now under "Expired": record a payment to renew it.`
            : `${reinstating.memberName} was reinstated and is active again.`,
      })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not reinstate the subscription.' })
    } finally {
      setBusy(false)
      setReinstating(null)
    }
  }

  const pay = (row: SubscriptionRow) =>
    setPaying({ _id: row._id, memberName: row.memberName, plan: row.plan, planPrice: row.planPrice, expiresOn: row.expiresOn, status: row.status })

  const count = (key: Tab): number => {
    if (!data) return 0
    return key === 'support' ? data.counts.supportCases : data.counts[key]
  }

  const payButton = (row: SubscriptionRow, label: string) =>
    data?.canRecordPayments ? (
      <Button onClick={() => pay(row)} className="whitespace-nowrap">
        {label}
      </Button>
    ) : null

  return (
    <AdminShell title="Renewals & Cancellations" subtitle="Failed renewals, cancellations, subscriptions about to expire and membership support cases to follow up">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar notice={{ type: 'info', text: APP_NOT_WIRED + ' Nothing charges a member automatically, so a "retry" here means recording the payment once the member has paid.' }} />

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div role="tablist" aria-label="Follow-up lists" className="flex flex-wrap gap-2 mb-4">
            {TABS.map((item) => (
              <button
                key={item.key}
                role="tab"
                aria-selected={tab === item.key}
                data-tab={item.key}
                onClick={() => setTab(item.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  tab === item.key ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {item.label} <span data-count={item.key}>({count(item.key)})</span>
              </button>
            ))}
          </div>

          {tab === 'failed' && (
            <Card>
              <Header title="Failed renewals" text='Subscriptions marked "Payment failed". Their expiry date was not extended. When the member has paid, record the payment: that renews the subscription.' />
              {data.failed.length === 0 ? (
                <EmptyState title="No subscription has a failed renewal." hint="A subscription lands here when a payment recorded for it is marked Failed." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={headRowClass}>
                        <th scope="col" className={thClass}>Member</th>
                        <th scope="col" className={thClass}>Plan</th>
                        <th scope="col" className={thClass}>Failed payment</th>
                        <th scope="col" className={thClass}>Expires on</th>
                        <th scope="col" className={thClass + ' text-right'}>Follow up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.failed.map((row) => (
                        <tr key={row._id} className="hover:bg-gray-50 align-top" data-row={row._id}>
                          <td className={tdClass}><MemberLink row={row} /></td>
                          <td className={tdClass}>{row.plan || '—'}</td>
                          <td className={tdClass}>
                            {row.failedPayment ? (
                              <>
                                {formatMoney(row.failedPayment.amount)} on {formatDate(row.failedPayment.paidOn)}
                                {row.failedPaymentCount > 1 && <p className="text-xs text-gray-500">{row.failedPaymentCount} failed payments in total</p>}
                              </>
                            ) : (
                              <span className="text-gray-500">Marked by hand{row.statusReason ? `: ${row.statusReason}` : ''}</span>
                            )}
                          </td>
                          <td className={tdClass + ' whitespace-nowrap'}>
                            {formatDate(row.expiresOn)}
                            <p className="text-xs text-gray-500">{daysLeftText(row.daysLeft)}</p>
                          </td>
                          <td className={tdClass}>
                            <div className="flex justify-end">{payButton(row, 'Retry: record payment')}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'cancelled' && (
            <Card>
              <Header title="Cancellations" text="Cancelled subscriptions with the reason given, newest first. Reinstating needs a reason and is written to the activity log." />
              {data.cancelled.length === 0 ? (
                <EmptyState title="No subscription is cancelled." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={headRowClass}>
                        <th scope="col" className={thClass}>Member</th>
                        <th scope="col" className={thClass}>Plan</th>
                        <th scope="col" className={thClass}>Cancelled</th>
                        <th scope="col" className={thClass}>Reason</th>
                        <th scope="col" className={thClass}>Expiry date</th>
                        <th scope="col" className={thClass + ' text-right'}>Follow up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.cancelled.map((row) => (
                        <tr key={row._id} className="hover:bg-gray-50 align-top" data-row={row._id}>
                          <td className={tdClass}><MemberLink row={row} /></td>
                          <td className={tdClass}>{row.plan || '—'}</td>
                          <td className={tdClass + ' whitespace-nowrap'}>
                            {formatDate(row.cancelledAt || row.statusChangedAt, true)}
                            {row.cancelledBy && <p className="text-xs text-gray-500">{row.cancelledBy}</p>}
                          </td>
                          <td className={tdClass + ' max-w-xs break-words'}>{row.cancelReason || row.statusReason || 'No reason recorded'}</td>
                          <td className={tdClass + ' whitespace-nowrap'}>{formatDate(row.expiresOn)}</td>
                          <td className={tdClass}>
                            <div className="flex justify-end">
                              {data.canManage && (
                                <Button variant="secondary" onClick={() => setReinstating(row)}>
                                  Reinstate
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {(tab === 'expiring' || tab === 'lapsed') && (
            <Card>
              {tab === 'expiring' ? (
                <Header title={`Expiring in the next ${data.days} days`} text="Active subscriptions close to their expiry date. Reminders are sent from the Expiry Reminders screen." />
              ) : (
                <Header title="Expired" text="Subscriptions whose expiry date has passed without a renewal. Recording a payment renews them from today." />
              )}
              {data[tab].length === 0 ? (
                <EmptyState title={tab === 'expiring' ? `No active subscription expires in the next ${data.days} days.` : 'No subscription has expired.'} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={headRowClass}>
                        <th scope="col" className={thClass}>Member</th>
                        <th scope="col" className={thClass}>Plan</th>
                        <th scope="col" className={thClass}>Expires on</th>
                        <th scope="col" className={thClass}>Last reminder</th>
                        <th scope="col" className={thClass + ' text-right'}>Follow up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data[tab].map((row) => (
                        <tr key={row._id} className="hover:bg-gray-50 align-top" data-row={row._id}>
                          <td className={tdClass}><MemberLink row={row} /></td>
                          <td className={tdClass}>{row.plan || '—'}</td>
                          <td className={tdClass + ' whitespace-nowrap'}>
                            {formatDate(row.expiresOn)}
                            <p className="text-xs text-gray-500">{daysLeftText(row.daysLeft)}</p>
                          </td>
                          <td className={tdClass + ' whitespace-nowrap'}>{row.lastReminderAt ? formatDate(row.lastReminderAt, true) : 'None'}</td>
                          <td className={tdClass}>
                            <div className="flex justify-end gap-2">
                              {tab === 'expiring' && (
                                <Link href="/memberships/reminders" className="text-sm text-teal underline self-center whitespace-nowrap">
                                  Reminders
                                </Link>
                              )}
                              {payButton(row, 'Record renewal payment')}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'support' && (
            <Card>
              <Header
                title="Membership support cases"
                text={`Support tickets and complaints with the service set to Membership: ${data.counts.supportCases} in total, ${data.counts.openSupportCases} still open. They are worked under Support; each row opens the case there.`}
              />
              {!data.canSeeSupport ? (
                <EmptyState title="Your role cannot open support cases." hint="The counts above are shown; ask an admin with access to Support for the details." />
              ) : data.supportCases.length === 0 ? (
                <EmptyState
                  title="No membership support case has been raised."
                  hint="Cases appear here when a ticket or complaint is created under Support with the service set to Membership."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={headRowClass}>
                        <th scope="col" className={thClass}>Case</th>
                        <th scope="col" className={thClass}>Customer</th>
                        <th scope="col" className={thClass}>Status</th>
                        <th scope="col" className={thClass}>Priority</th>
                        <th scope="col" className={thClass}>Raised</th>
                        <th scope="col" className={thClass + ' text-right'}>Follow up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.supportCases.map((item) => (
                        <tr key={item._id} className="hover:bg-gray-50 align-top" data-row={item._id}>
                          <td className={tdClass}>
                            <p className="text-gray-900 font-medium">{item.subject || 'Untitled case'}</p>
                            <p className="text-xs text-gray-500">{item.kind === 'complaint' ? 'Complaint' : 'Support ticket'}</p>
                          </td>
                          <td className={tdClass}>
                            {item.customerName || '—'}
                            <p className="text-xs text-gray-500">{item.customerPhone}</p>
                          </td>
                          <td className={tdClass}>
                            <Badge tone={CASE_TONE[item.status] || 'gray'}>{item.status.replace(/_/g, ' ')}</Badge>
                          </td>
                          <td className={tdClass}>{item.priority || '—'}</td>
                          <td className={tdClass + ' whitespace-nowrap'}>{formatDate(item.createdAt, true)}</td>
                          <td className={tdClass}>
                            <div className="flex justify-end gap-3">
                              <Link href={supportHref(item)} className="text-sm text-teal underline whitespace-nowrap">
                                Open case
                              </Link>
                              <Link href={`/memberships/subscriptions?q=${encodeURIComponent(item.customerPhone)}`} className="text-sm text-teal underline whitespace-nowrap">
                                Find subscription
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
          )}

          {tab !== 'support' && count(tab) > data.listLimit && (
            <p className="text-xs text-gray-500 mt-2">Showing the first {data.listLimit}. The Subscriptions screen lists all of them.</p>
          )}
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
        open={Boolean(reinstating)}
        title="Reinstate subscription"
        message={
          reinstating
            ? `${reinstating.memberName}'s cancelled subscription will be opened again. If its expiry date (${formatDate(reinstating.expiresOn)}) has passed it comes back as expired, ready for a renewal payment.`
            : ''
        }
        confirmLabel="Reinstate"
        askReason
        reasonRequired
        busy={busy}
        onConfirm={reinstate}
        onClose={() => setReinstating(null)}
      />
    </AdminShell>
  )
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
      <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">{text}</p>
    </div>
  )
}
