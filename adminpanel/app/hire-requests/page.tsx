'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { SearchInput, TabLinks, matches } from '@/components/catalogue/shared'
import type { Tone } from '@/lib/resource-types'

interface HireRequest {
  _id: string
  professionalId: string
  professionalName: string
  type: string
  userPhone: string
  userName: string
  eventDate: string
  city: string
  message: string
  status: string
  statusReason: string
  createdAt: string
}

const TABS = [
  { href: '/professionals', label: 'Professionals' },
  { href: '/hire-requests', label: 'Hire requests' },
]

const STATUSES: { value: string; label: string; tone: Tone }[] = [
  { value: 'pending', label: 'Pending', tone: 'amber' },
  { value: 'accepted', label: 'Accepted', tone: 'blue' },
  { value: 'rejected', label: 'Rejected', tone: 'red' },
  { value: 'completed', label: 'Completed', tone: 'green' },
]

type Pending = { item: HireRequest; kind: 'delete' } | { item: HireRequest; kind: 'status'; status: string }

function HireRequestList() {
  const canManage = useCan('hire:manage')
  const [items, setItems] = useState<HireRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ requests: HireRequest[] }>('/api/hire-requests')
      setItems(data.requests || [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load hire requests.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () =>
      items.filter(
        (r) => (!status || r.status === status) && matches(search, r.userName, r.userPhone, r.professionalName, r.city, r.message)
      ),
    [items, search, status]
  )

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of items) out[r.status] = (out[r.status] || 0) + 1
    return out
  }, [items])

  const confirm = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.kind === 'delete') {
        await api(`/api/hire-requests/${pending.item._id}`, { method: 'DELETE', body: { reason } })
        setNotice({ type: 'success', text: 'The hire request was deleted.' })
      } else {
        await api(`/api/hire-requests/${pending.item._id}`, { method: 'PUT', body: { status: pending.status, reason } })
        setNotice({ type: 'success', text: `The request from ${pending.item.userName || pending.item.userPhone} is now ${pending.status}.` })
      }
      setPending(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `Nothing was changed. ${error.message || ''}` })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TabLinks tabs={TABS} current="/hire-requests" />
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {[{ value: '', label: 'All' }, ...STATUSES].map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => setStatus(tab.value)}
                className={`px-3 py-1.5 rounded-full text-sm ${status === tab.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {tab.label} ({tab.value ? counts[tab.value] || 0 : items.length})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <SearchInput id="hire-search" value={search} onChange={setSearch} placeholder="Search by customer, phone, professional, city or message..." />
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'No hire requests yet' : 'No hire requests match these filters'}
            hint={items.length === 0 ? 'Requests appear here when a customer asks to hire a photographer or videographer from the user app.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Professional</th>
                  <th className="px-4 py-3 font-medium">Event date</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((item) => {
                  const current = STATUSES.find((s) => s.value === item.status)
                  return (
                    <tr key={item._id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-deep-blue">{item.userName || 'Name not given'}</p>
                        <p className="text-gray-500">{item.userPhone}</p>
                      </td>
                      <td className="px-4 py-3">
                        {item.professionalName || '—'}
                        <span className="block text-gray-500 capitalize">{item.type}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{item.eventDate || '—'}</td>
                      <td className="px-4 py-3">{item.city || '—'}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="whitespace-pre-wrap break-words">{item.message || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={current?.tone || 'gray'}>{current?.label || item.status}</Badge>
                        {item.statusReason && <p className="text-xs text-gray-600 mt-1 max-w-[14rem]">Reason: {item.statusReason}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(item.createdAt, true)}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end items-center gap-1">
                            <select
                              aria-label={`Change status of the request from ${item.userName || item.userPhone}`}
                              value={item.status}
                              onChange={(e) => setPending({ item, kind: 'status', status: e.target.value })}
                              className={inputClass + ' w-auto !py-1.5'}
                            >
                              {!current && <option value={item.status}>{item.status}</option>}
                              {STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => setPending({ item, kind: 'delete' })}
                              aria-label={`Delete the request from ${item.userName || item.userPhone}`}
                              title="Delete"
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.kind === 'delete' ? 'Delete hire request' : `Mark request as ${pending?.kind === 'status' ? pending.status : ''}`}
        message={
          pending?.kind === 'delete'
            ? 'This permanently removes the request. The customer is not told.'
            : pending?.kind === 'status' && pending.status === 'rejected'
            ? 'Give the reason for rejecting this request. It is saved with the request.'
            : `The request from ${pending?.item.userName || pending?.item.userPhone || 'the customer'} for ${pending?.item.professionalName || 'the professional'} will be updated. The app does not notify the customer yet, so contact them directly.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Update status'}
        danger={pending?.kind === 'delete'}
        askReason
        reasonRequired={pending?.kind === 'status' && pending.status === 'rejected'}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function HireRequestsPage() {
  return (
    <AdminShell title="Hire Requests" subtitle="Requests from customers to hire photographers and videographers">
      <HireRequestList />
    </AdminShell>
  )
}
