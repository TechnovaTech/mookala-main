'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

interface Activity {
  id: string
  type: string
  at: string
  title: string
  detail: string
  phone: string
  userId: string | null
  userName: string
}

interface ActivityResponse {
  activities: Activity[]
  total: number
  page: number
  pages: number
  capped: boolean
  maxRows: number
  counts: Record<string, number>
  types: { value: string; label: string }[]
  user: { query: string; matched: number; account: { id: string; name: string; phone: string } | null } | null
}

const TYPE_TONES: Record<string, Tone> = {
  signup: 'green',
  signin: 'blue',
  signin_failed: 'amber',
  booking: 'blue',
  cancellation: 'red',
  support: 'amber',
  feedback: 'gray',
  report: 'red',
  admin: 'purple',
}

const TYPE_NAMES: Record<string, string> = {
  signup: 'Sign-up',
  signin: 'Sign-in',
  signin_failed: 'Failed sign-in',
  booking: 'Booking',
  cancellation: 'Cancellation',
  support: 'Support case',
  feedback: 'Feedback',
  report: 'Report',
  admin: 'Admin action',
}

const PAGE_SIZE = 25

function ActivityFeed() {
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userText, setUserText] = useState('')
  const [user, setUser] = useState('')
  const [page, setPage] = useState(1)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<ActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  // A link from a user's page arrives as /users/activity?user=<phone or id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialUser = (params.get('user') || '').trim()
    const initialType = (params.get('type') || '').trim()
    if (initialUser) {
      setUserText(initialUser)
      setUser(initialUser)
    }
    if (initialType) setType(initialType)
    setReady(true)
  }, [])

  // The user box filters shortly after the admin stops typing.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      const next = userText.trim()
      setUser((current) => {
        if (current !== next) setPage(1)
        return next
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [userText, ready])

  const load = useCallback(async () => {
    if (!ready) return
    if (from && to && from > to) {
      setNotice({ type: 'error', text: 'The start date must not be after the end date.' })
      return
    }
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (type) params.set('type', type)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (user) params.set('user', user)
      const result = await api<ActivityResponse>('/api/users/activity?' + params.toString())
      if (id !== requestId.current) return
      setData(result)
      setNotice(null)
    } catch (e: any) {
      if (id !== requestId.current) return
      setNotice({ type: 'error', text: e?.message || 'Could not load user activity.' })
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [ready, type, from, to, user, page])

  useEffect(() => {
    load()
  }, [load])

  const filtered = Boolean(type || from || to || user)
  const clear = () => {
    setType('')
    setFrom('')
    setTo('')
    setUserText('')
    setUser('')
    setPage(1)
  }

  const activities = data?.activities || []
  const allCount = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="activity-type" className="block text-xs font-medium text-gray-600 mb-1">Activity type</label>
            <select
              id="activity-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setPage(1)
              }}
              className={inputClass}
            >
              <option value="">All types{data ? ` (${allCount.toLocaleString('en-IN')})` : ''}</option>
              {(data?.types || Object.entries(TYPE_NAMES).map(([value, label]) => ({ value, label }))).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {data ? ` (${(data.counts[option.value] ?? 0).toLocaleString('en-IN')})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activity-from" className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              id="activity-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="activity-to" className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              id="activity-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="activity-user" className="block text-xs font-medium text-gray-600 mb-1">User (name, phone or email)</label>
            <input
              id="activity-user"
              type="search"
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              placeholder="All users"
              className={inputClass}
            />
          </div>
          <div>
            <Button variant="secondary" onClick={clear} disabled={!filtered}>Clear filters</Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Dates use India Standard Time. Sign-ins are listed from the time the OTP service started recording them; the apps do not
          record page views or sessions, so those are not shown.
        </p>
      </Card>

      {data?.user && user && (
        <div className="mb-4 text-sm text-gray-700" data-testid="activity-user-match">
          {data.user.account ? (
            <>
              Showing activity for{' '}
              <Link href={`/users/${data.user.account.id}`} className="font-medium text-deep-blue hover:underline">
                {data.user.account.name || data.user.account.phone || 'this user'}
              </Link>
              {data.user.account.name && data.user.account.phone ? ` (${data.user.account.phone})` : ''}.
            </>
          ) : data.user.matched > 1 ? (
            `Showing activity for the ${data.user.matched.toLocaleString('en-IN')} accounts that match "${data.user.query}".`
          ) : (
            `No account matches "${data.user.query}". Activity recorded against that phone number, if any, is still shown.`
          )}
        </div>
      )}

      <Card>
        {loading && !data ? (
          <Spinner label="Loading activity..." />
        ) : activities.length === 0 ? (
          <EmptyState
            title={filtered ? 'No activity matches these filters' : 'No user activity recorded yet'}
            hint={
              filtered
                ? 'Try a wider date range, another type or a different user.'
                : 'Sign-ups, sign-ins, bookings, cancellations, support cases, feedback, reports and admin actions on customer accounts appear here as they happen.'
            }
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">User</th>
                  <th scope="col" className="px-4 py-3">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-gray-50" data-type={row.type}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(row.at, true)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={TYPE_TONES[row.type] || 'gray'}>{TYPE_NAMES[row.type] || row.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {row.userId ? (
                        <Link href={`/users/${row.userId}`} className="font-medium text-deep-blue hover:underline">
                          {row.userName || row.phone || 'View user'}
                        </Link>
                      ) : (
                        <span className="text-gray-800">{row.userName || row.phone || 'Unknown'}</span>
                      )}
                      <div className="text-xs text-gray-500">
                        {row.userId ? row.phone : row.type === 'admin' ? 'Account no longer exists' : `${row.phone ? row.phone + ' · ' : ''}no customer account`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{row.title}</div>
                      {row.detail && <div className="text-xs text-gray-600 mt-0.5 break-words">{row.detail}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span data-testid="activity-total">
              {data.total.toLocaleString('en-IN')} {data.total === 1 ? 'activity' : 'activities'} · page {data.page} of {data.pages}
              {data.capped ? ` · only the latest ${data.maxRows.toLocaleString('en-IN')} can be paged through, narrow the filters to see older ones` : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(data.page - 1)}
                disabled={data.page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(data.page + 1)}
                disabled={data.page >= data.pages || loading}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

export default function UserActivityPage() {
  return (
    <AdminShell title="User Activity" subtitle="Sign-ups, sign-ins, bookings, cancellations, support cases and admin actions across all users">
      <ActivityFeed />
    </AdminShell>
  )
}
