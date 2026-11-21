'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell, { useCan } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import GatewaySettlements from './GatewaySettlements'
import OverviewRangeFilter, { rangeQuery, type RangeValue } from '@/components/finance/OverviewRangeFilter'
import ReportDefinitions from '@/components/finance/ReportDefinitions'
import { LedgerExportLink, LedgerStatusBadge, td, tdRight, th, thRight } from '@/components/finance/LedgerLabels'
import type { Tone } from '@/lib/resource-types'

interface Row {
  category: 'matched' | 'amount_mismatch' | 'gateway_only' | 'ledger_only' | 'not_compared'
  gatewayPaymentId: string
  ledgerReference: string
  ledgerStatus: string
  ledgerAmount: number | null
  ledgerCreatedAt: string | null
  gatewayStatus: string
  gatewayAmount: number | null
  gatewayCreatedAt: string | null
  amountDifference: number | null
  gatewayFee: number | null
  gatewayTax: number | null
  ledgerGatewayFee: number | null
  feeDifference: number | null
  note: string
  gatewayOrderId?: string | null
  bookingId?: string | null
  bookingStatus?: string | null
}

interface WebhookRow {
  _id: string
  receivedAt: string
  event: string | null
  eventId: string | null
  signatureValid: boolean
  processed: boolean
  error: string | null
  result?: string | null
  deliveries?: number
  replays?: number
  replayedBy?: string | null
  canReplay: boolean
}

interface Bucket {
  count: number
  ledgerAmount: number
  gatewayAmount: number
}

interface Result {
  range: { label: string }
  gateway: {
    configured: boolean
    enabled: boolean
    mode: string
    compared: boolean
    error: string | null
    notConfigured: boolean
    fetched: number
    truncated: boolean
    byStatus: { status: string; count: number; total: number }[]
  }
  ledger: { payments: number; byStatus: { status: string; count: number; total: number }[] }
  summary: {
    matched: Bucket
    amountMismatch: Bucket
    gatewayOnly: Bucket
    ledgerOnly: Bucket
    notCompared: Bucket
    fees: { gatewayFee: number; gatewayTax: number; ledgerGatewayFee: number; paymentsWithFeeDifference: number }
  }
  mismatches: Row[]
  matched: Row[]
  matchedListed: number
  notes: string[]
  webhooks: {
    total: number
    lastDeliveryAt: string | null
    lastEvent: string | null
    lastResult: string | null
    last24h: number
    invalidSignatures: number
    invalidSignatures24h: number
    processingErrors: number
    processingErrors24h: number
    recent: WebhookRow[]
    failing: WebhookRow[]
  }
}

const CATEGORY: Record<Row['category'], { label: string; tone: Tone }> = {
  matched: { label: 'Matched', tone: 'green' },
  amount_mismatch: { label: 'Amount mismatch', tone: 'red' },
  gateway_only: { label: 'Missing from ledger', tone: 'red' },
  ledger_only: { label: 'Not at gateway', tone: 'amber' },
  not_compared: { label: 'Not compared', tone: 'gray' },
}

const money = (value: number | null) => (value === null ? '—' : formatMoney(value))

function RowsTable({ rows, onConfirm }: { rows: Row[]; onConfirm?: (row: Row) => void }) {
  const canManage = useCan('finance:manage')
  const canSeeBookings = useCan('bookings:view')
  const actions = Boolean(onConfirm) && rows.some((row) => row.category === 'gateway_only')
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>Result</th>
            <th className={th}>Gateway payment ID</th>
            <th className={th}>Ledger reference</th>
            <th className={thRight}>Ledger amount</th>
            <th className={thRight}>Gateway amount</th>
            <th className={thRight}>Difference</th>
            <th className={thRight}>Gateway fee (incl. tax)</th>
            <th className={thRight}>Gateway tax</th>
            <th className={thRight}>Ledger gateway fee</th>
            {actions && <th className={th}>Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, index) => (
            <tr key={row.gatewayPaymentId + row.ledgerReference + index} data-recon-row={row.gatewayPaymentId || row.ledgerReference}>
              <td className={td}>
                <Badge tone={CATEGORY[row.category].tone}>{CATEGORY[row.category].label}</Badge>
                {row.note && <span className="block text-xs text-gray-500 mt-1 max-w-[14rem]">{row.note}</span>}
              </td>
              <td className={td + ' font-mono text-xs'}>
                {row.gatewayPaymentId || '—'}
                {row.gatewayStatus && <span className="block font-sans text-gray-500">{row.gatewayStatus}</span>}
                {row.gatewayCreatedAt && <span className="block font-sans text-gray-500">{formatDate(row.gatewayCreatedAt, true)}</span>}
              </td>
              <td className={td + ' font-mono text-xs'}>
                {row.ledgerReference ? (
                  <Link href={'/finance/payments?open=' + encodeURIComponent(row.ledgerReference)} className="text-deep-blue underline">
                    {row.ledgerReference}
                  </Link>
                ) : (
                  '—'
                )}
                {row.ledgerStatus && (
                  <span className="block mt-1">
                    <LedgerStatusBadge status={row.ledgerStatus} />
                  </span>
                )}
                {row.ledgerCreatedAt && <span className="block font-sans text-gray-500 mt-1">{formatDate(row.ledgerCreatedAt, true)}</span>}
              </td>
              <td className={tdRight}>{money(row.ledgerAmount)}</td>
              <td className={tdRight}>{money(row.gatewayAmount)}</td>
              <td className={tdRight + (row.amountDifference ? ' text-red-700 font-semibold' : '')}>{money(row.amountDifference)}</td>
              <td className={tdRight}>{money(row.gatewayFee)}</td>
              <td className={tdRight}>{money(row.gatewayTax)}</td>
              <td className={tdRight}>
                {money(row.ledgerGatewayFee)}
                {row.feeDifference ? <span className="block text-xs text-amber-700">differs by {formatMoney(row.feeDifference)}</span> : null}
              </td>
              {actions && (
                <td className={td}>
                  {row.category === 'gateway_only' &&
                    (row.bookingId ? (
                      <span className="flex flex-col items-start gap-1">
                        <span className="text-xs text-gray-500">Booking {String(row.bookingStatus || 'no status').replace(/_/g, ' ')}</span>
                        {canSeeBookings && (
                          <Link href={'/bookings?open=' + encodeURIComponent(row.bookingId)} className="text-sm text-deep-blue underline">
                            Open booking
                          </Link>
                        )}
                        {canManage && onConfirm && (
                          <Button variant="secondary" onClick={() => onConfirm(row)} aria-label={`Confirm payment ${row.gatewayPaymentId}`}>
                            Confirm payment
                          </Button>
                        )}
                      </span>
                    ) : (
                      <span className="block text-xs text-gray-500 max-w-[12rem]">
                        No booking was created for this order. Refund it from the Razorpay dashboard if the customer should not have been charged.
                      </span>
                    ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The gateway keys are managed by a Super Admin (or an admin granted the integrations permission). */
function GatewaySettingsLink() {
  const canOpen = useCan('integrations:view')
  if (!canOpen) return <span>The Razorpay keys are managed by a Super Admin under Payment Gateway.</span>
  return (
    <Link href="/settings" className="underline font-medium">
      Open payment gateway settings
    </Link>
  )
}

function WebhookTable({ rows, onReplay }: { rows: WebhookRow[]; onReplay: (row: WebhookRow) => void }) {
  const canManage = useCan('finance:manage')
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>Received</th>
            <th className={th}>Event</th>
            <th className={th}>Event ID</th>
            <th className={th}>Signature</th>
            <th className={th}>Processed</th>
            <th className={th}>Result</th>
            <th className={th}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((event) => (
            <tr key={event._id} data-webhook={event.eventId || event._id}>
              <td className={td + ' whitespace-nowrap'}>{formatDate(event.receivedAt, true)}</td>
              <td className={td}>{event.event || '—'}</td>
              <td className={td + ' font-mono text-xs'}>
                {event.eventId || '—'}
                {(event.deliveries || 0) > 1 && <span className="block font-sans text-gray-500">delivered {event.deliveries} times</span>}
              </td>
              <td className={td}>{event.signatureValid ? <Badge tone="green">Valid</Badge> : <Badge tone="red">Invalid</Badge>}</td>
              <td className={td}>{event.processed ? <Badge tone="green">Yes</Badge> : <Badge tone={event.signatureValid ? 'red' : 'gray'}>No</Badge>}</td>
              <td className={td + ' max-w-[22rem]'}>
                {event.error ? <span className="text-red-700">{event.error}</span> : event.result || '—'}
                {event.replayedBy && <span className="block text-xs text-gray-500">Replayed by {event.replayedBy}</span>}
              </td>
              <td className={td}>
                {event.canReplay && canManage && (
                  <Button variant="secondary" onClick={() => onReplay(event)} aria-label={`Replay ${event.event} ${event.eventId}`}>
                    Replay
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ReconciliationPage() {
  const [range, setRange] = useState<RangeValue>({ preset: '7d', from: '', to: '' })
  const [data, setData] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [view, setView] = useState<'payments' | 'settlements'>('payments')
  const [confirmRow, setConfirmRow] = useState<Row | null>(null)
  const [replayRow, setReplayRow] = useState<WebhookRow | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'settlements') setView('settlements')
  }, [])

  const load = useCallback(async () => {
    // The settlements tab loads its own data and does not read the gateway's payment list.
    if (view !== 'payments') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setData(await api<Result>('/api/admin/finance/reconciliation?' + rangeQuery(range)))
      setNotice(null)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not run the reconciliation.' })
    } finally {
      setLoading(false)
    }
  }, [range, view])

  useEffect(() => {
    load()
  }, [load])

  const confirmPayment = async (reason: string) => {
    if (!confirmRow) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>('/api/admin/finance/reconciliation', {
        method: 'POST',
        body: { action: 'confirm_payment', gatewayPaymentId: confirmRow.gatewayPaymentId, reason },
      })
      setConfirmRow(null)
      await load()
      setNotice({ type: 'success', text: result.message })
    } catch (error: any) {
      setConfirmRow(null)
      setNotice({ type: 'error', text: error.message || 'Could not confirm the payment.' })
    } finally {
      setBusy(false)
    }
  }

  const replay = async (reason: string) => {
    if (!replayRow) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>('/api/admin/finance/reconciliation/webhooks', { method: 'POST', body: { id: replayRow._id, reason } })
      setReplayRow(null)
      await load()
      setNotice({ type: 'success', text: result.message })
    } catch (error: any) {
      setReplayRow(null)
      await load()
      setNotice({ type: 'error', text: error.message || 'The replay failed.' })
    } finally {
      setBusy(false)
    }
  }

  const gateway = data?.gateway
  const hooks = data?.webhooks

  return (
    <AdminShell
      title="Reconciliation"
      subtitle="Razorpay payments and settlements against the ledger, and webhook status"
      actions={view === 'payments' ? <LedgerExportLink href={'/api/admin/finance/reconciliation?format=csv&' + rangeQuery(range)} label="Export mismatches (CSV)" /> : undefined}
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Reconciliation view">
        {[
          { value: 'payments' as const, label: 'Payments and webhooks' },
          { value: 'settlements' as const, label: 'Gateway settlements' },
        ].map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === option.value ? 'bg-deep-blue text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card className="p-4 mb-4">
        <OverviewRangeFilter value={range} onChange={setRange} disabled={loading} />
        {view === 'payments' && data && (
          <p className="text-sm text-gray-600 mt-3">
            Comparing <span className="font-medium text-gray-800">{data.range.label}</span>, Asia/Kolkata (IST). Payments are matched by gateway payment ID. At
            most 1,000 gateway payments are fetched for one range.
          </p>
        )}
      </Card>

      {view === 'settlements' && <GatewaySettlements range={range} />}

      {view === 'payments' && loading && !data && <Spinner label="Fetching payments from the gateway and the ledger..." />}

      {view === 'payments' && data && gateway && hooks && (
        <div className={loading ? 'opacity-60' : ''}>
          {!gateway.compared && (
            <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm mb-4" role="alert">
              <p className="font-semibold">
                {gateway.notConfigured ? 'The payment gateway is not configured, so nothing was compared' : 'The gateway could not be read, so nothing was compared'}
              </p>
              <p className="mt-0.5">
                {gateway.error}{' '}
                {gateway.notConfigured && <GatewaySettingsLink />}
              </p>
              <p className="mt-1">The ledger side and the webhook log below are still shown. No payment is reported as matched or mismatched.</p>
            </div>
          )}
          {data.notes.map((note) => (
            <NoticeBar key={note} notice={{ type: 'info', text: note }} />
          ))}

          {gateway.compared && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
                <StatCard label="Matched" value={data.summary.matched.count} hint={formatMoney(data.summary.matched.gatewayAmount)} tone="green" />
                <StatCard
                  label="In the gateway, missing from the ledger"
                  value={data.summary.gatewayOnly.count}
                  hint={formatMoney(data.summary.gatewayOnly.gatewayAmount)}
                  tone={data.summary.gatewayOnly.count ? 'red' : 'gray'}
                />
                <StatCard
                  label="In the ledger, not at the gateway"
                  value={data.summary.ledgerOnly.count}
                  hint={formatMoney(data.summary.ledgerOnly.ledgerAmount)}
                  tone={data.summary.ledgerOnly.count ? 'amber' : 'gray'}
                />
                <StatCard
                  label="Amount mismatches"
                  value={data.summary.amountMismatch.count}
                  hint={`Gateway ${formatMoney(data.summary.amountMismatch.gatewayAmount)} / ledger ${formatMoney(data.summary.amountMismatch.ledgerAmount)}`}
                  tone={data.summary.amountMismatch.count ? 'red' : 'gray'}
                />
              </div>
              <Card className="p-5 mb-4">
                <h2 className="text-lg font-semibold text-deep-blue">Gateway fees against the ledger</h2>
                <p className="text-sm text-gray-600 mt-1">
                  For the {data.summary.matched.count + data.summary.amountMismatch.count} payments found on both sides: the gateway charged{' '}
                  <span className="font-medium text-gray-800">{formatMoney(data.summary.fees.gatewayFee)}</span> in fees (including{' '}
                  {formatMoney(data.summary.fees.gatewayTax)} tax); the ledger holds{' '}
                  <span className="font-medium text-gray-800">{formatMoney(data.summary.fees.ledgerGatewayFee)}</span> in &lsquo;gateway_fee&rsquo; entries for the
                  same payments. {data.summary.fees.paymentsWithFeeDifference} payments differ. The ledger fee comes from the percentage in the commission rule, so
                  small differences from the gateway&rsquo;s actual charge are expected.
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Gateway payments fetched: {gateway.fetched} ({gateway.byStatus.filter((s) => s.count).map((s) => `${s.status} ${s.count}`).join(', ') || 'none'}).
                  Attempts the gateway did not capture are not expected in the ledger.
                </p>
              </Card>
            </>
          )}

          <Card className="mb-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">{gateway.compared ? 'Mismatches' : 'Ledger payments in this range (not compared)'}</h2>
              <p className="text-sm text-gray-500">
                Ledger side: {data.ledger.payments} payment entries
                {data.ledger.byStatus.length > 0 && ' (' + data.ledger.byStatus.map((s) => `${s.status} ${s.count}, ${formatMoney(s.total)}`).join('; ') + ')'}.
              </p>
            </div>
            {data.mismatches.length === 0 ? (
              <EmptyState
                title={gateway.compared ? 'No mismatches in this range' : 'No ledger payments in this range'}
                hint={
                  gateway.compared
                    ? 'Every captured gateway payment has a ledger entry with the same amount, and every ledger payment was found at the gateway.'
                    : 'Ledger payment entries are written when a payment is verified through the gateway.'
                }
              />
            ) : (
              <RowsTable rows={data.mismatches} onConfirm={setConfirmRow} />
            )}
          </Card>

          {gateway.compared && data.matched.length > 0 && (
            <Card className="mb-4 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-deep-blue">Matched payments</h2>
                <p className="text-sm text-gray-500">
                  Showing {data.matchedListed} of {data.summary.matched.count}, with the gateway&rsquo;s fee and tax beside the ledger&rsquo;s gateway fee entry.
                </p>
              </div>
              <RowsTable rows={data.matched} />
            </Card>
          )}

          <Card className="mb-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-deep-blue">Payment webhook status</h2>
              <p className="text-sm text-gray-500">
                Deliveries from Razorpay received by this server. Not limited to the date range above. Only identifiers, amounts and statuses of a delivery are
                stored: no card, UPI or contact details.
              </p>
            </div>
            {hooks.total === 0 ? (
              <EmptyState
                title="No webhook deliveries have been received"
                hint="Deliveries are logged here when Razorpay calls the payment webhook. If payments are being taken, check that the webhook URL and secret are set in the Razorpay dashboard."
              />
            ) : (
              <div data-webhook-status>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 p-5">
                  <StatCard
                    label="Last delivery"
                    value={<span className="text-lg">{formatDate(hooks.lastDeliveryAt, true)}</span>}
                    hint={[hooks.lastEvent, hooks.lastResult].filter(Boolean).join(' · ') || undefined}
                    tone="gray"
                  />
                  <StatCard label="Deliveries in the last 24 hours" value={hooks.last24h} hint={`${hooks.total} in total`} tone="gray" />
                  <StatCard
                    label="Invalid signatures"
                    value={hooks.invalidSignatures}
                    hint={`${hooks.invalidSignatures24h} in the last 24 hours`}
                    tone={hooks.invalidSignatures24h ? 'red' : 'gray'}
                  />
                  <StatCard
                    label="Processing errors"
                    value={hooks.processingErrors}
                    hint={`${hooks.processingErrors24h} in the last 24 hours; genuine deliveries not processed yet`}
                    tone={hooks.processingErrors ? 'red' : 'gray'}
                  />
                </div>
                {hooks.failing.length > 0 && (
                  <div className="border-t border-gray-200" data-webhook-failing>
                    <p className="px-5 py-3 text-sm text-gray-700">
                      <span className="font-semibold text-red-700">{hooks.processingErrors} genuine {hooks.processingErrors === 1 ? 'delivery has' : 'deliveries have'} not been processed.</span>{' '}
                      Razorpay retries a failed delivery for a limited time. &ldquo;Replay&rdquo; runs the handler again on the stored delivery; it cannot apply a payment or
                      refund twice.
                    </p>
                    <WebhookTable rows={hooks.failing} onReplay={setReplayRow} />
                  </div>
                )}
                <div className="border-t border-gray-200">
                  <p className="px-5 py-3 text-sm font-medium text-gray-700">Recent deliveries</p>
                  <WebhookTable rows={hooks.recent} onReplay={setReplayRow} />
                </div>
                <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-200">The 25 most recent deliveries are listed.</p>
              </div>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmRow !== null}
        title="Confirm this payment into the ledger?"
        message={
          confirmRow ? (
            <div className="space-y-2">
              <p>
                Razorpay captured <span className="font-mono text-xs">{confirmRow.gatewayPaymentId}</span> for {money(confirmRow.gatewayAmount)}, but the ledger does not count
                it. The payment is fetched from Razorpay again and its booking is confirmed exactly as the webhook would have done: the booking becomes a ticket and the
                payment, commission, GST and gateway fee entries are written.
              </p>
              <p>If the seats are no longer free, the payment is recorded, the booking is cancelled and a full refund request is opened instead.</p>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Confirm payment"
        askReason
        reasonRequired
        busy={busy}
        onConfirm={confirmPayment}
        onClose={() => setConfirmRow(null)}
      />

      <ConfirmDialog
        open={replayRow !== null}
        title="Replay this webhook delivery?"
        message={
          replayRow
            ? `The handler for '${replayRow.event}' runs again on the delivery stored at ${formatDate(replayRow.receivedAt, true)}. Work that was already done is not repeated.`
            : ''
        }
        confirmLabel="Replay"
        askReason
        busy={busy}
        onConfirm={replay}
        onClose={() => setReplayRow(null)}
      />

      {view === 'payments' && <ReportDefinitions rangeLabel={data?.range.label} />}
    </AdminShell>
  )
}
