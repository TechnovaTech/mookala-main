'use client'
import React from 'react'
import { Badge } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

/** Labels and small helpers shared by the wishes screens. */

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  created: { label: 'Created', tone: 'gray' },
  paid: { label: 'Paid', tone: 'blue' },
  processing: { label: 'Processing', tone: 'amber' },
  delivered: { label: 'Delivered', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  delayed: { label: 'Delayed', tone: 'amber' },
  disputed: { label: 'Disputed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  refunded: { label: 'Refunded', tone: 'purple' },
}

export const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', in_app: 'In the app' }

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={ORDER_STATUS[status]?.tone || 'gray'}>{ORDER_STATUS[status]?.label || status}</Badge>
}

/** "3 d 4 h", "5 h 12 min", "8 min", "under a minute". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'under a minute'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${mins} min`
  return `${mins} min`
}

export function formatAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—'
  return formatDuration(hours * 3600000)
}

export const APPS_NOT_WIRED =
  'Ordering from the mobile apps and website is not wired: the apps can read the templates on sale (/api/public/wishes/templates and /api/public/wishes/categories), but there is no app screen for wishes and no order can be placed or paid from an app. Every order here was entered by the team.'
