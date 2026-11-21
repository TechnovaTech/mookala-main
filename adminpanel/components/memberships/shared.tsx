'use client'
import React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui'

/** Pieces shared by the membership screens. */

type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple'

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  expired: { label: 'Expired', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  payment_failed: { label: 'Payment failed', tone: 'amber' },
  paused: { label: 'Paused', tone: 'purple' },
}

export function StatusBadge({ status }: { status: string }) {
  const known = SUBSCRIPTION_STATUS[status]
  return <Badge tone={known?.tone || 'gray'}>{known?.label || status || 'Unknown'}</Badge>
}

/** A subscription as the membership APIs return it. */
export interface SubscriptionRow {
  _id: string
  memberName: string
  memberPhone: string
  memberEmail: string
  planId: string
  plan: string
  planPrice: number | null
  planBillingPeriod: string
  startedOn: string | null
  expiresOn: string | null
  daysLeft: number | null
  autoRenew: boolean
  status: string
  statusReason: string | null
  statusChangedAt: string | null
  lastPaymentReference: string | null
  lastPaymentAt: string | null
  lastPaymentAmount: number | null
  lastFailedPaymentAt: string | null
  cancelReason: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  reinstatedAt: string | null
  lastReminderAt: string | null
}

export function daysLeftText(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'Today'
  if (days < 0) return days === -1 ? '1 day ago' : `${-days} days ago`
  return days === 1 ? 'In 1 day' : `In ${days} days`
}

export function memberHref(id: string): string {
  return `/memberships/subscriptions/member?id=${id}`
}

export function MemberLink({ row }: { row: { _id: string; memberName: string; memberPhone: string } }) {
  return (
    <>
      <Link href={memberHref(row._id)} className="text-deep-blue font-medium hover:underline">
        {row.memberName || 'Unnamed member'}
      </Link>
      <p className="text-xs text-gray-500">{row.memberPhone}</p>
    </>
  )
}

/** Where a membership support case is handled. */
export function supportHref(item: { _id: string; kind: string }): string {
  return `${item.kind === 'complaint' ? '/support/complaints' : '/support/tickets'}?id=${item._id}`
}

/** Says plainly that the apps do not sell memberships yet. */
export const APP_NOT_WIRED =
  'Buying a membership in the mobile apps is not wired: the apps show plan names written into their own code and take no membership payment. The plans and a member\'s own status are available to the apps at /api/public/memberships/plans and /api/public/memberships/status for when they are connected; until then every subscription and payment here is entered by the team.'

export const thClass = 'px-4 py-3 font-medium whitespace-nowrap'
export const tdClass = 'px-4 py-3 text-gray-800'
export const headRowClass = 'bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500'
