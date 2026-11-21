'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Button, Card, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, formatMoney, inputClass, type Notice } from '@/components/ui'
import ReportDefinitions from '@/components/finance/ReportDefinitions'
import {
  LedgerExportLink,
  LedgerPager,
  LedgerStatusBadge,
  LedgerTypeBadge,
  PAYEE_TYPE_OPTIONS,
  SERVICE_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  serviceName,
  td,
  tdRight,
  th,
  thRight,
} from '@/components/finance/LedgerLabels'

interface TypeTotal {
  type: string
  count: number
  successCount: number
  successTotal: number
  otherTotal: number
}

interface ListResponse {
  items: any[]
  page: number
  pageSize: number
  total: number
  totals: { byType: TypeTotal[]; figures: Record<string, number> }
  rangeLabel: string
  ledgerEntries: number
}

const EMPTY_FILTERS = { q: '', type: '', service: '', status: '', payeeType: '', payee: '', from: '', to: '' }
type Filters = typeof EMPTY_FILTERS

const EMPTY_ADJUSTMENT = { amount: '', direction: 'credit', service: '', payeeType: 'platform', payeeId: '', payeeName: '', reason: '' }

function AdjustmentButton({ onOpen }: { onOpen: () => void }) {
  const canManage = useCan('finance:manage')
  if (!canManage) return null
  return (
    <Button onClick={onOpen}>
      <Plus size={16} />
      Add adjustment
    </Button>
  )
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
  all,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  all?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {all !== undefined && <option value="">{all}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function LedgerPage() {
  // `ready` waits for the filters given in the URL so the first request already uses them.
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const [adjusting, setAdjusting] = useState(false)
  const [form, setForm] = useState(EMPTY_ADJUSTMENT)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Other screens link here with any of the filters in the URL, for example
    // ?q=<reference> or ?type=refund&payeeType=organizer&payee=<id>&from=2026-11-01&to=2026-11-30.
    const params = new URLSearchParams(window.location.search)
    const allowed: Record<string, string[] | null> = {
      q: null,
      payee: null,
      type: TYPE_OPTIONS.map((option) => option.value),
      service: SERVICE_OPTIONS.map((option) => option.value),
      status: STATUS_OPTIONS.map((option) => option.value),
      payeeType: PAYEE_TYPE_OPTIONS.map((option) => option.value),
      from: null,
      to: null,
    }
    const fromUrl: Partial<Filters> = {}
    for (const key of Object.keys(allowed) as (keyof Filters)[]) {
      const value = (params.get(key) || '').trim().slice(0, 100)
      if (!value) continue
      if (allowed[key] && !allowed[key]!.includes(value)) continue
      if ((key === 'from' || key === 'to') && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue
      fromUrl[key] = value
    }
    if (Object.keys(fromUrl).length) {
      setDraft((current) => ({ ...current, ...fromUrl }))
      setFilters((current) => ({ ...current, ...fromUrl }))
    }
    setReady(true)
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams(extra)
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    if (!ready) return
    setLoading(true)
    try {
      setData(await api<ListResponse>('/api/admin/finance/ledger?' + query({ page: String(page) })))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the ledger.' })
    } finally {
      setLoading(false)
    }
  }, [ready, query, page])

  useEffect(() => {
    load()
  }, [load])

  const apply = (next: Filters) => {
    setDraft(next)
    setFilters(next)
    setPage(1)
  }
  const filtered = Object.values(filters).some(Boolean)

  const saveAdjustment = async () => {
    setFormError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('Enter an amount greater than zero.')
    if (!form.service) return setFormError('Choose a service.')
    if (form.payeeType !== 'platform' && !form.payeeId.trim()) return setFormError('Enter the payee ID.')
    if (form.reason.trim().length < 10) return setFormError('Give a reason of at least 10 characters.')

    setSaving(true)
    try {
      const result = await api<{ entry: any }>('/api/admin/finance/ledger', { method: 'POST', body: { ...form, amount } })
      setAdjusting(false)
      setForm(EMPTY_ADJUSTMENT)
      setNotice({ type: 'success', text: `Adjustment ${result.entry.reference} was added to the ledger.` })
      setPage(1)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not record the adjustment.')
    } finally {
      setSaving(false)
    }
  }

  const figures = data?.totals.figures

  return (
    <AdminShell
      title="Ledger"
      subtitle="Every money movement, one entry each. Append-only."
      actions={
        <>
          <LedgerExportLink href={'/api/admin/finance/ledger?format=csv&' + query()} />
          <AdjustmentButton
            onOpen={() => {
              setFormError('')
              setAdjusting(true)
            }}
          />
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Ledger entries cannot be edited or deleted. A correction is made by adding an adjustment entry with a reason, which is recorded in the activity log.',
        }}
      />

      <Card className="mb-4">
        <form
          className="p-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8 items-end border-b border-gray-200"
          onSubmit={(event) => {
            event.preventDefault()
            apply({ ...draft, q: draft.q.trim(), payee: draft.payee.trim() })
          }}
        >
          <div className="md:col-span-2">
            <label htmlFor="ledger-q" className="block text-xs font-medium text-gray-600 mb-1">
              Search
            </label>
            <input
              id="ledger-q"
              type="search"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              placeholder="Reference, gateway ID, booking ID, phone"
              className={inputClass}
            />
          </div>
          <Select id="ledger-type" label="Type" value={draft.type} onChange={(type) => apply({ ...draft, type })} options={TYPE_OPTIONS} all="All types" />
          <Select id="ledger-service" label="Service" value={draft.service} onChange={(service) => apply({ ...draft, service })} options={SERVICE_OPTIONS} all="All services" />
          <Select id="ledger-status" label="Status" value={draft.status} onChange={(status) => apply({ ...draft, status })} options={STATUS_OPTIONS} all="All statuses" />
          <Select id="ledger-payee-type" label="Payee type" value={draft.payeeType} onChange={(payeeType) => apply({ ...draft, payeeType })} options={PAYEE_TYPE_OPTIONS} all="All payees" />
          <div className="md:col-span-2">
            <label htmlFor="ledger-payee" className="block text-xs font-medium text-gray-600 mb-1">
              Payee name or ID
            </label>
            <input id="ledger-payee" type="text" value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ledger-from" className="block text-xs font-medium text-gray-600 mb-1">
              From
            </label>
            <input id="ledger-from" type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => apply({ ...draft, from: e.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ledger-to" className="block text-xs font-medium text-gray-600 mb-1">
              To
            </label>
            <input id="ledger-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => apply({ ...draft, to: e.target.value })} className={inputClass} />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">Search</Button>
            {filtered && (
              <Button type="button" variant="ghost" onClick={() => apply(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            )}
          </div>
        </form>

        {data && data.total > 0 && figures && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600 mb-3">
              Totals for all <span className="font-medium text-gray-800">{data.total}</span> entries that match the filters (not only this page). Dates:{' '}
              {data.rangeLabel}, Asia/Kolkata (IST). Amounts count entries with status &lsquo;success&rsquo;.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    {data.totals.byType
                      .filter((row) => row.count > 0)
                      .map((row) => (
                        <th key={row.type} className="px-3 pb-1 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                          {TYPE_OPTIONS.find((o) => o.value === row.type)?.label} ({row.count})
                        </th>
                      ))}
                    <th className="px-3 pb-1 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Platform revenue</th>
                    <th className="px-3 pb-1 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Net to payees</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {data.totals.byType
                      .filter((row) => row.count > 0)
                      .map((row) => (
                        <td key={row.type} className="px-3 text-sm font-semibold text-deep-blue tabular-nums whitespace-nowrap align-top">
                          {formatMoney(row.successTotal)}
                          {row.otherTotal > 0 && <span className="block text-xs font-normal text-gray-500">+ {formatMoney(row.otherTotal)} not successful</span>}
                        </td>
                      ))}
                    <td className="px-3 text-sm font-semibold text-deep-blue tabular-nums whitespace-nowrap align-top">{formatMoney(figures.platformRevenue)}</td>
                    <td className="px-3 text-sm font-semibold text-deep-blue tabular-nums whitespace-nowrap align-top">{formatMoney(figures.netToPayees)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Adjustments are listed for the record. They are not added to revenue, to net to payees or to payee balances.
            </p>
          </div>
        )}

        {loading && !data ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={data && data.ledgerEntries === 0 ? 'The ledger has no entries yet' : 'No entries match these filters'}
            hint={
              data && data.ledgerEntries === 0
                ? 'Entries are written when a payment is verified through the payment gateway, and when refunds and settlements are processed. Figures appear here after the first verified payment.'
                : 'Change or clear the filters to see more entries.'
            }
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Type</th>
                  <th className={th}>Service</th>
                  <th className={th}>Payee</th>
                  <th className={th}>Linked to</th>
                  <th className={th}>Status</th>
                  <th className={thRight}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50">
                    <td className={td + ' whitespace-nowrap'}>{formatDate(item.createdAt, true)}</td>
                    <td className={td + ' font-mono text-xs whitespace-nowrap'}>
                      {item.type === 'payment' ? (
                        <Link href={'/finance/payments?open=' + encodeURIComponent(item.reference)} className="text-deep-blue underline">
                          {item.reference}
                        </Link>
                      ) : (
                        item.reference
                      )}
                    </td>
                    <td className={td}>
                      <LedgerTypeBadge type={item.type} />
                      {item.type === 'adjustment' && item.meta?.direction && <span className="block text-xs text-gray-500 mt-1 capitalize">{item.meta.direction}</span>}
                    </td>
                    <td className={td}>{serviceName(item.service)}</td>
                    <td className={td}>
                      {item.payeeName || (item.payeeType === 'platform' ? 'Platform' : '—')}
                      {item.payeeType && item.payeeType !== 'platform' && <span className="block text-xs text-gray-500 capitalize">{item.payeeType}</span>}
                    </td>
                    <td className={td + ' text-xs'}>
                      {item.parentReference && (
                        <Link href={'/finance/payments?open=' + encodeURIComponent(item.parentReference)} className="block font-mono text-deep-blue underline">
                          {item.parentReference}
                        </Link>
                      )}
                      {item.type === 'settlement' && item.meta?.settlementId && (
                        <Link href={'/finance/settlements?open=' + encodeURIComponent(item.meta.settlementId)} className="block text-deep-blue underline" data-settlement-link>
                          Settlement record {String(item.meta.settlementId).slice(-8)}
                          {item.meta.bankReference ? ` · bank ref ${item.meta.bankReference}` : ''}
                        </Link>
                      )}
                      {(item.type === 'refund' || item.type === 'refund_deduction') && item.meta?.refundId && (
                        <Link href={'/finance/refunds?q=' + encodeURIComponent(item.bookingId || item.meta.refundId)} className="block text-deep-blue underline">
                          Refund {String(item.meta.refundId).slice(-8)}
                          {item.meta.chargeback ? ' · chargeback' : ''}
                        </Link>
                      )}
                      {item.gatewaySettlementId && <span className="block text-gray-500">Gateway settlement {item.gatewaySettlementId}</span>}
                      {item.gatewayPaymentId && <span className="block font-mono text-gray-500">{item.gatewayPaymentId}</span>}
                      {item.bookingId && <span className="block text-gray-500 break-all">Booking {item.bookingId}</span>}
                      {item.type === 'adjustment' && item.description && <span className="block text-gray-600 max-w-xs">{item.description}</span>}
                      {!item.parentReference && !item.gatewayPaymentId && !item.bookingId && !item.description && !item.meta?.settlementId && '—'}
                    </td>
                    <td className={td}>
                      <LedgerStatusBadge status={item.status} />
                      {item.type === 'payment' && item.status === 'success' && item.refundState && (
                        <span className="block text-xs text-purple-700 mt-1">
                          {item.refundState === 'full' ? 'Refunded in full' : 'Refunded in part'}
                          {item.dispute?.outcome === 'lost' ? ' (chargeback)' : ''}
                        </span>
                      )}
                      {item.type !== 'payment' && item.status === 'disputed' && <span className="block text-xs text-gray-500 mt-1">Set aside with its payment</span>}
                      {item.status === 'refunded' && item.reversedBy === 'dispute_lost' && <span className="block text-xs text-gray-500 mt-1">Reversed: dispute lost</span>}
                      {item.status === 'failed' && item.failedByGatewayAt && <span className="block text-xs text-gray-500 mt-1">The gateway could not complete it</span>}
                    </td>
                    <td className={tdRight}>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <LedgerPager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>

      <ReportDefinitions rangeLabel={data?.rangeLabel} />

      <Modal
        open={adjusting}
        title="Add ledger adjustment"
        onClose={() => setAdjusting(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveAdjustment} loading={saving}>
              Add adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
          <p className="text-sm text-gray-600">
            An adjustment is a new entry. It cannot be edited or removed afterwards, and it is written to the activity log with your name and reason.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount (₹)
              </label>
              <input id="adj-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <Select
              id="adj-direction"
              label="Direction"
              value={form.direction}
              onChange={(direction) => setForm({ ...form, direction })}
              options={[
                { value: 'credit', label: 'Credit (in favour of the payee)' },
                { value: 'debit', label: 'Debit (against the payee)' },
              ]}
            />
            <Select id="adj-service" label="Service" value={form.service} onChange={(service) => setForm({ ...form, service })} options={SERVICE_OPTIONS} all="Choose a service" />
            <Select id="adj-payee-type" label="Applies to" value={form.payeeType} onChange={(payeeType) => setForm({ ...form, payeeType })} options={PAYEE_TYPE_OPTIONS} />
          </div>
          {form.payeeType !== 'platform' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adj-payee-id" className="block text-sm font-medium text-gray-700 mb-1">
                  Payee ID
                </label>
                <input id="adj-payee-id" type="text" value={form.payeeId} onChange={(e) => setForm({ ...form, payeeId: e.target.value })} className={inputClass} />
                <p className="text-xs text-gray-500 mt-1">Organiser and artist IDs are checked against their records.</p>
              </div>
              <div>
                <label htmlFor="adj-payee-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Payee name
                </label>
                <input id="adj-payee-name" type="text" value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} className={inputClass} />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="adj-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea id="adj-reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} />
          </div>
          <p className="text-xs text-gray-500">
            Adjustments are recorded and shown in the ledger and its exports. They do not change revenue figures or payee balances, which are computed
            from payments, commission, GST, gateway fees, refunds and settlements only.
          </p>
        </div>
      </Modal>
    </AdminShell>
  )
}
