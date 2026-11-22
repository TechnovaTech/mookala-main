'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, api, formatDate } from '@/components/ui'

interface Context {
  source: string
  booking: { _id: string; eventTitle: string; status: string; checkedIn: boolean; attended: boolean } | null
  event: { _id: string; name: string; status: string; startDate: string | null } | null
  organizer: { _id: string; name: string } | null
  artists: { _id: string; name: string }[]
  moderation: { by: string | null; at: string; reason: string | null } | null
}

/** Inside a rating: the booking it was given for and who it counts for once published. */
export default function FeedbackPanel({ feedbackId }: { feedbackId: string }) {
  const [data, setData] = useState<Context | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api<Context>(`/api/admin/support/feedback/${feedbackId}`)
      .then((result) => !cancelled && setData(result))
      .catch((e: any) => !cancelled && setError(e.message || 'Could not load the rating.'))
    return () => {
      cancelled = true
    }
  }, [feedbackId])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-gray-500">Loading the booking and event...</p>

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm" data-testid="feedback-context">
      <p>
        <Badge tone={data.source === 'app' ? 'blue' : 'gray'}>{data.source === 'app' ? 'From the customer app' : 'Recorded by staff'}</Badge>
      </p>
      {data.booking ? (
        <p className="text-gray-700">
          Booking <span className="font-mono text-xs">{data.booking._id}</span> · {data.booking.status}
          {data.booking.attended ? <Badge tone="green">Attended</Badge> : <Badge tone="red">Not attended</Badge>}
        </p>
      ) : (
        <p className="text-gray-500">Not linked to a booking (recorded before ratings came from the app).</p>
      )}
      {data.event && (
        <p className="text-gray-700">
          Event:{' '}
          <Link href={`/events/${data.event._id}`} className="text-teal underline">
            {data.event.name || 'Event'}
          </Link>
          {data.event.startDate ? ` · ${data.event.startDate}` : ''}
        </p>
      )}
      {(data.organizer || data.artists.length > 0) && (
        <p className="text-gray-700">
          Counts for:{' '}
          {data.organizer && (
            <Link href={`/organizers/${data.organizer._id}`} className="text-teal underline">
              {data.organizer.name || 'Organiser'} (organiser)
            </Link>
          )}
          {data.artists.map((a) => (
            <span key={a._id}>
              {' '}
              <Link href={`/artists/${a._id}`} className="text-teal underline">
                {a.name || 'Artist'}
              </Link>
            </span>
          ))}
        </p>
      )}
      {data.moderation && (
        <p className="text-xs text-gray-500">
          Last moderated by {data.moderation.by || '—'} on {formatDate(data.moderation.at, true)}
          {data.moderation.reason ? ` · ${data.moderation.reason}` : ''}
        </p>
      )}
      <p className="text-xs text-gray-500">Publish or hide this rating with Change status; a reason is required either way.</p>
    </div>
  )
}
