'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download, Plus, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'
import { StatusBadge, serviceLabel } from '@/components/finance/RulesShared'
import RefundDetail, { REFUND_STATUS } from '@/components/finance/RefundDetail'
import RefundRaiseDialog from '@/components/finance/RefundRaiseDialog'

type Refund = Record<string, any>

export default function RefundsPage() {
  const [items, setItems] = useState<Refund[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [threshold, setThreshold] = useState<number | null>(null)
  const [serviceLimits, setServiceLimits] = useState<{ service: string; label: string; amount: number | null }[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [service, setService] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const [openId, setOpenId] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (query) params.set('q', query)
      if (service) params.set('service', service)
      if (requestedBy) params.set('requestedBy', requestedBy)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return params.toString()
    },
    [status, query, service, requestedBy, from, to]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<any>('/api/admin/finance/refunds?' + queryString({ page: String(page), limit: String(limit) }))
      setItems(data.items || [])
      setTotal(data.total || 0)
      setCounts(data.statusCounts || {})
      setThreshold(data.secondApprovalAbove ?? null)
      setServiceLimits(data.serviceApprovalLimits || [])
      setCanManage(Boolean(data.canManage))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the refunds.' })
    } finally {
      setLoading(false)
    }
  }, [page, queryString])

  // Other screens link here with ?q=<booking id> or ?status=<status>, and ?open=<refund id>.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = (params.get('q') || '').trim()
    if (q) {
      setSearch(q)
      setQuery(q)
    }
    const wanted = params.get('status') || ''
    if (REFUND_STATUS.some((option) => option.value === wanted)) setStatus(wanted)
    const open = params.get('open') || ''
    if (/^[a-f0-9]{24}$/i.test(open)) setOpenId(open)
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) load()
  }, [ready, load])

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((current) => {
        const next = search.trim()
        if (next !== current) setPage(1)
        return next
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const allCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const pages = Math.max(1, Math.ceil(total / limit))
  const hasFilters = Boolean(status || query || service || requestedBy || from || to)

  const tab = (value: string, label: string, count: number) => (
    <button
      key={value || 'all'}
      onClick={() => {
        setStatus(value)
        setPage(1)
      }}
      aria-pressed={status === value}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
        status === value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label} <span className={status === value ? 'text-white/80' : 'text-gray-500'}>{count}</span>
    </button>
  )

  return (
    <AdminShell
      title="Refunds"
      subtitle="Refund requests, approvals, processing and disputes"
      actions={
        <>
          <a
            href={'/api/admin/finance/refunds?' + queryString({ export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
          {canManage && (
            <Button onClick={() => setRaising(true)}>
              <Plus size={16} />
              Raise a refund
            </Button>
          )}
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <p className="text-sm text-gray-600 mb-4">
        A refund is created when a customer cancels a booking, or raised here by an admin. It must be approved before any money
        moves.{' '}
        {threshold === null
          ? 'No second-approval threshold is set, so one approver is enough for every refund (set it under Commission Settings).'
          : `A refund above ${formatMoney(threshold)} needs a second approval from a different admin.`}
        {serviceLimits.length > 0 &&
          ` Own limit: ${serviceLimits.map((limit) => `${limit.label} ${formatMoney(limit.amount)}`).join(', ')}.`}
      </p>

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tab('', 'All', allCount)}
            {REFUND_STATUS.map((option) => tab(option.value, option.label, counts[option.value] || 0))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <label htmlFor="refund-search" className="sr-only">
                Search refunds
              </label>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="refund-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Booking ID, phone, event or payment reference"
                className={inputClass + ' pl-9'}
              />
            </div>
            <div>
              <label htmlFor="refund-service" className="sr-only">
                Service
              </label>
              <select
                id="refund-service"
                value={service}
                onChange={(e) => {
                  setService(e.target.value)
                  setPage(1)
                }}
                className={inputClass}
              >
                <option value="">All services</option>
                {FINANCE_SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="refund-requested-by" className="sr-only">
                Requested by
              </label>
              <select
                id="refund-requested-by"
                value={requestedBy}
                onChange={(e) => {
                  setRequestedBy(e.target.value)
                  setPage(1)
                }}
                className={inputClass}
              >
                <option value="">Requested by anyone</option>
                <option value="customer">Requested by the customer</option>
                <option value="admin">Raised by an admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="refund-from" className="sr-only">
                  Requested from
                </label>
                <input
                  id="refund-from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  className={inputClass}
                  title="Requested from"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="refund-to" className="sr-only">
                  Requested to
                </label>
                <input
                  id="refund-to"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  className={inputClass}
                  title="Requested to"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No refunds match these filters.' : 'No refunds have been requested yet.'}
            hint={
              hasFilters
                ? undefined
                : 'A refund appears here when a customer cancels a paid booking, or when an admin raises one with "Raise a refund".'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Booking</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Event / service</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Deduction</th>
                  <th className="px-4 py-3 font-medium text-right">Refund</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((refund) => (
                  <tr key={refund._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(refund.createdAt, true)}
                      <span className="block text-xs text-gray-500">
                        {refund.requestedBy === 'customer' ? 'by the customer' : `by ${refund.requestedBy || 'unknown'}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs break-all max-w-[11rem]">{refund.bookingId || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{refund.customerPhone || '—'}</td>
                    <td className="px-4 py-3">
                      {refund.eventTitle || '—'}
                      <span className="block text-xs text-gray-500">{serviceLabel(refund.service)}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(refund.amountPaid)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(refund.deductionAmount)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-deep-blue">{formatMoney(refund.refundAmount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={refund.status} options={REFUND_STATUS} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" className="px-3 py-1" onClick={() => setOpenId(refund._id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span>
              Page {page} of {pages} · {total} refunds
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <RefundDetail
        refundId={openId}
        onClose={() => setOpenId(null)}
        onChanged={(text) => {
          setNotice({ type: 'success', text })
          load()
        }}
      />

      <RefundRaiseDialog
        open={raising}
        onClose={() => setRaising(false)}
        onRaised={(id) => {
          setRaising(false)
          setNotice({ type: 'success', text: 'Refund raised. It now needs approval.' })
          load()
          setOpenId(id)
        }}
      />
    </AdminShell>
  )
}
