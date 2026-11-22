'use client'
import React from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Badge, Card, EmptyState, formatDate } from '@/components/ui'

export interface ScheduleRow {
  id: string
  name: string
  placement: string
  status: string
  storedStatus: string
  startsAt: string | null
  endsAt: string | null
  priority: number
  couponCode: string | null
  artwork: string
  artworkProblem: string | null
  overlaps: { id: string; name: string; from: string; to: string }[]
}

export interface Schedule {
  from: string
  to: string
  weeks: number
  placements: { placement: string; label: string; shownIn: string | null; rows: ScheduleRow[] }[]
  changes: { id: string; name: string; from: string; to: string }[]
}

const TONE: Record<string, 'gray' | 'purple' | 'green' | 'red'> = { draft: 'gray', scheduled: 'purple', live: 'green', ended: 'red' }
const BAR: Record<string, string> = { draft: 'bg-gray-300', scheduled: 'bg-purple-400', live: 'bg-green-500', ended: 'bg-red-300' }

/** Promotions per placement on a timeline, with overlaps on the same placement called out. */
export default function PromotionSchedule({ schedule }: { schedule: Schedule }) {
  const start = new Date(schedule.from).getTime()
  const end = new Date(schedule.to).getTime()
  const span = Math.max(1, end - start)
  const pct = (iso: string | null, fallback: number) => {
    const t = iso ? new Date(iso).getTime() : fallback
    return Math.min(100, Math.max(0, ((t - start) / span) * 100))
  }
  const weeks = Array.from({ length: schedule.weeks }, (_, i) => new Date(start + i * 7 * 24 * 3600 * 1000))
  const anyRows = schedule.placements.some((p) => p.rows.length > 0)

  return (
    <div data-testid="promotion-schedule">
      {schedule.changes.length > 0 && (
        <Card className="p-4 mb-4 text-sm text-gray-700">
          Brought up to date by their dates just now:{' '}
          {schedule.changes.map((c) => `${c.name} (${c.from} to ${c.to})`).join(', ')}.
        </Card>
      )}
      {!anyRows && (
        <Card>
          <EmptyState title="No promotions in this window" hint="Promotions whose dates touch the next weeks appear here, grouped by placement." />
        </Card>
      )}
      {schedule.placements
        .filter((p) => p.rows.length > 0)
        .map((group) => (
          <Card key={group.placement} className="p-5 mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-deep-blue">{group.label}</h3>
              <span className="text-xs text-gray-500">{group.shownIn ? `Shown through ${group.shownIn}` : 'No app or website screen reads this placement yet'}</span>
            </div>
            <div className="relative h-5 mt-3 text-[10px] text-gray-500" aria-hidden="true">
              {weeks.map((w) => (
                <span key={w.toISOString()} className="absolute top-0" style={{ left: `${pct(w.toISOString(), start)}%` }}>
                  {formatDate(w)}
                </span>
              ))}
            </div>
            <ul className="space-y-3 mt-1">
              {group.rows.map((row) => {
                const left = pct(row.startsAt, start)
                const right = pct(row.endsAt, end)
                return (
                  <li key={row.id} data-testid="schedule-row">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/marketing/promotions?id=${row.id}`} className="font-medium text-gray-900 underline">
                        {row.name}
                      </Link>
                      <Badge tone={TONE[row.status] || 'gray'}>{row.status}</Badge>
                      <span className="text-xs text-gray-500">
                        {formatDate(row.startsAt, true)} to {formatDate(row.endsAt, true)} · priority {row.priority}
                        {row.couponCode ? ` · coupon ${row.couponCode}` : ''}
                      </span>
                    </div>
                    <div className="relative h-3 bg-gray-100 rounded mt-1">
                      <div
                        className={`absolute top-0 h-3 rounded ${BAR[row.status] || 'bg-gray-300'}`}
                        style={{ left: `${left}%`, width: `${Math.max(1, right - left)}%` }}
                        title={`${row.name}: ${row.status}`}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{row.artworkProblem ? <span className="text-red-700">{row.artworkProblem}</span> : `Artwork: ${row.artwork}`}</p>
                    {row.overlaps.length > 0 && (
                      <p className="text-xs text-amber-800 mt-1 flex items-start gap-1" data-testid="schedule-overlap">
                        <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden="true" />
                        <span>
                          Overlaps on this placement with{' '}
                          {row.overlaps.map((o) => `${o.name} (${formatDate(o.from, true)} to ${formatDate(o.to, true)})`).join(', ')}. Both are shown;
                          the higher priority comes first.
                        </span>
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
    </div>
  )
}
