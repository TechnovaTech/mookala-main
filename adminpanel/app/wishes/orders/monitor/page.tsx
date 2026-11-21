'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import { ExportLink } from '@/components/learning/ReportKit'
import WishTabs from '@/components/wishes/WishTabs'
import { APPS_NOT_WIRED, CHANNEL, StatusBadge, formatAge } from '@/components/wishes/shared'

interface Row {
  id: string
  resource: 'wish-orders' | 'custom-wishes'
  kind: 'template' | 'custom'
  status: string
  customerName: string
  customerPhone: string
  recipientName: string
  item: string
  deliveryChannel: string
  amount: number
  paid: boolean
  reason: string
  since: string | null
  ageHours: number | null
  retryCount: number
  dueDate: string | null
  daysOverdue: number
  scheduledFor: string | null
  hoursPastSchedule: number | null
}
interface Monitor {
  asOf: string
  counts: { failed: number; delayed: number; disputed: number; overdue: number; pastSchedule: number }
  problems: Row[]
  overdue: Row[]
  pastSchedule: Row[]
  canManage: boolean
}
interface Action {
  row: Row
  to: string
  title: string
  verb: string
  danger?: boolean
}

const API = '/api/admin/wishes/monitor'

function openHref(row: Row) {
  return `${row.kind === 'custom' ? '/wishes/custom' : '/wishes/orders'}?id=${row.id}`
}

/** What can be done with an order in a problem state. The server checks each move again. */
function actionsFor(row: Row): Action[] {
  const list: Action[] = [{ row, to: 'processing', title: 'Retry delivery', verb: 'Retry' }]
  if (row.status !== 'failed' && row.paid) list.push({ row, to: 'delivered', title: 'Resolve as delivered', verb: 'Mark delivered' })
  if (row.status === 'delayed') list.push({ row, to: 'failed', title: 'Mark as failed', verb: 'Mark failed', danger: true })
  if (row.paid) list.push({ row, to: 'refunded', title: 'Resolve with a refund', verb: 'Refund', danger: true })
  else list.push({ row, to: 'cancelled', title: 'Resolve by cancelling', verb: 'Cancel order', danger: true })
  return list
}

function Section({
  title,
  description,
  exportHref,
  count,
  children,
}: {
  title: string
  description: string
  exportHref: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-200">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">{description}</p>
        </div>
        {count > 0 && <ExportLink href={exportHref} />}
      </div>
      {children}
    </Card>
  )
}

const th = 'px-4 py-3 font-medium whitespace-nowrap'
const td = 'px-4 py-3 text-gray-800 align-top'

export default function Page() {
  const [data, setData] = useState<Monitor | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    try {
      setData(await api<Monitor>(API))
    } catch (problem: any) {
      setNotice({ type: 'error', text: problem.message || 'Could not load the delivery monitor.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const confirm = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      await api(`/api/admin/r/${pending.row.resource}/${pending.row.id}`, { method: 'PATCH', body: { status: pending.to, reason } })
      setNotice({ type: 'success', text: `${pending.title}: done for ${pending.row.recipientName || 'the order'}. The reason is saved in the order's history.` })
      setPending(null)
      setRefresh((current) => current + 1)
      await load()
    } catch (problem: any) {
      setNotice({ type: 'error', text: problem.message || 'Could not update the order.' })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const who = (row: Row) => (
    <>
      <span className="block">{row.recipientName || '—'}</span>
      <span className="block text-xs text-gray-500">
        from {row.customerName || '—'} {row.customerPhone ? `· ${row.customerPhone}` : ''}
      </span>
    </>
  )
  const what = (row: Row) => (
    <>
      <span className="block">{row.kind === 'custom' ? 'Custom wish' : 'Template order'}</span>
      <span className="block text-xs text-gray-500">{row.item || (row.kind === 'custom' ? 'No artist assigned' : '—')}</span>
    </>
  )
  const open = (row: Row) => (
    <Link href={openHref(row)} className="text-teal underline whitespace-nowrap" aria-label={`Open the order for ${row.recipientName || 'recipient'}`}>
      Open
    </Link>
  )

  return (
    <AdminShell
      title="Delivery monitor"
      subtitle="Failed, delayed and disputed deliveries, overdue custom wishes and orders past their scheduled time"
      actions={
        <Button variant="secondary" onClick={() => { setLoading(true); load() }}>
          Refresh
        </Button>
      }
    >
      <WishTabs current="/wishes/orders/monitor" refreshKey={refresh} />
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text:
            'These lists are worked out each time the screen is opened or refreshed; nothing is flagged automatically in the background and no message is sent to the customer from here. ' +
            APPS_NOT_WIRED,
        }}
      />

      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6" data-monitor-counts>
            <StatCard label="Failed" value={data.counts.failed} />
            <StatCard label="Delayed" value={data.counts.delayed} />
            <StatCard label="Disputed" value={data.counts.disputed} />
            <StatCard label="Overdue custom wishes" value={data.counts.overdue} />
            <StatCard label="Past scheduled time" value={data.counts.pastSchedule} />
          </div>

          <Section
            title="Failed, delayed and disputed deliveries"
            description="Oldest first. Retry sends the order back to Processing; the other buttons resolve it. Every action needs a reason, which is kept in the order's history."
            exportHref={API + '?export=problems'}
            count={data.problems.length}
          >
            {data.problems.length === 0 ? (
              <EmptyState title="No failed, delayed or disputed deliveries." hint="An order appears here as soon as its status is set to Failed, Delayed or Disputed." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-monitor-table="problems">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className={th}>Status</th>
                      <th scope="col" className={th}>Age</th>
                      <th scope="col" className={th}>Recipient</th>
                      <th scope="col" className={th}>Order</th>
                      <th scope="col" className={th}>Channel</th>
                      <th scope="col" className={th + ' text-right'}>Amount</th>
                      <th scope="col" className={th}>Reason given</th>
                      <th scope="col" className={th + ' text-right'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.problems.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50" data-order={row.id}>
                        <td className={td}><StatusBadge status={row.status} /></td>
                        <td className={td + ' whitespace-nowrap'} data-age>
                          {formatAge(row.ageHours)}
                          <span className="block text-xs text-gray-500">since {formatDate(row.since, true)}</span>
                          {row.retryCount > 0 && <span className="block text-xs text-gray-500">retried {row.retryCount}×</span>}
                        </td>
                        <td className={td}>{who(row)}</td>
                        <td className={td}>{what(row)}</td>
                        <td className={td}>{CHANNEL[row.deliveryChannel] || row.deliveryChannel || '—'}</td>
                        <td className={td + ' text-right tabular-nums whitespace-nowrap'}>
                          {formatMoney(row.amount)}
                          <span className="block text-xs text-gray-500">{row.paid ? 'paid' : 'not paid'}</span>
                        </td>
                        <td className={td + ' max-w-xs'}>{row.reason || '—'}</td>
                        <td className={td}>
                          <div className="flex flex-wrap justify-end items-center gap-2">
                            {open(row)}
                            {data.canManage &&
                              actionsFor(row).map((action) => (
                                <Button
                                  key={action.to}
                                  variant={action.danger ? 'ghost' : 'secondary'}
                                  className="!px-3 !py-1.5"
                                  onClick={() => setPending(action)}
                                >
                                  {action.verb}
                                </Button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Overdue custom wishes"
            description="Custom wishes whose due date has passed and that are not delivered, cancelled or refunded. Open the wish to chase the artist, change the due date or update its status."
            exportHref={API + '?export=overdue'}
            count={data.overdue.length}
          >
            {data.overdue.length === 0 ? (
              <EmptyState title="No overdue custom wishes." hint="A custom wish appears here the day after its due date if it has not been delivered." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-monitor-table="overdue">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className={th}>Overdue by</th>
                      <th scope="col" className={th}>Due date</th>
                      <th scope="col" className={th}>Status</th>
                      <th scope="col" className={th}>Recipient</th>
                      <th scope="col" className={th}>Artist</th>
                      <th scope="col" className={th + ' text-right'}>Amount</th>
                      <th scope="col" className={th + ' text-right'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.overdue.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50" data-order={row.id}>
                        <td className={td + ' whitespace-nowrap font-medium text-red-700'} data-overdue>
                          {row.daysOverdue} day{row.daysOverdue === 1 ? '' : 's'}
                        </td>
                        <td className={td + ' whitespace-nowrap'}>{formatDate(row.dueDate)}</td>
                        <td className={td}><StatusBadge status={row.status} /></td>
                        <td className={td}>{who(row)}</td>
                        <td className={td}>{row.item || 'No artist assigned'}</td>
                        <td className={td + ' text-right tabular-nums whitespace-nowrap'}>{formatMoney(row.amount)}</td>
                        <td className={td + ' text-right'}>{open(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Past the scheduled time, not yet delivered"
            description='Orders whose "Scheduled for" time has passed while they are still Created, Paid or Processing. Open the order to deliver it or mark it Delayed with a reason.'
            exportHref={API + '?export=past-schedule'}
            count={data.pastSchedule.length}
          >
            {data.pastSchedule.length === 0 ? (
              <EmptyState title="No order is past its scheduled time." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-monitor-table="past-schedule">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th scope="col" className={th}>Late by</th>
                      <th scope="col" className={th}>Scheduled for</th>
                      <th scope="col" className={th}>Status</th>
                      <th scope="col" className={th}>Recipient</th>
                      <th scope="col" className={th}>Order</th>
                      <th scope="col" className={th + ' text-right'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.pastSchedule.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50" data-order={row.id}>
                        <td className={td + ' whitespace-nowrap'}>{formatAge(row.hoursPastSchedule)}</td>
                        <td className={td + ' whitespace-nowrap'}>{formatDate(row.scheduledFor, true)}</td>
                        <td className={td}><StatusBadge status={row.status} /></td>
                        <td className={td}>{who(row)}</td>
                        <td className={td}>{what(row)}</td>
                        <td className={td + ' text-right'}>
                          <div className="flex flex-wrap justify-end items-center gap-2">
                            {open(row)}
                            {data.canManage && row.paid && (
                              <Button
                                variant="secondary"
                                className="!px-3 !py-1.5"
                                onClick={() => setPending({ row, to: 'delayed', title: 'Mark as delayed', verb: 'Mark delayed' })}
                              >
                                Mark delayed
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
          </Section>
          <p className="text-xs text-gray-500">Worked out at {formatDate(data.asOf, true)}.</p>
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title || ''}
        message={
          pending ? (
            <>
              {pending.verb} the {pending.row.kind === 'custom' ? 'custom wish' : 'order'} for{' '}
              <strong>{pending.row.recipientName || 'this recipient'}</strong>?
              {pending.to === 'refunded' && ' This writes a refund entry to the finance ledger; it does not send the money back.'}
              {pending.to === 'processing' && ' The order goes back to Processing.'}
            </>
          ) : null
        }
        confirmLabel={pending?.verb || 'Confirm'}
        danger={Boolean(pending?.danger)}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </AdminShell>
  )
}
