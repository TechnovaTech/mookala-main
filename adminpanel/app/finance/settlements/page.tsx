'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download, Plus, Search } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Button, Card, EmptyState, NoticeBar, Spinner, api, formatMoney, inputClass, type Notice } from '@/components/ui'
import { StatusBadge, formatDay, payeeTypeLabel, serviceLabel } from '@/components/finance/RulesShared'
import SettlementDetail, { SETTLEMENT_STATUS } from '@/components/finance/SettlementDetail'
import SettlementCreateDialog, { type PayeeOption } from '@/components/finance/SettlementCreateDialog'
import StatementServiceTable, { entriesHref, type StatementFigures, type StatementServiceRow } from '@/components/finance/StatementServiceTable'

type Row = Record<string, any>

const SCHEDULE_LABEL: Record<string, string> = {
  weekly: 'weekly',
  fortnightly: 'every two weeks',
  monthly: 'monthly',
  manual: 'manual, with no fixed cycle',
}

export default function SettlementsPage() {
  const [view, setView] = useState<'balances' | 'settlements'>('balances')
  const [notice, setNotice] = useState<Notice>(null)
  const [canManage, setCanManage] = useState(false)
  const [settings, setSettings] = useState<any>(null)

  const [balances, setBalances] = useState<Row[] | null>(null)
  const [byService, setByService] = useState<{ rows: StatementServiceRow[]; total: StatementFigures } | null>(null)

  const [items, setItems] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const [openId, setOpenId] = useState<string | null>(null)

  // Other screens link here with ?open=<settlement id> (for example a ledger settlement entry).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (id && /^[a-f0-9]{24}$/i.test(id)) setOpenId(id)
  }, [])
  const [creating, setCreating] = useState(false)
  const [createFor, setCreateFor] = useState<PayeeOption | null>(null)

  const loadBalances = useCallback(async () => {
    try {
      const data = await api<any>('/api/admin/finance/settlements?view=balances')
      setBalances(data.balances || [])
      setCanManage(Boolean(data.canManage))
      setSettings(data.settings || null)
      // The same money by service, all time, from the ledger.
      try {
        const statement = await api<any>('/api/admin/finance/statements')
        setByService({ rows: statement.services || [], total: statement.total })
      } catch {
        setByService(null)
      }
    } catch (error: any) {
      setBalances([])
      setNotice({ type: 'error', text: error.message || 'Could not load the balances.' })
    }
  }, [])

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (query) params.set('q', query)
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return params.toString()
    },
    [status, query]
  )

  const loadSettlements = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<any>('/api/admin/finance/settlements?' + queryString({ page: String(page), limit: String(limit) }))
      setItems(data.items || [])
      setTotal(data.total || 0)
      setCounts(data.statusCounts || {})
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the settlements.' })
    } finally {
      setLoading(false)
    }
  }, [page, queryString])

  useEffect(() => {
    loadBalances()
  }, [loadBalances])

  useEffect(() => {
    loadSettlements()
  }, [loadSettlements])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      setQuery(search.trim())
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const reload = () => {
    loadBalances()
    loadSettlements()
  }

  const startCreate = (payee: PayeeOption | null) => {
    setCreateFor(payee)
    setCreating(true)
  }

  const allCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const pages = Math.max(1, Math.ceil(total / limit))
  const payeeOptions: PayeeOption[] = (balances || []).map((b) => ({
    payeeType: b.payeeType,
    payeeId: b.payeeId,
    payeeName: b.payeeName,
    available: b.available,
  }))

  const viewTab = (value: 'balances' | 'settlements', label: string) => (
    <button
      onClick={() => setView(value)}
      aria-pressed={view === value}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        view === value ? 'border-deep-blue text-deep-blue' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )

  const statusTab = (value: string, label: string, count: number) => (
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
      title="Settlements"
      subtitle="What each organiser, artist, instructor and cinema is owed, and the payouts made to them"
      actions={
        <>
          <a
            href={view === 'balances' ? '/api/admin/finance/settlements?view=balances&export=csv' : '/api/admin/finance/settlements?' + queryString({ export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
          {canManage && (
            <Button onClick={() => startCreate(null)} disabled={payeeOptions.length === 0}>
              <Plus size={16} />
              Create settlement
            </Button>
          )}
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {settings && (
        <p className="text-sm text-gray-600 mb-4">
          {settings.payoutSchedule ? `Payout schedule: ${SCHEDULE_LABEL[settings.payoutSchedule]}.` : 'No payout schedule is set, so settlements get no due date.'}{' '}
          {settings.settlementEligibilityDays === null
            ? 'No settlement eligibility wait is set.'
            : `Earnings can be settled ${settings.settlementEligibilityDays} day${settings.settlementEligibilityDays === 1 ? '' : 's'} after the event.`}{' '}
          {settings.payoutSecondApprovalAbove === null
            ? 'No second-approval threshold is set, so one approver is enough for every payout.'
            : `A payout above ${formatMoney(settings.payoutSecondApprovalAbove)} needs a second approval from a different admin.`}{' '}
          {Object.keys(settings.serviceRules || {}).length > 0
            ? `These are the global rules; ${Object.keys(settings.serviceRules).length} service${Object.keys(settings.serviceRules).length === 1 ? ' has' : 's have'} their own. `
            : ''}
          They are set under <a href="/finance/commissions#gst" className="text-deep-blue hover:underline">Commission Settings</a>, for all services or for
          one service. Each settlement records the rule that was applied to it.
        </p>
      )}

      <div className="flex gap-2 border-b border-gray-200 mb-4">
        {viewTab('balances', 'Balances')}
        {viewTab('settlements', `Settlements (${allCount})`)}
      </div>

      {view === 'balances' && (
        <Card>
          {balances === null ? (
            <Spinner />
          ) : balances.length === 0 ? (
            <EmptyState
              title="No payee has money in the ledger yet."
              hint="Balances appear here once customer payments are verified through the payment gateway or recorded by the team. Each payment is written to the ledger with its commission, GST and gateway fee, and what remains is owed to the organiser, artist, instructor or cinema."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium">Payee</th>
                    <th className="px-4 py-3 font-medium text-right">Gross</th>
                    <th className="px-4 py-3 font-medium text-right">Commission</th>
                    <th className="px-4 py-3 font-medium text-right">GST</th>
                    <th className="px-4 py-3 font-medium text-right">Gateway fees</th>
                    <th className="px-4 py-3 font-medium text-right">Refunds</th>
                    <th className="px-4 py-3 font-medium text-right">Earned</th>
                    <th className="px-4 py-3 font-medium text-right">Settled</th>
                    <th className="px-4 py-3 font-medium text-right">Pending</th>
                    <th className="px-4 py-3 font-medium text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={`${b.payeeType}:${b.payeeId}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{b.payeeName || b.payeeId}</span>
                        <span className="block text-xs text-gray-500">{payeeTypeLabel(b.payeeType)}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'payment', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`gross of ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.gross)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'commission', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`commission of ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.commission)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'gst', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`gst of ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.gst)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'gateway_fee', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`gatewayFee of ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.gatewayFee)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'refund', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`refunds of ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.refunds)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(b.earned)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a href={entriesHref({ type: 'settlement', payeeType: b.payeeType, payeeId: b.payeeId })} className="hover:underline" aria-label={`Payouts to ${b.payeeName || b.payeeId}: open the ledger entries`}>
                          {formatMoney(b.settled)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-semibold text-deep-blue">{formatMoney(b.pending)}</span>
                        {b.inSettlement > 0 && <span className="block text-xs text-gray-500">{formatMoney(b.inSettlement)} in open settlements</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canManage && b.available > 0 && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1"
                            onClick={() => startCreate({ payeeType: b.payeeType, payeeId: b.payeeId, payeeName: b.payeeName, available: b.available })}
                          >
                            Create settlement
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {view === 'balances' && byService && byService.total.entries > 0 && (
        <Card className="mt-4">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-deep-blue">By service</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Gross, each charge, refunds and net for every service, all time. Select a figure to see its ledger entries. For a period, or
              to download a statement, open <a href="/finance/statements" className="text-deep-blue hover:underline">Statements</a>.
            </p>
          </div>
          <StatementServiceTable rows={byService.rows} total={byService.total} hideEmpty />
        </Card>
      )}

      {view === 'settlements' && (
        <Card>
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {statusTab('', 'All', allCount)}
              {SETTLEMENT_STATUS.map((option) => statusTab(option.value, option.label, counts[option.value] || 0))}
            </div>
            <div className="relative max-w-md">
              <label htmlFor="settlement-search" className="sr-only">
                Search settlements
              </label>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="settlement-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Payee, bank reference or notes"
                className={inputClass + ' pl-9'}
              />
            </div>
          </div>

          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState
              title={status || query ? 'No settlements match these filters.' : 'No settlement has been created yet.'}
              hint={status || query ? undefined : 'Create one from the Balances tab for a payee with a pending balance.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium">Payee</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium text-right">Gross</th>
                    <th className="px-4 py-3 font-medium text-right">Net payable</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Bank reference</th>
                    <th className="px-4 py-3 font-medium text-right">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{s.payeeName || s.payeeId}</span>
                        <span className="block text-xs text-gray-500">
                          {payeeTypeLabel(s.payeeType)} · {serviceLabel(s.service)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDay(s.periodFrom, s.periodTimezone)} to {formatDay(s.periodTo, s.periodTimezone)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(s.grossAmount)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-deep-blue">{formatMoney(s.netAmount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.dueDate ? formatDay(s.dueDate, s.periodTimezone) : '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={s.status} options={SETTLEMENT_STATUS} />
                      </td>
                      <td className="px-4 py-3">{s.bankReference || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" className="px-3 py-1" onClick={() => setOpenId(s._id)}>
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
                Page {page} of {pages} · {total} settlements
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
      )}

      <SettlementDetail
        settlementId={openId}
        onClose={() => setOpenId(null)}
        onChanged={(text, closed) => {
          setNotice({ type: 'success', text })
          if (closed) setOpenId(null)
          reload()
        }}
      />

      <SettlementCreateDialog
        open={creating}
        payees={payeeOptions}
        initial={createFor}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          setNotice({ type: 'success', text: 'Settlement created. It now needs approval.' })
          setView('settlements')
          reload()
          setOpenId(id)
        }}
      />
    </AdminShell>
  )
}
