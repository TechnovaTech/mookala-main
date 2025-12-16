"use client"

import type { Event } from "@/lib/types"
import { EventCard } from "./event-card"
import { useEffect, useRef } from "react"
import { useLanguage } from "@/lib/language-context"

interface EventGridProps {
  events: Event[]
  hasMore: boolean
  onLoadMore: () => void
  isLoading: boolean
}

export function EventGrid({ events, hasMore, onLoadMore, isLoading }: EventGridProps) {
  const { t } = useLanguage()
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          onLoadMore()
        }
      },
      { threshold: 0.1 },
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [hasMore, isLoading, onLoadMore])

  if (events.length === 0) {
    return (
      <div className="col-span-full py-12 text-center">
        <p className="text-muted-foreground text-lg">{t("grid.noEvents")}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" suppressHydrationWarning>
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={observerTarget} className="col-span-full py-8 text-center" suppressHydrationWarning>
        {isLoading && <p className="text-muted-foreground">{t("grid.loading")}</p>}
      </div>
    </>
  )
}
