'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Card, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import {
  CountTabs,
  Pager,
  SignupBadge,
  UserActionDialog,
  UserStatusBadge,
  type PendingAction,
  type UserRow,
} from '@/components/users/shared'

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blocked', label: 'Blocked' },
]

const EMPTY_HINTS: Record<string, string> = {
  all: 'Users appear here when they sign up in the Mookalaa app or website.',
  active: 'Users who completed their profile and are not restricted appear here.',
  inactive: 'Users who signed up but have not completed their profile appear here.',
  suspended: 'No account is suspended. Suspend an account from its row or its detail page.',
  blocked: 'No account is blocked. Block an account from its row or its detail page.',
}

const PAGE_SIZE = 25

interface ListResponse {
  users: UserRow[]
  total: number
  page: number
  pages: number
  counts: Record<string, number>
}

function UsersList() {
  const canManage = useCan('users:manage')
  const [view, setView] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const requestId = useRef(0)

  // Search as the admin types, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ view, ...extra })
      if (query) params.set('q', query)
      return params.toString()
    },
    [view, query]
  )

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>(
        '/api/users?' + queryString({ page: String(page), limit: String(PAGE_SIZE) })
      )
      if (id !== requestId.current) return
      // An action can empty the last page: step back instead of showing nothing.
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

      <Card>
        <CountTabs
          label="User views"
          tabs={VIEWS}
          active={view}
          counts={data?.counts || null}
          onChange={(value) => {
            setView(value)
            setPage(1)
          }}
        />

        <div className="p-4 border-b border-gray-200">
          <label htmlFor="user-search" className="sr-only">
            Search users by name, phone or email
          </label>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="user-search"
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
            title={query ? `No users match "${query}" in this view` : 'No users in this view'}
            hint={query ? 'Try a different name, phone number or email, or switch to the All tab.' : EMPTY_HINTS[view]}
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">User</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3">City</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Signup</th>
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
                      {user.verifiedByAdmin && <div className="text-xs text-green-700 mt-0.5">Verified by admin</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{user.phone || '—'}</div>
                      <div className="text-xs text-gray-500">{user.email || 'No email'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{user.city || '—'}</td>
                    <td className="px-4 py-3">
                      <UserStatusBadge user={user} />
                      {user.accountStatus !== 'active' && user.accountStatusReason && (
                        <div className="text-xs text-gray-500 mt-1 max-w-[16rem] truncate" title={user.accountStatusReason}>
                          {user.accountStatusReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SignupBadge status={user.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-medium">
                        <Link href={`/users/${user.id}`} className="text-deep-blue hover:underline">
                          View
                        </Link>
                        {canManage && user.accountStatus === 'active' && (
                          <>
                            <button type="button" className="text-amber-700 hover:underline" onClick={() => setPending({ action: 'suspend', user })}>
                              Suspend
                            </button>
                            <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ action: 'block', user })}>
                              Block
                            </button>
                          </>
                        )}
                        {canManage && user.accountStatus === 'suspended' && (
                          <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ action: 'block', user })}>
                            Block
                          </button>
                        )}
                        {canManage && user.accountStatus !== 'active' && (
                          <button type="button" className="text-green-700 hover:underline" onClick={() => setPending({ action: 'reactivate', user })}>
                            Reactivate
                          </button>
                        )}
                        {canManage && (
                          <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ action: 'delete', user })}>
                            Delete
                          </button>
                        )}
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

export default function UsersPage() {
  return (
    <AdminShell title="Users" subtitle="Customer accounts, their status and account restrictions">
      <UsersList />
    </AdminShell>
  )
}
