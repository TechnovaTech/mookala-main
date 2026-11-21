'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { AccountBadge, Avatar, KYC_META, KYC_ORDER, KycBadge, Pagination, qs, selectClass, useDebounced, type KycView } from './shared'

/**
 * The artist list and the organiser list: server-side search, filters,
 * sorting, pagination and CSV export. Rows never contain KYC documents.
 */

interface Row {
  _id: string
  name: string
  phone: string
  email: string
  city: string
  genre: string
  kyc: KycView
  kycCorrectionRequested: boolean
  accountStatus: string
  categoryName?: string | null
  followers: number
  mediaCount: number
  events?: number
  profileImageUrl?: string | null
  createdAt: string | null
}

interface ListResponse {
  items: Row[]
  total: number
  page: number
  limit: number
  counts: { total: number; kyc: Record<KycView, number>; account: Record<string, number> }
  cities: string[]
  categories?: { _id: string; name: string; parentId: string | null; status: string }[]
}

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A to Z' },
  { value: 'name:desc', label: 'Name Z to A' },
]

export default function PartyList({ role }: { role: 'artist' | 'organizer' }) {
  const isArtist = role === 'artist'
  const endpoint = isArtist ? '/api/admin/artists' : '/api/organizers'
  const detailBase = isArtist ? '/artists/' : '/organizers/'
  const plural = isArtist ? 'artists' : 'organisers'

  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [kyc, setKyc] = useState('')
  const [account, setAccount] = useState('')
  const [city, setCity] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState('createdAt:desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  const [sortKey, sortDir] = sort.split(':')
  const filters = { q, kyc, account, city, categoryId: isArtist ? categoryId : '', sort: sortKey, dir: sortDir }
  const filterKey = qs(filters)

  useEffect(() => {
    setPage(1)
  }, [filterKey])

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>(`${endpoint}?${filterKey}&page=${page}&limit=25`)
      if (current !== requestId.current) return
      setData(result)
      setNotice(null)
    } catch (error: any) {
      if (current !== requestId.current) return
      setNotice({ type: 'error', text: error.message || `Could not load ${plural}.` })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [endpoint, filterKey, page, plural])

  useEffect(() => {
    load()
  }, [load])

  const filtered = Boolean(q || kyc || account || city || (isArtist && categoryId))
  const clear = () => {
    setSearch('')
    setKyc('')
    setAccount('')
    setCity('')
    setCategoryId('')
  }

  const categories = data?.categories || []
  const parents = categories.filter((c) => !c.parentId)
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id)

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard label={isArtist ? 'Artists' : 'Organisers'} value={data.counts.total} />
          <StatCard label="KYC pending review" value={data.counts.kyc.pending} />
          <StatCard label="KYC approved" value={data.counts.kyc.approved} />
          <StatCard label="Suspended or blocked" value={data.counts.account.suspended + data.counts.account.blocked} />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-200">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="party-search" className="block text-xs font-medium text-gray-600 mb-1">
              Search
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="party-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isArtist ? 'Name, phone, email, city or genre' : 'Name, phone, email or city'}
                className={inputClass + ' pl-9'}
              />
            </div>
          </div>
          <div>
            <label htmlFor="party-kyc" className="block text-xs font-medium text-gray-600 mb-1">
              KYC status
            </label>
            <select id="party-kyc" value={kyc} onChange={(e) => setKyc(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {KYC_ORDER.map((value) => (
                <option key={value} value={value}>
                  {KYC_META[value].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="party-account" className="block text-xs font-medium text-gray-600 mb-1">
              Account status
            </label>
            <select id="party-account" value={account} onChange={(e) => setAccount(e.target.value)} className={selectClass}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          {isArtist && (
            <div>
              <label htmlFor="party-category" className="block text-xs font-medium text-gray-600 mb-1">
                Category
              </label>
              <select id="party-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
                <option value="">All</option>
                <option value="none">No category</option>
                {parents.map((parent) => (
                  <React.Fragment key={parent._id}>
                    <option value={parent._id}>{parent.name}</option>
                    {childrenOf(parent._id).map((child) => (
                      <option key={child._id} value={child._id}>
                        {parent.name} › {child.name}
                      </option>
                    ))}
                  </React.Fragment>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="party-city" className="block text-xs font-medium text-gray-600 mb-1">
              City
            </label>
            <select id="party-city" value={city} onChange={(e) => setCity(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {(data?.cities || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="party-sort" className="block text-xs font-medium text-gray-600 mb-1">
              Sort
            </label>
            <select id="party-sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <button onClick={clear} className="text-sm text-teal hover:underline pb-2">
              Clear filters
            </button>
          )}
          <a
            href={`${endpoint}?${qs({ ...filters, export: 'csv' })}`}
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
            title={filtered ? `No ${plural} match these filters` : `No ${plural} yet`}
            hint={
              filtered
                ? 'Change or clear the filters to see more.'
                : isArtist
                ? 'Artists appear here when they register in the Mookalaa artist app.'
                : 'Organisers appear here when they register in the Mookalaa organiser app.'
            }
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">{isArtist ? 'Artist' : 'Organiser'}</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  {isArtist && <th className="px-4 py-3 font-medium">Category</th>}
                  <th className="px-4 py-3 font-medium">KYC</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium text-right">{isArtist ? 'Followers' : 'Events'}</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} src={row.profileImageUrl} size={36} />
                        <div className="min-w-0">
                          <Link href={detailBase + row._id} className="font-medium text-deep-blue hover:underline">
                            {row.name || 'No name yet'}
                          </Link>
                          <p className="text-xs text-gray-500">
                            {row.phone || 'No phone'}
                            {isArtist && row.genre ? ` · ${row.genre}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.city || '—'}</td>
                    {isArtist && <td className="px-4 py-3 text-gray-700">{row.categoryName || '—'}</td>}
                    <td className="px-4 py-3">
                      <KycBadge kyc={row.kyc} correction={row.kycCorrectionRequested} />
                    </td>
                    <td className="px-4 py-3">
                      <AccountBadge status={row.accountStatus} />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{isArtist ? row.followers : row.events ?? 0}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={detailBase + row._id} className="text-teal font-medium hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>
    </>
  )
}
