'use client'
import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button, formatDate } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

/* Building blocks shared by the artist, organiser and KYC screens. */

export type KycView = 'pending' | 'approved' | 'rejected' | 'not_submitted'

export const KYC_META: Record<KycView, { label: string; tone: Tone }> = {
  pending: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  not_submitted: { label: 'Not submitted', tone: 'gray' },
}

export const KYC_ORDER: KycView[] = ['pending', 'approved', 'rejected', 'not_submitted']

export function KycBadge({ kyc, correction = false }: { kyc: KycView; correction?: boolean }) {
  const meta = KYC_META[kyc] || KYC_META.not_submitted
  if (kyc === 'rejected' && correction) return <Badge tone="purple">Corrections requested</Badge>
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export const ACCOUNT_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  suspended: { label: 'Suspended', tone: 'amber' },
  blocked: { label: 'Blocked', tone: 'red' },
}

export function AccountBadge({ status }: { status: string }) {
  const meta = ACCOUNT_META[status] || ACCOUNT_META.active
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

const EVENT_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function EventStatusBadge({ status }: { status: string }) {
  const meta = EVENT_META[status]
  return <Badge tone={meta?.tone || 'gray'}>{meta?.label || status || 'Unknown'}</Badge>
}

/** Builds a query string, leaving out empty values. */
export function qs(values: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number
  limit: number
  total: number
  onPage: (page: number) => void
}) {
  if (total === 0) return null
  const pages = Math.max(1, Math.ceil(total / limit))
  const first = (page - 1) * limit + 1
  const last = Math.min(total, page * limit)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
      <span>
        Showing {first} to {last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="!px-2 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button variant="secondary" className="!px-2 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const style = { width: size, height: size }
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className="rounded-full object-cover bg-gray-100 shrink-0" onError={() => setFailed(true)} />
  }
  return (
    <div style={style} className="rounded-full bg-deep-blue text-white flex items-center justify-center font-semibold shrink-0" aria-hidden="true">
      {initial}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{children || '—'}</dd>
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
      <h2 className="text-base font-semibold text-deep-blue">{children}</h2>
      {aside}
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  kyc_approve: 'KYC approved',
  kyc_reject: 'KYC rejected',
  kyc_request_corrections: 'KYC corrections requested',
  kyc_reopen: 'KYC moved back to pending',
  suspend: 'Account suspended',
  reactivate: 'Account reactivated',
  assign_category: 'Category changed',
  media_approve: 'Portfolio item approved',
  media_reject: 'Portfolio item rejected',
  edit_profile: 'Public profile edited',
  remove_image: 'Image removed',
  availability_override: 'Availability changed by an admin',
}

export interface HistoryEntry {
  _id: string
  action: string
  module: string
  adminName: string
  adminEmail: string | null
  before: Record<string, any> | null
  after: Record<string, any> | null
  reason: string | null
  meta: Record<string, any> | null
  createdAt: string
}

function changeText(entry: HistoryEntry): string {
  if (entry.action === 'assign_category') {
    return `${entry.before?.category || 'No category'} → ${entry.after?.category || 'No category'}`
  }
  if (entry.action.startsWith('kyc_')) {
    return `${entry.before?.kycStatus || 'pending'} → ${entry.after?.kycStatus || ''}${entry.meta?.reversal ? ' (reversed an earlier decision)' : ''}`
  }
  if (entry.action.startsWith('media_')) {
    const item = typeof entry.meta?.mediaIndex === 'number' ? `Item ${entry.meta.mediaIndex + 1}: ` : ''
    return `${item}${entry.before?.reviewStatus || 'not reviewed'} → ${entry.after?.reviewStatus || ''}`
  }
  if (entry.action === 'edit_profile') {
    return Object.keys(entry.after || {})
      .map((key) => `${key}: "${entry.before?.[key] ?? ''}" → "${entry.after?.[key] ?? ''}"`)
      .join('; ')
  }
  if (entry.action === 'remove_image') {
    return entry.meta?.image === 'banner' ? 'Banner image removed' : 'Profile photo removed'
  }
  if (entry.action === 'availability_override') {
    const days = Object.keys(entry.after || {}).sort()
    if (days.length === 0) return ''
    const first = days[0]
    const range = days.length === 1 ? first : `${first} to ${days[days.length - 1]} (${days.length} days)`
    return `${range}: ${String(entry.before?.[first] ?? 'not_set').replace('_', ' ')} → ${String(entry.after?.[first] ?? '').replace('_', ' ')}`
  }
  if (entry.before?.accountStatus || entry.after?.accountStatus) {
    return `${entry.before?.accountStatus || ''} → ${entry.after?.accountStatus || ''}`
  }
  return ''
}

/** Admin decisions recorded against a profile, read from the activity log. */
export function HistoryList({ entries, empty }: { entries: HistoryEntry[]; empty: string }) {
  if (!entries.length) return <p className="text-sm text-gray-500 px-5 py-6">{empty}</p>
  return (
    <ul className="divide-y divide-gray-100">
      {entries.map((entry) => (
        <li key={entry._id} className="px-5 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-gray-900">{ACTION_LABELS[entry.action] || entry.action}</span>
            <span className="text-xs text-gray-500">{formatDate(entry.createdAt, true)}</span>
          </div>
          <p className="text-gray-600">
            By {entry.adminName}
            {changeText(entry) ? ` · ${changeText(entry)}` : ''}
          </p>
          {entry.reason && <p className="text-gray-700 mt-1">Reason: {entry.reason}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Reads one value from the page's query string (client only). */
export function readQueryParam(name: string): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name) || ''
}

export const selectClass =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none'
