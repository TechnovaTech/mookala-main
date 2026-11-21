'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { AccountBadge, KycBadge, Pagination, SectionTitle, qs, readQueryParam, selectClass, useDebounced, type KycView } from '@/components/artists/shared'

type DayStatus = 'available' | 'unavailable' | 'booked' | 'not_set'

interface CalendarDay {
  date: string
  status: DayStatus
  source: 'event' | 'artist' | 'admin' | 'none'
  note: string
  reason: string
  events: { _id: string; name: string; relation: string }[]
  updatedBy: string | null
  updatedAt: string | null
}

interface ArtistSummary {
  _id: string
  name: string
  phone: string
  city: string
  genre: string
  kyc: KycView
  accountStatus: string
}

interface CalendarResponse {
  month: string
  from: string
  to: string
  today: string
  artist: ArtistSummary
  days: CalendarDay[]
  summary: Record<DayStatus, number>
  overrides: { _id: string; adminName: string; before: Record<string, string>; after: Record<string, string>; reason: string; createdAt: string }[]
  canManage: boolean
}

interface ListRow extends ArtistSummary {
  available: number
  unavailable: number
  booked: number
  not_set: number
}

interface ListResponse {
  month: string
  today: string
  items: ListRow[]
  total: number
  page: number
  limit: number
  canManage: boolean
}

const STATUS_LABEL: Record<DayStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  booked: 'Booked',
  not_set: 'Not set',
}

// Full class names so Tailwind generates them.
const CELL_CLASS: Record<DayStatus, string> = {
  available: 'bg-green-50 border-green-300 text-green-900',
  unavailable: 'bg-red-50 border-red-300 text-red-900',
  booked: 'bg-blue-50 border-blue-300 text-blue-900',
  not_set: 'bg-white border-gray-200 text-gray-700',
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + by, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function currentMonth(): string {
  // India time, so the calendar opens on the right month late in the evening UTC.
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7)
}

function sourceText(day: CalendarDay): string {
  if (day.source === 'event') return 'Accepted event'
  if (day.source === 'admin') return `Set by an admin${day.updatedBy ? ` (${day.updatedBy})` : ''}`
  if (day.source === 'artist') return 'Set by the artist in the app'
  return 'Nothing recorded'
}

function MonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" className="!px-2 !py-1.5" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-semibold text-deep-blue min-w-[9rem] text-center" data-testid="month-label">
        {monthLabel(month)}
      </span>
      <Button variant="secondary" className="!px-2 !py-1.5" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        <ChevronRight size={16} />
      </Button>
    </div>
  )
}

function OverrideDialog({
  artist,
  day,
  monthEnd,
  onClose,
  onSaved,
}: {
  artist: ArtistSummary
  day: CalendarDay
  monthEnd: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [status, setStatus] = useState<string>(day.status === 'not_set' ? 'unavailable' : day.status)
  const [until, setUntil] = useState(day.date)
  const [note, setNote] = useState(day.note)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const save = async () => {
    setBusy(true)
    setProblem('')
    try {
      const result = await api<{ changed: number }>('/api/admin/artists/availability', {
        method: 'POST',
        body: { artistId: artist._id, from: day.date, to: until || day.date, status, note: note.trim(), reason: reason.trim() },
      })
      onSaved(`${result.changed} ${result.changed === 1 ? 'day was' : 'days were'} updated for ${artist.name || 'the artist'}.`)
    } catch (error: any) {
      setProblem(error.message || 'The override could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Change availability, ${formatDate(day.date)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!reason.trim() || !until || until < day.date}>
            Save override
          </Button>
        </>
      }
    >
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}
      <p className="text-sm text-gray-600 mb-4">
        Currently <strong>{STATUS_LABEL[day.status].toLowerCase()}</strong>. {sourceText(day)}.
        {day.reason ? ` Reason given: ${day.reason}` : ''}
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor="override-status" className="block text-sm font-medium text-gray-700 mb-1">
            New status
          </label>
          <select id="override-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass + ' w-full'}>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
            <option value="booked">Booked (outside Mookalaa)</option>
            <option value="clear">Not set (remove what is recorded)</option>
          </select>
        </div>
        <div>
          <label htmlFor="override-until" className="block text-sm font-medium text-gray-700 mb-1">
            Apply until (leave as is for one day)
          </label>
          <input
            id="override-until"
            type="date"
            min={day.date}
            max={monthEnd}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="override-note" className="block text-sm font-medium text-gray-700 mb-1">
            Note shown to the artist (optional)
          </label>
          <input id="override-note" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="override-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <textarea
            id="override-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="Saved in the activity log with the old and new status"
          />
        </div>
      </div>
    </Modal>
  )
}

function ArtistCalendar({ artistId, month, onMonth, onBack }: { artistId: string; month: string; onMonth: (month: string) => void; onBack: () => void }) {
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [editing, setEditing] = useState<CalendarDay | null>(null)
  const [selected, setSelected] = useState<CalendarDay | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<CalendarResponse>(`/api/admin/artists/availability?${qs({ artistId, month })}`))
      setProblem('')
    } catch (error: any) {
      setProblem(error.message || 'Could not load the calendar.')
    } finally {
      setLoading(false)
    }
  }, [artistId, month])

  useEffect(() => {
    load()
  }, [load])

  if (!data) {
    return loading ? (
      <Spinner />
    ) : (
      <Card>
        <EmptyState title={problem || 'The calendar could not be opened'} hint="Go back to the list and choose the artist again." />
        <div className="text-center pb-6">
          <Button variant="secondary" onClick={onBack}>
            Back to all artists
          </Button>
        </div>
      </Card>
    )
  }

  const { artist, days, summary } = data
  // Monday-first grid: empty cells before the 1st.
  const firstWeekday = (new Date(data.from + 'T00:00:00Z').getUTCDay() + 6) % 7
  const cells: (CalendarDay | null)[] = [...Array(firstWeekday).fill(null), ...days]

  const open = (day: CalendarDay) => {
    setSelected(day)
    if (data.canManage && day.source !== 'event') setEditing(day)
  }

  return (
    <>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-teal hover:underline mb-3">
        <ArrowLeft size={16} /> All artists
      </button>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-deep-blue">
              <Link href={`/artists/${artist._id}`} className="hover:underline">
                {artist.name || 'No name yet'}
              </Link>
            </h2>
            <p className="text-sm text-gray-600">{[artist.genre, artist.city, artist.phone].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <KycBadge kyc={artist.kyc} />
              <AccountBadge status={artist.accountStatus} />
            </div>
          </div>
          <MonthNav month={month} onChange={onMonth} />
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5" data-testid="month-summary">
          <Badge tone="green">{summary.available} available</Badge>
          <Badge tone="red">{summary.unavailable} unavailable</Badge>
          <Badge tone="blue">{summary.booked} booked</Badge>
          <Badge tone="gray">{summary.not_set} not set</Badge>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-7 gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-1">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5" data-testid="calendar-grid">
          {cells.map((day, index) =>
            day === null ? (
              <div key={`blank-${index}`} />
            ) : (
              <button
                key={day.date}
                type="button"
                data-date={day.date}
                data-status={day.status}
                onClick={() => open(day)}
                aria-label={`${formatDate(day.date)}: ${STATUS_LABEL[day.status]}`}
                className={`min-h-[84px] text-left border rounded-lg p-2 hover:shadow focus:outline-none focus:ring-2 focus:ring-teal/40 ${CELL_CLASS[day.status]} ${
                  day.date === data.today ? 'ring-2 ring-deep-blue/40' : ''
                }`}
              >
                <span className="block text-sm font-semibold">{Number(day.date.slice(8))}</span>
                <span className="block text-xs">{STATUS_LABEL[day.status]}</span>
                {day.events.length > 0 && <span className="block text-xs truncate">{day.events.map((event) => event.name).join(', ')}</span>}
                {day.source === 'admin' && <span className="block text-[11px] text-gray-600">admin</span>}
              </button>
            )
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Dates are India dates. A day with an accepted event is always booked and cannot be changed here: change the event instead.
          {data.canManage ? ' Select any other day to change it; a reason is required and the change is recorded.' : ''}
        </p>
      </Card>

      {selected && !editing && (
        <Card className="mb-4 p-5">
          <div data-testid="day-detail">
          <h3 className="text-sm font-semibold text-deep-blue">
            {formatDate(selected.date)}: {STATUS_LABEL[selected.status]}
          </h3>
          <p className="text-sm text-gray-700 mt-1">{sourceText(selected)}.</p>
          {selected.events.map((event) => (
            <p key={event._id} className="text-sm mt-1">
              <Link href={`/events/${event._id}`} className="text-deep-blue hover:underline">
                {event.name}
              </Link>
              <span className="text-gray-500"> · {event.relation === 'created' ? 'created by the artist' : 'invited and accepted'}</span>
            </p>
          ))}
          {selected.note && <p className="text-sm text-gray-700 mt-1">Note: {selected.note}</p>}
          {selected.reason && <p className="text-sm text-gray-700 mt-1">Reason: {selected.reason}</p>}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Admin changes to this calendar</SectionTitle>
        {data.overrides.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6">No admin has changed this artist&apos;s availability.</p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="override-history">
            {data.overrides.map((entry) => {
              const dates = Object.keys(entry.after).sort()
              const first = dates[0]
              return (
                <li key={entry._id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {dates.length === 1 ? first : `${first} to ${dates[dates.length - 1]} (${dates.length} days)`}:{' '}
                      {String(entry.before[first] || 'not_set').replace('_', ' ')} → {String(entry.after[first] || '').replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(entry.createdAt, true)}</span>
                  </div>
                  <p className="text-gray-600">By {entry.adminName}</p>
                  {entry.reason && <p className="text-gray-700 mt-1">Reason: {entry.reason}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <OverrideDialog
          artist={artist}
          day={editing}
          monthEnd={data.to}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null)
            setSelected(null)
            setNotice({ type: 'success', text })
            load()
          }}
        />
      )}
    </>
  )
}

function ArtistPicker({ month, onMonth, onPick }: { month: string; onMonth: (month: string) => void; onPick: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [q, month])

  useEffect(() => {
    const current = ++requestId.current
    setLoading(true)
    api<ListResponse>(`/api/admin/artists/availability?${qs({ month, q, page, limit: 25 })}`)
      .then((result) => {
        if (current !== requestId.current) return
        setData(result)
        setNotice(null)
      })
      .catch((error) => {
        if (current === requestId.current) setNotice({ type: 'error', text: error.message || 'Could not load artists.' })
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false)
      })
  }, [month, q, page])

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <label htmlFor="availability-search" className="sr-only">
              Filter by artist
            </label>
            <input
              id="availability-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by artist name, phone, city or genre"
              className={inputClass + ' pl-9'}
            />
          </div>
          <MonthNav month={month} onChange={onMonth} />
        </div>

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={q ? 'No artist matches this search' : 'No artists yet'}
            hint={q ? 'Check the spelling or clear the search.' : 'Artists appear here once they sign up in the artist app.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">Artist</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium">KYC</th>
                    <th className="px-4 py-3 font-medium text-right">Available</th>
                    <th className="px-4 py-3 font-medium text-right">Unavailable</th>
                    <th className="px-4 py-3 font-medium text-right">Booked</th>
                    <th className="px-4 py-3 font-medium text-right">Not set</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((row) => (
                    <tr key={row._id} data-artist={row._id}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-deep-blue">{row.name || 'No name yet'}</span>
                        <span className="block text-xs text-gray-500">{[row.genre, row.phone].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.city || '—'}</td>
                      <td className="px-4 py-3">
                        <KycBadge kyc={row.kyc} />
                      </td>
                      <td className="px-4 py-3 text-right">{row.available}</td>
                      <td className="px-4 py-3 text-right">{row.unavailable}</td>
                      <td className="px-4 py-3 text-right">{row.booked}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.not_set}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => onPick(row._id)} className="text-sm text-teal font-medium hover:underline whitespace-nowrap">
                          Open calendar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <p className="text-xs text-gray-500 mt-3">
        Day counts are for {monthLabel(month)}. Artists set their own days in the artist app; an accepted event books the day automatically.
      </p>
    </>
  )
}

function Availability() {
  const [month, setMonth] = useState(currentMonth)
  const [artistId, setArtistId] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const id = readQueryParam('artist')
    if (/^[a-f0-9]{24}$/i.test(id)) setArtistId(id)
    const wanted = readQueryParam('month')
    if (/^\d{4}-\d{2}$/.test(wanted)) setMonth(wanted)
    setReady(true)
  }, [])

  const pick = (id: string) => {
    setArtistId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('artist', id)
    else url.searchParams.delete('artist')
    window.history.replaceState(null, '', url.toString())
  }

  if (!ready) return <Spinner />
  return artistId ? (
    <ArtistCalendar artistId={artistId} month={month} onMonth={setMonth} onBack={() => pick('')} />
  ) : (
    <ArtistPicker month={month} onMonth={setMonth} onPick={pick} />
  )
}

export default function ArtistAvailabilityPage() {
  return (
    <AdminShell title="Artist Availability" subtitle="Each artist's calendar: available, unavailable and booked days, with admin overrides">
      <Availability />
    </AdminShell>
  )
}
