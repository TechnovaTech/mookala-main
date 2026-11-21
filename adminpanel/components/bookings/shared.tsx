'use client'
import React from 'react'
import type { Tone } from '@/lib/resource-types'
import { Badge } from '@/components/ui'

/* Labels and small pieces shared by the Bookings and Cancellations screens. */

export interface TicketLine {
  category?: string | null
  block?: string | null
  fromSeat?: number | string | null
  toSeat?: number | string | null
  quantity?: number | string | null
  price?: number | string | null
  totalPrice?: number | string | null
}

export interface RefundSummary {
  _id: string
  status?: string | null
  refundAmount?: number | null
  deductionAmount?: number | null
  refundPercent?: number | null
  ruleSnapshot?: Record<string, any> | null
}

export interface BookingRow {
  _id: string
  userPhone?: string | null
  eventId?: string | null
  eventTitle?: string | null
  eventDate?: string | null
  eventTime?: string | null
  venue?: string | null
  tickets?: TicketLine[] | null
  totalSeats?: number | null
  totalPrice?: number | string | null
  amountPaid?: number | null
  status?: string | null
  paymentStatus?: string | null
  storedPaymentStatus?: string | null
  paymentId?: string | null
  gatewayOrderId?: string | null
  gatewayPaymentId?: string | null
  checkedIn?: boolean | null
  checkedInAt?: string | null
  createdAt?: string | null
  expiresAt?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  refundId?: string | null
  refundQuote?: Record<string, any> | null
  refund?: RefundSummary | null
  [key: string]: any
}

export const BOOKING_STATUS: { value: string; label: string; tone: Tone }[] = [
  { value: 'pending_payment', label: 'Awaiting payment', tone: 'amber' },
  { value: 'confirmed', label: 'Confirmed', tone: 'green' },
  { value: 'attended', label: 'Attended', tone: 'blue' },
  { value: 'cancelled', label: 'Cancelled', tone: 'red' },
  { value: 'expired', label: 'Expired', tone: 'gray' },
]

export const PAYMENT_STATUS: { value: string; label: string; tone: Tone }[] = [
  { value: 'pending', label: 'Pending', tone: 'amber' },
  { value: 'paid', label: 'Paid', tone: 'green' },
  { value: 'unverified', label: 'Unverified', tone: 'purple' },
  { value: 'failed', label: 'Failed', tone: 'red' },
  { value: 'refund_requested', label: 'Refund requested', tone: 'amber' },
  { value: 'refunded', label: 'Refunded', tone: 'blue' },
]

export const REFUND_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'amber' },
  awaiting_second_approval: { label: 'Awaiting second approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  processing: { label: 'Processing', tone: 'blue' },
  processed: { label: 'Refunded', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  disputed: { label: 'Disputed', tone: 'purple' },
}

function humanise(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge tone="gray">Not set</Badge>
  const known = BOOKING_STATUS.find((s) => s.value === status)
  return <Badge tone={known?.tone || 'gray'}>{known?.label || humanise(String(status))}</Badge>
}

export function PaymentBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge tone="gray">Not set</Badge>
  const known = PAYMENT_STATUS.find((s) => s.value === status)
  return <Badge tone={known?.tone || 'gray'}>{known?.label || humanise(String(status))}</Badge>
}

export function RefundBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge tone="gray">No refund</Badge>
  const known = REFUND_STATUS[status]
  return <Badge tone={known?.tone || 'gray'}>{known?.label || humanise(String(status))}</Badge>
}

export function seatRange(line: TicketLine): string {
  const from = line.fromSeat
  const to = line.toSeat
  if (from === null || from === undefined || from === '' || to === null || to === undefined || to === '') return ''
  return String(from) === String(to) ? `Seat ${from}` : `Seats ${from}–${to}`
}

export function ticketSummary(tickets?: TicketLine[] | null): string {
  if (!Array.isArray(tickets) || tickets.length === 0) return '—'
  return tickets
    .map((line) => {
      const name = [line?.category, line?.block].filter(Boolean).join(' / ') || 'Ticket'
      const quantity = line?.quantity ?? ''
      const seats = seatRange(line || {})
      return `${name} × ${quantity}${seats ? ` (${seats})` : ''}`
    })
    .join(', ')
}

export function shortId(id?: string | null): string {
  if (!id) return '—'
  return id.length > 10 ? '…' + id.slice(-8) : id
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  return search.toString()
}
