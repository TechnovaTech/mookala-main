'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Armchair, Edit, Plus, Power, Trash2 } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import VenueForm, { EMPTY_VENUE, venueFormProblem, type VenueFormValues } from '@/components/catalogue/VenueForm'

interface Block {
  name: string
  type: string
  totalSeats: number
}

interface Venue {
  _id: string
  name: string
  location?: { address?: string; city?: string; state?: string }
  capacity: number
  amenities: string[]
  status: string
  image: string | null
  seatingLayoutImage: string | null
  createdAt: string
  updatedAt?: string | null
  statusReason?: string | null
  eventCount?: number
  seatConfig: { numberOfBlocks: number; blocks: Block[] } | null
}

const BLOCK_TYPES = ['VIP', 'Premium', 'Normal', 'Balcony']
const BLOCK_TONE: Record<string, 'purple' | 'blue' | 'green' | 'amber'> = { VIP: 'purple', Premium: 'blue', Normal: 'green', Balcony: 'amber' }

/** A, B, ... Z, AA, BB, ... : the naming the organiser app expects for blocks. */
function nextBlockName(blocks: Block[]): string {
  for (let i = 0; i < 200; i++) {
    const name = String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1)
    if (!blocks.some((b) => b.name.trim().toLowerCase() === name.toLowerCase())) return name
  }
  return `Block ${blocks.length + 1}`
}

function toForm(venue: Venue): VenueFormValues {
  return {
    name: venue.name || '',
    address: venue.location?.address || '',
    city: venue.location?.city || '',
    state: venue.location?.state || '',
    amenities: venue.amenities || [],
    image: venue.image || '',
    seatingLayoutImage: venue.seatingLayoutImage || '',
  }
}

function VenueDetail({ id }: { id: string }) {
  const router = useRouter()
  const canManage = useCan('venues:manage')

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState<VenueFormValues>(EMPTY_VENUE)
  const [formError, setFormError] = useState('')

  const [showSeats, setShowSeats] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [seatError, setSeatError] = useState('')

  const [pending, setPending] = useState<'delete' | 'activate' | 'deactivate' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ venue: Venue }>(`/api/venues/${id}`)
      setVenue(data.venue)
      setLoadError('')
    } catch (error: any) {
      setLoadError(error.message || 'Could not load the venue.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner />
  if (!venue) {
    return (
      <Card>
        <EmptyState title="This venue could not be opened" hint={loadError} />
      </Card>
    )
  }

  const saveDetails = async () => {
    const problem = venueFormProblem(form)
    if (problem) return setFormError(problem)

    // Send only what changed, so an untouched picture is never re-uploaded or cleared.
    const original = toForm(venue)
    const body: Record<string, any> = {}
    for (const key of ['name', 'address', 'city', 'state'] as const) {
      if (form[key].trim() !== original[key]) body[key] = form[key].trim()
    }
    if (JSON.stringify(form.amenities) !== JSON.stringify(original.amenities)) body.amenities = form.amenities
    if (form.image !== original.image) body.image = form.image || null
    if (form.seatingLayoutImage !== original.seatingLayoutImage) body.seatingLayoutImage = form.seatingLayoutImage || null

    if (Object.keys(body).length === 0) {
      setShowEdit(false)
      return
    }

    setBusy(true)
    setFormError('')
    try {
      await api(`/api/venues/${id}`, { method: 'PUT', body })
      setNotice({ type: 'success', text: 'Venue details saved.' })
      setShowEdit(false)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save the venue.')
    } finally {
      setBusy(false)
    }
  }

  const saveSeats = async () => {
    const names = new Set<string>()
    for (const block of blocks) {
      const name = block.name.trim()
      if (!name) return setSeatError('Every block needs a name.')
      if (names.has(name.toLowerCase())) return setSeatError(`Block name "${name}" is used twice.`)
      if (!Number.isInteger(block.totalSeats) || block.totalSeats < 1) return setSeatError(`Block "${name}" needs 1 or more seats.`)
      names.add(name.toLowerCase())
    }

    setBusy(true)
    setSeatError('')
    try {
      const data = await api<{ capacity: number }>(`/api/venues/${id}/seats`, {
        method: 'POST',
        body: { seatConfig: { numberOfBlocks: blocks.length, blocks: blocks.map((b) => ({ ...b, name: b.name.trim() })) } },
      })
      setNotice({ type: 'success', text: `Seat blocks saved. Capacity is now ${data.capacity.toLocaleString('en-IN')}.` })
      setShowSeats(false)
      await load()
    } catch (error: any) {
      setSeatError(error.message || 'Could not save the seat blocks.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending === 'delete') {
        await api(`/api/venues/${id}`, { method: 'DELETE', body: { reason } })
        router.push('/venues')
        return
      }
      await api(`/api/venues/${id}`, { method: 'PUT', body: { status: pending === 'activate' ? 'active' : 'inactive', reason } })
      setNotice({ type: 'success', text: `Venue is now ${pending === 'activate' ? 'active' : 'inactive'}.` })
      setPending(null)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The venue was not changed.' })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const savedBlocks = venue.seatConfig?.blocks || []
  const draftTotal = blocks.reduce((sum, block) => sum + (Number.isFinite(block.totalSeats) ? block.totalSeats : 0), 0)
  const active = venue.status === 'active'
  const events = venue.eventCount ?? 0

  return (
    <>
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          All venues
        </Link>
        <h2 className="text-xl font-semibold text-deep-blue self-center mr-auto">{venue.name}</h2>
        {canManage && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setForm(toForm(venue))
                setFormError('')
                setShowEdit(true)
              }}
            >
              <Edit size={16} />
              Edit details
            </Button>
            <Button
              onClick={() => {
                setBlocks(savedBlocks.map((b) => ({ name: b.name, type: b.type, totalSeats: Number(b.totalSeats) || 0 })))
                setSeatError('')
                setShowSeats(true)
              }}
            >
              <Armchair size={16} />
              {savedBlocks.length ? 'Edit seat blocks' : 'Set up seat blocks'}
            </Button>
            <Button variant="secondary" onClick={() => setPending(active ? 'deactivate' : 'activate')}>
              <Power size={16} />
              {active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="secondary" onClick={() => setPending('delete')}>
              <Trash2 size={16} />
              Delete
            </Button>
          </div>
        )}
      </div>

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {!active && (
        <NoticeBar
          notice={{
            type: 'info',
            text: `This venue is inactive, so the apps do not offer it for new events.${venue.statusReason ? ` Reason: ${venue.statusReason}` : ''}`,
          }}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Capacity" value={(venue.capacity || 0).toLocaleString('en-IN')} hint="total of the seat blocks" tone="gray" />
        <StatCard label="Seat blocks" value={savedBlocks.length} />
        <StatCard label="Events using this venue" value={events.toLocaleString('en-IN')} />
        <StatCard label="Status" value={<Badge tone={active ? 'green' : 'gray'}>{active ? 'Active' : 'Inactive'}</Badge>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-deep-blue mb-3">Venue details</h2>
          {venue.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.image} alt={`${venue.name}`} className="w-full max-h-64 object-cover rounded-lg mb-4 bg-gray-100" />
          ) : (
            <p className="text-sm text-gray-500 mb-4">No venue photo has been uploaded.</p>
          )}
          <dl className="text-sm space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <dt className="text-gray-500">Address</dt>
              <dd className="col-span-2 text-gray-900">{venue.location?.address || '—'}</dd>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <dt className="text-gray-500">City</dt>
              <dd className="col-span-2 text-gray-900">{venue.location?.city || '—'}</dd>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <dt className="text-gray-500">State</dt>
              <dd className="col-span-2 text-gray-900">{venue.location?.state || '—'}</dd>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <dt className="text-gray-500">Added</dt>
              <dd className="col-span-2 text-gray-900">{formatDate(venue.createdAt)}</dd>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <dt className="text-gray-500">Amenities</dt>
              <dd className="col-span-2">
                {venue.amenities.length === 0 ? (
                  <span className="text-gray-500">None listed. Use &quot;Edit details&quot; to add them.</span>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {venue.amenities.map((item) => (
                      <li key={item}>
                        <Badge tone="blue">{item}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-deep-blue mb-3">Seating layout image</h2>
          {venue.seatingLayoutImage ? (
            <a href={venue.seatingLayoutImage} target="_blank" rel="noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={venue.seatingLayoutImage} alt={`Seating layout of ${venue.name}`} className="w-full max-h-96 object-contain rounded-lg bg-gray-50 border border-gray-200" />
            </a>
          ) : (
            <EmptyState title="No seating layout uploaded" hint='Upload a plan of the hall from "Edit details".' />
          )}
        </Card>

        <Card className="p-5 xl:col-span-2">
          <h2 className="text-base font-semibold text-deep-blue mb-3">Seat blocks</h2>
          {savedBlocks.length === 0 ? (
            <EmptyState
              title="Seat blocks are not set up"
              hint="Until blocks are added the venue has a capacity of 0 and organisers cannot assign ticket categories to blocks."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {savedBlocks.map((block) => (
                <div key={block.name} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-lg font-semibold text-deep-blue">{block.name}</p>
                  <Badge tone={BLOCK_TONE[block.type] || 'gray'}>{block.type}</Badge>
                  <p className="text-sm text-gray-700 mt-2">{Number(block.totalSeats || 0).toLocaleString('en-IN')} seats</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={showEdit}
        title="Edit venue details"
        onClose={() => setShowEdit(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveDetails} loading={busy}>
              Save changes
            </Button>
          </>
        }
      >
        {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
        {events > 0 && form.name.trim() !== venue.name && (
          <NoticeBar
            notice={{
              type: 'info',
              text: `${events} event${events === 1 ? ' refers' : 's refer'} to this venue. Events that store the venue by name keep the old name "${venue.name}", so the apps will not match them to the renamed venue.`,
            }}
          />
        )}
        <VenueForm values={form} onChange={setForm} onError={setFormError} />
      </Modal>

      <Modal
        open={showSeats}
        title="Seat blocks"
        onClose={() => setShowSeats(false)}
        wide
        footer={
          <>
            <span className="mr-auto self-center text-sm text-gray-700">
              Capacity: <strong>{draftTotal.toLocaleString('en-IN')}</strong> seats in {blocks.length} block{blocks.length === 1 ? '' : 's'}
            </span>
            <Button variant="secondary" onClick={() => setShowSeats(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveSeats} loading={busy}>
              Save seat blocks
            </Button>
          </>
        }
      >
        {seatError && <NoticeBar notice={{ type: 'error', text: seatError }} />}
        {events > 0 && (
          <NoticeBar
            notice={{
              type: 'info',
              text: `${events} event${events === 1 ? ' uses' : 's use'} this venue. Tickets already created for those events keep their own seat ranges; changing blocks here only affects tickets created afterwards.`,
            }}
          />
        )}
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">No blocks yet. Add the first block below.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {blocks.map((block, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label htmlFor={`block-name-${index}`} className="block text-xs text-gray-500 mb-1">
                    Block name
                  </label>
                  <input
                    id={`block-name-${index}`}
                    type="text"
                    value={block.name}
                    maxLength={40}
                    onChange={(e) => setBlocks(blocks.map((b, i) => (i === index ? { ...b, name: e.target.value } : b)))}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-4">
                  <label htmlFor={`block-type-${index}`} className="block text-xs text-gray-500 mb-1">
                    Type
                  </label>
                  <select
                    id={`block-type-${index}`}
                    value={block.type}
                    onChange={(e) => setBlocks(blocks.map((b, i) => (i === index ? { ...b, type: e.target.value } : b)))}
                    className={inputClass}
                  >
                    {BLOCK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <label htmlFor={`block-seats-${index}`} className="block text-xs text-gray-500 mb-1">
                    Seats
                  </label>
                  <input
                    id={`block-seats-${index}`}
                    type="number"
                    min={1}
                    value={Number.isFinite(block.totalSeats) ? block.totalSeats : ''}
                    onChange={(e) => setBlocks(blocks.map((b, i) => (i === index ? { ...b, totalSeats: parseInt(e.target.value, 10) } : b)))}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBlocks(blocks.filter((_, i) => i !== index))}
                  aria-label={`Remove block ${block.name || index + 1}`}
                  className="col-span-1 p-2 rounded-lg text-red-600 hover:bg-red-50 justify-self-center"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="secondary"
          onClick={() => setBlocks([...blocks, { name: nextBlockName(blocks), type: 'Normal', totalSeats: 100 }])}
          disabled={blocks.length >= 100}
        >
          <Plus size={16} />
          Add block
        </Button>
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={pending === 'delete' ? `Delete ${venue.name}` : pending === 'activate' ? `Activate ${venue.name}` : `Deactivate ${venue.name}`}
        message={
          pending === 'delete'
            ? events > 0
              ? `${events} event${events === 1 ? ' uses' : 's use'} this venue, so it cannot be deleted. Deactivate it instead.`
              : 'This permanently removes the venue, its images and its seat blocks.'
            : pending === 'deactivate'
            ? 'Organisers will no longer be offered this venue for new events. Existing events and bookings are not affected.'
            : 'Organisers will be able to choose this venue again.'
        }
        confirmLabel={pending === 'delete' ? 'Delete' : pending === 'activate' ? 'Activate' : 'Deactivate'}
        danger={pending === 'delete'}
        askReason
        reasonRequired={pending === 'delete' || pending === 'deactivate'}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function VenueDetailsPage() {
  const params = useParams()
  const id = String(params.id || '')
  return (
    <AdminShell title="Venue" subtitle="Details, seating layout and seat blocks">
      {id ? <VenueDetail id={id} /> : null}
    </AdminShell>
  )
}
