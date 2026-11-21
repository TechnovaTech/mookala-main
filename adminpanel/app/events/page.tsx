'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Download, Eye, RotateCcw, Trash2, X } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  NoticeBar,
  Spinner,
  StatCard,
  api,
  formatDate,
  inputClass,
  type Notice,
} from '@/components/ui'
import { EventStatusBadge, SearchInput, TabButtons, useDebounced } from '@/components/catalogue/shared'
import JatraPanel from '@/components/catalogue/JatraPanel'

interface EventRow {
  _id: string
  name: string
  category: string
  status: 'pending' | 'approved' | 'rejected'
  storedStatus: string | null
  creator: { _id: string; role: string; name: string; phone: string } | null
  creatorRole: string | null
  startDate: string
  startTime: string
  venueName: string
  city: string
  ticketCategories: number
  capacity: number
  sold: number
  hasArtists: boolean
  artistResponse: string | null
  rejectionReason: string
  reviewedBy: string
  reviewedAt: string | null
  createdAt: string | null
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  ticketsOnSale: number
  ticketsSold: number
  seatsCheckedIn: number
}

type Action = { event: EventRow; kind: 'approved' | 'rejected' | 'pending' | 'delete' }

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
]

const ACTION_LABEL = { approved: 'Approve', rejected: 'Reject', pending: 'Move back to pending', delete: 'Delete' }
const LIMIT = 20

const number = (value: number) => value.toLocaleString('en-IN')

export default function EventsPage() {
  const [tab, setTab] = useState<'events' | 'jatra'>('events')

  const [items, setItems] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<Stats | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const query = useDebounced(search)

  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (query) params.set('q', query)
      if (category) params.set('category', category)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return params.toString()
    },
    [status, query, category, from, to]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<any>('/api/admin/events?' + queryString({ page: String(page), limit: String(LIMIT) }))
      setItems(data.items || [])
      setTotal(data.total || 0)
      setStatusCounts(data.statusCounts || {})
      setStats(data.stats || null)
      setCategories(data.categories || [])
      setCanManage(Boolean(data.canManage))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load events.' })
    } finally {
      setLoading(false)
    }
  }, [queryString, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [status, query, category, from, to])

  const runAction = async (reason: string) => {
    if (!action) return
    setBusy(true)
    const { event, kind } = action
    try {
      if (kind === 'delete') {
        await api(`/api/events/${event._id}`, { method: 'DELETE', body: { reason } })
        setNotice({ type: 'success', text: `"${event.name}" was deleted.` })
      } else {
        const data = await api<{ message?: string }>(`/api/events/${event._id}`, { method: 'PATCH', body: { status: kind, reason } })
        setNotice({ type: 'success', text: `"${event.name}": ${data.message || 'status updated.'}` })
      }
      setAction(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `"${event.name}" was not changed. ${error.message || ''}` })
      setAction(null)
    } finally {
      setBusy(false)
    }
  }

  const hasFilters = Boolean(query || category || from || to)
  const pages = Math.max(1, Math.ceil(total / LIMIT))

  const dialog = (() => {
    if (!action) return null
    const { event, kind } = action
    const reversing = kind !== 'delete' && event.status !== 'pending'
    if (kind === 'delete') {
      return {
        message: (
          <>
            <p>
              This permanently removes <strong>{event.name}</strong>, its tickets and its scanner staff. It cannot be undone.
            </p>
            {event.sold > 0 && (
              <p className="mt-2 text-red-700">
                {number(event.sold)} tickets are recorded as sold. Bookings for this event stay in the system, so settle cancellations and refunds first.
              </p>
            )}
          </>
        ),
        reasonRequired: true,
        danger: true,
      }
    }
    if (kind === 'rejected') {
      return {
        message: reversing
          ? `"${event.name}" is currently approved and visible in the apps. Rejecting it removes it from the public list. The reason is saved on the event.`
          : `"${event.name}" will not be published. The reason is saved on the event.`,
        reasonRequired: true,
        danger: true,
      }
    }
    if (kind === 'approved') {
      return {
        message: reversing
          ? `"${event.name}" was rejected earlier. Approving it publishes it${event.hasArtists ? ' once the booked artists accept' : ''}. Say why the decision is being reversed.`
          : `"${event.name}" will be published${event.hasArtists ? ' once the booked artists accept' : ' in the apps and on the website'}.`,
        reasonRequired: reversing,
        danger: false,
      }
    }
    return {
      message: `"${event.name}" goes back to the pending queue and is removed from the public list until it is decided again.`,
      reasonRequired: true,
      danger: false,
    }
  })()

  return (
    <AdminShell
      title="Events"
      subtitle="Review, approve and manage events and Jatra registrations"
      actions={
        tab === 'events' ? (
          <a
            href={'/api/admin/events?' + queryString({ export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
        ) : undefined
      }
    >
      <TabButtons
        tabs={[
          { key: 'events', label: 'Events' },
          { key: 'jatra', label: 'Jatra registrations' },
        ]}
        current={tab}
        onChange={setTab}
      />

      {tab === 'jatra' ? (
        <JatraPanel canManage={canManage} />
      ) : (
        <>
          <NoticeBar notice={notice} onClose={() => setNotice(null)} />

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
            <StatCard label="Total events" value={stats ? number(stats.total) : '—'} />
            <StatCard label="Pending review" value={stats ? number(stats.pending) : '—'} />
            <StatCard label="Approved" value={stats ? number(stats.approved) : '—'} />
            <StatCard label="Rejected" value={stats ? number(stats.rejected) : '—'} />
            <StatCard
              label="Tickets sold"
              value={stats ? number(stats.ticketsSold) : '—'}
              hint={stats ? `of ${number(stats.ticketsOnSale)} on sale` : undefined}
              tone="gray"
            />
            <StatCard label="Seats checked in" value={stats ? number(stats.seatsCheckedIn) : '—'} hint="scanned at the gate" tone="gray" />
          </div>

          <Card>
            <div className="p-4 border-b border-gray-200 space-y-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
                {STATUS_TABS.map((option) => (
                  <button
                    key={option.value || 'all'}
                    role="tab"
                    aria-selected={status === option.value}
                    onClick={() => setStatus(option.value)}
                    className={`px-3 py-1.5 rounded-full text-sm ${
                      status === option.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label} ({statusCounts[option.value || 'all'] || 0})
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <SearchInput id="event-search" value={search} onChange={setSearch} placeholder="Search by event, organiser, artist, venue or city..." />
                <div>
                  <label htmlFor="event-category" className="block text-xs text-gray-500 mb-1">
                    Category
                  </label>
                  <select id="event-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass + ' w-auto'}>
                    <option value="">All categories</option>
                    {categories.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="event-from" className="block text-xs text-gray-500 mb-1">
                    Event date from
                  </label>
                  <input id="event-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass + ' w-auto'} />
                </div>
                <div>
                  <label htmlFor="event-to" className="block text-xs text-gray-500 mb-1">
                    Event date to
                  </label>
                  <input id="event-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass + ' w-auto'} />
                </div>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearch('')
                      setCategory('')
                      setFrom('')
                      setTo('')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No events match these filters' : status ? `No ${status} events` : 'No events yet'}
                hint={
                  hasFilters
                    ? 'Try a different search, category or date range.'
                    : 'Events are created by organisers and artists in the organiser app and arrive here as pending.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 font-medium">Created by</th>
                      <th className="px-4 py-3 font-medium">Event date</th>
                      <th className="px-4 py-3 font-medium">Venue</th>
                      <th className="px-4 py-3 font-medium">Tickets sold</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((event) => (
                      <tr key={event._id} className="align-top hover:bg-gray-50">
                        <td className="px-4 py-3 max-w-xs">
                          <Link href={`/events/${event._id}`} className="font-medium text-deep-blue hover:underline">
                            {event.name || 'Untitled event'}
                          </Link>
                          <p className="text-gray-500">{event.category || 'No category'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {event.creator ? (
                            <>
                              <p className="text-gray-900">{event.creator.name || 'Unnamed'}</p>
                              <p className="text-xs text-gray-500">
                                {event.creator.role === 'artist' ? 'Artist' : 'Organiser'}
                                {event.creator.phone ? ` · ${event.creator.phone}` : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-gray-500">Account not found</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {event.startDate ? formatDate(event.startDate) : '—'}
                          {event.startTime && <span className="block text-gray-500">{event.startTime}</span>}
                        </td>
                        <td className="px-4 py-3">
                          {event.venueName || '—'}
                          {event.city && <span className="block text-gray-500">{event.city}</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {event.ticketCategories === 0 ? (
                            <span className="text-gray-500">No tickets set up</span>
                          ) : (
                            <>
                              {number(event.sold)} / {number(event.capacity)}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <EventStatusBadge status={event.status} />
                          {event.storedStatus && event.storedStatus !== event.status && (
                            <p className="text-xs text-gray-500 mt-1">Stored as &quot;{event.storedStatus}&quot;</p>
                          )}
                          {event.status === 'approved' && event.hasArtists && event.artistResponse !== 'accepted' && (
                            <div className="mt-1">
                              <Badge tone={event.artistResponse === 'rejected' ? 'red' : 'blue'}>
                                {event.artistResponse === 'rejected' ? 'Artist declined' : 'Waiting for artist'}
                              </Badge>
                            </div>
                          )}
                          {event.status === 'rejected' && event.rejectionReason && (
                            <p className="text-xs text-red-700 mt-1 max-w-[14rem]">Reason: {event.rejectionReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(event.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/events/${event._id}`}
                              aria-label={`View ${event.name}`}
                              title="View details"
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                            >
                              <Eye size={16} />
                            </Link>
                            {canManage && (
                              <>
                                {event.status !== 'approved' && (
                                  <button
                                    onClick={() => setAction({ event, kind: 'approved' })}
                                    aria-label={`Approve ${event.name}`}
                                    title="Approve"
                                    className="p-2 rounded-lg text-green-700 hover:bg-green-50"
                                  >
                                    <Check size={16} />
                                  </button>
                                )}
                                {event.status !== 'rejected' && (
                                  <button
                                    onClick={() => setAction({ event, kind: 'rejected' })}
                                    aria-label={`Reject ${event.name}`}
                                    title="Reject"
                                    className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                                {event.status !== 'pending' && (
                                  <button
                                    onClick={() => setAction({ event, kind: 'pending' })}
                                    aria-label={`Move ${event.name} back to pending`}
                                    title="Move back to pending"
                                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                                  >
                                    <RotateCcw size={16} />
                                  </button>
                                )}
                                <button
                                  onClick={() => setAction({ event, kind: 'delete' })}
                                  aria-label={`Delete ${event.name}`}
                                  title="Delete"
                                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
                <span>
                  Showing {(page - 1) * LIMIT + 1} to {Math.min(page * LIMIT, total)} of {number(total)}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span>
                    Page {page} of {pages}
                  </span>
                  <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <ConfirmDialog
            open={Boolean(action)}
            title={action ? `${ACTION_LABEL[action.kind]} event` : ''}
            message={dialog?.message || ''}
            confirmLabel={action ? ACTION_LABEL[action.kind] : 'Confirm'}
            danger={dialog?.danger}
            askReason
            reasonRequired={dialog?.reasonRequired}
            busy={busy}
            onConfirm={runAction}
            onClose={() => setAction(null)}
          />
        </>
      )}
    </AdminShell>
  )
}
