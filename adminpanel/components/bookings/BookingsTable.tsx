'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, RefreshCw, Search } from 'lucide-react'
import { api, Button, Card, EmptyState, formatDate, formatMoney, inputClass, NoticeBar, Spinner, type Notice } from '@/components/ui'
import BookingDetail from './BookingDetail'
import {
  BOOKING_STATUS,
  buildQuery,
  PAYMENT_STATUS,
  PaymentBadge,
  RefundBadge,
  shortId,
  StatusBadge,
  ticketSummary,
  type BookingRow,
} from './shared'

interface ListResponse {
  items: BookingRow[]
  total: number
  page: number
  limit: number
  pages: number
  counts: Record<string, number>
  unverified?: { count: number; value: number; capped: boolean }
  events?: { id: string; title: string; bookings: number }[]
}

const LIMIT = 25

/**
 * The bookings list used by both screens. `mode="cancellations"` locks the
 * status to cancelled and shows who cancelled, why, the rule applied and the
 * refund, instead of the ticket and payment columns.
 */
export default function BookingsTable({ mode = 'all' }: { mode?: 'all' | 'cancellations' }) {
  const cancellations = mode === 'cancellations'
  const [data, setData] = useState<ListResponse | null>(null)
  const [events, setEvents] = useState<{ id: string; title: string; bookings: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const [status, setStatus] = useState('')
  const [searchText, setSearchText] = useState('')
  const [q, setQ] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [eventId, setEventId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const requestRef = useRef(0)
  // `ready` waits for values from the URL (?q=, ?paymentStatus=, ?open=) so the first request already uses them.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const text = (params.get('q') || '').slice(0, 120)
    if (text) {
      setSearchText(text)
      setQ(text)
    }
    const payment = params.get('paymentStatus') || ''
    if (PAYMENT_STATUS.some((option) => option.value === payment)) setPaymentStatus(payment)
    const open = (params.get('open') || '').slice(0, 80)
    if (open) setOpenId(open)
    setReady(true)
  }, [])

  // The search box is sent to the server shortly after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchText.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchText])

  const filters = { q, status: cancellations ? 'cancelled' : status, paymentStatus, eventId, from, to }
  const filterKey = buildQuery(filters)

  const load = useCallback(async () => {
    if (!ready) return
    const request = ++requestRef.current
    setLoading(true)
    try {
      const query = buildQuery({ ...filters, page, limit: LIMIT, withEvents: 1 })
      const result = await api<ListResponse>('/api/admin/bookings?' + query)
      if (request !== requestRef.current) return
      setData(result)
      if (result.events) setEvents(result.events)
      setNotice((current) => (current?.type === 'error' ? null : current))
    } catch (error: any) {
      if (request !== requestRef.current) return
      setData(null)
      setNotice({ type: 'error', text: error?.message || 'Could not load bookings' })
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, ready])

  useEffect(() => {
    load()
  }, [load])

  const hasFilters = Boolean(q || (!cancellations && status) || paymentStatus || eventId || from || to)
  const clearFilters = () => {
    setSearchText('')
    setQ('')
    setStatus('')
    setPaymentStatus('')
    setEventId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const items = data?.items || []
  const total = data?.total || 0
  const counts = data?.counts || {}
  const exportHref = '/api/admin/bookings?' + buildQuery({ ...filters, format: 'csv' })
  const change = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-3 mb-4">
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </Button>
        <a
          href={exportHref}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <Download size={16} /> Export CSV
        </a>
      </div>

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {!cancellations && data?.unverified && data.unverified.count > 0 && (
        <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-4" role="alert" data-unverified-banner>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              {data.unverified.count}
              {data.unverified.capped ? '+' : ''} {data.unverified.count === 1 ? 'ticket was' : 'tickets were'} issued without a verified payment, claiming{' '}
              {formatMoney(data.unverified.value)}
            </p>
            <p className="mt-0.5">
              These come from old app versions or demonstration mode: the gateway never confirmed the money, so they are marked &lsquo;Unverified&rsquo; and are
              not counted as revenue anywhere. Open one to attach the Razorpay payment that paid for it, or to cancel it.{' '}
              {paymentStatus !== 'unverified' && (
                <button
                  className="underline font-medium"
                  onClick={() => {
                    setPaymentStatus('unverified')
                    setStatus('')
                    setPage(1)
                  }}
                >
                  Show unverified bookings
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          {!cancellations && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by booking status">
              {[{ value: '', label: 'All' }, ...BOOKING_STATUS].map((option) => (
                <button
                  key={option.value || 'all'}
                  role="tab"
                  aria-selected={status === option.value}
                  onClick={() => {
                    setStatus(option.value)
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm ${
                    status === option.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label} ({data ? counts[option.value || 'all'] || 0 : '…'})
                </button>
              ))}
              {data && (counts.other || 0) > 0 && (
                <span className="px-3 py-1.5 text-sm text-gray-500">
                  {counts.other} with another or no status (shown under All)
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[14rem]">
              <label htmlFor="booking-search" className="block text-xs font-medium text-gray-600 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  id="booking-search"
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Event, phone, booking ID or payment ID"
                  className={inputClass + ' pl-9'}
                />
              </div>
            </div>
            <div>
              <label htmlFor="booking-event" className="block text-xs font-medium text-gray-600 mb-1">
                Event
              </label>
              <select id="booking-event" value={eventId} onChange={change(setEventId)} className={inputClass + ' max-w-[14rem]'}>
                <option value="">All events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} ({event.bookings})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-payment" className="block text-xs font-medium text-gray-600 mb-1">
                Payment
              </label>
              <select id="booking-payment" value={paymentStatus} onChange={change(setPaymentStatus)} className={inputClass}>
                <option value="">Any payment status</option>
                {PAYMENT_STATUS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-from" className="block text-xs font-medium text-gray-600 mb-1">
                Booked from
              </label>
              <input id="booking-from" type="date" value={from} max={to || undefined} onChange={change(setFrom)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="booking-to" className="block text-xs font-medium text-gray-600 mb-1">
                Booked to
              </label>
              <input id="booking-to" type="date" value={to} min={from || undefined} onChange={change(setTo)} className={inputClass} />
            </div>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <Spinner label="Loading bookings..." />
        ) : items.length === 0 ? (
          <EmptyState
            title={
              hasFilters
                ? 'Nothing matches these filters'
                : cancellations
                ? 'No bookings have been cancelled'
                : 'No bookings yet'
            }
            hint={
              hasFilters
                ? 'Clear the search or filters to see everything.'
                : cancellations
                ? 'A booking appears here when the customer cancels it in the app or an admin cancels it from Bookings.'
                : 'Bookings appear here as soon as a customer books tickets on the website or in the app.'
            }
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-4 py-3 font-medium">Booking</th>
                  <th scope="col" className="px-4 py-3 font-medium">Event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                  {cancellations ? (
                    <>
                      <th scope="col" className="px-4 py-3 font-medium">Cancelled</th>
                      <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                      <th scope="col" className="px-4 py-3 font-medium">Rule applied</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Paid</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Refund</th>
                      <th scope="col" className="px-4 py-3 font-medium">Refund status</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-3 font-medium">Tickets</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Amount</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                    </>
                  )}
                  <th scope="col" className="px-4 py-3 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((booking) => {
                  const quote = booking.refundQuote || null
                  return (
                    <tr key={booking._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs text-gray-800" title={booking._id}>
                          {shortId(booking._id)}
                        </div>
                        <div className="text-xs text-gray-500">{formatDate(booking.createdAt, true)}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[16rem]">
                        <div className="text-gray-900 truncate" title={booking.eventTitle || ''}>
                          {booking.eventTitle || 'Untitled event'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {[booking.eventDate, booking.eventTime].filter(Boolean).join(' · ') || 'No date stored'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800">{booking.userPhone || '—'}</td>
                      {cancellations ? (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-gray-800">{formatDate(booking.cancelledAt, true)}</div>
                            <div className="text-xs text-gray-500">
                              by{' '}
                              {booking.cancelledBy === 'customer'
                                ? 'customer'
                                : booking.cancelledBy === 'system'
                                ? 'system'
                                : booking.cancelledBy || 'not recorded'}
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[14rem] truncate text-gray-700" title={booking.cancelReason || ''}>
                            {booking.cancelReason || '—'}
                          </td>
                          <td className="px-4 py-3 max-w-[14rem] text-gray-700">
                            {quote?.ruleName ? (
                              <>
                                <div className="truncate" title={quote.ruleName}>{quote.ruleName}</div>
                                <div className="text-xs text-gray-500">{quote.refundPercent}% refund</div>
                              </>
                            ) : quote ? (
                              'No rule matched'
                            ) : booking.refund ? (
                              `${booking.refund.refundPercent ?? 0}% (no rule)`
                            ) : (
                              'Not recorded'
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(booking.amountPaid ?? 0)}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {booking.refund ? formatMoney(booking.refund.refundAmount) : formatMoney(quote?.refundAmount ?? 0)}
                          </td>
                          <td className="px-4 py-3">
                            <RefundBadge status={booking.refund?.status} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 max-w-[16rem] truncate text-gray-700" title={ticketSummary(booking.tickets)}>
                            {ticketSummary(booking.tickets)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(booking.totalPrice ?? 0)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={booking.status} />
                          </td>
                          <td className="px-4 py-3">
                            <PaymentBadge status={booking.paymentStatus} />
                            {booking.paymentStatus === 'unverified' && ['confirmed', 'attended'].includes(String(booking.status)) && (
                              <span className="block text-xs text-amber-800 mt-1">Not revenue · needs resolving</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" onClick={() => setOpenId(booking._id)} aria-label={`View booking ${booking._id}`}>
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {data.pages}
              </span>
              <Button variant="secondary" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <BookingDetail bookingId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  )
}
