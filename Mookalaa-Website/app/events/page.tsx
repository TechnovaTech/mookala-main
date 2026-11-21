"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { EventFilters } from "@/components/event-filters"
import { EventGrid } from "@/components/event-grid"
import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { fetchApprovedEvents, fetchCategories } from "@/lib/api"
import { errorMessage } from "@/lib/api-client"
import { EMPTY_FILTERS, filterEvents, sortEvents } from "@/lib/utils-events"
import type { Event, EventTypeFilter, FilterOptions, SortOption } from "@/lib/types"

const PAGE_SIZE = 12
const TYPES: EventTypeFilter[] = ["all", "free", "paid", "online", "offline"]

function filtersFromUrl(params: URLSearchParams): FilterOptions {
  const type = params.get("type") as EventTypeFilter | null
  const date = params.get("date") || ""
  return {
    ...EMPTY_FILTERS,
    search: params.get("search") || "",
    location: params.get("location") || "",
    category: params.get("category") || "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    type: type && TYPES.includes(type) ? type : "all",
  }
}

function EventsBrowser() {
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  const [events, setEvents] = useState<Event[]>([])
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("soonest")
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [filters, setFilters] = useState<FilterOptions>(() => filtersFromUrl(new URLSearchParams(query)))

  // A new search from the header or the home page arrives as a new URL.
  useEffect(() => {
    setFilters(filtersFromUrl(new URLSearchParams(query)))
    setDisplayCount(PAGE_SIZE)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [eventsResult, categoriesResult] = await Promise.allSettled([fetchApprovedEvents(), fetchCategories()])
    if (eventsResult.status === "fulfilled") {
      setEvents(eventsResult.value)
    } else {
      setEvents([])
      setError(errorMessage(eventsResult.reason, "Events could not be loaded."))
    }
    setCategoryNames(categoriesResult.status === "fulfilled" ? categoriesResult.value.map((c) => c.name) : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const name of [...categoryNames, ...events.map((event) => event.category)]) {
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [categoryNames, events])

  const matching = useMemo(() => sortEvents(filterEvents(events, filters), sortBy), [events, filters, sortBy])
  const visible = matching.slice(0, displayCount)

  const handleFilters = (next: FilterOptions) => {
    setFilters(next)
    setDisplayCount(PAGE_SIZE)
  }

  const handleClear = () => {
    setFilters(EMPTY_FILTERS)
    setSortBy("soonest")
    setDisplayCount(PAGE_SIZE)
  }

  return (
    <main className="min-h-screen py-8">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <BackButton className="mb-4" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Explore Events</h1>
          <p className="text-muted-foreground" role="status">
            {loading
              ? "Loading events..."
              : error
                ? ""
                : `${matching.length} ${matching.length === 1 ? "event" : "events"} found`}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <EventFilters filters={filters} onFiltersChange={handleFilters} onClear={handleClear} categories={categories} />
          </div>

          <div className="md:col-span-3">
            <div className="flex justify-end mb-6">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-3 py-2 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"
                >
                  <option value="soonest">Date: soonest first</option>
                  <option value="latest">Date: latest first</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="newest">Recently added</option>
                </select>
              </label>
            </div>

            {loading ? (
              <p className="py-12 text-center text-muted-foreground">Loading events...</p>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground mb-4" role="alert">
                  {error}
                </p>
                <Button onClick={load} variant="outline" className="rounded-lg">
                  Try again
                </Button>
              </div>
            ) : (
              <EventGrid
                events={visible}
                hasMore={displayCount < matching.length}
                onLoadMore={() => setDisplayCount((count) => count + PAGE_SIZE)}
                emptyMessage={
                  events.length === 0
                    ? "There are no events to show right now."
                    : "No events match these filters. Try clearing some of them."
                }
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function EventsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen py-12 text-center text-muted-foreground">Loading events...</main>}>
      <EventsBrowser />
    </Suspense>
  )
}
