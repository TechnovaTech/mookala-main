'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import { MoneyLines } from '@/components/finance/RulesShared'
import type { Tone } from '@/lib/resource-types'

const PAYMENT_TONE: Record<string, Tone> = {
  paid: 'green',
  pending: 'amber',
  unverified: 'amber',
  failed: 'red',
  refund_requested: 'purple',
  refunded: 'gray',
}

const BOOKING_TONE: Record<string, Tone> = {
  confirmed: 'green',
  attended: 'green',
  pending_payment: 'amber',
  cancelled: 'red',
  expired: 'gray',
}

function words(value: any): string {
  return value ? String(value).replace(/_/g, ' ') : '—'
}

export default function EventFinancePage() {
  const params = useParams()
  const eventId = String(params?.id || '')

  const [details, setDetails] = useState<any>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [failed, setFailed] = useState(false)

  const [bookings, setBookings] = useState<any[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 25

  useEffect(() => {
    if (!eventId) return
    api<any>(`/api/events/${eventId}/payment-details`)
      .then((data) => setDetails(data.eventDetails))
      .catch((error: any) => {
        setFailed(true)
        setNotice({ type: 'error', text: error.message || 'Could not load the event.' })
      })
  }, [eventId])

  const loadBookings = useCallback(async () => {
    if (!eventId) return
    try {
      const data = await api<any>(`/api/events/${eventId}/bookings?page=${page}&limit=${limit}`)
      setBookings(data.bookings || [])
      setTotal(data.total || 0)
    } catch (error: any) {
      setBookings([])
      setNotice({ type: 'error', text: error.message || 'Could not load the bookings.' })
    }
  }, [eventId, page])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  const ledger = details?.ledger
  const book = details?.bookings
  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminShell
      title={details?.eventName || 'Event finance'}
      subtitle={
        details
          ? [details.startDate ? formatDate(details.startDate) : null, details.city, `event is ${words(details.status)}`].filter(Boolean).join(' · ')
          : 'Money received, charges and bookings for one event'
      }
      actions={
        <Link
          href={details?.organizerId ? `/finance/organizer/${details.organizerId}` : '/finance'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          {details?.organizerId ? 'All events of this organiser' : 'Back to finance'}
        </Link>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {failed ? (
        <Card>
          <EmptyState title="This event could not be loaded." hint="Check the link, or open the event from the organiser's finance page." />
        </Card>
      ) : !details ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Money received (verified)"
              value={formatMoney(ledger.gross)}
              hint={`${ledger.payments} payment${ledger.payments === 1 ? '' : 's'} in the ledger`}
              tone="green"
            />
            <StatCard label="Owed to the organiser" value={formatMoney(ledger.net)} hint="after charges and refunds" tone="blue" />
            <StatCard
              label="Tickets sold"
              value={`${details.ticketsSold} of ${details.totalTickets}`}
              hint={details.soldPercent === null ? 'no ticket quantity set' : `${details.soldPercent}% of inventory`}
              tone="gray"
            />
            <StatCard
              label="Unverified bookings"
              value={book.unverifiedCount}
              hint={book.unverifiedCount > 0 ? `${formatMoney(book.unverifiedAmount)} never confirmed` : 'none'}
              tone={book.unverifiedCount > 0 ? 'amber' : 'gray'}
            />
          </div>

          {book.unverifiedCount > 0 && (
            <NoticeBar
              notice={{
                type: 'info',
                text: `${book.unverifiedCount} of ${book.total} bookings (${formatMoney(book.unverifiedAmount)}) were never confirmed with the payment gateway. They are not counted as money received and are not owed to the organiser until the payment is verified.`,
              }}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-deep-blue">Money for this event</h2>
              <p className="text-sm text-gray-500 mt-0.5 mb-3">From the ledger: payments verified with the gateway and the entries derived from them.</p>
              {ledger.payments === 0 && ledger.refunds === 0 && ledger.refundsOutsideLedger === 0 ? (
                <EmptyState
                  title="No verified payment yet."
                  hint="Amounts appear here once a customer's payment for this event is verified through the payment gateway and written to the ledger."
                />
              ) : (
                <>
                  <MoneyLines
                    lines={[
                      { label: 'Gross payments', value: ledger.gross },
                      { label: 'Commission', value: ledger.commission, minus: true },
                      { label: 'GST on commission', value: ledger.gst, minus: true },
                      { label: 'Gateway fees', value: ledger.gatewayFee, minus: true },
                      { label: 'Refunds to customers', value: ledger.refunds, minus: true },
                      { label: 'Net owed to the organiser', value: ledger.net, strong: true },
                    ]}
                  />
                  <p className="text-xs text-gray-500 mt-3">
                    Kept from refunds under the refund rules: {formatMoney(ledger.refundDeductions)}.
                    {ledger.refundsOutsideLedger > 0
                      ? ` Another ${formatMoney(ledger.refundsOutsideLedger)} was refunded for bookings that were never verified; that is recorded against the platform and does not reduce the organiser's net.`
                      : ''}
                  </p>
                </>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold text-deep-blue">Bookings by payment status</h2>
              <p className="text-sm text-gray-500 mt-0.5 mb-3">What the booking records say. Only &quot;paid&quot; bookings verified with the gateway are in the ledger.</p>
              {book.total === 0 ? (
                <EmptyState title="No bookings yet." />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4 font-medium">Payment status</th>
                      <th className="py-2 pr-4 font-medium text-right">Bookings</th>
                      <th className="py-2 font-medium text-right">Booking value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(book.byPaymentStatus as Record<string, { count: number; amount: number }>).map(([key, row]) => (
                      <tr key={key} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4">
                          <Badge tone={PAYMENT_TONE[key] || 'gray'}>{words(key)}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-right">{row.count}</td>
                        <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card>
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">Ticket inventory</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Counts kept on the event. &quot;Value at listed price&quot; is tickets sold × price, not money received.
              </p>
            </div>
            {details.tickets.length === 0 ? (
              <EmptyState title="This event has no ticket types." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 font-medium">Ticket</th>
                      <th className="px-4 py-3 font-medium text-right">Price</th>
                      <th className="px-4 py-3 font-medium text-right">Quantity</th>
                      <th className="px-4 py-3 font-medium text-right">Sold</th>
                      <th className="px-4 py-3 font-medium text-right">Sold %</th>
                      <th className="px-4 py-3 font-medium text-right">Value at listed price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.tickets.map((ticket: any, index: number) => (
                      <tr key={index} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{ticket.name || 'Unnamed ticket'}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(ticket.price)}</td>
                        <td className="px-4 py-3 text-right">{ticket.quantity}</td>
                        <td className="px-4 py-3 text-right">{ticket.sold}</td>
                        <td className="px-4 py-3 text-right">{ticket.soldPercent === null ? '—' : `${ticket.soldPercent}%`}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(ticket.revenue)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">{details.totalTickets}</td>
                      <td className="px-4 py-3 text-right">{details.ticketsSold}</td>
                      <td className="px-4 py-3 text-right">{details.soldPercent === null ? '—' : `${details.soldPercent}%`}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(details.inventoryValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">Bookings ({total})</h2>
            </div>
            {bookings === null ? (
              <Spinner />
            ) : bookings.length === 0 ? (
              <EmptyState title="No bookings have been made for this event." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 font-medium">Booked</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Tickets</th>
                      <th className="px-4 py-3 font-medium text-right">Seats</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                      <th className="px-4 py-3 font-medium">Booking</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b._id} className="border-b border-gray-100 last:border-0 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(b.createdAt, true)}
                          <span className="block font-mono text-xs text-gray-500">{b._id}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{b.userPhone || '—'}</td>
                        <td className="px-4 py-3">
                          {b.tickets.length === 0
                            ? '—'
                            : b.tickets.map((t: any, i: number) => (
                                <span key={i} className="block">
                                  {t.quantity} × {t.category || 'ticket'}
                                  {t.block ? ` (${t.block})` : ''} at {formatMoney(t.price)}
                                </span>
                              ))}
                        </td>
                        <td className="px-4 py-3 text-right">{b.totalSeats}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(b.totalPrice)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={BOOKING_TONE[b.status] || 'gray'}>{words(b.status)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={PAYMENT_TONE[b.paymentStatus] || 'gray'}>{words(b.paymentStatus)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
                <span>
                  Page {page} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  )
}
