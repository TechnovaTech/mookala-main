'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, Plus, Power, Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { SearchInput, matches } from '@/components/catalogue/shared'
import VenueForm, { EMPTY_VENUE, venueFormProblem, type VenueFormValues } from '@/components/catalogue/VenueForm'

interface Venue {
  _id: string
  name: string
  location?: { address?: string; city?: string; state?: string }
  capacity: number
  amenities: string[]
  status: string
  image: string | null
  seatingLayoutImage: string | null
  seatConfig: { blocks?: any[] } | null
  createdAt: string
}

type Pending = { venue: Venue; kind: 'delete' | 'activate' | 'deactivate' }

function VenueList() {
  const canManage = useCan('venues:manage')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<VenueFormValues>(EMPTY_VENUE)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ venues: Venue[] }>('/api/venues')
      setVenues(data.venues || [])
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load venues.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(
    () =>
      venues.filter(
        (v) => (!status || v.status === status) && matches(search, v.name, v.location?.address, v.location?.city, v.location?.state)
      ),
    [venues, search, status]
  )

  const save = async () => {
    const problem = venueFormProblem(form)
    if (problem) return setFormError(problem)
    setSaving(true)
    setFormError('')
    try {
      await api('/api/venues', { method: 'POST', body: form })
      setNotice({ type: 'success', text: `"${form.name.trim()}" was added. Open it to set up its seat blocks.` })
      setShowAdd(false)
      setForm(EMPTY_VENUE)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save the venue.')
    } finally {
      setSaving(false)
    }
  }

  const confirm = async (reason: string) => {
    if (!pending) return
    const { venue, kind } = pending
    setBusy(true)
    try {
      if (kind === 'delete') {
        await api(`/api/venues/${venue._id}`, { method: 'DELETE', body: { reason } })
        setNotice({ type: 'success', text: `"${venue.name}" was deleted.` })
      } else {
        await api(`/api/venues/${venue._id}`, { method: 'PUT', body: { status: kind === 'activate' ? 'active' : 'inactive', reason } })
        setNotice({ type: 'success', text: `"${venue.name}" is now ${kind === 'activate' ? 'active' : 'inactive'}.` })
      }
      setPending(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The venue was not changed.' })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => {
              setForm(EMPTY_VENUE)
              setFormError('')
              setShowAdd(true)
            }}
          >
            <Plus size={16} />
            Add venue
          </Button>
        </div>
      )}

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card>
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3">
          <SearchInput id="venue-search" value={search} onChange={setSearch} placeholder="Search by venue name, address, city or state..." />
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass + ' w-auto'}>
            <option value="">Status: all</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={venues.length === 0 ? 'No venues yet' : 'No venues match these filters'}
            hint={venues.length === 0 ? 'Add a venue so organisers can choose it when they create an event.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium text-right">Capacity</th>
                  <th className="px-4 py-3 font-medium">Seat blocks</th>
                  <th className="px-4 py-3 font-medium">Amenities</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((venue) => {
                  const blocks = venue.seatConfig?.blocks?.length || 0
                  return (
                    <tr key={venue._id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {venue.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={venue.image} alt="" className="h-10 w-14 rounded object-cover bg-gray-100" />
                          ) : (
                            <div className="h-10 w-14 rounded bg-gray-100" aria-hidden="true" />
                          )}
                          <Link href={`/venues/${venue._id}`} className="font-medium text-deep-blue hover:underline">
                            {venue.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {venue.location?.address || '—'}
                        <span className="block text-gray-500">{[venue.location?.city, venue.location?.state].filter(Boolean).join(', ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{(venue.capacity || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">{blocks > 0 ? `${blocks} block${blocks === 1 ? '' : 's'}` : <span className="text-amber-700">Not set up</span>}</td>
                      <td className="px-4 py-3 max-w-[16rem]">{venue.amenities.length ? venue.amenities.join(', ') : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={venue.status === 'active' ? 'green' : 'gray'}>{venue.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(venue.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Link href={`/venues/${venue._id}`} aria-label={`Open ${venue.name}`} title="Open" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                            <Eye size={16} />
                          </Link>
                          {canManage && (
                            <>
                              <button
                                onClick={() => setPending({ venue, kind: venue.status === 'active' ? 'deactivate' : 'activate' })}
                                aria-label={`${venue.status === 'active' ? 'Deactivate' : 'Activate'} ${venue.name}`}
                                title={venue.status === 'active' ? 'Deactivate' : 'Activate'}
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                              >
                                <Power size={16} />
                              </button>
                              <button
                                onClick={() => setPending({ venue, kind: 'delete' })}
                                aria-label={`Delete ${venue.name}`}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={showAdd}
        title="Add venue"
        onClose={() => setShowAdd(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Add venue
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        <VenueForm values={form} onChange={setForm} onError={setFormError} />
        <p className="text-xs text-gray-500 mt-4">Capacity is worked out from the seat blocks, which you set up after the venue is added.</p>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.kind === 'delete' ? 'Delete' : pending.kind === 'activate' ? 'Activate' : 'Deactivate'} ${pending.venue.name}` : ''}
        message={
          pending?.kind === 'delete'
            ? 'This permanently removes the venue, its images and its seat blocks. A venue that is used by any event cannot be deleted.'
            : pending?.kind === 'deactivate'
            ? 'Organisers will no longer be offered this venue for new events. Existing events and bookings are not affected.'
            : 'Organisers will be able to choose this venue again.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        danger={pending?.kind === 'delete'}
        askReason
        reasonRequired={pending?.kind === 'delete' || pending?.kind === 'deactivate'}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function VenuesPage() {
  return (
    <AdminShell title="Venues" subtitle="Venues organisers can choose for events, with seat blocks and capacity">
      <VenueList />
    </AdminShell>
  )
}
