'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import RatingsSection from '@/components/support/RatingsSection'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  NoticeBar,
  Spinner,
  StatCard,
  api,
  formatDate,
  formatMoney,
  inputClass,
  type Notice,
} from '@/components/ui'
import { EventStatusBadge } from '@/components/catalogue/shared'

interface Person {
  _id: string
  role: string
  name: string
  phone: string
  email: string
  city: string
  genre: string
  kycStatus: string | null
  profileImage: string | null
}

interface Ticket {
  name: string
  blockName: string
  price: number
  quantity: number
  sold: number
  remaining: number
  startSeat: any
  endSeat: any
}

interface Detail {
  event: {
    _id: string
    name: string
    category: string
    subCategories: string[]
    languages: string[]
    description: string
    terms: string
    status: 'pending' | 'approved' | 'rejected'
    storedStatus: string | null
    artistResponse: string | null
    rejectionReason: string
    statusReason: string
    reviewedBy: string
    reviewedAt: string | null
    locationType: string
    location: { name?: string; address?: string; city?: string } | null
    venueText: string
    venue: { _id: string; name: string; location?: { address?: string; city?: string; state?: string }; capacity?: number; status: string } | null
    recordedDetails: { platform?: string; videoLink?: string; accessInstructions?: string } | null
    photographyContact: any
    startDate: string
    startTime: string
    endDate: string
    endTime: string
    bannerImage: string | null
    images: string[]
    hasPromotionalVideo: boolean
    createdAt: string | null
    updatedAt: string | null
  }
  creator: Person | null
  creatorMissing: boolean
  artists: Person[]
  tickets: Ticket[]
  ticketTotals: { quantity: number; sold: number; remaining: number; soldValue: number }
  bookings: { bookings: number; confirmedBookings: number; confirmedSeats: number; checkedInSeats: number; cancelledBookings: number }
  sales: Sales | null
  scannerStaff: { name: string }[]
  history: {
    _id: string
    action: string
    adminName: string
    adminEmail: string
    byOrganizer?: boolean
    detected?: boolean
    meta?: Record<string, any> | null
    before: any
    after: any
    reason: string
    createdAt: string
  }[]
  canManage: boolean
}

interface Bucket {
  bookings: number
  seats: number
  value: number
}

interface Sales {
  sold: Bucket
  checkedIn: Bucket
  cancelled: Bucket
  awaitingPayment: Bucket
  expired: Bucket
  other: Bucket
  byStatus: Record<string, number>
  byPayment: Record<string, number>
  refunds: {
    total: number
    processed: { count: number; amount: number; deductions: number }
    open: { count: number; amount: number }
    states: Record<string, { count: number; amount: number }>
  }
  inventory: { name: string; blockName: string; counter: number; booked: number; difference: number }[]
  recent: {
    _id: string
    userPhone: string
    status: string
    paymentStatus: string
    seats: number
    totalPrice: number
    checkedIn: boolean
    cancelledAt: string | null
    cancelReason: string
    createdAt: string | null
  }[]
}

const BOOKING_TONE: Record<string, 'green' | 'red' | 'amber' | 'gray' | 'blue'> = {
  confirmed: 'green',
  attended: 'blue',
  cancelled: 'red',
  pending_payment: 'amber',
  expired: 'gray',
}

const REFUND_LABEL: Record<string, string> = {
  requested: 'Requested',
  awaiting_second_approval: 'Awaiting second approval',
  approved: 'Approved',
  rejected: 'Rejected',
  processing: 'Processing',
  processed: 'Refunded',
  failed: 'Failed',
  disputed: 'Disputed',
}

const words = (value: string) => value.replace(/_/g, ' ')

/** "7:00 PM" or "19:00" as the HH:MM a time input needs. */
function toClock(value: string): string {
  const match = (value || '').trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$/)
  if (!match) return ''
  let hours = parseInt(match[1], 10)
  if (match[3]) {
    const pm = match[3].toLowerCase() === 'p'
    if (hours === 12) hours = pm ? 12 : 0
    else if (pm) hours += 12
  }
  return hours > 23 ? '' : `${String(hours).padStart(2, '0')}:${match[2]}`
}

function ticketLabel(ticket: { name: string; blockName: string }): string {
  return ticket.blockName ? `${ticket.name} (${ticket.blockName})` : ticket.name
}

/** Plain-language list of what changed between two ticket lists. */
function ticketChanges(before: any[], after: any[]): string[] {
  const key = (t: any) => `${String(t?.name || '').toLowerCase()}|${String(t?.blockName || '').toLowerCase()}`
  const old = new Map((before || []).map((t) => [key(t), t]))
  const next = new Map((after || []).map((t) => [key(t), t]))
  const lines: string[] = []
  for (const [k, ticket] of next) {
    const previous = old.get(k)
    if (!previous) {
      lines.push(`${ticketLabel(ticket)} added: ${ticket.quantity} at ${formatMoney(ticket.price)}`)
      continue
    }
    const parts: string[] = []
    if (previous.price !== ticket.price) parts.push(`price ${formatMoney(previous.price)} → ${formatMoney(ticket.price)}`)
    if (previous.quantity !== ticket.quantity) parts.push(`quantity ${previous.quantity} → ${ticket.quantity}`)
    if (previous.startSeat !== ticket.startSeat || previous.endSeat !== ticket.endSeat) {
      parts.push(`seats ${previous.startSeat ?? '—'} to ${previous.endSeat ?? '—'} → ${ticket.startSeat ?? '—'} to ${ticket.endSeat ?? '—'}`)
    }
    if (parts.length) lines.push(`${ticketLabel(ticket)}: ${parts.join(', ')}`)
  }
  for (const [k, ticket] of old) if (!next.has(k)) lines.push(`${ticketLabel(ticket)} removed`)
  return lines
}

type Kind = 'approved' | 'rejected' | 'pending' | 'delete'
const ACTION_LABEL: Record<Kind, string> = { approved: 'Approve', rejected: 'Reject', pending: 'Move back to pending', delete: 'Delete' }

const number = (value: number) => value.toLocaleString('en-IN')

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900 break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  )
}

const SCHEDULE_LABEL: Record<string, string> = { startDate: 'start date', startTime: 'start time', endDate: 'end date', endTime: 'end time' }

function historyLine(entry: Detail['history'][number]): string {
  if (entry.action === 'status_change') {
    const from = entry.before?.status ?? 'none'
    const to = entry.after?.status ?? 'unknown'
    return `Status changed from ${from} to ${to}`
  }
  if (entry.action === 'create') return 'Event created by an admin'
  if (entry.action === 'update' || entry.action === 'organizer_ticket_update') {
    const lines: string[] = []
    const after = entry.after || {}
    const before = entry.before || {}
    if (Array.isArray(after.tickets)) {
      const changes = ticketChanges(Array.isArray(before.tickets) ? before.tickets : [], after.tickets)
      lines.push(changes.length ? `Tickets changed. ${changes.join('; ')}` : 'Tickets saved without a change in price, quantity or seats')
    }
    const schedule = Object.keys(SCHEDULE_LABEL).filter((key) => key in after)
    if (schedule.length) {
      lines.push(`Schedule changed. ${schedule.map((key) => `${SCHEDULE_LABEL[key]} ${before[key] || 'not set'} → ${after[key] || 'not set'}`).join('; ')}`)
      if (entry.meta?.bookingsUpdated) lines.push(`${entry.meta.bookingsUpdated} live bookings now show the new date`)
    }
    if ('scannerStaff' in after) lines.push('Scanner staff changed')
    return lines.length ? lines.join('. ') : 'Event updated'
  }
  return entry.action
}

interface TicketDraft {
  name: string
  blockName: string
  price: string
  quantity: string
  startSeat: string
  endSeat: string
  sold: number
  existing: boolean
}

function TicketDialog({ eventId, tickets, onClose, onSaved }: { eventId: string; tickets: Ticket[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [rows, setRows] = useState<TicketDraft[]>(
    tickets.map((t) => ({
      name: t.name,
      blockName: t.blockName,
      price: String(t.price),
      quantity: String(t.quantity),
      startSeat: t.startSeat === null || t.startSeat === undefined ? '' : String(t.startSeat),
      endSeat: t.endSeat === null || t.endSeat === undefined ? '' : String(t.endSeat),
      sold: t.sold,
      existing: true,
    }))
  )
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const change = (index: number, key: keyof TicketDraft, value: string) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  const save = async () => {
    setBusy(true)
    setProblem('')
    try {
      const result = await api<{ message?: string }>(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        body: {
          action: 'update_tickets',
          reason: reason.trim(),
          tickets: rows.map((row) => ({
            name: row.name.trim(),
            blockName: row.blockName.trim(),
            price: row.price.trim() === '' ? NaN : Number(row.price),
            quantity: row.quantity.trim() === '' ? NaN : Number(row.quantity),
            startSeat: row.startSeat.trim() === '' ? null : Number(row.startSeat),
            endSeat: row.endSeat.trim() === '' ? null : Number(row.endSeat),
          })),
        },
      })
      onSaved(result.message || 'Tickets updated.')
    } catch (error: any) {
      setProblem(error.message || 'The tickets could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const cell = inputClass + ' !px-2 !py-1.5'

  return (
    <Modal
      open
      wide
      title="Edit ticket categories, prices and inventory"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!reason.trim()}>
            Save tickets
          </Button>
        </>
      }
    >
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}
      <p className="text-sm text-gray-600 mb-3">
        Sold counts cannot be edited. A quantity cannot go below what is sold, and a category with sales cannot be renamed or removed. A new price
        applies to bookings made from now on.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="ticket-editor">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Category</th>
              <th className="py-1 pr-2 font-medium">Block</th>
              <th className="py-1 pr-2 font-medium">Price (₹)</th>
              <th className="py-1 pr-2 font-medium">Quantity</th>
              <th className="py-1 pr-2 font-medium">First seat</th>
              <th className="py-1 pr-2 font-medium">Last seat</th>
              <th className="py-1 pr-2 font-medium text-right">Sold</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const locked = row.existing && row.sold > 0
              return (
                <tr key={index}>
                  <td className="py-1 pr-2">
                    <input aria-label={`Category name, row ${index + 1}`} className={cell} value={row.name} disabled={locked} onChange={(e) => change(index, 'name', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Block, row ${index + 1}`} className={cell} value={row.blockName} disabled={locked} onChange={(e) => change(index, 'blockName', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Price, row ${index + 1}`} type="number" min={0} step="0.01" className={cell} value={row.price} onChange={(e) => change(index, 'price', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Quantity, row ${index + 1}`} type="number" min={row.sold} step={1} className={cell} value={row.quantity} onChange={(e) => change(index, 'quantity', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`First seat, row ${index + 1}`} type="number" min={1} step={1} className={cell} value={row.startSeat} onChange={(e) => change(index, 'startSeat', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Last seat, row ${index + 1}`} type="number" min={1} step={1} className={cell} value={row.endSeat} onChange={(e) => change(index, 'endSeat', e.target.value)} />
                  </td>
                  <td className="py-1 pr-2 text-right text-gray-700">{row.sold}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label={`Remove row ${index + 1}`}
                      disabled={locked}
                      title={locked ? 'This category has sales and cannot be removed' : undefined}
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => setRows([...rows, { name: '', blockName: '', price: '', quantity: '', startSeat: '', endSeat: '', sold: 0, existing: false }])}
      >
        <Plus size={16} />
        Add category
      </Button>
      <div className="mt-4">
        <label htmlFor="ticket-reason" className="block text-sm font-medium text-gray-700 mb-1">
          Reason
        </label>
        <textarea
          id="ticket-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
          placeholder="Saved in the event history with the old and new values"
        />
      </div>
    </Modal>
  )
}

function ScheduleDialog({
  event,
  liveBookings,
  onClose,
  onSaved,
}: {
  event: Detail['event']
  liveBookings: number
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [startDate, setStartDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(event.startDate) ? event.startDate : '')
  const [startTime, setStartTime] = useState(toClock(event.startTime))
  const [endDate, setEndDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(event.endDate) ? event.endDate : '')
  const [endTime, setEndTime] = useState(toClock(event.endTime))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const save = async () => {
    setBusy(true)
    setProblem('')
    try {
      const result = await api<{ message?: string; bookingsUpdated?: number }>(`/api/admin/events/${event._id}`, {
        method: 'PATCH',
        body: { action: 'update_schedule', startDate, startTime, endDate: endDate || startDate, endTime, reason: reason.trim() },
      })
      onSaved(
        `${result.message || 'Schedule updated.'}${result.bookingsUpdated ? ` ${result.bookingsUpdated} live bookings now show the new date.` : ''}`
      )
    } catch (error: any) {
      setProblem(error.message || 'The schedule could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const field = (id: string, label: string, type: 'date' | 'time', value: string, set: (value: string) => void) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input id={id} type={type} value={value} onChange={(e) => set(e.target.value)} className={inputClass} />
    </div>
  )

  return (
    <Modal
      open
      title="Change the schedule"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!reason.trim() || !startDate || !startTime}>
            Save schedule
          </Button>
        </>
      }
    >
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}
      {liveBookings > 0 && (
        <NoticeBar
          notice={{
            type: 'info',
            text: `${liveBookings} confirmed bookings exist for this event. Their tickets will show the new date, but customers are not told automatically: send them a notice from Communications.`,
          }}
        />
      )}
      <div className="grid grid-cols-2 gap-4">
        {field('schedule-start-date', 'Start date', 'date', startDate, setStartDate)}
        {field('schedule-start-time', 'Start time', 'time', startTime, setStartTime)}
        {field('schedule-end-date', 'End date', 'date', endDate, setEndDate)}
        {field('schedule-end-time', 'End time', 'time', endTime, setEndTime)}
      </div>
      <p className="text-xs text-gray-500 mt-2">Times are India time.</p>
      <div className="mt-4">
        <label htmlFor="schedule-reason" className="block text-sm font-medium text-gray-700 mb-1">
          Reason
        </label>
        <textarea
          id="schedule-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
          placeholder="Saved in the event history with the old and new schedule"
        />
      </div>
    </Modal>
  )
}

export default function EventDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id || '')

  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [kind, setKind] = useState<Kind | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<'tickets' | 'schedule' | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/admin/events/${id}`))
      setLoadError('')
    } catch (error: any) {
      setLoadError(error.message || 'Could not load the event.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) load()
  }, [id, load])

  const run = async (reason: string) => {
    if (!kind || !data) return
    setBusy(true)
    try {
      if (kind === 'delete') {
        await api(`/api/events/${id}`, { method: 'DELETE', body: { reason } })
        router.push('/events')
        return
      }
      const result = await api<{ message?: string }>(`/api/events/${id}`, { method: 'PATCH', body: { status: kind, reason } })
      setNotice({ type: 'success', text: result.message || 'Status updated.' })
      setKind(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `Nothing was changed. ${error.message || ''}` })
      setKind(null)
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link
      href="/events"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
    >
      <ArrowLeft size={16} />
      All events
    </Link>
  )

  if (loading || !data) {
    return (
      <AdminShell title="Event" actions={back}>
        {loading ? <Spinner /> : <Card><EmptyState title="This event could not be opened" hint={loadError} /></Card>}
      </AdminShell>
    )
  }

  const { event, creator, artists, tickets, ticketTotals, bookings, sales, scannerStaff, history, canManage } = data
  const saved = (text: string) => {
    setEditing(null)
    setNotice({ type: 'success', text })
    load()
  }
  // Same rule as booking: sales close at the end of the event's last day, India time.
  const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(event.endDate) ? event.endDate : event.startDate
  const closesAt = /^\d{4}-\d{2}-\d{2}$/.test(lastDay) ? new Date(`${lastDay}T23:59:59+05:30`) : null
  const over = Boolean(closesAt && closesAt.getTime() < Date.now())
  const availability =
    event.status !== 'approved'
      ? { tone: 'amber' as const, text: event.status === 'rejected' ? 'Not on sale: the event was rejected' : 'Not on sale: waiting for approval' }
      : artists.length > 0 && event.artistResponse !== 'accepted'
      ? { tone: 'amber' as const, text: 'Not on sale: waiting for the artist' }
      : tickets.length === 0
      ? { tone: 'gray' as const, text: 'Not on sale: no tickets set up' }
      : over
      ? { tone: 'gray' as const, text: 'Closed: the event date has passed' }
      : ticketTotals.remaining === 0
      ? { tone: 'red' as const, text: 'Sold out' }
      : { tone: 'green' as const, text: `On sale: ${number(ticketTotals.remaining)} tickets available` }
  const reversing = kind !== null && kind !== 'delete' && event.status !== 'pending'
  const reasonRequired = kind === 'delete' || kind === 'rejected' || kind === 'pending' || reversing

  return (
    <AdminShell
      title={event.name || 'Untitled event'}
      subtitle={[event.category, event.startDate && formatDate(event.startDate)].filter(Boolean).join(' · ')}
      actions={
        <>
          {back}
          {canManage && event.status !== 'approved' && (
            <Button onClick={() => setKind('approved')}>
              <Check size={16} />
              Approve
            </Button>
          )}
          {canManage && event.status !== 'rejected' && (
            <Button variant="danger" onClick={() => setKind('rejected')}>
              <X size={16} />
              Reject
            </Button>
          )}
          {canManage && event.status !== 'pending' && (
            <Button variant="secondary" onClick={() => setKind('pending')}>
              <RotateCcw size={16} />
              Move back to pending
            </Button>
          )}
          {canManage && (
            <Button variant="secondary" onClick={() => setKind('delete')}>
              <Trash2 size={16} />
              Delete
            </Button>
          )}
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {event.status === 'rejected' && event.rejectionReason && (
        <NoticeBar notice={{ type: 'error', text: `Rejected: ${event.rejectionReason}` }} />
      )}
      {event.status === 'approved' && artists.length > 0 && event.artistResponse !== 'accepted' && (
        <NoticeBar
          notice={{
            type: 'info',
            text:
              event.artistResponse === 'rejected'
                ? 'The booked artist declined this event, so it is not shown in the apps.'
                : 'Approved, but not shown in the apps until the booked artist accepts.',
          }}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Tickets on sale" value={number(ticketTotals.quantity)} />
        <StatCard label="Tickets sold" value={number(ticketTotals.sold)} hint={sales ? `${formatMoney(sales.sold.value)} paid on ${number(sales.sold.bookings)} sold bookings` : `${formatMoney(ticketTotals.soldValue)} at today's list price`} tone="gray" />
        <StatCard label="Remaining" value={number(ticketTotals.remaining)} />
        <StatCard
          label="Seats checked in"
          value={number(bookings.checkedInSeats)}
          hint={`${number(bookings.confirmedSeats)} seats on ${number(bookings.confirmedBookings)} confirmed bookings`}
          tone="gray"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Section title="Event information" aside={<EventStatusBadge status={event.status} />}>
            {event.bannerImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.bannerImage} alt={`${event.name} banner`} className="w-full max-h-72 object-cover rounded-lg mb-4 bg-gray-100" />
            )}
            <dl>
              <Row label="Category">
                {event.category || '—'}
                {event.subCategories.length > 0 && <span className="text-gray-500"> · {event.subCategories.join(', ')}</span>}
              </Row>
              <Row label="Languages">{event.languages.length ? event.languages.join(', ') : '—'}</Row>
              <Row label="Starts">
                {event.startDate ? formatDate(event.startDate) : '—'} {event.startTime}
                {canManage && (
                  <button onClick={() => setEditing('schedule')} className="ml-3 text-sm text-teal font-medium hover:underline">
                    Change schedule
                  </button>
                )}
              </Row>
              <Row label="Ends">{event.endDate || event.endTime ? `${event.endDate ? formatDate(event.endDate) : ''} ${event.endTime}` : '—'}</Row>
              <Row label="Format">{event.locationType || '—'}</Row>
              <Row label="Location">
                {event.location?.name || event.venue?.name || event.venueText || '—'}
                {(event.location?.address || event.location?.city) && (
                  <span className="block text-gray-500">{[event.location?.address, event.location?.city].filter(Boolean).join(', ')}</span>
                )}
              </Row>
              <Row label="Linked venue">
                {event.venue ? (
                  <>
                    <Link href={`/venues/${event.venue._id}`} className="text-deep-blue hover:underline">
                      {event.venue.name}
                    </Link>
                    <span className="text-gray-500"> · capacity {number(event.venue.capacity || 0)}</span>
                    {event.venue.status === 'inactive' && <span className="ml-2"><Badge tone="gray">Inactive venue</Badge></span>}
                  </>
                ) : event.venueText ? (
                  <span>{event.venueText} <span className="text-gray-500">(typed in, not a managed venue)</span></span>
                ) : (
                  'Not linked to a managed venue'
                )}
              </Row>
              {event.recordedDetails && (
                <Row label="Recorded event">
                  {[event.recordedDetails.platform, event.recordedDetails.videoLink].filter(Boolean).join(' · ') || '—'}
                  {event.recordedDetails.accessInstructions && (
                    <span className="block text-gray-500">{event.recordedDetails.accessInstructions}</span>
                  )}
                </Row>
              )}
              <Row label="Description">
                <span className="whitespace-pre-wrap">{event.description || '—'}</span>
              </Row>
              <Row label="Terms">
                <span className="whitespace-pre-wrap">{event.terms || '—'}</span>
              </Row>
              <Row label="Submitted">{formatDate(event.createdAt, true)}</Row>
            </dl>
            {event.images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
                {event.images.map((image, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={image} alt={`${event.name} photo ${index + 1}`} className="h-24 w-full object-cover rounded-lg bg-gray-100" />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Ticket inventory"
            aside={
              <span className="flex items-center gap-3">
                <Badge tone={availability.tone}>{availability.text}</Badge>
                {canManage && (
                  <button onClick={() => setEditing('tickets')} className="text-sm text-teal font-medium hover:underline">
                    Edit tickets
                  </button>
                )}
              </span>
            }
          >
            {tickets.length === 0 ? (
              <EmptyState title="No tickets set up" hint="The organiser adds ticket categories in the organiser app." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Category</th>
                      <th className="py-2 pr-4 font-medium">Block</th>
                      <th className="py-2 pr-4 font-medium">Seats</th>
                      <th className="py-2 pr-4 font-medium text-right">Price</th>
                      <th className="py-2 pr-4 font-medium text-right">Quantity</th>
                      <th className="py-2 pr-4 font-medium text-right">Sold</th>
                      <th className="py-2 font-medium text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.map((ticket, index) => (
                      <tr key={index}>
                        <td className="py-2 pr-4 font-medium text-gray-900">{ticket.name || '—'}</td>
                        <td className="py-2 pr-4">{ticket.blockName || '—'}</td>
                        <td className="py-2 pr-4">
                          {ticket.startSeat !== null && ticket.endSeat !== null ? `${ticket.startSeat} to ${ticket.endSeat}` : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right">{formatMoney(ticket.price)}</td>
                        <td className="py-2 pr-4 text-right">{number(ticket.quantity)}</td>
                        <td className="py-2 pr-4 text-right">{number(ticket.sold)}</td>
                        <td className="py-2 text-right">{number(ticket.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 font-semibold text-deep-blue">
                    <tr>
                      <td className="py-2 pr-4" colSpan={4}>
                        Total
                      </td>
                      <td className="py-2 pr-4 text-right">{number(ticketTotals.quantity)}</td>
                      <td className="py-2 pr-4 text-right">{number(ticketTotals.sold)}</td>
                      <td className="py-2 text-right">{number(ticketTotals.remaining)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">
              Bookings: {number(bookings.bookings)} in total, {number(bookings.confirmedBookings)} confirmed, {number(bookings.cancelledBookings)} cancelled.
            </p>
          </Section>

          <Section title="Sales, cancellations and refunds">
            {!sales ? (
              <p className="text-sm text-gray-500">Your role cannot see bookings, so sales figures are not shown.</p>
            ) : sales.sold.bookings + sales.cancelled.bookings + sales.awaitingPayment.bookings + sales.expired.bookings + sales.other.bookings === 0 ? (
              <EmptyState title="No bookings yet" hint="Bookings made in the apps and on the website for this event appear here." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="sales-monitor">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Booking status</th>
                        <th className="py-2 pr-4 font-medium text-right">Bookings</th>
                        <th className="py-2 pr-4 font-medium text-right">Seats</th>
                        <th className="py-2 font-medium text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(
                        [
                          ['Sold (confirmed and attended)', sales.sold],
                          ['Checked in at the gate', sales.checkedIn],
                          ['Cancelled', sales.cancelled],
                          ['Waiting for payment', sales.awaitingPayment],
                          ['Expired without payment', sales.expired],
                          ...(sales.other.bookings ? ([['Other', sales.other]] as [string, Bucket][]) : []),
                        ] as [string, Bucket][]
                      ).map(([label, bucket]) => (
                        <tr key={label}>
                          <td className="py-2 pr-4 text-gray-900">{label}</td>
                          <td className="py-2 pr-4 text-right">{number(bucket.bookings)}</td>
                          <td className="py-2 pr-4 text-right">{number(bucket.seats)}</td>
                          <td className="py-2 text-right">{formatMoney(bucket.value)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2 pr-4 text-gray-900">Refunded to customers</td>
                        <td className="py-2 pr-4 text-right">{number(sales.refunds.processed.count)}</td>
                        <td className="py-2 pr-4 text-right">—</td>
                        <td className="py-2 text-right">{formatMoney(sales.refunds.processed.amount)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-gray-900">Refunds still open</td>
                        <td className="py-2 pr-4 text-right">{number(sales.refunds.open.count)}</td>
                        <td className="py-2 pr-4 text-right">—</td>
                        <td className="py-2 text-right">{formatMoney(sales.refunds.open.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-3" data-testid="sales-breakdown">
                  Payment status: {Object.entries(sales.byPayment).map(([key, count]) => `${words(key)} ${count}`).join(', ') || 'none'}.
                  {sales.refunds.total > 0 &&
                    ` Refund requests: ${Object.entries(sales.refunds.states)
                      .map(([key, entry]) => `${(REFUND_LABEL[key] || words(key)).toLowerCase()} ${entry.count} (${formatMoney(entry.amount)})`)
                      .join(', ')}. Kept under the refund rule on processed refunds: ${formatMoney(sales.refunds.processed.deductions)}.`}
                </p>

                {sales.inventory.some((line) => line.difference !== 0) && (
                  <div className="mt-3" data-testid="inventory-check">
                    <NoticeBar
                      notice={{
                        type: 'info',
                        text: `Inventory check: ${sales.inventory
                          .filter((line) => line.difference !== 0)
                          .map((line) => `${ticketLabel(line)} shows ${line.counter} sold on the event but ${line.booked} seats on live bookings`)
                          .join('; ')}. Seats on bookings waiting for payment are held and count as sold until they expire.`,
                      }}
                    />
                  </div>
                )}

                <h3 className="text-sm font-semibold text-deep-blue mt-5 mb-2">Latest bookings</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="recent-bookings">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Booked on</th>
                        <th className="py-2 pr-4 font-medium">Customer</th>
                        <th className="py-2 pr-4 font-medium text-right">Seats</th>
                        <th className="py-2 pr-4 font-medium text-right">Amount</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 font-medium">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sales.recent.map((booking) => (
                        <tr key={booking._id}>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDate(booking.createdAt, true)}</td>
                          <td className="py-2 pr-4">{booking.userPhone || '—'}</td>
                          <td className="py-2 pr-4 text-right">{booking.seats}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(booking.totalPrice)}</td>
                          <td className="py-2 pr-4">
                            <Badge tone={BOOKING_TONE[booking.status] || 'gray'}>{words(booking.status) || 'unknown'}</Badge>
                            {booking.checkedIn && <span className="ml-2 text-xs text-gray-500">checked in</span>}
                            {booking.status === 'cancelled' && booking.cancelReason && (
                              <span className="block text-xs text-gray-500">{booking.cancelReason}</span>
                            )}
                          </td>
                          <td className="py-2">{words(booking.paymentStatus) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Showing the latest {sales.recent.length} of {number(bookings.bookings)} bookings. The full list, with search, is under{' '}
                  <Link href="/bookings" className="text-teal underline">
                    Bookings
                  </Link>{' '}
                  (filter by this event); refunds are handled under{' '}
                  <Link href="/finance/refunds" className="text-teal underline">
                    Finance, Refunds
                  </Link>
                  .
                </p>
              </>
            )}
          </Section>

          <RatingsSection subject="event" id={id} />

          <Section title="History of decisions and changes">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">
                {event.reviewedAt
                  ? `Last reviewed ${formatDate(event.reviewedAt, true)}${event.reviewedBy ? ` by ${event.reviewedBy}` : ''}.`
                  : 'No decision or change has been recorded for this event yet.'}
              </p>
            ) : (
              <ol className="space-y-3">
                {history.map((entry) => (
                  <li key={entry._id} className="border-l-2 border-gray-200 pl-3">
                    <p className="text-sm text-gray-900">{historyLine(entry)}</p>
                    {entry.reason && <p className="text-sm text-gray-700">Reason: {entry.reason}</p>}
                    <p className="text-xs text-gray-500">
                      {entry.adminName} · {entry.detected ? 'on or before ' : ''}
                      {formatDate(entry.createdAt, true)}
                    </p>
                    {entry.detected && (
                      <p className="text-xs text-gray-500">
                        Found by comparing the tickets now on the event with the last ticket list in this history. Changes made in the organiser app
                        are not logged one by one.
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Created by">
            {creator ? (
              <dl>
                <Row label="Name">
                  <Link href={creator.role === 'artist' ? `/artists/${creator._id}` : `/organizers/${creator._id}`} className="text-deep-blue hover:underline">
                    {creator.name || 'Unnamed'}
                  </Link>
                </Row>
                <Row label="Account type">{creator.role === 'artist' ? 'Artist' : 'Organiser'}</Row>
                <Row label="Phone">{creator.phone || '—'}</Row>
                <Row label="Email">{creator.email || '—'}</Row>
                <Row label="City">{creator.city || '—'}</Row>
                <Row label="KYC">
                  <Badge tone={creator.kycStatus === 'approved' ? 'green' : creator.kycStatus === 'rejected' ? 'red' : 'amber'}>
                    {creator.kycStatus || 'not submitted'}
                  </Badge>
                </Row>
              </dl>
            ) : (
              <p className="text-sm text-gray-500">
                {data.creatorMissing
                  ? 'The organiser or artist account that created this event no longer exists.'
                  : 'This event has no creator recorded.'}
              </p>
            )}
          </Section>

          <Section title="Performing artists">
            {artists.length === 0 ? (
              <p className="text-sm text-gray-500">No artists were booked for this event.</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100">
                  {artists.map((artist) => (
                    <li key={artist._id} className="py-2 text-sm">
                      <Link href={`/artists/${artist._id}`} className="text-deep-blue hover:underline">
                        {artist.name || 'Unnamed'}
                      </Link>
                      <span className="block text-gray-500">{[artist.genre, artist.city, artist.phone].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mt-2">Artist response: {event.artistResponse || 'not answered yet'}</p>
              </>
            )}
          </Section>

          <Section title="Scanner staff">
            {scannerStaff.length === 0 ? (
              <p className="text-sm text-gray-500">No gate staff were added for this event.</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-gray-900 space-y-1">
                {scannerStaff.map((staff, index) => (
                  <li key={index}>{staff.name || 'Unnamed'}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500 mt-3">Staff sign-in details are set by the organiser and are never shown here.</p>
          </Section>

          <Section title="Review">
            <dl>
              <Row label="Status">
                <EventStatusBadge status={event.status} />
                {event.storedStatus && event.storedStatus !== event.status && (
                  <span className="block text-xs text-gray-500 mt-1">Stored as &quot;{event.storedStatus}&quot;, treated as pending.</span>
                )}
              </Row>
              <Row label="Reviewed by">{event.reviewedBy || '—'}</Row>
              <Row label="Reviewed at">{formatDate(event.reviewedAt, true)}</Row>
              <Row label="Reason given">{event.statusReason || event.rejectionReason || '—'}</Row>
            </dl>
          </Section>
        </div>
      </div>

      {editing === 'tickets' && <TicketDialog eventId={event._id} tickets={tickets} onClose={() => setEditing(null)} onSaved={saved} />}
      {editing === 'schedule' && (
        <ScheduleDialog event={event} liveBookings={bookings.confirmedBookings} onClose={() => setEditing(null)} onSaved={saved} />
      )}

      <ConfirmDialog
        open={kind !== null}
        title={kind ? `${ACTION_LABEL[kind]} event` : ''}
        message={
          kind === 'delete' ? (
            <>
              <p>
                This permanently removes <strong>{event.name}</strong>, its tickets and its scanner staff. It cannot be undone.
              </p>
              {bookings.confirmedBookings > 0 && (
                <p className="mt-2 text-red-700">
                  {number(bookings.confirmedBookings)} confirmed bookings ({number(bookings.confirmedSeats)} seats) exist for this event. They stay in the
                  system, so settle cancellations and refunds first.
                </p>
              )}
            </>
          ) : kind === 'rejected' ? (
            'The event will not be shown in the apps or on the website. The reason is saved on the event.'
          ) : kind === 'approved' ? (
            reversing ? 'This reverses the earlier rejection. Say why.' : 'The event will be published.'
          ) : (
            'The event goes back to the pending queue and is hidden from the public list until it is decided again.'
          )
        }
        confirmLabel={kind ? ACTION_LABEL[kind] : 'Confirm'}
        danger={kind === 'delete' || kind === 'rejected'}
        askReason
        reasonRequired={reasonRequired}
        busy={busy}
        onConfirm={run}
        onClose={() => setKind(null)}
      />
    </AdminShell>
  )
}
