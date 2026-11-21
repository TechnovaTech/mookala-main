'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { Pagination, qs, readQueryParam, useDebounced } from '@/components/artists/shared'

type Review = 'pending' | 'approved' | 'rejected'

interface Item {
  key: string
  artistId: string
  artistName: string
  artistPhone: string
  artistCity: string
  index: number
  type: string
  uploadedAt: string | null
  reviewStatus: Review
  reviewedBy: string | null
  reviewedAt: string | null
  reviewReason: string
  url: string
}

interface ListResponse {
  items: Item[]
  total: number
  page: number
  limit: number
  counts: Record<Review, number>
  canManage: boolean
}

const TABS: { value: Review; label: string }[] = [
  { value: 'pending', label: 'Not reviewed' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const EMPTY: Record<Review, string> = {
  pending: 'Every portfolio item has been reviewed. New photos and videos artists upload in the artist app appear here.',
  approved: 'No portfolio item has been approved yet.',
  rejected: 'No portfolio item has been rejected.',
}

function PortfolioReview() {
  const [status, setStatus] = useState<Review>('pending')
  const [artistId, setArtistId] = useState('')
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ item: Item; action: 'approve' | 'reject' } | null>(null)
  const [busy, setBusy] = useState('')
  const requestId = useRef(0)

  // /artists/portfolio?artistId=... shows one artist's items.
  useEffect(() => {
    const id = readQueryParam('artistId')
    if (/^[a-f0-9]{24}$/i.test(id)) setArtistId(id)
    setReady(true)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [status, q, artistId])

  const load = useCallback(async () => {
    if (!ready) return
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>('/api/admin/artists/portfolio?' + qs({ status, q, artistId, page, limit: 24 }))
      if (current !== requestId.current) return
      setData(result)
    } catch (error: any) {
      if (current !== requestId.current) return
      setNotice({ type: 'error', text: error.message || 'Could not load portfolio items.' })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [ready, status, q, artistId, page])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (item: Item, action: 'approve' | 'reject', reason: string) => {
    setBusy(item.key)
    try {
      await api('/api/admin/artists/portfolio', {
        method: 'POST',
        body: { artistId: item.artistId, index: item.index, uploadedAt: item.uploadedAt, action, reason },
      })
      setNotice({
        type: 'success',
        text:
          action === 'approve'
            ? `Approved an item from ${item.artistName || 'the artist'}.`
            : `Rejected an item from ${item.artistName || 'the artist'}. It is no longer shown in the apps.`,
      })
      setPending(null)
      await load()
    } catch (error: any) {
      setPending(null)
      setNotice({ type: 'error', text: error.message || 'The review could not be saved.' })
      load()
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <p className="text-sm text-gray-600 mb-4">
        Items uploaded before portfolio review existed have no review yet. They stay visible in the apps, as they are today, until
        someone rejects them. Only a rejected item is hidden from the apps.
      </p>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 border-b border-gray-200">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Review status">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => setStatus(tab.value)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  status === tab.value ? 'border-teal text-deep-blue' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{data ? data.counts[tab.value] : '…'}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72 pb-3">
            <label htmlFor="portfolio-search" className="sr-only">
              Search by artist name, phone or city
            </label>
            <Search size={16} className="absolute left-3 top-[11px] text-gray-400" />
            <input
              id="portfolio-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Artist name, phone or city"
              className={inputClass + ' pl-9'}
            />
          </div>
        </div>

        {artistId && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-800">
            <span>Showing one artist&apos;s portfolio.</span>
            <button onClick={() => setArtistId('')} className="font-medium underline">
              Show all artists
            </button>
          </div>
        )}

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="Nothing here" hint={q || artistId ? 'No portfolio items match.' : EMPTY[status]} />
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 ${loading ? 'opacity-60' : ''}`}>
            {data.items.map((item) => (
              <div key={item.key} className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                {/video/i.test(item.type) ? (
                  <video src={item.url} controls preload="none" className="w-full h-48 object-contain bg-black" />
                ) : (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open the full image in a new tab">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={`Portfolio item from ${item.artistName || 'artist'}`} loading="lazy" className="w-full h-48 object-contain bg-gray-100" />
                  </a>
                )}
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div>
                    <Link href={`/artists/${item.artistId}`} className="font-medium text-deep-blue hover:underline">
                      {item.artistName || 'No name yet'}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {[item.artistPhone, item.artistCity].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {/video/i.test(item.type) ? 'Video' : 'Photo'} · {item.uploadedAt ? `uploaded ${formatDate(item.uploadedAt)}` : 'upload date not recorded'}
                    </p>
                  </div>
                  {item.reviewStatus !== 'pending' && (
                    <div className="text-xs text-gray-600">
                      <Badge tone={item.reviewStatus === 'approved' ? 'green' : 'red'}>
                        {item.reviewStatus === 'approved' ? 'Approved' : 'Rejected'}
                      </Badge>
                      <p className="mt-1">
                        {item.reviewedBy ? `By ${item.reviewedBy}` : ''}
                        {item.reviewedAt ? `, ${formatDate(item.reviewedAt, true)}` : ''}
                      </p>
                      {item.reviewReason && <p className="mt-1">Reason: {item.reviewReason}</p>}
                    </div>
                  )}
                  {data.canManage && (
                    <div className="flex gap-2 mt-auto pt-1">
                      {item.reviewStatus !== 'approved' && (
                        <Button className="flex-1 !py-1.5" loading={busy === item.key} onClick={() => decide(item, 'approve', '')}>
                          Approve
                        </Button>
                      )}
                      {item.reviewStatus !== 'rejected' && (
                        <Button variant="danger" className="flex-1 !py-1.5" disabled={busy === item.key} onClick={() => setPending({ item, action: 'reject' })}>
                          Reject
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Reject this portfolio item?"
        message="A rejected item is hidden from the apps. The item is kept, and you can approve it again later."
        confirmLabel="Reject"
        danger
        askReason
        reasonRequired
        busy={Boolean(busy)}
        onConfirm={(reason) => pending && decide(pending.item, pending.action, reason)}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function PortfolioPage() {
  return (
    <AdminShell title="Portfolio Review" subtitle="Photos and videos artists show on their profile">
      <PortfolioReview />
    </AdminShell>
  )
}
