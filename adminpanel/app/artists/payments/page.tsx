'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { Pagination, SectionTitle, qs, readQueryParam, useDebounced } from '@/components/artists/shared'
import type { Tone } from '@/lib/resource-types'

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

interface Row extends Balance {
  _id: string
  name: string
  phone: string
  city: string
  settlements: number
  settlementsPaid: number
  settlementsOpen: number
}

interface ListResponse {
  items: Row[]
  total: number
  page: number
  limit: number
  totals: Balance
  artistsWithEntries: number
  totalsComplete: boolean
}

interface Entry {
  _id: string
  reference: string
  createdAt: string | null
  type: string
  service: string
  status: string
  amount: number
  effect: number | null
  bookingId: string
  parentReference: string
  description: string
}

interface Settlement {
  _id: string
  service: string
  periodFrom: string | null
  periodTo: string | null
  grossAmount: number | null
  commissionAmount: number | null
  gstAmount: number | null
  gatewayFeeAmount: number | null
  refundsAmount: number | null
  netAmount: number | null
  dueDate: string | null
  bankReference: string
  status: string
  paidAt: string | null
}

interface ServiceRow {
  service: string
  payments: number
  gross: number
  commission: number
  commissionPercent: number | null
  gst: number
  gatewayFee: number
  refunds: number
  earned: number
  settled: number
}

interface StatementResponse {
  artist: { _id: string; name: string; phone: string; city: string }
  balance: Balance
  byService: ServiceRow[]
  entries: Entry[]
  entryCount: number
  truncated: boolean
  settlements: Settlement[]
}

const NO_ENTRIES =
  'Ledger entries appear once customer payments are verified through the payment gateway. Until then there is nothing to show here.'

const TYPE_LABEL: Record<string, string> = {
  payment: 'Payment',
  commission: 'Commission',
  gst: 'GST on commission',
  gateway_fee: 'Gateway fee',
  refund: 'Refund',
  refund_deduction: 'Refund deduction',
  settlement: 'Settlement paid',
  adjustment: 'Adjustment',
}

const SERVICE_LABEL: Record<string, string> = {
  ticketing: 'Event ticketing',
  artist_booking: 'Artist booking',
  learning: 'Learning',
  wishes: 'Wishes & greetings',
  membership: 'Membership',
  advertising: 'Advertising',
  premium_search: 'Premium search pass',
}

const SETTLEMENT_TONE: Record<string, Tone> = {
  pending: 'amber',
  awaiting_second_approval: 'purple',
  approved: 'blue',
  paid: 'green',
  failed: 'red',
  on_hold: 'gray',
}

const label = (value: string) => value.replace(/_/g, ' ')

function BalanceCards({ balance }: { balance: Balance }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <StatCard label="Gross payments" value={formatMoney(balance.gross)} />
      <StatCard
        label="Deductions"
        value={formatMoney(balance.commission + balance.gst + balance.gatewayFee + balance.refunds)}
        hint={`Commission ${formatMoney(balance.commission)} · GST ${formatMoney(balance.gst)} · Gateway ${formatMoney(balance.gatewayFee)} · Refunds ${formatMoney(balance.refunds)}`}
        tone="gray"
      />
      <StatCard label="Earned" value={formatMoney(balance.earned)} hint={`Settled ${formatMoney(balance.settled)}`} tone="green" />
      <StatCard label="Pending payout" value={formatMoney(balance.pending)} />
    </div>
  )
}

function Statement({ id, onBack }: { id: string; onBack: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<StatementResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<StatementResponse>(`/api/admin/artists/payments/${id}?` + qs({ from, to })))
      setNotice(null)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the statement.' })
    } finally {
      setLoading(false)
    }
  }, [id, from, to])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-teal hover:underline mb-3">
        <ArrowLeft size={16} /> All artist payments
      </button>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {!data ? (
        loading ? (
          <Spinner />
        ) : (
          <Card>
            <EmptyState title="Statement not available" hint="Go back and choose the artist again." />
          </Card>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-deep-blue">{data.artist.name || 'No name yet'}</h2>
              <p className="text-sm text-gray-600">{[data.artist.phone, data.artist.city].filter(Boolean).join(' · ')}</p>
            </div>
            <Link href={`/artists/${data.artist._id}`} className="text-sm text-teal font-medium hover:underline">
              Open artist profile
            </Link>
          </div>

          <BalanceCards balance={data.balance} />

          <Card className="mb-4">
            <SectionTitle>Statement</SectionTitle>
            <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-200">
              <div>
                <label htmlFor="statement-from" className="block text-xs font-medium text-gray-600 mb-1">
                  From
                </label>
                <input id="statement-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="statement-to" className="block text-xs font-medium text-gray-600 mb-1">
                  To
                </label>
                <input id="statement-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </div>
              {(from || to) && (
                <button
                  onClick={() => {
                    setFrom('')
                    setTo('')
                  }}
                  className="text-sm text-teal hover:underline pb-2"
                >
                  Clear dates
                </button>
              )}
              <a
                href={`/api/admin/artists/payments/${id}?` + qs({ from, to, export: 'csv' })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 ml-auto"
              >
                <Download size={16} />
                Export CSV
              </a>
            </div>

            {data.byService.length > 0 && (
              <div className={`overflow-x-auto border-b border-gray-200 ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full text-sm" data-testid="service-commissions">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-3 font-medium">Commission by service</th>
                      <th className="px-4 py-3 font-medium text-right">Payments</th>
                      <th className="px-4 py-3 font-medium text-right">Gross</th>
                      <th className="px-4 py-3 font-medium text-right">Commission</th>
                      <th className="px-4 py-3 font-medium text-right">GST</th>
                      <th className="px-4 py-3 font-medium text-right">Gateway fees</th>
                      <th className="px-4 py-3 font-medium text-right">Refunds</th>
                      <th className="px-4 py-3 font-medium text-right">Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byService.map((row) => (
                      <tr key={row.service}>
                        <td className="px-4 py-3 font-medium text-gray-900">{SERVICE_LABEL[row.service] || row.service || 'Not recorded'}</td>
                        <td className="px-4 py-3 text-right">{row.payments}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.gross)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {formatMoney(row.commission)}
                          {row.commissionPercent !== null && <span className="text-xs text-gray-500"> ({row.commissionPercent}% of gross)</span>}
                        </td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.gst)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.gatewayFee)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.refunds)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-deep-blue">{formatMoney(row.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.entries.length === 0 ? (
              <EmptyState
                title={from || to ? 'No ledger entries in this period' : 'No ledger entries yet'}
                hint={from || to ? 'Choose a wider period. The balance above always covers every entry.' : NO_ENTRIES}
              />
            ) : (
              <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Service</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Amount</th>
                      <th className="px-4 py-3 font-medium text-right">Effect on amount owed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.entries.map((entry) => (
                      <tr key={entry._id}>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatDate(entry.createdAt, true)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {entry.reference}
                          {entry.parentReference && <p className="text-gray-400">of {entry.parentReference}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-900">{TYPE_LABEL[entry.type] || entry.type}</td>
                        <td className="px-4 py-3 text-gray-700">{SERVICE_LABEL[entry.service] || entry.service || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={entry.status === 'success' ? 'green' : entry.status === 'failed' ? 'red' : 'amber'}>{entry.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatMoney(entry.amount)}</td>
                        <td className={`px-4 py-3 text-right ${entry.effect === null ? 'text-gray-400' : entry.effect < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {entry.effect === null ? 'none' : (entry.effect > 0 ? '+' : '−') + formatMoney(Math.abs(entry.effect))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.truncated && (
              <p className="px-4 py-3 text-sm text-gray-600 border-t border-gray-200">
                Showing the latest {data.entries.length} of {data.entryCount} entries. Narrow the dates or export the CSV for the full list.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Settlements</SectionTitle>
            {data.settlements.length === 0 ? (
              <EmptyState
                title="No settlements for this artist"
                hint="Settlements are created by Finance under Settlements & Payouts once the artist has an amount pending."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium">Service</th>
                      <th className="px-4 py-3 font-medium text-right">Gross</th>
                      <th className="px-4 py-3 font-medium text-right">Commission</th>
                      <th className="px-4 py-3 font-medium text-right">GST</th>
                      <th className="px-4 py-3 font-medium text-right">Gateway</th>
                      <th className="px-4 py-3 font-medium text-right">Refunds</th>
                      <th className="px-4 py-3 font-medium text-right">Net payout</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Paid / bank reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.settlements.map((s) => (
                      <tr key={s._id}>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {formatDate(s.periodFrom)} to {formatDate(s.periodTo)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{SERVICE_LABEL[s.service] || s.service || '—'}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(s.grossAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(s.commissionAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(s.gstAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(s.gatewayFeeAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(s.refundsAmount)}</td>
                        <td className="px-4 py-3 text-right font-medium text-deep-blue">{formatMoney(s.netAmount)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={SETTLEMENT_TONE[s.status] || 'gray'}>{label(s.status)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {s.paidAt ? formatDate(s.paidAt) : s.dueDate ? `Due ${formatDate(s.dueDate)}` : '—'}
                          {s.bankReference && <p className="text-xs text-gray-500 font-mono">{s.bankReference}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function Payments() {
  const [selected, setSelected] = useState('')
  const [scope, setScope] = useState<'ledger' | 'all'>('ledger')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const requestId = useRef(0)

  // /artists/payments?artist=... opens that artist's statement.
  useEffect(() => {
    const id = readQueryParam('artist')
    if (/^[a-f0-9]{24}$/i.test(id)) setSelected(id)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [q, scope])

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const result = await api<ListResponse>('/api/admin/artists/payments?' + qs({ q, scope: scope === 'all' ? 'all' : '', page, limit: 25 }))
      if (current !== requestId.current) return
      setData(result)
      setNotice(null)
    } catch (error: any) {
      if (current !== requestId.current) return
      setNotice({ type: 'error', text: error.message || 'Could not load artist payments.' })
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [q, scope, page])

  useEffect(() => {
    load()
  }, [load])

  if (selected) return <Statement id={selected} onBack={() => setSelected('')} />

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {data && data.artistsWithEntries > 0 && (
        <>
          <BalanceCards balance={data.totals} />
          {!data.totalsComplete && (
            <p className="text-sm text-gray-600 mb-4">The totals above cover the first 1,000 artists with ledger entries.</p>
          )}
        </>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <label htmlFor="payments-search" className="sr-only">
              Search by artist name, phone or city
            </label>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="payments-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Artist name, phone or city"
              className={inputClass + ' pl-9'}
            />
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm" role="group" aria-label="Which artists to list">
            <button
              onClick={() => setScope('ledger')}
              aria-pressed={scope === 'ledger'}
              className={`px-3 py-2 ${scope === 'ledger' ? 'bg-deep-blue text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              With ledger entries
            </button>
            <button
              onClick={() => setScope('all')}
              aria-pressed={scope === 'all'}
              className={`px-3 py-2 ${scope === 'all' ? 'bg-deep-blue text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              All artists
            </button>
          </div>
          <a
            href={'/api/admin/artists/payments?' + qs({ q, scope: scope === 'all' ? 'all' : '', export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 ml-auto"
          >
            <Download size={16} />
            Export CSV
          </a>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          data && data.artistsWithEntries === 0 && scope === 'ledger' ? (
            <EmptyState title="No artist has ledger entries yet" hint={NO_ENTRIES} />
          ) : (
            <EmptyState title="No artists match" hint={scope === 'ledger' ? 'Try "All artists" to include artists without ledger entries.' : undefined} />
          )
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">Artist</th>
                  <th className="px-4 py-3 font-medium text-right">Gross</th>
                  <th className="px-4 py-3 font-medium text-right">Commission</th>
                  <th className="px-4 py-3 font-medium text-right">GST</th>
                  <th className="px-4 py-3 font-medium text-right">Gateway fees</th>
                  <th className="px-4 py-3 font-medium text-right">Refunds</th>
                  <th className="px-4 py-3 font-medium text-right">Earned</th>
                  <th className="px-4 py-3 font-medium text-right">Settled</th>
                  <th className="px-4 py-3 font-medium text-right">Pending</th>
                  <th className="px-4 py-3 font-medium text-right">Settlements</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Statement</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-deep-blue">{row.name || 'No name yet'}</p>
                      <p className="text-xs text-gray-500">{[row.phone, row.city].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.gross)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.commission)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.gst)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.gatewayFee)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.refunds)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.earned)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.settled)}</td>
                    <td className="px-4 py-3 text-right font-medium text-deep-blue">{formatMoney(row.pending)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.settlements}
                      {row.settlementsOpen > 0 && <span className="text-xs text-gray-500"> ({row.settlementsOpen} open)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" className="!px-2 !py-1 text-teal" onClick={() => setSelected(row._id)}>
                        Statement
                      </Button>
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

export default function ArtistPaymentsPage() {
  return (
    <AdminShell title="Artist Payments" subtitle="Ledger balance, statement and settlements for each artist">
      <Payments />
    </AdminShell>
  )
}
