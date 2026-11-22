'use client'
import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge, api, formatDate } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'
import {
  CASE_PRIORITIES,
  CASE_SERVICES,
  CASE_STATUSES,
  CASE_TEAMS,
  DELIVERY_STATES,
  SLA_STATES,
} from '@/lib/resources/support'

/* Small pieces shared by the support screens. */

export interface SlaClockView {
  state: 'met' | 'within' | 'breached' | 'no_target' | 'not_recorded'
  targetHours: number | null
  dueAt: string | null
  elapsedMinutes: number | null
  remainingMinutes: number | null
}

export interface CaseRowView {
  _id: string
  kind: 'complaint' | 'ticket'
  subject: string
  customerName: string
  customerPhone: string
  service: string
  priority: string
  status: string
  source: string
  assignedTeam: string | null
  assignedTo: string | null
  assignedToId: string | null
  assignedToName: string | null
  escalated: boolean
  escalationLevel: number
  bookingId: string | null
  refundId: string | null
  aboutRefund: boolean
  repliesCount: number
  notesCount: number
  createdAt: string | null
  updatedAt: string | null
  firstResponseAt: string | null
  responseMinutes: number | null
  resolvedAt: string | null
  resolutionMinutes: number | null
  sla: { response: SlaClockView; resolution: SlaClockView }
}

export interface Assignee {
  id: string
  email: string
  name: string
  role: string
  roleLabel: string
  canAct: boolean
}

export const optionLabel = (options: { value: string; label: string }[], value: string | null | undefined, fallback = '—') =>
  options.find((o) => o.value === value)?.label || (value ? String(value).replace(/_/g, ' ') : fallback)

export const serviceLabel = (value: string | null | undefined) => optionLabel(CASE_SERVICES, value)
export const teamName = (value: string | null | undefined) => optionLabel(CASE_TEAMS, value, 'Unassigned')

/** 95 → "1 h 35 min", 3000 → "2 d 2 h". */
export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const minutes = Math.round(value)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? `${h} h ${m} min` : `${h} h`
  }
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  return h ? `${d} d ${h} h` : `${d} d`
}

export function hoursLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return 'no target'
  return formatMinutes(hours * 60)
}

export function PriorityBadge({ value }: { value: string }) {
  const option = CASE_PRIORITIES.find((p) => p.value === value)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || value || '—'}</Badge>
}

export function CaseStatusBadge({ value }: { value: string }) {
  const option = CASE_STATUSES.find((s) => s.value === value)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || value || '—'}</Badge>
}

/** The escalation flag shown wherever a case appears. */
export function EscalatedFlag({ escalated, level }: { escalated: boolean; level?: number }) {
  if (!escalated) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap"
      data-escalated="true"
      title={level ? `Escalated ${level} time${level === 1 ? '' : 's'}` : 'Escalated'}
    >
      <AlertTriangle size={12} aria-hidden="true" />
      Escalated{level && level > 1 ? ` ×${level}` : ''}
    </span>
  )
}

export function DeliveryBadge({ status }: { status: string }) {
  const option = DELIVERY_STATES.find((d) => d.value === status)
  return <Badge tone={option?.tone || 'gray'}>{option?.label || status || '—'}</Badge>
}

/** One SLA clock: its state and the time that explains it. */
export function SlaBadge({ clock, compact = false }: { clock: SlaClockView; compact?: boolean }) {
  const option = SLA_STATES.find((s) => s.value === clock.state)
  const tone: Tone = option?.tone || 'gray'
  let detail = ''
  if (clock.state === 'within') detail = `due in ${formatMinutes(clock.remainingMinutes)}`
  else if (clock.state === 'breached' && clock.dueAt && clock.remainingMinutes !== null) {
    detail = `overdue, target ${hoursLabel(clock.targetHours)}`
  } else if (clock.state === 'breached') detail = `took ${formatMinutes(clock.elapsedMinutes)}, target ${hoursLabel(clock.targetHours)}`
  else if (clock.state === 'met') detail = `took ${formatMinutes(clock.elapsedMinutes)}, target ${hoursLabel(clock.targetHours)}`
  else if (clock.state === 'no_target' && clock.elapsedMinutes !== null) detail = `${formatMinutes(clock.elapsedMinutes)}`
  return (
    <span className="inline-flex flex-col items-start gap-0.5" data-sla={clock.state}>
      <Badge tone={tone}>{option?.label || clock.state}</Badge>
      {!compact && detail && <span className="text-xs text-gray-500 whitespace-nowrap">{detail}</span>}
      {compact && detail && <span className="text-[11px] text-gray-500 whitespace-nowrap">{detail}</span>}
    </span>
  )
}

/** Eligible admins for a team, loaded from the server (never typed in). */
export function useAssignees(team: string) {
  const [list, setList] = useState<Assignee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!team) {
      setList([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    api<{ teams: { team: string; assignees: Assignee[] }[] }>('/api/admin/support/assignees?team=' + encodeURIComponent(team))
      .then((data) => {
        if (!cancelled) setList(data.teams?.[0]?.assignees || [])
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || 'Could not load the admins.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [team])
  return { list, loading, error }
}

export function whenText(value: string | null | undefined) {
  return value ? formatDate(value, true) : '—'
}

export const HISTORY_ACTIONS: Record<string, string> = {
  create: 'created the case',
  update: 'edited the case',
  status_change: 'changed the status',
  note: 'added an internal note',
  reply: 'replied to the customer',
  assign: 'assigned the case',
  reassign: 'reassigned the case',
  unassign: 'removed the assignment',
  escalate: 'escalated the case',
  delete: 'deleted the case',
}
