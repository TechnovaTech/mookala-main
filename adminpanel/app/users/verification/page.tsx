'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Card, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import {
  CountTabs,
  Pager,
  UserActionDialog,
  UserStatusBadge,
  type PendingAction,
  type UserRow,
} from '@/components/users/shared'

const GROUPS = [
  { value: 'phone_unverified', label: 'Phone not verified' },
  { value: 'phone_verified', label: 'Phone verified, profile incomplete' },
  { value: 'profile_completed', label: 'Profile completed' },
  { value: 'admin_verified', label: 'Verified by admin' },
]

const EMPTY_HINTS: Record<string, string> = {
  phone_unverified: 'Users who asked for an OTP but never entered it appear here.',
  phone_verified: 'Users who confirmed their phone with an OTP but have not filled in their profile appear here.',
  profile_completed: 'Users who confirmed their phone and completed their profile in the app appear here.',
  admin_verified:
    'No profile has been verified by hand yet. Use "Mark as verified" on a user in another group after checking them.',
}

const PAGE_SIZE = 25

interface ListResponse {
  users: UserRow[]
  total: number
  page: number
  pages: number
  verificationCounts: Record<string, number>
}

function VerificationList() {
  const canManage = useCan('users:manage')
  const [group, setGroup] = useState('phone_verified')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ verification: group, ...extra })
      if (query) params.set('q', query)
      return params.toString()
    },
    [group, query]
  )

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>(
        '/api/users?' + queryString({ page: String(page), limit: String(PAGE_SIZE) })
      )
      if (id !== requestId.current) return
      if (result.users.length === 0 && result.total > 0 && page > result.pages) {
        setPage(result.pages)
        return
      }
      setData(result)
    } catch (e: any) {
      if (id !== requestId.current) return
      setNotice({ type: 'error', text: e?.message || 'Could not load users.' })
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [queryString, page])

  useEffect(() => {
    load()
  }, [load])

  const users = data?.users || []

  return (
    <>
      <div className="flex flex-wrap justify-end gap-3 mb-4">
        <a
          href={'/api/users?' + queryString({ format: 'csv' })}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <Download size={16} />
          Export CSV
        </a>
      </div>

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <NoticeBar
        notice={{
          type: 'info',
          text: 'Phone and profile status come from the app: a phone is verified when the user enters the OTP, and a profile is completed when the user fills it in. "Verified by admin" is a separate mark that staff set by hand, with a reason, after checking a customer themselves.',
        }}
      />

      <Card>
        <CountTabs
          label="Verification groups"
          tabs={GROUPS}
          active={group}
          counts={data?.verificationCounts || null}
          onChange={(value) => {
            setGroup(value)
            setPage(1)
          }}
        />

        <div className="p-4 border-b border-gray-200">
          <label htmlFor="verification-search" className="sr-only">
            Search users by name, phone or email
          </label>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="verification-search"
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name, phone or email"
              className={inputClass + ' pl-9'}
            />
          </div>
        </div>

        {loading && !data ? (
          <Spinner label="Loading users..." />
        ) : users.length === 0 ? (
          <EmptyState
            title={query ? `No users match "${query}" in this group` : 'No users in this group'}
            hint={query ? 'Try a different name, phone number or email.' : EMPTY_HINTS[group]}
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">User</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3">Phone (OTP)</th>
                  <th scope="col" className="px-4 py-3">Profile</th>
                  <th scope="col" className="px-4 py-3">Admin verification</th>
                  <th scope="col" className="px-4 py-3">Account</th>
                  <th scope="col" className="px-4 py-3">Joined</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <Link href={`/users/${user.id}`} className="font-medium text-deep-blue hover:underline">
                        {user.name || 'Name not provided'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{user.phone || '—'}</div>
                      <div className="text-xs text-gray-500">{user.email || 'No email'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {user.phoneVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="gray">Not verified</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {user.profileCompleted ? <Badge tone="green">Completed</Badge> : <Badge tone="amber">Incomplete</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {user.verifiedByAdmin ? (
                        <div className="max-w-[18rem]">
                          <Badge tone="green">Verified</Badge>
                          <div className="text-xs text-gray-500 mt-1">
                            {user.verifiedByAdmin.by || 'Admin'} · {formatDate(user.verifiedByAdmin.at, true)}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5 break-words">{user.verifiedByAdmin.reason}</div>
                        </div>
                      ) : (
                        <Badge tone="gray">Not marked</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <UserStatusBadge user={user} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-medium">
                        <Link href={`/users/${user.id}`} className="text-deep-blue hover:underline">
                          View
                        </Link>
                        {canManage &&
                          (user.verifiedByAdmin ? (
                            <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ action: 'unverify', user })}>
                              Clear mark
                            </button>
                          ) : (
                            <button type="button" className="text-green-700 hover:underline" onClick={() => setPending({ action: 'verify', user })}>
                              Mark as verified
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </Card>

      <UserActionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(message) => {
          setPending(null)
          setNotice({ type: 'success', text: message })
          load()
        }}
      />
    </>
  )
}

export default function UserVerificationPage() {
  return (
    <AdminShell title="User Verification" subtitle="Phone and profile verification status, and manual verification by staff">
      <VerificationList />
    </AdminShell>
  )
}
