'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import RatingsSection from '@/components/support/RatingsSection'
import { Card, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import AccountActions from '@/components/artists/AccountActions'
import {
  AccountBadge,
  Avatar,
  EventStatusBadge,
  Field,
  HistoryList,
  KycBadge,
  SectionTitle,
  type HistoryEntry,
  type KycView,
} from '@/components/artists/shared'

interface EventRow {
  _id: string
  name: string
  category: string
  status: string
  startDate: string | null
  startTime: string
  city: string
  place: string
}

interface Organizer {
  _id: string
  name: string
  phone: string
  email: string
  city: string
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
  profileImage: string | null
  identity: { aadhar: string; pan: string } | null
  events: EventRow[]
  eventTotal: number
  history: HistoryEntry[]
  createdAt: string | null
}

interface Balance {
  gross: number
  commission: number
  gst: number
  gatewayFee: number
  refunds: number
  earned: number
  settled: number
  pending: number
}

interface DetailResponse {
  organizer: Organizer
  balance: Balance | null
  ledgerEntries: number
  settlements: {
    _id: string
    service: string
    periodFrom: string | null
    periodTo: string | null
    grossAmount: number | null
    netAmount: number | null
    status: string
    bankReference: string
    paidAt: string | null
  }[]
  recentEntries: { _id: string; reference: string; createdAt: string | null; type: string; service: string; status: string; amount: number; eventId: string }[]
  canManage: boolean
  canViewKyc: boolean
  canViewBalance: boolean
}

function Money({ label, value, strong = false, deduct = false }: { label: string; value: number; strong?: boolean; deduct?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? 'font-semibold text-deep-blue' : 'text-gray-900'}>{deduct && value > 0 ? '−' : ''}
        {formatMoney(value)}
      </span>
    </div>
  )
}

function OrganizerDetail() {
  const params = useParams()
  const id = String(params?.id || '')
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState('')
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<DetailResponse>(`/api/organizers/${id}`))
      setMissing('')
    } catch (error: any) {
      setMissing(error.message || 'Could not load this organiser.')
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
        <EmptyState title={missing || 'Organiser not found'} hint="Go back to the organiser list and open the organiser again." />
      </Card>
    )
  }

  const { organizer, balance } = data
  const hasLedger = data.ledgerEntries > 0

  return (
    <>
      <Link href="/organizers" className="inline-flex items-center gap-1 text-sm text-teal hover:underline mb-3">
        <ArrowLeft size={16} /> All organisers
      </Link>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={organizer.name} src={organizer.profileImage} size={72} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-bold text-deep-blue">{organizer.name || 'No name yet'}</h2>
            <p className="text-sm text-gray-600">{organizer.city || 'No city on the profile'}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <KycBadge kyc={organizer.kyc} correction={organizer.kycCorrectionRequested} />
              <AccountBadge status={organizer.accountStatus} />
            </div>
          </div>
          {data.canManage && (
            <AccountActions
              endpoint={`/api/organizers/${organizer._id}`}
              name={organizer.name}
              status={organizer.accountStatus}
              kind="organiser"
              onDone={(text) => {
                setNotice({ type: 'success', text })
                load()
              }}
              onError={(text) => setNotice({ type: 'error', text })}
            />
          )}
        </div>
        {organizer.accountStatus !== 'active' && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800 rounded-b-xl">
            This account is {organizer.accountStatus}
            {organizer.accountStatusBy ? ` (by ${organizer.accountStatusBy}, ${formatDate(organizer.accountStatusAt, true)})` : ''}
            {organizer.accountStatusReason ? `. Reason: ${organizer.accountStatusReason}` : '.'}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card>
          <SectionTitle>Profile</SectionTitle>
          <dl className="space-y-3 p-5">
            <Field label="Phone">{organizer.phone}</Field>
            <Field label="Email">{organizer.email}</Field>
            <Field label="City">{organizer.city}</Field>
            <Field label="Joined">{formatDate(organizer.createdAt)}</Field>
            <Field label="Signup progress">{organizer.signupStatus}</Field>
          </dl>
        </Card>

        <Card>
          <SectionTitle
            aside={
              data.canViewKyc && organizer.kyc !== 'not_submitted' ? (
                <Link href={`/kyc?role=organizer&id=${organizer._id}`} className="text-sm text-teal font-medium hover:underline">
                  Open review
                </Link>
              ) : undefined
            }
          >
            KYC verification
          </SectionTitle>
          <dl className="space-y-3 p-5">
            <Field label="Status">
              <KycBadge kyc={organizer.kyc} correction={organizer.kycCorrectionRequested} />
            </Field>
            {organizer.kyc === 'not_submitted' && (
              <p className="text-sm text-gray-600">The organiser has not uploaded identity documents yet.</p>
            )}
            <Field label="Reviewed by">{organizer.kycReviewedBy}</Field>
            <Field label="Reviewed on">{organizer.kycReviewedAt ? formatDate(organizer.kycReviewedAt, true) : ''}</Field>
            {organizer.rejectionNotes && <Field label="Note sent to the organiser">{organizer.rejectionNotes}</Field>}
            {organizer.identity && (
              <>
                <Field label="Aadhaar">{organizer.identity.aadhar}</Field>
                <Field label="PAN">{organizer.identity.pan}</Field>
              </>
            )}
          </dl>
        </Card>

        <Card>
          <SectionTitle
            aside={
              data.canViewBalance ? (
                <Link href={`/finance/organizer/${organizer._id}`} className="text-sm text-teal font-medium hover:underline">
                  Open in Finance
                </Link>
              ) : undefined
            }
          >
            Ledger balance
          </SectionTitle>
          {!data.canViewBalance || !balance ? (
            <p className="p-5 text-sm text-gray-600">Your role does not include settlements or finance, so the balance is not shown.</p>
          ) : !hasLedger ? (
            <p className="p-5 text-sm text-gray-600">
              No ledger entries for this organiser yet. Entries appear once ticket payments for their events are verified through the
              payment gateway.
            </p>
          ) : (
            <div className="space-y-2 p-5">
              <Money label="Gross payments" value={balance.gross} />
              <Money label="Commission" value={balance.commission} deduct />
              <Money label="GST on commission" value={balance.gst} deduct />
              <Money label="Gateway fees" value={balance.gatewayFee} deduct />
              <Money label="Refunds" value={balance.refunds} deduct />
              <div className="border-t border-gray-200 pt-2">
                <Money label="Earned" value={balance.earned} strong />
              </div>
              <Money label="Settled (paid out)" value={balance.settled} />
              <Money label="Pending payout" value={balance.pending} strong />
            </div>
          )}
        </Card>
      </div>

      {data.canViewBalance && (
        <Card className="mb-4">
          <SectionTitle
            aside={
              <Link href="/finance/settlements" className="text-sm text-teal font-medium hover:underline">
                Finance, Settlements
              </Link>
            }
          >
            Transactions and settlements
          </SectionTitle>
          {!hasLedger && data.settlements.length === 0 ? (
            <EmptyState
              title="No transactions or settlements yet"
              hint="Verified ticket payments for this organiser's events are written to the ledger and listed here, followed by the settlements created for them in Finance."
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 xl:divide-x divide-gray-100">
              <div className="overflow-x-auto">
                <h3 className="px-5 pt-4 text-sm font-semibold text-deep-blue">Settlements ({data.settlements.length})</h3>
                {data.settlements.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-gray-500">No settlement has been created for this organiser. Create one under Finance, Settlements.</p>
                ) : (
                  <table className="w-full text-sm" data-testid="organiser-settlements">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                        <th className="px-5 py-3 font-medium">Period</th>
                        <th className="px-5 py-3 font-medium text-right">Gross</th>
                        <th className="px-5 py-3 font-medium text-right">Net payable</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.settlements.map((s) => (
                        <tr key={s._id}>
                          <td className="px-5 py-3 whitespace-nowrap">
                            {formatDate(s.periodFrom)} to {formatDate(s.periodTo)}
                          </td>
                          <td className="px-5 py-3 text-right">{formatMoney(s.grossAmount)}</td>
                          <td className="px-5 py-3 text-right">{formatMoney(s.netAmount)}</td>
                          <td className="px-5 py-3">
                            {s.status.replace(/_/g, ' ')}
                            {s.bankReference ? <span className="block text-xs text-gray-500">{s.bankReference}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="overflow-x-auto border-t xl:border-t-0 border-gray-100">
                <h3 className="px-5 pt-4 text-sm font-semibold text-deep-blue">
                  Latest ledger entries ({data.recentEntries.length} of {data.ledgerEntries})
                </h3>
                <table className="w-full text-sm" data-testid="organiser-entries">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Reference</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.recentEntries.map((entry) => (
                      <tr key={entry._id}>
                        <td className="px-5 py-3 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                        <td className="px-5 py-3 font-mono text-xs">{entry.reference}</td>
                        <td className="px-5 py-3">{entry.type.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3 text-right">{formatMoney(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <SectionTitle>
          Events ({organizer.eventTotal}
          {organizer.eventTotal > organizer.events.length ? `, showing the latest ${organizer.events.length}` : ''})
        </SectionTitle>
        {organizer.events.length === 0 ? (
          <EmptyState title="No events created yet" hint="Events this organiser creates in the organiser app appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Place</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {organizer.events.map((event) => (
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
                    <td className="px-5 py-3">
                      <EventStatusBadge status={event.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RatingsSection subject="organizer" id={id} className="mb-4" />

      <Card>
        <SectionTitle>Admin history</SectionTitle>
        <HistoryList
          entries={organizer.history}
          empty="No admin action has been recorded for this organiser yet. KYC decisions and suspensions are listed here."
        />
      </Card>
    </>
  )
}

export default function OrganizerDetailPage() {
  return (
    <AdminShell title="Organiser" subtitle="Profile, KYC, events, ledger balance and account status">
      <OrganizerDetail />
    </AdminShell>
  )
}
