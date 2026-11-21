'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, api, formatDate, type Notice } from '@/components/ui'
import { EventStatusBadge, SearchInput, matches } from './shared'

interface Jatra {
  _id: string
  name: string
  venue: string
  date: string
  time: string
  description: string
  artists: string[]
  committeeMembers: string[]
  organizerPhone: string
  status: string
  rejectionReason: string
  reviewedAt: string | null
  createdAt: string
}

type Decision = { jatra: Jatra; status: 'approved' | 'rejected' | 'pending' }

const LABELS = { approved: 'Approve', rejected: 'Reject', pending: 'Move back to pending' }

/** Jatra registrations sent from the organiser app, with approve and reject. */
export default function JatraPanel({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Jatra[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ jatras: Jatra[] }>('/api/jatra')
      setItems(data.jatras || [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load Jatra registrations.' })
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
        (j) => (!status || j.status === status) && matches(search, j.name, j.venue, j.organizerPhone, j.artists.join(' '))
      ),
    [items, search, status]
  )

  const counts = useMemo(() => {
    const out: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
    for (const j of items) out[j.status] = (out[j.status] || 0) + 1
    return out
  }, [items])

  const decide = async (reason: string) => {
    if (!decision) return
    setBusy(true)
    try {
      await api(`/api/admin/events/jatra/${decision.jatra._id}`, { method: 'PATCH', body: { status: decision.status, reason } })
      setNotice({ type: 'success', text: `"${decision.jatra.name}" is now ${decision.status}.` })
      setDecision(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not update the registration.' })
      setDecision(null)
    } finally {
      setBusy(false)
    }
  }

  const reasonRequired = decision ? decision.status === 'rejected' || decision.jatra.status !== 'pending' : false

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {[
              { value: '', label: `All (${items.length})` },
              { value: 'pending', label: `Pending (${counts.pending || 0})` },
              { value: 'approved', label: `Approved (${counts.approved || 0})` },
              { value: 'rejected', label: `Rejected (${counts.rejected || 0})` },
            ].map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => setStatus(tab.value)}
                className={`px-3 py-1.5 rounded-full text-sm ${status === tab.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <SearchInput id="jatra-search" value={search} onChange={setSearch} placeholder="Search by name, venue, organiser phone or artist..." />
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'No Jatra registrations yet' : 'No registrations match these filters'}
            hint={items.length === 0 ? 'Registrations appear here when an organiser submits a Jatra from the organiser app.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Jatra</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Organiser phone</th>
                  <th className="px-4 py-3 font-medium">Artists</th>
                  <th className="px-4 py-3 font-medium">Committee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((j) => (
                  <tr key={j._id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-deep-blue">{j.name}</p>
                      <p className="text-gray-500">{j.venue || 'Venue not given'}</p>
                      {j.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{j.description}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {j.date || '—'}
                      {j.time && <span className="block text-gray-500">{j.time}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{j.organizerPhone || '—'}</td>
                    <td className="px-4 py-3">{j.artists.length ? j.artists.join(', ') : '—'}</td>
                    <td className="px-4 py-3">{j.committeeMembers.length ? j.committeeMembers.join(', ') : '—'}</td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={j.status} />
                      {j.status === 'rejected' && j.rejectionReason && (
                        <p className="text-xs text-red-700 mt-1 max-w-[14rem]">Reason: {j.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(j.createdAt)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {j.status !== 'approved' && (
                            <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setDecision({ jatra: j, status: 'approved' })}>
                              <Check size={14} />
                              Approve
                            </Button>
                          )}
                          {j.status !== 'rejected' && (
                            <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setDecision({ jatra: j, status: 'rejected' })}>
                              <X size={14} />
                              Reject
                            </Button>
                          )}
                          {j.status !== 'pending' && (
                            <Button
                              variant="ghost"
                              className="!px-2 !py-1.5"
                              aria-label={`Move ${j.name} back to pending`}
                              title="Move back to pending"
                              onClick={() => setDecision({ jatra: j, status: 'pending' })}
                            >
                              <RotateCcw size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(decision)}
        title={decision ? `${LABELS[decision.status]}: ${decision.jatra.name}` : ''}
        message={
          decision?.status === 'rejected'
            ? 'The registration will be marked as rejected. The reason is stored on the registration and in the activity log.'
            : decision?.jatra.status !== 'pending'
            ? `This reverses the earlier decision (${decision?.jatra.status}). Say why, so the change can be traced.`
            : 'The registration will be marked as approved.'
        }
        confirmLabel={decision ? LABELS[decision.status] : 'Confirm'}
        danger={decision?.status === 'rejected'}
        askReason
        reasonRequired={reasonRequired}
        busy={busy}
        onConfirm={decide}
        onClose={() => setDecision(null)}
      />
    </>
  )
}
