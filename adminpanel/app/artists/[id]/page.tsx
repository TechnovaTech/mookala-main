'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import AccountActions from '@/components/artists/AccountActions'
import {
  AccountBadge,
  Avatar,
  EventStatusBadge,
  Field,
  HistoryList,
  KycBadge,
  SectionTitle,
  selectClass,
  type HistoryEntry,
  type KycView,
} from '@/components/artists/shared'

interface MediaItem {
  index: number
  type: string
  uploadedAt: string | null
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewed: boolean
  reviewedBy: string | null
  reviewReason: string
  url: string
}

interface EventRow {
  _id: string
  name: string
  category: string
  status: string
  startDate: string | null
  startTime: string
  city: string
  place: string
  relation?: string
  artistResponse?: string
  bookings: number
  tickets: number
  value: number
  checkedIn: number
  cancelled: number
  other: number
}

interface BookingRow {
  _id: string
  eventId: string
  eventTitle: string
  userPhone: string
  status: string
  paymentStatus: string
  seats: number
  categories: string
  totalPrice: number
  checkedIn: boolean
  createdAt: string | null
}

interface Feedback {
  rating: number | null
  ratingCount: number
  pendingRatings?: number
  ratings: { _id: string; rating: number; comment: string; customerName: string; status: string; createdAt: string | null }[]
  complaints: { _id: string; subject: string; status: string; priority: string; bookingId: string; createdAt: string | null }[]
  reports: { _id: string; reason: string; details: string; status: string; createdAt: string | null }[]
}

interface Availability {
  from: string
  to: string
  summary: { available: number; unavailable: number; booked: number; not_set: number }
  days: { date: string; status: 'available' | 'unavailable' | 'booked'; source: string; note: string; events: { _id: string; name: string }[] }[]
}

interface Artist {
  _id: string
  name: string
  phone: string
  email: string
  city: string
  genre: string
  pricing: any
  bio: string
  signupStatus: string
  kyc: KycView
  kycCorrectionRequested: boolean
  kycReviewedBy: string | null
  kycReviewedAt: string | null
  rejectionNotes: string
  accountStatus: string
  accountStatusReason: string
  accountStatusBy: string | null
  accountStatusAt: string | null
  categoryId: string | null
  categoryName: string | null
  followers: number
  profileImageUrl: string | null
  bannerImageUrl: string | null
  identity: { aadhar: string; pan: string } | null
  media: MediaItem[]
  events: EventRow[]
  bookingTotals: { bookings: number; tickets: number; value: number; checkedIn: number; cancelled: number; other: number }
  bookingCount: number
  recentBookings: BookingRow[]
  feedback: Feedback
  availability: Availability
  history: HistoryEntry[]
  createdAt: string | null
}

interface DetailResponse {
  artist: Artist
  canManage: boolean
  canViewKyc: boolean
  canViewPayments: boolean
}

interface Category {
  _id: string
  name: string
  parentId: string | null
  status: string
}

const MEDIA_LABEL: Record<string, { label: string; tone: 'gray' | 'green' | 'red' }> = {
  pending: { label: 'Not reviewed', tone: 'gray' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

function CategoryDialog({
  artist,
  onClose,
  onSaved,
  onError,
}: {
  artist: Artist
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [categoryId, setCategoryId] = useState(artist.categoryId || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    api<{ items: any[] }>('/api/admin/r/artist-categories?limit=100&sort=displayOrder&dir=asc')
      .then((data) =>
        setCategories(
          data.items.map((item) => ({
            _id: String(item._id),
            name: item.name || '',
            parentId: item.parentId ? String(item.parentId) : null,
            status: item.status || 'active',
          }))
        )
      )
      .catch((error) => {
        setCategories([])
        setProblem(error.message || 'Could not load the categories.')
      })
  }, [])

  const save = async () => {
    setBusy(true)
    setProblem('')
    try {
      await api(`/api/admin/artists/${artist._id}`, {
        method: 'PATCH',
        body: { action: 'assign_category', categoryId: categoryId || null, reason: reason.trim() },
      })
      onSaved('The category was updated.')
    } catch (error: any) {
      setProblem(error.message || 'The category could not be changed.')
      onError('')
    } finally {
      setBusy(false)
    }
  }

  const parents = (categories || []).filter((c) => !c.parentId)
  const unchanged = categoryId === (artist.categoryId || '')

  return (
    <Modal
      open
      title="Change category"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={unchanged || !reason.trim() || categories === null}>
            Save
          </Button>
        </>
      }
    >
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}
      {categories === null ? (
        <Spinner />
      ) : categories.length === 0 && !problem ? (
        <p className="text-sm text-gray-700">
          There are no artist categories yet.{' '}
          <Link href="/artists/categories" className="text-teal underline">
            Add categories
          </Link>{' '}
          first.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="category-select" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select id="category-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass + ' w-full'}>
              <option value="">No category</option>
              {parents.map((parent) => (
                <React.Fragment key={parent._id}>
                  <option value={parent._id}>
                    {parent.name}
                    {parent.status === 'hidden' ? ' (hidden)' : ''}
                  </option>
                  {(categories || [])
                    .filter((c) => c.parentId === parent._id)
                    .map((child) => (
                      <option key={child._id} value={child._id}>
                        {parent.name} › {child.name}
                        {child.status === 'hidden' ? ' (hidden)' : ''}
                      </option>
                    ))}
                </React.Fragment>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              id="category-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder="Saved in the activity log with the old and new category"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}

const PROFILE_INPUTS: { key: 'name' | 'city' | 'genre' | 'pricing' | 'bio'; label: string; max: number; area?: boolean }[] = [
  { key: 'name', label: 'Name', max: 120 },
  { key: 'city', label: 'City', max: 120 },
  { key: 'genre', label: 'Genre', max: 200 },
  { key: 'pricing', label: 'Pricing', max: 200 },
  { key: 'bio', label: 'Bio', max: 3000, area: true },
]

function ProfileDialog({ artist, onClose, onSaved }: { artist: Artist; onClose: () => void; onSaved: (message: string) => void }) {
  const original = {
    name: artist.name || '',
    city: artist.city || '',
    genre: artist.genre || '',
    pricing: artist.pricing === null || artist.pricing === undefined ? '' : String(artist.pricing),
    bio: artist.bio || '',
  }
  const [form, setForm] = useState(original)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const changed = PROFILE_INPUTS.filter((input) => form[input.key].trim() !== original[input.key].trim())

  const save = async () => {
    setBusy(true)
    setProblem('')
    try {
      const profile: Record<string, string> = {}
      for (const input of changed) profile[input.key] = form[input.key].trim()
      await api(`/api/admin/artists/${artist._id}`, { method: 'PATCH', body: { action: 'edit_profile', profile, reason: reason.trim() } })
      onSaved(`Profile updated: ${changed.map((input) => input.label.toLowerCase()).join(', ')}.`)
    } catch (error: any) {
      setProblem(error.message || 'The profile could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Edit public profile"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={changed.length === 0 || !reason.trim() || !form.name.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      {problem && <NoticeBar notice={{ type: 'error', text: problem }} />}
      <p className="text-sm text-gray-600 mb-4">
        This is the text customers see on the artist&apos;s profile in the apps. Phone, email and identity documents cannot be changed here.
      </p>
      <div className="space-y-4">
        {PROFILE_INPUTS.map((input) => (
          <div key={input.key}>
            <label htmlFor={`profile-${input.key}`} className="block text-sm font-medium text-gray-700 mb-1">
              {input.label}
            </label>
            {input.area ? (
              <textarea
                id={`profile-${input.key}`}
                rows={4}
                maxLength={input.max}
                value={form[input.key]}
                onChange={(e) => setForm({ ...form, [input.key]: e.target.value })}
                className={inputClass}
              />
            ) : (
              <input
                id={`profile-${input.key}`}
                type="text"
                maxLength={input.max}
                value={form[input.key]}
                onChange={(e) => setForm({ ...form, [input.key]: e.target.value })}
                className={inputClass}
              />
            )}
          </div>
        ))}
        <div>
          <label htmlFor="profile-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <textarea
            id="profile-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="Saved in the activity log with the old and new text"
          />
        </div>
      </div>
    </Modal>
  )
}

const DAY_TONE: Record<string, 'green' | 'red' | 'blue'> = { available: 'green', unavailable: 'red', booked: 'blue' }
const DAY_LABEL: Record<string, string> = { available: 'Available', unavailable: 'Unavailable', booked: 'Booked' }

const BOOKING_TONE: Record<string, 'green' | 'red' | 'amber' | 'gray' | 'blue'> = {
  confirmed: 'green',
  attended: 'blue',
  cancelled: 'red',
  pending_payment: 'amber',
  expired: 'gray',
}

function ArtistDetail() {
  const params = useParams()
  const id = String(params?.id || '')
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [missing, setMissing] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [removing, setRemoving] = useState<'profile' | 'banner' | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<DetailResponse>(`/api/admin/artists/${id}`))
      setMissing('')
    } catch (error: any) {
      setMissing(error.message || 'Could not load this artist.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner />
  if (!data) {
    return (
      <Card>
        <EmptyState title={missing || 'Artist not found'} hint="Go back to the artist list and open the artist again." />
      </Card>
    )
  }

  const { artist } = data
  const done = (text: string) => {
    setNotice({ type: 'success', text })
    load()
  }

  const removeImage = async (reason: string) => {
    if (!removing) return
    setRemoveBusy(true)
    try {
      await api(`/api/admin/artists/${artist._id}`, { method: 'PATCH', body: { action: 'remove_image', image: removing, reason } })
      const label = removing === 'profile' ? 'profile photo' : 'banner image'
      setRemoving(null)
      done(`The ${label} was removed.`)
    } catch (error: any) {
      setRemoving(null)
      setNotice({ type: 'error', text: `Nothing was changed. ${error.message || ''}` })
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <>
      <Link href="/artists" className="inline-flex items-center gap-1 text-sm text-teal hover:underline mb-3">
        <ArrowLeft size={16} /> All artists
      </Link>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="mb-4 overflow-hidden">
        {artist.bannerImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artist.bannerImageUrl} alt="" className="w-full h-36 object-cover bg-gray-100" />
        )}
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={artist.name} src={artist.profileImageUrl} size={72} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-bold text-deep-blue">{artist.name || 'No name yet'}</h2>
            <p className="text-sm text-gray-600">
              {[artist.genre, artist.city].filter(Boolean).join(' · ') || 'No genre or city on the profile'}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <KycBadge kyc={artist.kyc} correction={artist.kycCorrectionRequested} />
              <AccountBadge status={artist.accountStatus} />
              {artist.categoryName && <Badge tone="blue">{artist.categoryName}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.canViewPayments && (
              <Link
                href={`/artists/payments?artist=${artist._id}`}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                Payments
              </Link>
            )}
            {data.canManage && (
              <AccountActions
                endpoint={`/api/admin/artists/${artist._id}`}
                name={artist.name}
                status={artist.accountStatus}
                kind="artist"
                onDone={done}
                onError={(text) => setNotice({ type: 'error', text })}
              />
            )}
          </div>
        </div>
        {artist.accountStatus !== 'active' && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
            This account is {artist.accountStatus}
            {artist.accountStatusBy ? ` (by ${artist.accountStatusBy}, ${formatDate(artist.accountStatusAt, true)})` : ''}
            {artist.accountStatusReason ? `. Reason: ${artist.accountStatusReason}` : '.'} It is not listed in the apps.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <SectionTitle
            aside={
              data.canManage ? (
                <button onClick={() => setProfileOpen(true)} className="text-sm text-teal font-medium hover:underline">
                  Edit profile
                </button>
              ) : undefined
            }
          >
            Profile
          </SectionTitle>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
            <Field label="Phone">{artist.phone}</Field>
            <Field label="Email">{artist.email}</Field>
            <Field label="City">{artist.city}</Field>
            <Field label="Genre">{artist.genre}</Field>
            <Field label="Pricing">{artist.pricing ? String(artist.pricing) : ''}</Field>
            <Field label="Followers">{String(artist.followers)}</Field>
            <Field label="Joined">{formatDate(artist.createdAt)}</Field>
            <Field label="Signup progress">{artist.signupStatus}</Field>
            <div className="sm:col-span-2">
              <Field label="Bio">{artist.bio ? <span className="whitespace-pre-wrap">{artist.bio}</span> : ''}</Field>
            </div>
            <Field label="Profile photo">
              {artist.profileImageUrl ? (
                <span className="flex items-center gap-3">
                  Uploaded
                  {data.canManage && (
                    <button onClick={() => setRemoving('profile')} className="text-sm text-red-700 font-medium hover:underline">
                      Remove profile photo
                    </button>
                  )}
                </span>
              ) : (
                'None'
              )}
            </Field>
            <Field label="Banner image">
              {artist.bannerImageUrl ? (
                <span className="flex items-center gap-3">
                  Uploaded
                  {data.canManage && (
                    <button onClick={() => setRemoving('banner')} className="text-sm text-red-700 font-medium hover:underline">
                      Remove banner image
                    </button>
                  )}
                </span>
              ) : (
                'None'
              )}
            </Field>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle
              aside={
                data.canViewKyc && artist.kyc !== 'not_submitted' ? (
                  <Link href={`/kyc?role=artist&id=${artist._id}`} className="text-sm text-teal font-medium hover:underline">
                    Open review
                  </Link>
                ) : undefined
              }
            >
              KYC verification
            </SectionTitle>
            <dl className="space-y-3 p-5">
              <Field label="Status">
                <KycBadge kyc={artist.kyc} correction={artist.kycCorrectionRequested} />
              </Field>
              {artist.kyc === 'not_submitted' && (
                <p className="text-sm text-gray-600">The artist has not uploaded identity documents yet.</p>
              )}
              <Field label="Reviewed by">{artist.kycReviewedBy}</Field>
              <Field label="Reviewed on">{artist.kycReviewedAt ? formatDate(artist.kycReviewedAt, true) : ''}</Field>
              {artist.rejectionNotes && <Field label="Note sent to the artist">{artist.rejectionNotes}</Field>}
              {artist.identity && (
                <>
                  <Field label="Aadhaar">{artist.identity.aadhar}</Field>
                  <Field label="PAN">{artist.identity.pan}</Field>
                </>
              )}
            </dl>
          </Card>

          <Card>
            <SectionTitle
              aside={
                data.canManage ? (
                  <button onClick={() => setCategoryOpen(true)} className="text-sm text-teal font-medium hover:underline">
                    Change
                  </button>
                ) : undefined
              }
            >
              Category
            </SectionTitle>
            <p className="p-5 text-sm text-gray-900">{artist.categoryName || 'Not assigned to a category'}</p>
          </Card>

          <Card>
            <SectionTitle
              aside={
                <Link href={`/artists/availability?artist=${artist._id}`} className="text-sm text-teal font-medium hover:underline">
                  Open calendar
                </Link>
              }
            >
              Availability, next 30 days
            </SectionTitle>
            <div className="p-5">
              <div className="flex flex-wrap gap-2 mb-3" data-testid="availability-summary">
                <Badge tone="green">{artist.availability.summary.available} available</Badge>
                <Badge tone="red">{artist.availability.summary.unavailable} unavailable</Badge>
                <Badge tone="blue">{artist.availability.summary.booked} booked</Badge>
                <Badge tone="gray">{artist.availability.summary.not_set} not set</Badge>
              </div>
              {artist.availability.days.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Nothing is recorded for the next 30 days. Days are set by the artist in the artist app, by an accepted event, or by an admin on the
                  availability calendar.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {artist.availability.days.slice(0, 12).map((day) => (
                    <li key={day.date} className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-700 w-24">{formatDate(day.date)}</span>
                      <Badge tone={DAY_TONE[day.status]}>{DAY_LABEL[day.status]}</Badge>
                      <span className="text-gray-500 text-xs">
                        {day.events.length ? day.events.map((event) => event.name).join(', ') : day.source === 'admin' ? 'set by an admin' : 'set by the artist'}
                      </span>
                    </li>
                  ))}
                  {artist.availability.days.length > 12 && (
                    <li className="text-xs text-gray-500">and {artist.availability.days.length - 12} more days on the calendar</li>
                  )}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mb-4">
        <SectionTitle
          aside={
            artist.media.length > 0 ? (
              <Link href={`/artists/portfolio?artistId=${artist._id}`} className="text-sm text-teal font-medium hover:underline">
                Review portfolio
              </Link>
            ) : undefined
          }
        >
          Portfolio ({artist.media.length})
        </SectionTitle>
        {artist.media.length === 0 ? (
          <EmptyState title="No portfolio items" hint="Photos and videos the artist uploads in the artist app appear here." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-5">
            {artist.media.map((item) => (
              <div key={item.index} className="border border-gray-200 rounded-lg overflow-hidden">
                {/video/i.test(item.type) ? (
                  <video src={item.url} controls preload="none" className="w-full h-32 object-cover bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={`Portfolio item ${item.index + 1}`} loading="lazy" className="w-full h-32 object-cover bg-gray-100" />
                )}
                <div className="p-2">
                  <Badge tone={MEDIA_LABEL[item.reviewStatus].tone}>{MEDIA_LABEL[item.reviewStatus].label}</Badge>
                  <p className="text-xs text-gray-500 mt-1">{item.uploadedAt ? formatDate(item.uploadedAt) : 'Upload date not recorded'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle>Events ({artist.events.length})</SectionTitle>
        {artist.events.length === 0 ? (
          <EmptyState title="No events" hint="Events this artist created or was added to by an organiser appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Place</th>
                  <th className="px-5 py-3 font-medium">Role and response</th>
                  <th className="px-5 py-3 font-medium">Event status</th>
                  <th className="px-5 py-3 font-medium text-right">Bookings</th>
                  <th className="px-5 py-3 font-medium text-right">Tickets</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium text-right">Checked in</th>
                  <th className="px-5 py-3 font-medium text-right">Cancelled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {artist.events.map((event) => (
                  <tr key={event._id}>
                    <td className="px-5 py-3">
                      <Link href={`/events/${event._id}`} className="font-medium text-deep-blue hover:underline">
                        {event.name || 'Untitled event'}
                      </Link>
                      {event.category && <p className="text-xs text-gray-500">{event.category}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                      {event.startDate ? formatDate(event.startDate) : '—'}
                      {event.startTime ? `, ${event.startTime}` : ''}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{[event.place, event.city].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {event.relation === 'created' ? (
                        'Created by the artist'
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          Invited
                          <Badge tone={event.artistResponse === 'accepted' ? 'green' : event.artistResponse === 'rejected' ? 'red' : 'amber'}>
                            {event.artistResponse === 'accepted'
                              ? 'Accepted'
                              : event.artistResponse === 'rejected'
                              ? 'Declined'
                              : 'No answer yet'}
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="px-5 py-3 text-right">{event.bookings}</td>
                    <td className="px-5 py-3 text-right">{event.tickets}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">{formatMoney(event.value)}</td>
                    <td className="px-5 py-3 text-right">{event.checkedIn}</td>
                    <td className="px-5 py-3 text-right">{event.cancelled}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 font-semibold text-deep-blue">
                <tr data-testid="artist-booking-totals">
                  <td className="px-5 py-3" colSpan={5}>
                    Total
                  </td>
                  <td className="px-5 py-3 text-right">{artist.bookingTotals.bookings}</td>
                  <td className="px-5 py-3 text-right">{artist.bookingTotals.tickets}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">{formatMoney(artist.bookingTotals.value)}</td>
                  <td className="px-5 py-3 text-right">{artist.bookingTotals.checkedIn}</td>
                  <td className="px-5 py-3 text-right">{artist.bookingTotals.cancelled}</td>
                </tr>
              </tfoot>
            </table>
            <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
              Bookings, tickets and value count confirmed and attended bookings. Cancelled bookings are shown separately; bookings that were never paid
              for are not counted.
            </p>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle>Booking history ({artist.bookingCount})</SectionTitle>
        {artist.recentBookings.length === 0 ? (
          <EmptyState title="No bookings yet" hint="Customer bookings on this artist's events appear here as they are made in the apps and on the website." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Booked on</th>
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Tickets</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {artist.recentBookings.map((booking) => (
                  <tr key={booking._id}>
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{formatDate(booking.createdAt, true)}</td>
                    <td className="px-5 py-3">
                      <Link href={`/events/${booking.eventId}`} className="font-medium text-deep-blue hover:underline">
                        {booking.eventTitle || 'Untitled event'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{booking.userPhone || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {booking.seats}
                      {booking.categories ? ` (${booking.categories})` : ''}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">{formatMoney(booking.totalPrice)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={BOOKING_TONE[booking.status] || 'gray'}>{booking.status.replace(/_/g, ' ') || 'unknown'}</Badge>
                      {booking.checkedIn && <span className="ml-2 text-xs text-gray-500">checked in</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{booking.paymentStatus.replace(/_/g, ' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {artist.bookingCount > artist.recentBookings.length && (
              <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
                Showing the latest {artist.recentBookings.length} of {artist.bookingCount} bookings. Open an event to see all of its bookings.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle
          aside={
            <Link href="/artists/performance" className="text-sm text-teal font-medium hover:underline">
              Compare artists
            </Link>
          }
        >
          Ratings, complaints and reports
        </SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-gray-100">
          <div className="p-5" data-testid="artist-ratings">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Ratings{' '}
              <span className="font-normal text-gray-600">
                {artist.feedback.rating !== null
                  ? `${artist.feedback.rating.toFixed(2)} out of 5 from ${artist.feedback.ratingCount} published`
                  : 'none published yet'}
              </span>
            </h3>
            {Boolean(artist.feedback.pendingRatings) && (
              <p className="text-xs text-gray-500 mb-2">
                {artist.feedback.pendingRatings} waiting for review on{' '}
                <Link href="/support/feedback?status=pending" className="text-teal underline">Feedback &amp; Ratings</Link>
              </p>
            )}
            {artist.feedback.ratings.length === 0 ? (
              <p className="text-sm text-gray-500">
                Customers rate the events they attended from My bookings in the app. A rating of an event this artist performed in counts here once it is published.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {artist.feedback.ratings.map((rating) => (
                  <li key={rating._id}>
                    <span className="font-medium text-gray-900">{rating.rating} / 5</span>
                    <span className="text-gray-500"> · {rating.customerName || 'Customer'} · {formatDate(rating.createdAt)}</span>
                    {rating.comment && <p className="text-gray-700">{rating.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-5 border-t lg:border-t-0 border-gray-100" data-testid="artist-complaints">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Complaints ({artist.feedback.complaints.length})</h3>
            {artist.feedback.complaints.length === 0 ? (
              <p className="text-sm text-gray-500">Complaints that name a booking on one of this artist&apos;s events appear here.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {artist.feedback.complaints.map((complaint) => (
                  <li key={complaint._id}>
                    <Link href={`/support/complaints?id=${complaint._id}`} className="font-medium text-deep-blue hover:underline">
                      {complaint.subject || 'Complaint'}
                    </Link>
                    <span className="text-gray-500"> · {complaint.status.replace(/_/g, ' ')} · {formatDate(complaint.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-5 border-t lg:border-t-0 border-gray-100" data-testid="artist-reports">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Reports ({artist.feedback.reports.length})</h3>
            {artist.feedback.reports.length === 0 ? (
              <p className="text-sm text-gray-500">Reports filed against this artist&apos;s phone number appear here.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {artist.feedback.reports.map((report) => (
                  <li key={report._id}>
                    <span className="font-medium text-gray-900">{report.reason.replace(/_/g, ' ') || 'Report'}</span>
                    <span className="text-gray-500"> · {report.status.replace(/_/g, ' ')} · {formatDate(report.createdAt)}</span>
                    {report.details && <p className="text-gray-700">{report.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Admin history</SectionTitle>
        <HistoryList
          entries={artist.history}
          empty="No admin action has been recorded for this artist yet. KYC decisions, suspensions, category changes and portfolio reviews are listed here."
        />
      </Card>

      {profileOpen && (
        <ProfileDialog
          artist={artist}
          onClose={() => setProfileOpen(false)}
          onSaved={(text) => {
            setProfileOpen(false)
            done(text)
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing === 'banner' ? 'Remove the banner image?' : 'Remove the profile photo?'}
        message="The image is deleted from the artist's profile and stops showing in the apps. The artist can upload a new one. The image is not kept, so this cannot be undone."
        confirmLabel="Remove image"
        danger
        askReason
        reasonRequired
        busy={removeBusy}
        onConfirm={removeImage}
        onClose={() => setRemoving(null)}
      />

      {categoryOpen && (
        <CategoryDialog
          artist={artist}
          onClose={() => setCategoryOpen(false)}
          onError={() => {}}
          onSaved={(text) => {
            setCategoryOpen(false)
            done(text)
          }}
        />
      )}
    </>
  )
}

export default function ArtistDetailPage() {
  return (
    <AdminShell title="Artist" subtitle="Profile, KYC, category, availability, portfolio, events, bookings, ratings and account status">
      <ArtistDetail />
    </AdminShell>
  )
}
