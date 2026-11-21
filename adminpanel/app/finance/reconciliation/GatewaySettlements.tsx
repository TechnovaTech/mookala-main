'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import { rangeQuery, type RangeValue } from '@/components/finance/OverviewRangeFilter'
import { LedgerStatusBadge, td, tdRight, th, thRight } from '@/components/finance/LedgerLabels'

interface SettlementRow {
  settlementId: string
  utr: string | null
  status: string | null
  settledAt: string | null
  amount: number | null
  fees: number | null
  tax: number | null
  lines: number
  payments: number
  paymentsGross: number
  matched: number
  unmatched: number
  refunds: number
  otherLines: number
  debits: number
  itemsNet: number
  netDifference: number | null
  gatewayFees: number
  gatewayTax: number
  matchedGatewayFees: number
  ledgerFees: number
  feeDifference: number
  amountMismatches: number
  unmatchedItems: { paymentId: string; orderId: string | null; amount: number; fee: number; tax: number }[]
  mismatchedItems: { paymentId: string; ledgerReference: string; amount: number; ledgerAmount: number }[]
}

interface Result {
  range: { label: string; days: number }
  gateway: { configured: boolean; enabled: boolean; usable: boolean; mode: string; message: string | null }
  lastFetch: { at: string | null; by: string | null; range: string | null; error: string | null } | null
  maxFetchDays: number
  settlements: SettlementRow[]
  totals: { settlements: number; amount: number; payments: number; matched: number; unmatched: number; gatewayFees: number; gatewayTax: number; matchedGatewayFees: number; ledgerFees: number }
  ledger: {
    settled: { count: number; total: number }
    unsettled: { count: number; total: number }
    unsettledListed: { _id: string; reference: string; gatewayPaymentId: string; amount: number; status: string; createdAt: string }[]
  }
}

const money = (value: number | null) => (value === null || value === undefined ? '—' : formatMoney(value))

/**
 * Second tab of the reconciliation screen: what Razorpay has paid into the
 * bank account, settlement by settlement, matched against the ledger.
 */
export default function GatewaySettlements({ range }: { range: RangeValue }) {
  const canManage = useCan('finance:manage')
  const canOpenSettings = useCan('integrations:view')
  const [data, setData] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirming, setConfirming] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<Result>('/api/admin/finance/reconciliation/settlements?' + rangeQuery(range)))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the gateway settlements.' })
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  const fetchFromGateway = async (reason: string) => {
    setFetching(true)
    try {
      const body: Record<string, string> = { action: 'fetch', preset: range.preset, reason }
      if (range.preset === 'custom') {
        body.from = range.from
        body.to = range.to
      }
      const result = await api<{ message: string }>('/api/admin/finance/reconciliation/settlements', { method: 'POST', body })
      setNotice({ type: 'success', text: result.message })
      setConfirming(false)
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not fetch the settlements.' })
      setConfirming(false)
    } finally {
      setFetching(false)
    }
  }

  if (loading && !data) return <Spinner label="Loading gateway settlements..." />
  if (!data) return <NoticeBar notice={notice} onClose={() => setNotice(null)} />

  const { gateway, totals, ledger } = data
  const tooLong = data.range.days > data.maxFetchDays

  return (
    <div className={loading ? 'opacity-60' : ''} data-gateway-settlements>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {!gateway.usable && (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-4" role="alert" data-gateway-unavailable>
          <p className="font-semibold">
            {gateway.configured ? 'Online payments are switched off, so settlements cannot be fetched' : 'The payment gateway is not configured, so settlements cannot be fetched'}
          </p>
          <p className="mt-0.5">
            {gateway.message} {canOpenSettings ? (
              <Link href="/settings" className="underline font-medium">
                Open payment gateway settings
              </Link>
            ) : (
              'The Razorpay keys are managed by a Super Admin under Payment Gateway.'
            )}
          </p>
          <p className="mt-1">
            {data.settlements.length > 0
              ? 'The settlements below were fetched earlier and are shown as stored.'
              : 'No settlement has been fetched yet, so no ledger payment can be shown as settled by the gateway.'}
          </p>
        </div>
      )}

      <Card className="p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-deep-blue">Settlements from Razorpay</h2>
            <p className="text-sm text-gray-600 mt-1">
              Razorpay transfers captured payments to the bank account in settlements, each with a UTR, after taking its fee and tax. Each settled payment is
              matched to its ledger entry by gateway payment ID. These are the gateway&rsquo;s payouts to the platform; payouts to organisers and artists are
              under{' '}
              <Link href="/finance/settlements" className="text-deep-blue underline">
                Finance → Settlements
              </Link>
              .
            </p>
            <p className="text-sm text-gray-600 mt-2" data-last-fetch>
              {data.lastFetch?.at
                ? `Last fetched ${formatDate(data.lastFetch.at, true)}${data.lastFetch.by ? ' by ' + data.lastFetch.by : ''} for ${data.lastFetch.range || 'an unknown range'}${
                    data.lastFetch.error ? '. It failed: ' + data.lastFetch.error : '.'
                  }`
                : 'Settlements have never been fetched from the gateway.'}{' '}
              The list shows what is stored; it is not refreshed by itself.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setConfirming(true)} disabled={!gateway.usable || tooLong || fetching}>
              <RefreshCw size={16} />
              Fetch from Razorpay
            </Button>
          )}
        </div>
        {tooLong && gateway.usable && (
          <p className="text-sm text-amber-800 mt-2">
            Settlements can be fetched for at most {data.maxFetchDays} days at a time. Choose a shorter range to fetch.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <StatCard label="Settlements in this range" value={totals.settlements} hint={`${formatMoney(totals.amount)} paid to the bank`} tone="blue" />
        <StatCard label="Settled payments matched to the ledger" value={totals.matched} hint={`of ${totals.payments} payments in these settlements`} tone="green" />
        <StatCard label="Settled payments not in the ledger" value={totals.unmatched} hint="Money received that the ledger does not have" tone={totals.unmatched ? 'red' : 'gray'} />
        <StatCard
          label="Ledger payments not settled yet"
          value={ledger.unsettled.count}
          hint={`${formatMoney(ledger.unsettled.total)}; ${ledger.settled.count} settled`}
          tone={ledger.unsettled.count ? 'amber' : 'gray'}
        />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-deep-blue">Settlements</h2>
          <p className="text-sm text-gray-500">
            Settled {data.range.label}, Asia/Kolkata (IST). Gateway fees charged on matched payments: {formatMoney(totals.matchedGatewayFees)}; the ledger&rsquo;s
            &lsquo;gateway_fee&rsquo; entries for the same payments: {formatMoney(totals.ledgerFees)}. Total gateway fees {formatMoney(totals.gatewayFees)}, including{' '}
            {formatMoney(totals.gatewayTax)} tax.
          </p>
        </div>
        {data.settlements.length === 0 ? (
          <EmptyState
            title="No gateway settlements are stored for this range"
            hint={
              gateway.usable
                ? 'Press "Fetch from Razorpay" to read the settlements for this range. They are then stored and matched to the ledger.'
                : 'Settlements are read from Razorpay once the gateway is configured and switched on.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Settled</th>
                  <th className={th}>Settlement ID / UTR</th>
                  <th className={thRight}>Paid to bank</th>
                  <th className={th}>Payments</th>
                  <th className={thRight}>Gateway fee (incl. tax)</th>
                  <th className={thRight}>Tax</th>
                  <th className={thRight}>Ledger gateway fee</th>
                  <th className={th}>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.settlements.map((row) => (
                  <React.Fragment key={row.settlementId}>
                    <tr data-settlement={row.settlementId}>
                      <td className={td + ' whitespace-nowrap'}>{formatDate(row.settledAt, true)}</td>
                      <td className={td + ' font-mono text-xs'}>
                        {row.settlementId}
                        <span className="block font-sans text-gray-500">UTR {row.utr || 'not given'}</span>
                        {row.status && <span className="block font-sans text-gray-500">{row.status}</span>}
                      </td>
                      <td className={tdRight}>
                        {money(row.amount)}
                        {row.netDifference ? (
                          <span className="block text-xs text-amber-700">lines add up to {formatMoney(row.itemsNet)}</span>
                        ) : row.amount !== null && row.lines > 0 ? (
                          <span className="block text-xs text-gray-500">equals its lines</span>
                        ) : null}
                      </td>
                      <td className={td}>
                        <Badge tone={row.unmatched ? 'red' : row.payments ? 'green' : 'gray'}>
                          {row.matched} matched / {row.unmatched} unmatched
                        </Badge>
                        <span className="block text-xs text-gray-500 mt-1">
                          {row.payments} payments worth {formatMoney(row.paymentsGross)}
                          {row.refunds > 0 ? `, ${row.refunds} refunds` : ''}
                          {row.otherLines > 0 ? `, ${row.otherLines} other lines` : ''}
                          {row.debits > 0 ? ` (${formatMoney(row.debits)} deducted)` : ''}
                        </span>
                        {row.amountMismatches > 0 && <span className="block text-xs text-red-700">{row.amountMismatches} with a different amount in the ledger</span>}
                      </td>
                      <td className={tdRight}>{formatMoney(row.gatewayFees)}</td>
                      <td className={tdRight}>{formatMoney(row.gatewayTax)}</td>
                      <td className={tdRight}>
                        {formatMoney(row.ledgerFees)}
                        {row.feeDifference ? <span className="block text-xs text-amber-700">gateway charged {formatMoney(Math.abs(row.feeDifference))} {row.feeDifference > 0 ? 'more' : 'less'}</span> : null}
                      </td>
                      <td className={td}>
                        {(row.unmatched > 0 || row.amountMismatches > 0) && (
                          <button
                            className="text-sm text-deep-blue underline"
                            aria-expanded={expanded === row.settlementId}
                            onClick={() => setExpanded(expanded === row.settlementId ? null : row.settlementId)}
                          >
                            {expanded === row.settlementId ? 'Hide' : 'Show'} differences
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === row.settlementId && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3 bg-gray-50 text-sm text-gray-700">
                          {row.unmatchedItems.length > 0 && (
                            <>
                              <p className="font-medium text-gray-800">Settled by the gateway, not in the ledger</p>
                              <ul className="mt-1 space-y-1">
                                {row.unmatchedItems.map((item) => (
                                  <li key={item.paymentId}>
                                    <span className="font-mono text-xs">{item.paymentId}</span> · {formatMoney(item.amount)} (fee {formatMoney(item.fee)})
                                    {item.orderId ? <span className="text-gray-500"> · order {item.orderId}</span> : null}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-xs text-gray-500 mt-1">
                                Use the Payments tab for the dates these were paid to confirm them into the ledger. They are matched here automatically afterwards.
                              </p>
                            </>
                          )}
                          {row.mismatchedItems.length > 0 && (
                            <>
                              <p className="font-medium text-gray-800 mt-2">Different amount in the ledger</p>
                              <ul className="mt-1 space-y-1">
                                {row.mismatchedItems.map((item) => (
                                  <li key={item.paymentId}>
                                    <span className="font-mono text-xs">{item.paymentId}</span> · gateway {formatMoney(item.amount)}, ledger {formatMoney(item.ledgerAmount)} (
                                    <Link href={'/finance/payments?open=' + encodeURIComponent(item.ledgerReference)} className="text-deep-blue underline">
                                      {item.ledgerReference}
                                    </Link>
                                    )
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-deep-blue">Ledger payments the gateway has not settled yet</h2>
          <p className="text-sm text-gray-500" data-ledger-settled-summary>
            Gateway payments recorded in the ledger {data.range.label}: {ledger.settled.count} settled ({formatMoney(ledger.settled.total)}), {ledger.unsettled.count} not
            settled ({formatMoney(ledger.unsettled.total)}). A payment is settled once a fetched settlement contains it; Razorpay usually settles two working days after
            capture.
          </p>
        </div>
        {ledger.unsettledListed.length === 0 ? (
          <EmptyState
            title={ledger.settled.count > 0 ? 'Every gateway payment in this range has been settled' : 'No gateway payments in the ledger for this range'}
            hint="Ledger payments made through the gateway are listed here until a fetched settlement contains them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Paid</th>
                  <th className={th}>Ledger reference</th>
                  <th className={th}>Gateway payment ID</th>
                  <th className={th}>Status</th>
                  <th className={thRight}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.unsettledListed.map((payment) => (
                  <tr key={payment._id}>
                    <td className={td + ' whitespace-nowrap'}>{formatDate(payment.createdAt, true)}</td>
                    <td className={td + ' font-mono text-xs'}>
                      <Link href={'/finance/payments?open=' + encodeURIComponent(payment.reference)} className="text-deep-blue underline">
                        {payment.reference}
                      </Link>
                    </td>
                    <td className={td + ' font-mono text-xs'}>{payment.gatewayPaymentId}</td>
                    <td className={td}>
                      <LedgerStatusBadge status={payment.status} />
                    </td>
                    <td className={tdRight}>{formatMoney(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledger.unsettled.count > ledger.unsettledListed.length && (
              <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-200">
                The oldest {ledger.unsettledListed.length} of {ledger.unsettled.count} are listed.
              </p>
            )}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        title="Fetch settlements from Razorpay?"
        message={`This reads the settlements and the settlement report for ${data.range.label} from Razorpay, stores them and matches each settled payment to the ledger. Nothing is changed at the gateway.`}
        confirmLabel="Fetch settlements"
        askReason
        busy={fetching}
        onConfirm={fetchFromGateway}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
