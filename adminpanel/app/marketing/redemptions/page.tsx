'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'

interface Row {
  id: string
  createdAt: string
  code: string
  couponId: string
  bookingId: string
  eventTitle: string
  userPhone: string | null
  listPrice: number
  discount: number
  amountPaid: number
  free: boolean
  paymentReference: string | null
  ledgerReference: string | null
  ledgerStatus: string | null
  ledgerAmount: number | null
  overLimit: boolean
  confirmedVia: string | null
}

interface Data {
  items: Row[]
  total: number
  page: number
  pageSize: number
  totals: { discount: number; listPrice: number; amountPaid: number }
}

const LEDGER_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { success: 'green', disputed: 'amber', refunded: 'red' }

export default function Page() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [applied, setApplied] = useState({ q: '', from: '', to: '' })

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (applied.q) params.set('q', applied.q)
      if (applied.from) params.set('from', applied.from)
      if (applied.to) params.set('to', applied.to)
      for (const [k, v] of Object.entries(extra)) params.set(k, v)
      return params.toString()
    },
    [applied]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<Data>(`/api/admin/marketing/coupon-redemptions?${query({ page: String(page) })}`))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the redemptions.' })
    } finally {
      setLoading(false)
    }
  }, [page, query])

  useEffect(() => {
    load()
  }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <AdminShell
      title="Coupon Redemptions"
      subtitle="Every paid or free booking that used a coupon, with the ledger entries behind it. Read-only, for Marketing and Finance."
      actions={
        <a
          href={`/api/admin/marketing/coupon-redemptions?${query({ export: 'csv' })}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          <Download size={16} />
          Export CSV
        </a>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Coupons are funded by the platform. "Paid" is what the gateway received and is the payment entry in the ledger. "Discount" is a separate coupon discount entry owed to the organiser or artist, so they earn on the list price. A redemption is written only when the payment is confirmed (or the coupon made the booking free); orders that were never paid do not appear.',
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatCard label="List price of redeemed bookings" value={data ? formatMoney(data.totals.listPrice) : '—'} hint={data ? `${data.total} redemptions` : undefined} />
        <StatCard label="Paid by customers" value={data ? formatMoney(data.totals.amountPaid) : '—'} />
        <StatCard label="Discounts funded by the platform" value={data ? formatMoney(data.totals.discount) : '—'} tone="amber" />
      </div>

      <Card className="p-4 mb-4">
        <form
          className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setApplied({ q: q.trim(), from, to })
          }}
        >
          <label className="text-sm text-gray-700">
            <span className="block mb-1 font-medium">Coupon code, booking or ledger reference</span>
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. DIWALI20" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="block mb-1 font-medium">From (India time)</span>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm text-gray-700">
            <span className="block mb-1 font-medium">To</span>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button type="submit">
            <Search size={16} />
            Search
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        {loading && !data ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="No coupon redemptions"
            hint="A row appears here when a booking made with a coupon is paid for, or when a coupon makes a booking free."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Redeemed</th>
                <th className="px-4 py-3">Coupon</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3 text-right">List price</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((row) => (
                <tr key={row.id} data-testid="redemption-row">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/marketing/coupons?id=${row.couponId}`} className="font-mono text-deep-blue underline">
                      {row.code}
                    </Link>
                    {row.overLimit && (
                      <span className="block mt-1">
                        <Badge tone="red">Over usage limit</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-mono text-xs">{row.bookingId}</span>
                    <span className="block text-gray-600">{row.eventTitle}</span>
                    {row.userPhone && <span className="block text-xs text-gray-500">{row.userPhone}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.listPrice)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.discount)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(row.amountPaid)}
                    {row.free && <span className="block text-xs text-gray-500">free with coupon</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.paymentReference ? (
                      <span className="block">
                        Payment{' '}
                        <Link href={`/finance/payments?open=${encodeURIComponent(row.paymentReference)}`} className="font-mono text-deep-blue underline">
                          {row.paymentReference}
                        </Link>
                      </span>
                    ) : (
                      <span className="block text-gray-500">No payment (free)</span>
                    )}
                    {row.ledgerReference ? (
                      <span className="block mt-1">
                        Discount <span className="font-mono">{row.ledgerReference}</span>{' '}
                        {row.ledgerStatus && <Badge tone={LEDGER_TONE[row.ledgerStatus] || 'gray'}>{row.ledgerStatus}</Badge>}
                      </span>
                    ) : (
                      <span className="block mt-1 text-amber-700">Discount entry not written yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
