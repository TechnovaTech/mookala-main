import type { Event, FilterOptions } from "./types"

export function filterEvents(events: Event[], filters: FilterOptions): Event[] {
  return events.filter((event) => {
    // Location filter
    if (filters.location && event.city.toLowerCase() !== filters.location.toLowerCase()) {
      return false
    }

    // Category filter
    if (filters.category && event.category !== filters.category) {
      return false
    }

    // Price filter
    if (event.price > filters.priceRange[1] || event.price < filters.priceRange[0]) {
      return false
    }

    // Type filter
    if (filters.type !== "all") {
      if (filters.type === "free" && !event.isFree) return false
      if (filters.type === "paid" && event.isFree) return false
      if (filters.type === "online" && !event.isOnline) return false
      if (filters.type === "offline" && event.isOnline) return false
    }

    return true
  })
}

export function sortEvents(events: Event[], sortBy: "popular" | "date" | "recent"): Event[] {
  const sorted = [...events]

  switch (sortBy) {
    case "popular":
      return sorted.sort((a, b) => (b.attendees || 0) - (a.attendees || 0))
    case "date":
      return sorted.sort((a, b) => a.date.getTime() - b.date.getTime())
    case "recent":
      return sorted.sort((a, b) => b.date.getTime() - a.date.getTime())
    default:
      return sorted
  }
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatTime(time: string): string {
  return time
}

export function addToCalendar(event: Event) {
  const startDate = event.date.toISOString().split("T")[0].replace(/-/g, "")
  const endDate = event.endDate ? event.endDate.toISOString().split("T")[0].replace(/-/g, "") : startDate

  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate}/${endDate}&location=${encodeURIComponent(event.location)}&details=${encodeURIComponent(event.description)}`

  window.open(calendarUrl, "_blank")
}

export function shareEvent(event: Event) {
  const text = `Check out "${event.title}" on EventHub! ${window.location.href}`

  if (navigator.share) {
    navigator.share({
      title: event.title,
      text: event.description,
      url: window.location.href,
    })
  } else {
    navigator.clipboard.writeText(text)
  }
}

export function getRelatedEvents(event: Event, allEvents: Event[], limit = 5): Event[] {
  return allEvents.filter((e) => e.id !== event.id && e.category === event.category).slice(0, limit)
}
