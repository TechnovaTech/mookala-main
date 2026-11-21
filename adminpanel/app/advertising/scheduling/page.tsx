'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { CAMPAIGN_STATUS, PLACEMENT_LABEL, PLACEMENT_SCREEN, linkClass } from '@/components/advertising/shared'

interface Overlap {
  _id: string
  name: string
  from: string
  to: string
  sameCity: boolean
}
interface Row {
  _id: string
  name: string
  advertiserId: string
  advertiser: string
  advertiserStatus: string | null
  placement: string
  startDate: string
  endDate: string
  targetLocations: string[]
  storedStatus: string
  status: string
  statusReason: string | null
  hasCreative: boolean
  overlaps: Overlap[]
}
interface Schedule {
  window: { from: string; to: string; weeks: number }
  today: string
  placements: { placement: string; shownInApp: string | null; campaigns: Row[] }[]
  totals: { campaigns: number; live: number; scheduled: number; paused: number; draft: number; overlapping: number }
  synced: { id: string; label: string; from: string; to: string }[]
  canManage: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Tailwind needs whole class names, so each status has its bar colour written out. */
const BAR_CLASS: Record<string, string> = {
  draft: 'bg-gray-300 text-gray-800',
  scheduled: 'bg-blue-500 text-white',
  live: 'bg-green-600 text-white',
  paused: 'bg-amber-400 text-amber-900',
  completed: 'bg-purple-300 text-purple-900',
}

function isoDay(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10)
}

function shortDay(value: number): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

type Pending = { row: Row; to: 'paused' | 'live' }

export default function Page() {
  const [weeks, setWeeks] = useState(8)
  const [from, setFrom] = useState('')
  const [data, setData] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [updating, setUpdating] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ weeks: String(weeks) })
      if (from) query.set('from', from)
      const result = await api<Schedule>('/api/admin/advertising/scheduling?' + query.toString())
      setData(result)
      if (result.synced.length > 0) {
        setNotice({
          type: 'info',
          text: `${result.synced.length} campaign status${result.synced.length === 1 ? ' was' : 'es were'} brought up to date with the dates: ${result.synced
            .map((change) => `${change.label} (${CAMPAIGN_STATUS[change.from]?.label || change.from} to ${CAMPAIGN_STATUS[change.to]?.label || change.to})`)
            .join(', ')}.`,
        })
      }
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the schedule.' })
    } finally {
      setLoading(false)
    }
  }, [weeks, from])

  useEffect(() => {
    load()
  }, [load])

  const updateStatuses = async () => {
    setUpdating(true)
    try {
      const result = await api<{ changed: number; changes: { label: string; type: string; from: string; to: string }[] }>('/api/admin/advertising/campaigns/sync', {
        method: 'POST',
        body: {},
      })
      setNotice({
        type: 'success',
        text:
          result.changed === 0
            ? 'Every campaign and invoice status already matches its dates. Nothing was changed.'
            : `${result.changed} status${result.changed === 1 ? '' : 'es'} updated: ${result.changes.map((change) => `${change.label} (${change.from} to ${change.to})`).join(', ')}.`,
      })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The statuses were not updated.' })
    } finally {
      setUpdating(false)
    }
  }

  const changeStatus = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await api<{ status: string }>(`/api/admin/r/ad-campaigns/${pending.row._id}`, { method: 'PATCH', body: { status: pending.to, reason } })
      setNotice({
        type: 'success',
        text:
          pending.to === 'paused'
            ? `"${pending.row.name}" is paused and is no longer shown in the app.`
            : `"${pending.row.name}" was resumed and is now ${CAMPAIGN_STATUS[result.status]?.label.toLowerCase() || result.status}.`,
      })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: `"${pending.row.name}" was not changed. ${error.message || ''}` })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const shift = (direction: 1 | -1) => {
    const base = data ? new Date(data.window.from).getTime() : Date.now()
    setFrom(isoDay(new Date(base + direction * 28 * DAY_MS)))
  }

  const scale = useMemo(() => {
    if (!data) return null
    const start = new Date(data.window.from).getTime()
    const days = data.window.weeks * 7
    const today = new Date(data.today).getTime()
    const weekStarts = Array.from({ length: data.window.weeks }, (_, index) => start + index * 7 * DAY_MS)
    return { start, days, today, weekStarts, todayInside: today >= start && today < start + days * DAY_MS }
  }, [data])

  /** Left offset and width of a campaign inside the window, in percent. End dates are inclusive. */
  const bar = (row: Row) => {
    if (!scale) return { left: 0, width: 0, cutLeft: false, cutRight: false }
    const first = Math.round((new Date(row.startDate).getTime() - scale.start) / DAY_MS)
    const last = Math.round((new Date(row.endDate).getTime() - scale.start) / DAY_MS) + 1
    const a = Math.max(0, first)
    const b = Math.min(scale.days, last)
    return { left: (a / scale.days) * 100, width: Math.max(0.8, ((b - a) / scale.days) * 100), cutLeft: first < 0, cutRight: last > scale.days }
  }

  return (
    <AdminShell
      title="Campaign Scheduling"
      subtitle="Every placement over the coming weeks, with overlaps on the same placement"
      actions={
        data?.canManage ? (
          <Button onClick={updateStatuses} loading={updating}>
            <RefreshCw size={16} />
            Update statuses
          </Button>
        ) : undefined
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="schedule-from" className="block text-sm font-medium text-gray-700 mb-1">
              Window starts
            </label>
            <input id="schedule-from" type="date" value={from || (data ? isoDay(data.window.from) : '')} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="schedule-weeks" className="block text-sm font-medium text-gray-700 mb-1">
              Weeks shown
            </label>
            <select id="schedule-weeks" value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value, 10))} className={inputClass}>
              {[4, 8, 12, 26].map((value) => (
                <option key={value} value={value}>
                  {value} weeks
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => shift(-1)} aria-label="Four weeks earlier">
              <ChevronLeft size={16} />
              Earlier
            </Button>
            <Button variant="secondary" onClick={() => setFrom('')} disabled={!from}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => shift(1)} aria-label="Four weeks later">
              Later
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          There is no background scheduler. A campaign&apos;s status follows its dates whenever campaigns are read, by the apps or by these screens: an
          approved campaign becomes live on its start date and completed the day after its end date. &quot;Update statuses&quot; does the same on
          demand. Each change is written to the activity log. Days are counted in UTC and end dates are inclusive.
        </p>
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : data && scale ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6" data-schedule-totals>
            <StatCard label="Campaigns in window" value={data.totals.campaigns} />
            <StatCard label="Live" value={data.totals.live} tone="green" />
            <StatCard label="Approved, not started" value={data.totals.scheduled} />
            <StatCard label="Paused" value={data.totals.paused} tone="amber" />
            <StatCard label="Overlapping" value={data.totals.overlapping} hint={data.totals.overlapping ? 'Share a placement and days' : undefined} tone="red" />
          </div>

          {data.placements.length === 0 ? (
            <Card>
              <EmptyState
                title="No campaigns in this window"
                hint="Campaigns appear here once an application is approved or a campaign is added on the Campaigns screen, with dates that fall inside the window."
              />
            </Card>
          ) : (
            data.placements.map((group) => (
              <Card key={group.placement} className="mb-6">
                <div className="px-5 py-4 border-b border-gray-200" data-placement={group.placement}>
                  <h2 className="text-base font-semibold text-deep-blue">
                    {PLACEMENT_LABEL[group.placement] || group.placement} ({group.campaigns.length})
                  </h2>
                  <p className={`text-sm mt-1 ${PLACEMENT_SCREEN[group.placement] ? 'text-gray-500' : 'text-amber-700'}`}>
                    {PLACEMENT_SCREEN[group.placement] || 'No screen in the apps shows this placement yet: these campaigns are recorded but not displayed.'}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[900px]">
                    <div className="flex border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                      <div className="w-72 shrink-0 px-4 py-2 font-medium uppercase tracking-wide">Campaign</div>
                      <div className="flex-1 flex">
                        {scale.weekStarts.map((start) => (
                          <div key={start} className="flex-1 px-1 py-2 border-l border-gray-200 whitespace-nowrap overflow-hidden">
                            {shortDay(start)}
                          </div>
                        ))}
                      </div>
                    </div>
                    {group.campaigns.map((row) => {
                      const position = bar(row)
                      const clash = row.overlaps.filter((overlap) => overlap.sameCity)
                      return (
                        <div key={row._id} className="flex border-b border-gray-100 last:border-b-0" data-campaign-row={row._id} data-status={row.status}>
                          <div className="w-72 shrink-0 px-4 py-3 space-y-1">
                            <Link href={`/advertising/campaigns?id=${row._id}`} className={`block text-sm ${linkClass}`}>
                              {row.name}
                            </Link>
                            <p className="text-xs text-gray-500">
                              <Link href={`/advertising/advertisers/${row.advertiserId}`} className="hover:underline">
                                {row.advertiser}
                              </Link>{' '}
                              · {formatDate(row.startDate)} – {formatDate(row.endDate)}
                            </p>
                            <p className="text-xs text-gray-500">{row.targetLocations.length ? row.targetLocations.join(', ') : 'Every city'}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={CAMPAIGN_STATUS[row.status]?.tone || 'gray'}>{CAMPAIGN_STATUS[row.status]?.label || row.status}</Badge>
                              {!row.hasCreative && <Badge tone="red">No creative</Badge>}
                              {row.advertiserStatus && row.advertiserStatus !== 'verified' && <Badge tone="amber">Advertiser not verified</Badge>}
                            </div>
                            {row.status === 'paused' && row.statusReason && <p className="text-xs text-gray-500">Paused: {row.statusReason}</p>}
                            {row.overlaps.length > 0 && (
                              <p className={`text-xs flex items-start gap-1 ${clash.length ? 'text-red-700' : 'text-gray-500'}`} data-overlap>
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                <span>
                                  Overlaps{' '}
                                  {row.overlaps
                                    .map((overlap) => `${overlap.name} (${shortDay(new Date(overlap.from).getTime())} to ${shortDay(new Date(overlap.to).getTime())}${overlap.sameCity ? '' : ', different cities'})`)
                                    .join('; ')}
                                </span>
                              </p>
                            )}
                            {data.canManage && (row.status === 'live' || row.status === 'scheduled') && (
                              <button onClick={() => setPending({ row, to: 'paused' })} className="text-xs text-amber-700 font-medium hover:underline" data-action="pause">
                                Pause
                              </button>
                            )}
                            {data.canManage && row.status === 'paused' && (
                              <button onClick={() => setPending({ row, to: 'live' })} className="text-xs text-green-700 font-medium hover:underline" data-action="resume">
                                Resume
                              </button>
                            )}
                          </div>
                          <div className="flex-1 relative min-h-[4.5rem]">
                            <div className="absolute inset-0 flex" aria-hidden="true">
                              {scale.weekStarts.map((start) => (
                                <div key={start} className="flex-1 border-l border-gray-100" />
                              ))}
                            </div>
                            {scale.todayInside && (
                              <div
                                className="absolute top-0 bottom-0 w-px bg-red-500"
                                style={{ left: `${((scale.today - scale.start) / DAY_MS / scale.days) * 100}%` }}
                                title="Today"
                                aria-hidden="true"
                              />
                            )}
                            <div
                              className={`absolute top-4 h-7 flex items-center px-2 text-xs font-medium overflow-hidden whitespace-nowrap ${BAR_CLASS[row.status] || BAR_CLASS.draft} ${
                                position.cutLeft ? '' : 'rounded-l-md'
                              } ${position.cutRight ? '' : 'rounded-r-md'} ${clash.length ? 'ring-2 ring-red-500' : ''}`}
                              style={{ left: `${position.left}%`, width: `${position.width}%` }}
                              title={`${row.name}: ${formatDate(row.startDate)} to ${formatDate(row.endDate)}, ${CAMPAIGN_STATUS[row.status]?.label || row.status}`}
                              data-bar
                            >
                              {CAMPAIGN_STATUS[row.status]?.label || row.status}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Card>
            ))
          )}
          <p className="text-xs text-gray-500">
            The red line is today. A red outline marks campaigns that share a placement, days and at least one city (or target every city); the apps
            rotate them in the same slot.
          </p>
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.to === 'paused' ? 'Pause' : 'Resume'} ${pending.row.name}` : ''}
        message={
          pending?.to === 'paused'
            ? 'The campaign stops being shown in the app straight away. Its dates keep running while it is paused.'
            : 'The campaign is shown again if today is inside its dates; otherwise it waits for its start date.'
        }
        confirmLabel={pending?.to === 'paused' ? 'Pause' : 'Resume'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={changeStatus}
        onClose={() => setPending(null)}
      />
    </AdminShell>
  )
}
