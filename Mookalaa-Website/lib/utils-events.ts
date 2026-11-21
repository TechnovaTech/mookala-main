import type { Event, FilterOptions, SortOption } from "./types"

export const EMPTY_FILTERS: FilterOptions = {
  search: "",
  location: "",
  category: "",
  date: "",
  minPrice: null,
  maxPrice: null,
  type: "all",
  includePast: false,
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** The last day an event runs on, when its dates are known. */
function lastDay(event: Event): number | null {
  const end = event.endDate || event.date
  return end ? startOfDay(end) : null
}

export function isPastEvent(event: Event, now = new Date()): boolean {
  const last = lastDay(event)
  return last !== null && last < startOfDay(now)
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle)
}

export function filterEvents(events: Event[], filters: FilterOptions): Event[] {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
  const place = filters.location.trim().toLowerCase()
  const category = filters.category.trim().toLowerCase()

  let day: number | null = null
  const match = filters.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) day = new Date(+match[1], +match[2] - 1, +match[3]).getTime()

  return events.filter((event) => {
    if (!filters.includePast && day === null && isPastEvent(event)) return false

    if (words.length > 0) {
      const searchable = [
        event.title,
        event.description,
        event.category,
        event.venueName,
        event.city,
        event.organizer?.name || "",
        ...event.tags,
        ...event.artists.map((artist) => artist.name),
      ]
        .join(" ")
        .toLowerCase()
      if (!words.every((word) => searchable.includes(word))) return false
    }

    if (place) {
      const where = [event.city, event.venueName, event.address, event.state].join(" ")
      if (!contains(where, place)) return false
    }

    if (category && event.category.toLowerCase() !== category) return false

    if (day !== null) {
      if (!event.date) return false
      const first = startOfDay(event.date)
      const last = lastDay(event) ?? first
      if (day < first || day > last) return false
    }

    // An event matches a price range when at least one of its tickets is inside it.
    if (filters.minPrice !== null || filters.maxPrice !== null) {
      const min = filters.minPrice ?? 0
      const max = filters.maxPrice ?? Number.POSITIVE_INFINITY
      if (!event.tickets.some((ticket) => ticket.price >= min && ticket.price <= max)) return false
    }

    if (filters.type === "free" && !event.isFree) return false
    if (filters.type === "paid" && (event.isFree || !event.hasTickets)) return false
    if (filters.type === "online" && !event.isOnline) return false
    if (filters.type === "offline" && event.isOnline) return false

    return true
  })
}

export function sortEvents(events: Event[], sortBy: SortOption): Event[] {
  const sorted = [...events]
  const time = (date: Date | null, missing: number) => (date ? date.getTime() : missing)

  switch (sortBy) {
    case "soonest":
      return sorted.sort((a, b) => time(a.date, Infinity) - time(b.date, Infinity))
    case "latest":
      return sorted.sort((a, b) => time(b.date, -Infinity) - time(a.date, -Infinity))
    case "price-low":
      return sorted.sort((a, b) => a.minPrice - b.minPrice)
    case "price-high":
      return sorted.sort((a, b) => b.maxPrice - a.maxPrice)
    case "newest":
      return sorted.sort((a, b) => time(b.createdAt, -Infinity) - time(a.createdAt, -Infinity))
    default:
      return sorted
  }
}

export function formatDate(date: Date | null): string {
  if (!date) return "Date to be announced"
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

function compactDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

/** Opens Google Calendar with an all-day entry for the event's dates. */
export function addToCalendar(event: Event): boolean {
  if (!event.date) return false
  const lastDayOfEvent = event.endDate && event.endDate > event.date ? event.endDate : event.date
  // Google's all-day ranges end on the day after the last day.
  const dayAfter = new Date(lastDayOfEvent.getFullYear(), lastDayOfEvent.getMonth(), lastDayOfEvent.getDate() + 1)
  const where = [event.venueName, event.address, event.city].filter(Boolean).join(", ")
  const details = [event.time ? `Starts at ${event.time}.` : "", event.description].filter(Boolean).join(" ")
  const url =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(event.title)}` +
    `&dates=${compactDay(event.date)}/${compactDay(dayAfter)}` +
    `&location=${encodeURIComponent(where)}` +
    `&details=${encodeURIComponent(details)}`
  return window.open(url, "_blank", "noopener") !== null
}

/** Shares through the device share sheet, or copies the link. Says which happened. */
export async function shareEvent(event: Event): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = window.location.href
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: event.title, text: `${event.title} on Mookalaa`, url })
      return "shared"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled"
    }
  }
  try {
    await navigator.clipboard.writeText(`Check out "${event.title}" on Mookalaa: ${url}`)
    return "copied"
  } catch {
    return "failed"
  }
}

export function mapsLink(event: Event): string | null {
  const where = [event.venueName, event.address, event.city, event.state].filter(Boolean).join(", ")
  if (!where) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`
}
