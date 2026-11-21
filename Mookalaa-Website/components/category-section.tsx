"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { Event } from "@/lib/types"
import { EventCard } from "./event-card"
import { Button } from "@/components/ui/button"

interface CategorySectionProps {
  category: string
  events: Event[]
}

export function CategorySection({ category, events }: CategorySectionProps) {
  const categoryEvents = events.filter((event) => event.category.toLowerCase() === category.toLowerCase())
  if (categoryEvents.length === 0) return null

  return (
    <section className="py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-1">{category}</h2>
          <p className="text-muted-foreground text-sm">
            {categoryEvents.length} upcoming {categoryEvents.length === 1 ? "event" : "events"}
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-lg bg-transparent flex-shrink-0">
          <Link href={`/events?category=${encodeURIComponent(category)}`}>
            View all <ChevronRight size={18} />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {categoryEvents.slice(0, 6).map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}
