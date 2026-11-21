'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Card, EmptyState, NoticeBar, Spinner, StatCard, api, inputClass, type Notice } from '@/components/ui'
import { AccountBadge, Pagination, qs, useDebounced } from '@/components/artists/shared'

interface Row {
  _id: string
  name: string
  phone: string
  city: string
  genre: string
  accountStatus: string
  events: number
  followers: number
  bookings: number
  tickets: number
  checkIns: number
  rating: number | null
  ratings: number
  complaints: number
  reports: number
}

interface ListResponse {
  items: Row[]
  total: number
  page: number
  limit: number
  totals: { artists: number; events: number; bookings: number; ratings: number }
}

const COLUMNS: { key: keyof Row; label: string }[] = [
  { key: 'events', label: 'Events' },
  { key: 'followers', label: 'Followers' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'tickets', label: 'Tickets sold' },
  { key: 'checkIns', label: 'Check-ins' },
  { key: 'rating', label: 'Avg rating' },
  { key: 'ratings', label: 'Ratings' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'reports', label: 'Reports' },
]

function Performance() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [sort, setSort] = useState<string>('events')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [q, sort, dir])

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>('/api/admin/artists/performance?' + qs({ q, sort, dir, page, limit: 25 }))
      if (current !== requestId.current) return
      setData(result)
      setNotice(null)
    } catch (error: any) {
      if (current !== requestId.current) return
      setNotice({ type: 'error', text: error.message || 'Could not load artist performance.' })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [q, sort, dir, page])

  useEffect(() => {
    load()
  }, [load])

  const sortBy = (key: string) => {
    if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc')
    else {
      setSort(key)
      setDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const header = (key: string, label: string, right = true) => (
    <th
      key={key}
      className={`px-4 py-3 font-medium ${right ? 'text-right' : ''}`}
      aria-sort={sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button onClick={() => sortBy(key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-deep-blue">
        {label}
        {sort === key && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard label="Artists" value={data.totals.artists} />
          <StatCard label="Events with an artist" value={data.totals.events} />
          <StatCard label="Bookings on those events" value={data.totals.bookings} />
          <StatCard label="Ratings received" value={data.totals.ratings} />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <label htmlFor="performance-search" className="sr-only">
              Search by artist name, phone, city or genre
            </label>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="performance-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Artist name, phone, city or genre"
              className={inputClass + ' pl-9'}
            />
          </div>
          <a
            href={'/api/admin/artists/performance?' + qs({ q, sort, dir, export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 ml-auto"
          >
            <Download size={16} />
            Export CSV
          </a>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={q ? 'No artists match this search' : 'No artists yet'}
            hint={q ? undefined : 'Artists appear here when they register in the Mookalaa artist app.'}
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  {header('name', 'Artist', false)}
                  {COLUMNS.map((column) => header(column.key, column.label))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/artists/${row._id}`} className="font-medium text-deep-blue hover:underline">
                        {row.name || 'No name yet'}
                      </Link>
                      <p className="text-xs text-gray-500">{[row.genre, row.city].filter(Boolean).join(' · ') || row.phone}</p>
                      {row.accountStatus !== 'active' && (
                        <div className="mt-1">
                          <AccountBadge status={row.accountStatus} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{row.events}</td>
                    <td className="px-4 py-3 text-right">{row.followers}</td>
                    <td className="px-4 py-3 text-right">{row.bookings}</td>
                    <td className="px-4 py-3 text-right">{row.tickets}</td>
                    <td className="px-4 py-3 text-right">{row.checkIns}</td>
                    <td className="px-4 py-3 text-right">{row.rating === null ? '—' : row.rating.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{row.ratings}</td>
                    <td className="px-4 py-3 text-right">{row.complaints}</td>
                    <td className="px-4 py-3 text-right">{row.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-deep-blue mb-2">Where these numbers come from</h2>
        <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
          <li>Events: events the artist created or was added to, leaving out events the admin rejected.</li>
          <li>
            Bookings and tickets sold: bookings on those events that are not cancelled, expired or waiting for payment. Check-ins:
            bookings scanned at the venue.
          </li>
          <li>
            Ratings: entries in Feedback &amp; Ratings about an artist that are not hidden. The apps do not collect ratings yet, so this
            stays empty until feedback is recorded.
          </li>
          <li>Complaints: customer complaints linked to a booking on one of the artist&apos;s events.</li>
          <li>Reports: entries in Reported Accounts against the artist&apos;s phone number.</li>
        </ul>
      </Card>
    </>
  )
}

export default function PerformancePage() {
  return (
    <AdminShell title="Artist Performance" subtitle="Events, audience, ratings and complaints for each artist, from recorded activity">
      <Performance />
    </AdminShell>
  )
}
