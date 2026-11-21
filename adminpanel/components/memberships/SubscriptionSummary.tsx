'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Button, ConfirmDialog, NoticeBar, StatCard, api, formatMoney, type Notice } from '@/components/ui'
import { APP_NOT_WIRED } from './shared'

interface Figures {
  documents: { payments: number; gross: number; refunds: number; net: number }
  ledger: { payments: number; gross: number; refunds: number; net: number }
  ledgerOther: { payments: number; gross: number }
  missingFromLedger: number
  matches: boolean
}
export interface Summary {
  windowDays: number
  today: string
  expiredOnOpen: number
  active: number
  expiringSoon: number
  expired: number
  paymentFailed: number
  cancelled: number
  paused: number
  failedPayments: number
  revenue: { month: Figures & { from: string; to: string }; allTime: Figures }
  canManage: boolean
}

/**
 * Strip above the subscriptions list: live counts, membership revenue from the
 * payment records beside the finance ledger, and the "Update expired" action.
 * The page loads the summary before the list, because loading it also stores
 * "expired" on subscriptions whose expiry date has passed.
 */
export default function SubscriptionSummary({ initial }: { initial: Summary | null }) {
  const [summary, setSummary] = useState<Summary | null>(initial)
  const [notice, setNotice] = useState<Notice>(
    initial && initial.expiredOnOpen > 0
      ? {
          type: 'info',
          text: `${initial.expiredOnOpen} subscription${initial.expiredOnOpen === 1 ? ' was' : 's were'} past the expiry date and ${initial.expiredOnOpen === 1 ? 'has' : 'have'} been marked expired on opening this screen. Each change is in the activity log.`,
        }
      : null
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState(false)

  const updateExpired = async () => {
    setBusy(true)
    try {
      const result = await api<{ updated: number }>('/api/admin/memberships/expire', { method: 'POST', body: {} })
      setNotice({
        type: 'success',
        text:
          result.updated === 0
            ? 'No active subscription is past its expiry date. Nothing was changed.'
            : `${result.updated} subscription${result.updated === 1 ? ' was' : 's were'} marked expired. Refresh the list below to see the change.`,
      })
      setUpdated(result.updated > 0)
      setSummary(await api<Summary>('/api/admin/memberships/summary'))
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not update expired subscriptions.' })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const count = (value: number | undefined) => (summary ? (value || 0).toLocaleString('en-IN') : '—')
  const month = summary?.revenue.month
  const all = summary?.revenue.allTime

  return (
    <section aria-label="Membership summary" className="mb-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar notice={{ type: 'info', text: APP_NOT_WIRED }} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
        <StatCard label="Active" value={count(summary?.active)} />
        <StatCard label={`Expiring in ${summary?.windowDays ?? 30} days`} value={count(summary?.expiringSoon)} />
        <StatCard label="Expired" value={count(summary?.expired)} />
        <StatCard
          label="Failed renewals"
          value={count(summary?.paymentFailed)}
          hint={summary && summary.failedPayments > 0 ? `${summary.failedPayments} failed payment record${summary.failedPayments === 1 ? '' : 's'}` : undefined}
          tone="red"
        />
        <StatCard label="Cancellations" value={count(summary?.cancelled)} />
        <StatCard
          label="Membership revenue this month"
          value={month ? formatMoney(month.documents.gross) : '—'}
          hint={month ? `Ledger: ${formatMoney(month.ledger.gross)}${month.matches ? ' (matches)' : ' (differs)'}` : undefined}
          tone={month && !month.matches ? 'red' : 'green'}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3">
        <div className="text-sm text-gray-700 max-w-3xl space-y-1">
          <p>
            A subscription is valid through its expiry date (India time). Nothing runs on a schedule, so expiry is applied
            whenever a membership screen is opened and whenever an app asks for a member&apos;s status;{' '}
            &quot;Update expired&quot; does the same on demand.
          </p>
          {month && all && (
            <p data-revenue-check>
              Membership revenue is the payments received, by the date they were entered in the finance ledger. This month (
              {month.from} to {month.to}): {formatMoney(month.documents.gross)} from {month.documents.payments} payment record
              {month.documents.payments === 1 ? '' : 's'}, {formatMoney(month.ledger.gross)} in the ledger; refunds{' '}
              {formatMoney(month.documents.refunds)}. All dates: {formatMoney(all.documents.gross)} from the payment records,{' '}
              {formatMoney(all.ledger.gross)} in the ledger; refunds {formatMoney(all.documents.refunds)}.
              {all.ledgerOther.payments > 0
                ? ` The ledger holds ${all.ledgerOther.payments} membership payment entr${all.ledgerOther.payments === 1 ? 'y' : 'ies'} (${formatMoney(all.ledgerOther.gross)}) that were not written for a payment record here.`
                : ''}
              {all.missingFromLedger > 0
                ? ` ${all.missingFromLedger} older paid record${all.missingFromLedger === 1 ? ' has' : 's have'} no ledger entry.`
                : ''}{' '}
              The dashboard and Finance show the ledger figure.
            </p>
          )}
          <p>
            <Link href="/memberships/renewals" className="text-teal underline">
              Renewals &amp; Cancellations
            </Link>{' '}
            is the follow-up list;{' '}
            <Link href="/memberships/reports" className="text-teal underline">
              Membership Reports
            </Link>{' '}
            has the revenue, renewal, expiry and cancellation exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {updated && (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} />
              Refresh list
            </Button>
          )}
          {summary?.canManage && <Button onClick={() => setConfirming(true)}>Update expired</Button>}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Update expired subscriptions"
        message="Every active subscription whose expiry date has passed will be marked expired. Each change is written to the activity log."
        confirmLabel="Update expired"
        busy={busy}
        onConfirm={updateExpired}
        onClose={() => setConfirming(false)}
      />
    </section>
  )
}
