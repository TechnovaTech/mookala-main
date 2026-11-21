'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

const EVENT_TONE: Record<string, Tone> = { approved: 'green', pending: 'amber', rejected: 'red' }

const linkClass =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'

export default function OrganizerFinancePage() {
  const params = useParams()
  const organizerId = String(params?.id || '')

  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    if (!organizerId) return
    api<any>(`/api/events/organizer/${organizerId}`)
      .then(setData)
      .catch((error: any) => {
        setFailed(true)
        setNotice({ type: 'error', text: error.message || 'Could not load the organiser.' })
      })
  }, [organizerId])

  const payee = data?.payee
  const balance = data?.balance
  const events: any[] = data?.events || []
  const nothingInLedger = balance && balance.gross === 0 && balance.refunds === 0 && balance.settled === 0

  return (
    <AdminShell
      title={payee?.name || 'Organiser finance'}
      subtitle={
        payee
          ? [payee.type === 'artist' ? 'Artist' : 'Organiser', payee.city, payee.phone, payee.email].filter(Boolean).join(' · ')
          : 'Events and money owed for one organiser'
      }
      actions={
        <>
          <Link href="/finance" className={linkClass}>
            <ArrowLeft size={16} />
            Back to finance
          </Link>
          <Link href="/finance/settlements" className={linkClass}>
            Settlements
          </Link>
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {failed ? (
        <Card>
          <EmptyState title="This organiser could not be loaded." hint="Check the link, or open the organiser from the Organisers screen." />
        </Card>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {!payee && (
            <NoticeBar notice={{ type: 'info', text: 'The account that created these events no longer exists. The events and their ledger entries are still shown.' }} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Gross payments (verified)" value={formatMoney(balance.gross)} tone="green" hint="from the ledger" />
            <StatCard
              label="Charges"
              value={formatMoney(balance.commission + balance.gst + balance.gatewayFee)}
              tone="gray"
              hint={`commission ${formatMoney(balance.commission)} · GST ${formatMoney(balance.gst)} · gateway ${formatMoney(balance.gatewayFee)}`}
            />
            <StatCard label="Refunds" value={formatMoney(balance.refunds)} tone="gray" hint="returned to customers" />
            <StatCard label="Pending payout" value={formatMoney(balance.pending)} tone="blue" hint={`earned ${formatMoney(balance.earned)} · settled ${formatMoney(balance.settled)}`} />
          </div>

          {nothingInLedger && (
            <NoticeBar
              notice={{
                type: 'info',
                text: 'Nothing is in the ledger for this account yet. Amounts appear once customer payments for its events are verified through the payment gateway.',
              }}
            />
          )}

          <Card>
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">Events ({events.length})</h2>
              <p className="text-sm text-gray-500 mt-0.5">Money columns come from the ledger. Tickets sold is the count kept on the event.</p>
            </div>
            {events.length === 0 ? (
              <EmptyState title="This account has not created any events." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Tickets sold</th>
                      <th className="px-4 py-3 font-medium text-right">Gross</th>
                      <th className="px-4 py-3 font-medium text-right">Charges</th>
                      <th className="px-4 py-3 font-medium text-right">Refunds</th>
                      <th className="px-4 py-3 font-medium text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/finance/event/${event._id}`} className="font-medium text-deep-blue underline">
                            {event.name || 'Unnamed event'}
                          </Link>
                          <span className="block text-xs text-gray-500">{event.location?.city || (event.locationType === 'online' ? 'Online' : '')}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{event.startDate ? formatDate(event.startDate) : '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={EVENT_TONE[event.status] || 'gray'}>{event.status || '—'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {event.ticketsSold} of {event.totalTickets}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(event.ledger.gross)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {formatMoney(event.ledger.commission + event.ledger.gst + event.ledger.gatewayFee)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(event.ledger.refunds)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-deep-blue">{formatMoney(event.ledger.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  )
}
