'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { Card, api, formatDate } from '@/components/ui'

interface Ratings {
  average: number | null
  count: number
  distribution: Record<string, number>
  pending: number
  hidden: number
  recent: { id: string; rating: number; comment: string; name: string; at: string | null; eventName: string }[]
}

const NOUN = { event: 'event', artist: 'artist', organizer: 'organiser' }

/**
 * Published ratings of an event, an artist or an organiser
 * (GET /api/admin/support/ratings). Ratings count only once a moderator
 * publishes them under Users & Support → Feedback & Ratings.
 */
export default function RatingsSection({ subject, id, className = '' }: { subject: 'event' | 'artist' | 'organizer'; id: string; className?: string }) {
  const [data, setData] = useState<Ratings | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api<Ratings>(`/api/admin/support/ratings?${subject}Id=${encodeURIComponent(id)}`)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || 'Could not load the ratings.')
      })
    return () => {
      cancelled = true
    }
  }, [subject, id])

  return (
    <Card className={'p-5 ' + className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-deep-blue">Ratings</h2>
        <Link href="/support/feedback" className="text-xs text-teal underline">Moderate ratings</Link>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && <p className="text-sm text-gray-500">Loading...</p>}
      {data && (
        <div data-testid={`${subject}-ratings`} data-average={data.average ?? ''} data-count={data.count}>
          <p className="flex items-center gap-2 text-sm text-gray-900">
            <Star size={18} className="text-amber-500" aria-hidden="true" />
            {data.average !== null ? (
              <span>
                <strong className="text-lg">{data.average.toFixed(2)}</strong> out of 5 from {data.count} published rating{data.count === 1 ? '' : 's'}
              </span>
            ) : (
              <span>No published rating yet.</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {data.pending} waiting for review · {data.hidden} hidden. Customers rate an {NOUN[subject] === 'event' ? 'event' : `${NOUN[subject]}'s events`} from My bookings in the app after attending; only published ratings count here and in the app.
          </p>
          {data.count > 0 && (
            <ul className="flex flex-wrap gap-3 text-xs text-gray-600 mt-2" aria-label="Ratings per star">
              {['5', '4', '3', '2', '1'].map((star) => (
                <li key={star}>
                  {star}★ {data.distribution[star] || 0}
                </li>
              ))}
            </ul>
          )}
          {data.recent.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recent.map((r) => (
                <li key={r.id} className="border-l-2 border-amber-200 pl-3">
                  <span className="font-medium text-gray-900">{r.rating} / 5</span>
                  <span className="text-gray-500"> · {r.name || 'Customer'} · {formatDate(r.at)}{subject !== 'event' && r.eventName ? ` · ${r.eventName}` : ''}</span>
                  {r.comment && <p className="text-gray-700">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
