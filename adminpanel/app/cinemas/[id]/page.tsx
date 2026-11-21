'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Card, EmptyState, Spinner, StatCard, api, formatDate, formatMoney } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

interface Show {
  _id: string
  title: string
  language: string
  screen: string
  showAt: string | null
  status: string
  ticketCategories: string
  basePrice: number
  totalSeats: number
  seatsSold: number
  remaining: number
  value: number
}

interface Account {
  cinema: {
    _id: string
    name: string
    ownerName: string
    ownerPhone: string
    ownerEmail: string
    city: string
    state: string
    address: string
    screens: number
    totalSeats: number
    gstNumber: string
    status: string
    statusReason: string
    reviewedBy: string
    reviewedAt: string | null
    createdAt: string | null
    createdBy: string
  }
  shows: Show[]
  showTotals: { shows: number; scheduled: number; cancelled: number; totalSeats: number; seatsSold: number; value: number }
  history: { _id: string; action: string; adminName: string; before: any; after: any; reason: string; createdAt: string }[]
  canViewMoney: boolean
  balance: { gross: number; commission: number; gst: number; gatewayFee: number; refunds: number; earned: number; settled: number; pending: number } | null
  entryCount: number
  entries: { _id: string; reference: string; createdAt: string | null; type: string; service: string; status: string; amount: number; description: string }[]
  settlements: {
    _id: string
    periodFrom: string | null
    periodTo: string | null
    grossAmount: number | null
    commissionAmount: number | null
    netAmount: number | null
    status: string
    bankReference: string
    paidAt: string | null
    createdAt: string | null
  }[]
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  suspended: { label: 'Suspended', tone: 'gray' },
}

const SHOW_TONE: Record<string, Tone> = { scheduled: 'blue', cancelled: 'red', completed: 'green' }
const SETTLEMENT_TONE: Record<string, Tone> = { paid: 'green', approved: 'blue', failed: 'red', on_hold: 'amber', pending: 'gray', awaiting_second_approval: 'amber' }
const words = (value: string) => value.replace(/_/g, ' ')

function Title({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
      <h2 className="text-base font-semibold text-deep-blue">{children}</h2>
      {aside}
    </div>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{children || '—'}</dd>
    </div>
  )
}

function historyText(entry: Account['history'][number]): string {
  if (entry.action === 'status_change') return `Status changed from ${words(String(entry.before?.status || 'none'))} to ${words(String(entry.after?.status || ''))}`
  if (entry.action === 'create') return 'Listing added'
  if (entry.action === 'update') {
    const fields = Object.keys(entry.after || {})
    return fields.length ? `Changed ${fields.join(', ')}` : 'Listing edited'
  }
  if (entry.action === 'delete') return 'Listing deleted'
  return words(entry.action)
}

function CinemaAccount() {
  const params = useParams()
  const id = String(params?.id || '')
  const [data, setData] = useState<Account | null>(null)
  const [problem, setProblem] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Account>(`/api/admin/catalogue/cinemas/${id}`)
      .then(setData)
      .catch((error) => setProblem(error.message || 'Could not load this cinema.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Spinner />
  if (!data) {
    return (
      <Card>
        <EmptyState title={problem || 'Cinema not found'} hint="Go back to the cinema list and open the cinema again." />
      </Card>
    )
  }

  const { cinema, shows, showTotals, balance } = data
  const status = STATUS[cinema.status] || { label: cinema.status, tone: 'gray' as Tone }

  return (
    <>
      <Link href="/cinemas" className="inline-flex items-center gap-1 text-sm text-teal hover:underline mb-3">
        <ArrowLeft size={16} /> All cinemas
      </Link>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-xl font-bold text-deep-blue">{cinema.name || 'Unnamed cinema'}</h2>
            <p className="text-sm text-gray-600">{[cinema.address, cinema.city, cinema.state].filter(Boolean).join(', ')}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {cinema.statusReason && (
          <p className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">Reason recorded for the current status: {cinema.statusReason}</p>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Shows" value={showTotals.shows} hint={`${showTotals.scheduled} scheduled, ${showTotals.cancelled} cancelled`} tone="gray" />
        <StatCard label="Seats on shows" value={showTotals.totalSeats.toLocaleString('en-IN')} />
        <StatCard label="Seats sold" value={showTotals.seatsSold.toLocaleString('en-IN')} hint="typed in per show" tone="gray" />
        <StatCard label="Value at base price" value={formatMoney(showTotals.value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <Title>Owner account and business listing</Title>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
            <Item label="Owner">{cinema.ownerName}</Item>
            <Item label="Owner phone">{cinema.ownerPhone}</Item>
            <Item label="Owner email">{cinema.ownerEmail}</Item>
            <Item label="GST number">{cinema.gstNumber}</Item>
            <Item label="Screens">{cinema.screens ? String(cinema.screens) : ''}</Item>
            <Item label="Total seats">{cinema.totalSeats ? cinema.totalSeats.toLocaleString('en-IN') : ''}</Item>
            <Item label="Added">{`${formatDate(cinema.createdAt)}${cinema.createdBy ? ` by ${cinema.createdBy}` : ''}`}</Item>
            <Item label="Last reviewed">{cinema.reviewedAt ? `${formatDate(cinema.reviewedAt, true)}${cinema.reviewedBy ? ` by ${cinema.reviewedBy}` : ''}` : ''}</Item>
          </dl>
          <p className="px-5 pb-5 text-xs text-gray-500">
            The listing is edited, approved, rejected or suspended from the{' '}
            <Link href="/cinemas" className="text-teal underline">
              Cinemas list
            </Link>
            . Cinema owners do not have a login of their own: the operations team keeps this record.
          </p>
        </Card>

        <Card>
          <Title>Listing history</Title>
          {data.history.length === 0 ? (
            <p className="text-sm text-gray-500 px-5 py-6">No change has been recorded for this listing.</p>
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="cinema-history">
              {data.history.map((entry) => (
                <li key={entry._id} className="px-5 py-3 text-sm">
                  <p className="text-gray-900">{historyText(entry)}</p>
                  {entry.reason && <p className="text-gray-700">Reason: {entry.reason}</p>}
                  <p className="text-xs text-gray-500">
                    {entry.adminName} · {formatDate(entry.createdAt, true)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mb-4">
        <Title
          aside={
            <Link href="/cinemas/shows" className="text-sm text-teal font-medium hover:underline">
              Manage shows
            </Link>
          }
        >
          Shows, pricing and seat inventory ({shows.length})
        </Title>
        {shows.length === 0 ? (
          <EmptyState title="No shows scheduled" hint="Add shows for this cinema on the Cinema Shows screen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cinema-shows">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Show</th>
                  <th className="px-5 py-3 font-medium">Show time</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Ticket categories</th>
                  <th className="px-5 py-3 font-medium text-right">Base price</th>
                  <th className="px-5 py-3 font-medium text-right">Seats</th>
                  <th className="px-5 py-3 font-medium text-right">Sold</th>
                  <th className="px-5 py-3 font-medium text-right">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shows.map((show) => (
                  <tr key={show._id}>
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-900">{show.title || 'Untitled show'}</span>
                      <span className="block text-xs text-gray-500">{[show.screen, show.language].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(show.showAt, true)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={SHOW_TONE[show.status] || 'gray'}>{show.status}</Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-pre-line text-gray-700">{show.ticketCategories || '—'}</td>
                    <td className="px-5 py-3 text-right">{formatMoney(show.basePrice)}</td>
                    <td className="px-5 py-3 text-right">{show.totalSeats.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right">{show.seatsSold.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right">{show.remaining.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <Title
          aside={
            data.canViewMoney ? (
              <Link href="/finance/settlements" className="text-sm text-teal font-medium hover:underline">
                Finance, Settlements
              </Link>
            ) : undefined
          }
        >
          Transactions and settlements
        </Title>
        {!data.canViewMoney || !balance ? (
          <p className="text-sm text-gray-500 px-5 py-6">Your role cannot see ledger entries or settlements.</p>
        ) : data.entryCount === 0 && data.settlements.length === 0 ? (
          <EmptyState
            title="No money has been recorded for this cinema"
            hint="Ledger entries and settlements with this cinema as the payee appear here. Cinema tickets are not sold through the apps or the website yet, so nothing creates them today."
          />
        ) : (
          <>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5" data-testid="cinema-balance">
              <Item label="Payments received">{formatMoney(balance.gross)}</Item>
              <Item label="Commission, GST and gateway fees">{formatMoney(balance.commission + balance.gst + balance.gatewayFee)}</Item>
              <Item label="Earned by the cinema">{formatMoney(balance.earned)}</Item>
              <Item label="Paid out, and still owed">{`${formatMoney(balance.settled)} paid, ${formatMoney(balance.pending)} owed`}</Item>
            </dl>

            <h3 className="px-5 text-sm font-semibold text-deep-blue">Settlements ({data.settlements.length})</h3>
            {data.settlements.length === 0 ? (
              <p className="text-sm text-gray-500 px-5 py-3">No settlement has been created for this cinema. Create one under Finance, Settlements.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="cinema-settlements">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-medium">Period</th>
                      <th className="px-5 py-3 font-medium text-right">Gross</th>
                      <th className="px-5 py-3 font-medium text-right">Commission</th>
                      <th className="px-5 py-3 font-medium text-right">Net payable</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Bank reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.settlements.map((s) => (
                      <tr key={s._id}>
                        <td className="px-5 py-3 whitespace-nowrap">
                          {formatDate(s.periodFrom)} to {formatDate(s.periodTo)}
                        </td>
                        <td className="px-5 py-3 text-right">{formatMoney(s.grossAmount)}</td>
                        <td className="px-5 py-3 text-right">{formatMoney(s.commissionAmount)}</td>
                        <td className="px-5 py-3 text-right">{formatMoney(s.netAmount)}</td>
                        <td className="px-5 py-3">
                          <Badge tone={SETTLEMENT_TONE[s.status] || 'gray'}>{words(s.status)}</Badge>
                        </td>
                        <td className="px-5 py-3">{s.bankReference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="px-5 pt-4 text-sm font-semibold text-deep-blue">Ledger entries ({data.entryCount})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="cinema-entries">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Reference</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.entries.map((entry) => (
                    <tr key={entry._id}>
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                      <td className="px-5 py-3 font-mono text-xs">{entry.reference}</td>
                      <td className="px-5 py-3">{words(entry.type)}</td>
                      <td className="px-5 py-3">{entry.status}</td>
                      <td className="px-5 py-3 text-right">{formatMoney(entry.amount)}</td>
                      <td className="px-5 py-3 text-gray-700">{entry.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.entryCount > data.entries.length && (
              <p className="px-5 py-3 text-xs text-gray-500">Showing the newest {data.entries.length} entries. The full list is under Finance, Ledger.</p>
            )}
          </>
        )}
      </Card>
    </>
  )
}

export default function CinemaAccountPage() {
  return (
    <AdminShell title="Cinema" subtitle="Owner, listing, shows and seat inventory, transactions and settlements">
      <CinemaAccount />
    </AdminShell>
  )
}
