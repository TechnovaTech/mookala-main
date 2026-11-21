'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NoticeBar,
  Spinner,
  StatCard,
  api,
  formatDate,
  formatMoney,
  type Notice,
} from '@/components/ui'
import type { Tone } from '@/lib/resource-types'
import {
  AccountBadge,
  SignupBadge,
  UserActionDialog,
  UserStatusBadge,
  type AccountStatus,
  type PendingAction,
  type VerifiedByAdmin,
} from '@/components/users/shared'

interface Profile {
  id: string
  name: string
  email: string
  phone: string
  city: string
  genres: string[]
  profileImage: string | null
  followedArtistsCount: number
  status: string
  phoneVerified: boolean
  profileCompleted: boolean
  accountStatus: AccountStatus
  accountStatusReason: string | null
  accountStatusBy: string | null
  accountStatusAt: string | null
  verifiedByAdmin: VerifiedByAdmin | null
  createdAt: string | null
}

interface Booking {
  id: string
  eventTitle: string
  eventDate: string | null
  eventTime: string | null
  venue: string
  totalSeats: number | null
  amount: number
  status: string
  paymentStatus: string
  createdAt: string | null
}

interface Transaction {
  id: string
  reference: string
  type: string
  service: string
  amount: number
  status: string
  bookingId: string
  description: string
  createdAt: string | null
}

interface SupportCase {
  id: string
  kind: string
  subject: string
  service: string
  priority: string
  status: string
  createdAt: string | null
}

interface Feedback {
  id: string
  targetType: string
  targetName: string
  rating: number
  comment: string
  status: string
  createdAt: string | null
}

interface Report {
  id: string
  reason: string
  details: string
  reporterPhone: string
  status: string
  actionTaken: string
  createdAt: string | null
}

interface AdminAction {
  id: string
  action: string
  label: string
  adminName: string | null
  adminEmail: string | null
  reason: string | null
  createdAt: string | null
}

interface TimelineItem {
  at: string
  type: string
  title: string
  detail: string
}

interface Detail {
  user: Profile
  bookings: Booking[]
  bookingSummary: { total: number; counted: number; confirmed: number; cancelled: number; paidAmount: number }
  transactions: Transaction[]
  transactionsTotal: number
  supportCases: SupportCase[]
  feedback: Feedback[]
  reports: Report[]
  reportsFiled: { id: string; reportedName: string; reportedPhone: string; reportedType: string; reason: string; status: string; createdAt: string | null }[]
  lastSignInAt: string | null
  adminActions: AdminAction[]
  timeline: TimelineItem[]
}

const words = (value: string) => (value ? value.replace(/_/g, ' ') : '—')

const BOOKING_TONES: Record<string, Tone> = {
  confirmed: 'green',
  attended: 'green',
  pending_payment: 'amber',
  cancelled: 'red',
  expired: 'gray',
}
const PAYMENT_TONES: Record<string, Tone> = {
  paid: 'green',
  pending: 'amber',
  unverified: 'amber',
  failed: 'red',
  refund_requested: 'purple',
  refunded: 'blue',
}
const TXN_TONES: Record<string, Tone> = { success: 'green', pending: 'amber', failed: 'red', refunded: 'blue', disputed: 'purple' }
const CASE_TONES: Record<string, Tone> = {
  open: 'blue',
  in_progress: 'amber',
  waiting_customer: 'purple',
  escalated: 'red',
  resolved: 'green',
  closed: 'gray',
  under_review: 'amber',
  action_taken: 'green',
  dismissed: 'gray',
  pending: 'amber',
  published: 'green',
  hidden: 'gray',
}
const TIMELINE_TONES: Record<string, Tone> = { signup: 'green', signin: 'gray', booking: 'blue', payment: 'green', support: 'amber', feedback: 'gray', report: 'red', admin: 'purple' }
const TIMELINE_LABELS: Record<string, string> = {
  signup: 'Signup',
  signin: 'Sign-in',
  booking: 'Booking',
  payment: 'Payment',
  support: 'Support',
  feedback: 'Feedback',
  report: 'Report',
  admin: 'Admin action',
}
const RESTRICTION_ACTIONS = new Set(['suspend', 'block', 'reactivate'])

function StatusBadge({ value, tones }: { value: string; tones: Record<string, Tone> }) {
  if (!value) return <span className="text-gray-400">—</span>
  return <Badge tone={tones[value] || 'gray'}>{words(value)}</Badge>
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
        {note && <div className="text-xs text-gray-500">{note}</div>}
      </div>
      {children}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 break-words">{children}</dd>
    </div>
  )
}

const TH = 'px-4 py-3'
const HEAD = 'bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500'

function UserDetail({ id }: { id: string }) {
  const router = useRouter()
  const canManage = useCan('users:manage')
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/users/${id}`))
      setLoadError('')
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load this user.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner label="Loading user..." />

  if (!data) {
    return (
      <Card>
        <EmptyState title={loadError || 'User not found'} hint="The account may have been deleted. Go back to the users list to find another one." />
        <div className="flex justify-center pb-8">
          <Link href="/users" className="text-sm font-medium text-deep-blue hover:underline">
            Back to users
          </Link>
        </div>
      </Card>
    )
  }

  const { user, bookings, bookingSummary, transactions, supportCases, feedback, reports, adminActions, timeline } = data
  const reportsFiled = data.reportsFiled || []
  // The support screens accept ?q= to show one customer and ?id= to open one record.
  const phoneQuery = user.phone ? `?q=${encodeURIComponent(user.phone)}` : ''
  const restrictionHistory = adminActions.filter((a) => RESTRICTION_ACTIONS.has(a.action))
  const act = (action: PendingAction['action']) => setPending({ action, user })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link href="/users" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-deep-blue">
          <ArrowLeft size={16} />
          Back to users
        </Link>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {user.verifiedByAdmin ? (
              <Button variant="secondary" onClick={() => act('unverify')}>Clear manual verification</Button>
            ) : (
              <Button variant="secondary" onClick={() => act('verify')}>Mark as verified</Button>
            )}
            {user.accountStatus === 'active' && (
              <Button variant="secondary" onClick={() => act('suspend')}>Suspend</Button>
            )}
            {user.accountStatus !== 'blocked' && (
              <Button variant="danger" onClick={() => act('block')}>Block</Button>
            )}
            {user.accountStatus !== 'active' && <Button onClick={() => act('reactivate')}>Reactivate</Button>}
            <Button variant="ghost" className="text-red-700" onClick={() => act('delete')}>Delete</Button>
          </div>
        )}
      </div>

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {loadError && <NoticeBar notice={{ type: 'error', text: loadError }} />}

      {user.accountStatus !== 'active' && (
        <div
          role="status"
          className={`border rounded-lg px-4 py-3 text-sm mb-4 ${
            user.accountStatus === 'blocked' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <p className="font-semibold">This account is {user.accountStatus}.</p>
          <p className="mt-1">Reason: {user.accountStatusReason || 'No reason was recorded (restricted before reasons were required).'}</p>
          {(user.accountStatusBy || user.accountStatusAt) && (
            <p className="mt-1 text-xs opacity-80">
              {user.accountStatusBy ? `By ${user.accountStatusBy}` : ''}
              {user.accountStatusBy && user.accountStatusAt ? ' on ' : ''}
              {user.accountStatusAt ? formatDate(user.accountStatusAt, true) : ''}
            </p>
          )}
        </div>
      )}

      <Section title="Profile and verification">
        <div className="p-5 flex flex-col sm:flex-row gap-5">
          {user.profileImage && (user.profileImage.startsWith('data:image/') || user.profileImage.startsWith('http')) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.profileImage} alt={`Profile photo of ${user.name || 'user'}`} className="w-20 h-20 rounded-full object-cover border border-gray-200 shrink-0" />
          ) : (
            <div aria-hidden="true" className="w-20 h-20 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-2xl font-semibold shrink-0">
              {(user.name || user.phone || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <h2 className="text-xl font-bold text-deep-blue">{user.name || 'Name not provided'}</h2>
              <UserStatusBadge user={user} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Phone">{user.phone || '—'}</Field>
              <Field label="Email">{user.email || 'Not provided'}</Field>
              <Field label="City">{user.city || 'Not provided'}</Field>
              <Field label="Joined">{formatDate(user.createdAt, true)}</Field>
              <Field label="Last sign-in">
                {data.lastSignInAt ? formatDate(data.lastSignInAt, true) : <span className="text-gray-500">None recorded</span>}
              </Field>
              <Field label="Signup stage"><SignupBadge status={user.status} /></Field>
              <Field label="Phone (OTP)">
                {user.phoneVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="gray">Not verified</Badge>}
              </Field>
              <Field label="Profile">
                {user.profileCompleted ? <Badge tone="green">Completed</Badge> : <Badge tone="amber">Incomplete</Badge>}
              </Field>
              <Field label="Verified by admin">
                {user.verifiedByAdmin ? (
                  <>
                    <Badge tone="green">Verified</Badge>
                    <div className="text-xs text-gray-500 mt-1">
                      {user.verifiedByAdmin.by || 'Admin'} · {formatDate(user.verifiedByAdmin.at, true)}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{user.verifiedByAdmin.reason}</div>
                  </>
                ) : (
                  <Badge tone="gray">Not marked</Badge>
                )}
              </Field>
              <Field label="Artists followed">{user.followedArtistsCount}</Field>
              <Field label="Preferred genres">
                {user.genres.length ? (
                  <div className="flex flex-wrap gap-1">
                    {user.genres.map((genre) => (
                      <Badge key={genre} tone="blue">{genre}</Badge>
                    ))}
                  </div>
                ) : (
                  'None selected'
                )}
              </Field>
            </dl>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Bookings" value={bookingSummary.total.toLocaleString('en-IN')} />
        <StatCard label="Confirmed or attended" value={bookingSummary.confirmed.toLocaleString('en-IN')} />
        <StatCard label="Cancelled" value={bookingSummary.cancelled.toLocaleString('en-IN')} />
        <StatCard label="Paid on bookings" value={formatMoney(bookingSummary.paidAmount)} hint="Payment status paid only" tone="gray" />
      </div>
      {bookingSummary.counted < bookingSummary.total && (
        <NoticeBar
          notice={{
            type: 'info',
            text: `This customer has ${bookingSummary.total} bookings. The confirmed, cancelled and paid figures cover the latest ${bookingSummary.counted}.`,
          }}
        />
      )}

      <Section title="Account restriction" note={<AccountBadge status={user.accountStatus} />}>
        {restrictionHistory.length === 0 ? (
          <EmptyState
            title={user.accountStatus === 'active' ? 'This account has never been restricted' : 'No restriction history recorded'}
            hint="Each suspend, block and reactivate action is listed here with the admin who did it and the reason given."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>When</th>
                  <th scope="col" className={TH}>Action</th>
                  <th scope="col" className={TH}>By</th>
                  <th scope="col" className={TH}>Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {restrictionHistory.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(a.createdAt, true)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={a.action === 'reactivate' ? 'green' : a.action === 'block' ? 'red' : 'amber'}>{a.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.adminName || a.adminEmail || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 break-words">{a.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Booking history"
        note={bookingSummary.total > bookings.length ? `Latest ${bookings.length} of ${bookingSummary.total}` : undefined}
      >
        {bookings.length === 0 ? (
          <EmptyState title="No bookings yet" hint="Bookings made in the app or website with this phone number appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Booked on</th>
                  <th scope="col" className={TH}>Event</th>
                  <th scope="col" className={TH}>Event date</th>
                  <th scope="col" className={TH}>Seats</th>
                  <th scope="col" className={TH}>Amount</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(b.createdAt, true)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{b.eventTitle || 'Event name not recorded'}</div>
                      <div className="text-xs text-gray-500">
                        {b.venue ? b.venue + ' · ' : ''}
                        <span className="font-mono">{b.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {formatDate(b.eventDate)}
                      {b.eventTime ? ` ${b.eventTime}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{b.totalSeats ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{formatMoney(b.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge value={b.status} tones={BOOKING_TONES} /></td>
                    <td className="px-4 py-3"><StatusBadge value={b.paymentStatus} tones={PAYMENT_TONES} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Transaction history"
        note={data.transactionsTotal > transactions.length ? `Latest ${transactions.length} of ${data.transactionsTotal}` : undefined}
      >
        {transactions.length === 0 ? (
          <EmptyState
            title="No ledger entries for this customer"
            hint="Payments, refunds and their charges appear here once they are recorded in the financial ledger against this phone number. Bookings paid before the ledger existed have no entries."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Reference</th>
                  <th scope="col" className={TH}>Type</th>
                  <th scope="col" className={TH}>Service</th>
                  <th scope="col" className={TH}>Amount</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Booking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(t.createdAt, true)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{t.reference || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(t.type)}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(t.service)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{formatMoney(t.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge value={t.status} tones={TXN_TONES} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.bookingId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Complaints and support tickets"
        note={
          <span>
            Manage this customer&apos;s cases in{' '}
            <Link href={`/support/complaints${phoneQuery}`} className="text-deep-blue hover:underline">Complaints</Link> or{' '}
            <Link href={`/support/tickets${phoneQuery}`} className="text-deep-blue hover:underline">Support Tickets</Link>
          </span>
        }
      >
        {supportCases.length === 0 ? (
          <EmptyState title="No complaints or tickets" hint="Cases recorded by support staff with this customer's phone number appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Raised</th>
                  <th scope="col" className={TH}>Kind</th>
                  <th scope="col" className={TH}>Subject</th>
                  <th scope="col" className={TH}>Service</th>
                  <th scope="col" className={TH}>Priority</th>
                  <th scope="col" className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supportCases.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(c.createdAt, true)}</td>
                    <td className="px-4 py-3 text-gray-700">{c.kind === 'complaint' ? 'Complaint' : 'Ticket'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/support/${c.kind === 'complaint' ? 'complaints' : 'tickets'}?id=${c.id}`} className="text-deep-blue hover:underline">
                        {c.subject || 'Open case'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(c.service)}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(c.priority)}</td>
                    <td className="px-4 py-3"><StatusBadge value={c.status} tones={CASE_TONES} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Feedback and ratings"
        note={
          <Link href={`/support/feedback${phoneQuery}`} className="text-deep-blue hover:underline">Manage this customer&apos;s feedback</Link>
        }
      >
        {feedback.length === 0 ? (
          <EmptyState
            title="No feedback from this customer"
            hint="The apps and website do not collect ratings yet. Feedback entered by staff with this phone number appears here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>About</th>
                  <th scope="col" className={TH}>Rating</th>
                  <th scope="col" className={TH}>Comment</th>
                  <th scope="col" className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {feedback.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(f.createdAt, true)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      <span className="capitalize">{words(f.targetType)}</span>
                      {f.targetName ? `: ${f.targetName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{f.rating ? `${f.rating} / 5` : '—'}</td>
                    <td className="px-4 py-3 text-gray-700 break-words">{f.comment || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge value={f.status} tones={CASE_TONES} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Reports against this user"
        note={
          <Link href={`/support/reports${phoneQuery}`} className="text-deep-blue hover:underline">Review these reports in Reported Accounts</Link>
        }
      >
        {reports.length === 0 ? (
          <EmptyState title="No one has reported this user" hint="Reports recorded against this phone number appear here for review." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Reason</th>
                  <th scope="col" className={TH}>Details</th>
                  <th scope="col" className={TH}>Reported by</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Action taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(r.createdAt, true)}</td>
                    <td className="px-4 py-3 capitalize">
                      <Link href={`/support/reports?id=${r.id}`} className="text-deep-blue hover:underline">{words(r.reason)}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 break-words">{r.details || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{r.reporterPhone || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge value={r.status} tones={CASE_TONES} /></td>
                    <td className="px-4 py-3 text-gray-700 break-words">{r.actionTaken || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {reportsFiled.length > 0 && (
        <Section title="Reports filed by this user" note="Accounts this customer reported">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Reported account</th>
                  <th scope="col" className={TH}>Type</th>
                  <th scope="col" className={TH}>Reason</th>
                  <th scope="col" className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportsFiled.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(r.createdAt, true)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {r.reportedName || '—'}
                      {r.reportedPhone && <div className="text-xs text-gray-500">{r.reportedPhone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(r.reportedType)}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{words(r.reason)}</td>
                    <td className="px-4 py-3"><StatusBadge value={r.status} tones={CASE_TONES} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        title="Customer timeline"
        note={
          <span>
            Signup, sign-ins, bookings, payments, support cases, feedback, reports and admin actions, newest first ·{' '}
            <Link href={`/users/activity?user=${user.id}`} className="text-deep-blue hover:underline">Open in User Activity</Link>
          </span>
        }
      >
        {timeline.length === 0 ? (
          <EmptyState title="Nothing on the timeline yet" hint="Signup, bookings, support cases and admin actions on this account are listed here in time order." />
        ) : (
          <ol className="p-5 space-y-4">
            {timeline.map((item, index) => (
              <li key={index} className="flex gap-4">
                <div className="w-36 shrink-0 text-xs text-gray-500 pt-0.5">{formatDate(item.at, true)}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TIMELINE_TONES[item.type] || 'gray'}>{TIMELINE_LABELS[item.type] || item.type}</Badge>
                    <span className="text-sm text-gray-900">{item.title}</span>
                  </div>
                  {item.detail && <p className="text-sm text-gray-600 mt-1 break-words">{item.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <UserActionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(message, action) => {
          setPending(null)
          if (action === 'delete') {
            router.push('/users')
            return
          }
          setNotice({ type: 'success', text: message })
          load()
        }}
      />
    </>
  )
}

export default function UserDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  return (
    <AdminShell title="User Details" subtitle="Profile, verification, restrictions and full customer history">
      <UserDetail id={id} />
    </AdminShell>
  )
}
