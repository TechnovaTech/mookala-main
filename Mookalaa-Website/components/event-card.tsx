"use client"

import Link from "next/link"
import { Calendar, MapPin } from "lucide-react"
import type { Event } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils-events"

interface EventCardProps {
  event: Event
  variant?: "grid" | "featured"
}

function placeOf(event: Event): string {
  if (event.isOnline) return "Online"
  return [event.venueName, event.city].filter(Boolean).join(", ") || "Venue to be announced"
}

export function EventCard({ event, variant = "grid" }: EventCardProps) {
  const featured = variant === "featured"

  return (
    <Link href={`/event/${event.id}`} className="block h-full">
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group h-full flex flex-col py-0 gap-0">
        <div className={`relative overflow-hidden bg-muted ${featured ? "h-64" : "h-48"}`}>
          <img
            src={event.image || "/placeholder.svg"}
            alt=""
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
          {featured && <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>}
        </div>
        <div className={`${featured ? "p-5" : "p-4"} flex-1 flex flex-col`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <Badge variant="outline" className="w-fit rounded-md text-xs">
              {event.category}
            </Badge>
            {event.isFree && (
              <Badge variant="secondary" className="rounded-md text-xs">
                Free
              </Badge>
            )}
          </div>
          <h3
            className={`font-bold mb-2 line-clamp-2 group-hover:text-primary transition flex-1 ${featured ? "text-lg" : "text-sm"}`}
          >
            {event.title}
          </h3>
          <div className={`space-y-1 text-muted-foreground mb-3 ${featured ? "text-sm" : "text-xs"}`}>
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="flex-shrink-0" />
              <span>
                {formatDate(event.date)}
                {event.time ? ` · ${event.time}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="line-clamp-1">{placeOf(event)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className={`font-bold ${featured ? "text-lg" : "text-sm"}`}>{event.priceDisplay}</span>
            <span className="text-xs text-primary font-medium">View details</span>
          </div>
        </div>
      </Card>
    </Link>
  )
}
