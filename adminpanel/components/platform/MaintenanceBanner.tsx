'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wrench, X } from 'lucide-react'
import { api } from '@/components/ui'
import { can, type AdminIdentity } from '@/lib/permissions'
import { NOTICE_STATUS_LABEL, formatIst } from './time'

/**
 * Shown at the top of every admin page (from AdminShell): maintenance that is
 * on right now, or the next scheduled maintenance window. Reads
 * GET /api/admin/platform/maintenance, which every signed-in admin may read.
 */

interface State {
  active: boolean
  source: 'switch' | 'window' | null
  message: string
  endsAt: string | null
  nextWindow: { id: string; startsAt: string; endsAt: string; message: string; notifyInAdvance: boolean; notifyHoursBefore: number } | null
  nextNotice: { status: string; scheduledFor: string | null } | null
}

const EVENT = 'mookalaa:maintenance-changed'
const CACHE_MS = 60_000
let cache: { at: number; data: State } | null = null

/** Call after saving the platform configuration so the banner reloads at once. */
export function refreshMaintenanceBanner() {
  cache = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

function dismissKey(w: NonNullable<State['nextWindow']>) {
  return `maintenance-banner-dismissed:${w.id}:${w.startsAt}`
}

export default function MaintenanceBanner({ admin }: { admin: AdminIdentity | null }) {
  const [state, setState] = useState<State | null>(cache?.data || null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!admin) return
    let cancelled = false
    const load = async (force: boolean) => {
      if (!force && cache && Date.now() - cache.at < CACHE_MS) {
        setState(cache.data)
        return
      }
      try {
        const data = await api<State>('/api/admin/platform/maintenance')
        cache = { at: Date.now(), data }
        if (!cancelled) setState(data)
      } catch (error) {
        console.error('Maintenance banner could not be loaded:', error)
      }
    }
    load(false)
    const onChange = () => load(true)
    window.addEventListener(EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(EVENT, onChange)
    }
  }, [admin])

  useEffect(() => {
    const next = state?.nextWindow
    if (!next) return
    try {
      setDismissed(window.localStorage.getItem(dismissKey(next)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [state?.nextWindow])

  if (!state || !admin) return null
  const settingsLink = can(admin, 'platform:view') ? (
    <Link href="/platform" className="font-semibold underline">
      Platform Configuration
    </Link>
  ) : null

  if (state.active) {
    return (
      <div role="alert" data-banner="maintenance-active" className="mb-4 border border-red-300 bg-red-50 text-red-900 rounded-lg px-4 py-3 text-sm flex items-start gap-3">
        <Wrench size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p>
            <strong>Maintenance is on</strong>{' '}
            {state.source === 'window' ? `(scheduled window, ends ${formatIst(state.endsAt)})` : '(switched on by an admin, until it is switched off)'}.
            The website and apps cannot book tickets, start payments, request sign-in codes or change profiles. Payments already
            taken, gate check-in and the admin panel keep working.
          </p>
          <p className="mt-1">
            Message shown: &ldquo;{state.message}&rdquo; {settingsLink}
          </p>
        </div>
      </div>
    )
  }

  const next = state.nextWindow
  if (!next || dismissed) return null
  const notice = !next.notifyInAdvance
    ? 'Not announced to customers in advance.'
    : state.nextNotice
      ? `Advance notice to customers, artists and organisers: ${NOTICE_STATUS_LABEL[state.nextNotice.status] || state.nextNotice.status}${
          state.nextNotice.scheduledFor && !['sent', 'cancelled'].includes(state.nextNotice.status) ? `, due ${formatIst(state.nextNotice.scheduledFor)}` : ''
        }.`
      : `Advance notice ${next.notifyHoursBefore} hours before: not created yet.`

  return (
    <div role="status" data-banner="maintenance-upcoming" className="mb-4 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm flex items-start gap-3">
      <Wrench size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p>
          <strong>Scheduled maintenance</strong> from {formatIst(next.startsAt)} to {formatIst(next.endsAt)}: {next.message}
        </p>
        <p className="mt-1">
          Bookings, payments, sign-in codes and profile changes on the website and apps will be paused for that time. {notice} {settingsLink}
        </p>
      </div>
      <button
        type="button"
        aria-label="Hide this maintenance notice"
        className="p-1 rounded hover:bg-amber-100"
        onClick={() => {
          setDismissed(true)
          try {
            window.localStorage.setItem(dismissKey(next), '1')
          } catch {}
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
