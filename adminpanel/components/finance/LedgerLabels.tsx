'use client'
import React from 'react'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

/* Labels and small pieces shared by the finance overview, payments, ledger and report screens. */

/** Same list as SERVICES in lib/ledger.ts, which cannot be imported in the browser. */
export const SERVICE_OPTIONS = [
  { value: 'ticketing', label: 'Event ticketing' },
  { value: 'artist_booking', label: 'Artist booking' },
  { value: 'learning', label: 'Learning' },
  { value: 'wishes', label: 'Wishes & greetings' },
  { value: 'membership', label: 'Membership' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'premium_search', label: 'Premium search pass' },
]

export function serviceName(value?: string | null): string {
  if (!value) return '—'
  return SERVICE_OPTIONS.find((option) => option.value === value)?.label || value
}

export const TYPE_OPTIONS: { value: string; label: string; tone: Tone }[] = [
  { value: 'payment', label: 'Payment', tone: 'green' },
  { value: 'commission', label: 'Commission', tone: 'blue' },
  { value: 'gst', label: 'GST', tone: 'purple' },
  { value: 'gateway_fee', label: 'Gateway fee', tone: 'gray' },
  { value: 'refund', label: 'Refund', tone: 'red' },
  { value: 'refund_deduction', label: 'Refund deduction', tone: 'amber' },
  { value: 'settlement', label: 'Settlement', tone: 'blue' },
  { value: 'adjustment', label: 'Adjustment', tone: 'amber' },
]

export const STATUS_OPTIONS: { value: string; label: string; tone: Tone }[] = [
  { value: 'success', label: 'Successful', tone: 'green' },
  { value: 'failed', label: 'Failed', tone: 'red' },
  { value: 'pending', label: 'Pending', tone: 'amber' },
  { value: 'refunded', label: 'Refunded', tone: 'purple' },
  { value: 'disputed', label: 'Disputed', tone: 'red' },
]

export const PAYEE_TYPE_OPTIONS = [
  { value: 'platform', label: 'Platform' },
  { value: 'organizer', label: 'Organiser' },
  { value: 'artist', label: 'Artist' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'advertiser', label: 'Advertiser' },
]

export function LedgerTypeBadge({ type }: { type: string }) {
  const option = TYPE_OPTIONS.find((item) => item.value === type)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || type}</Badge>
}

export function LedgerStatusBadge({ status }: { status: string }) {
  const option = STATUS_OPTIONS.find((item) => item.value === status)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || status}</Badge>
}

/** A link styled as a secondary button that downloads a CSV export. */
export function LedgerExportLink({ href, label = 'Export CSV' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
    >
      <Download size={16} />
      {label}
    </a>
  )
}

export function LedgerPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const button = 'px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white'
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <span className="flex items-center gap-2">
        <button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  )
}

export const th = 'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap'
export const thRight = th.replace('text-left', 'text-right')
export const td = 'px-4 py-2.5 text-sm text-gray-700 align-top'
export const tdRight = td + ' text-right tabular-nums whitespace-nowrap'
