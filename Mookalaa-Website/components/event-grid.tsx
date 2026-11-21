"use client"

import type { Event } from "@/lib/types"
import { EventCard } from "./event-card"
import { Button } from "@/components/ui/button"

interface EventGridProps {
  events: Event[]
  hasMore: boolean
  onLoadMore: () => void
  emptyMessage: string
}

export function EventGrid({ events, hasMore, onLoadMore, emptyMessage }: EventGridProps) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      {hasMore && (
        <div className="py-8 text-center">
          <Button variant="outline" onClick={onLoadMore} className="rounded-lg">
            Show more events
          </Button>
        </div>
      )}
    </>
  )
}
