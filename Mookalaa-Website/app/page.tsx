"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { HeroSearch } from "@/components/hero-search"
import { FeaturedSlider } from "@/components/featured-slider"
import { CategorySection } from "@/components/category-section"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { fetchApprovedEvents, fetchCategories } from "@/lib/api"
import { errorMessage } from "@/lib/api-client"
import { isPastEvent, sortEvents } from "@/lib/utils-events"
import type { Event } from "@/lib/types"

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    // Categories are a nicety; the page still works from the events alone.
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

  const upcoming = useMemo(() => sortEvents(events.filter((event) => !isPastEvent(event)), "soonest"), [events])

  // Backend categories first, then any category that only appears on events.
  const sections = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const name of [...categoryNames, ...upcoming.map((event) => event.category)]) {
      const key = name.toLowerCase()
      if (!name || seen.has(key)) continue
      seen.add(key)
      ordered.push(name)
    }
    return ordered.filter((name) => upcoming.some((event) => event.category.toLowerCase() === name.toLowerCase()))
  }, [categoryNames, upcoming])

  const cities = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const event of upcoming) {
      if (!event.city || event.isOnline) continue
      const key = event.city.toLowerCase()
      const entry = counts.get(key) || { name: event.city, count: 0 }
      entry.count += 1
      counts.set(key, entry)
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [upcoming])

  const suggestions = useMemo(() => {
    const names = new Set<string>([...categoryNames, ...events.map((event) => event.category)])
    return [...names].filter(Boolean).sort()
  }, [categoryNames, events])

  const stats = [
    { label: "Upcoming events", value: upcoming.length },
    { label: "Cities", value: cities.length },
    { label: "Categories", value: sections.length },
  ]

  return (
    <main className="min-h-screen">
      <section className="px-4 sm:px-6 lg:px-8 pt-8 pb-12 max-w-7xl mx-auto">
        <HeroSearch categories={suggestions} cities={cities.map((city) => city.name)} />
      </section>

      {loading && (
        <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
          <p className="text-center text-muted-foreground" role="status">
            Loading events...
          </p>
        </section>
      )}

      {!loading && error && (
        <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground mb-4" role="alert">
            {error}
          </p>
          <Button onClick={load} variant="outline" className="rounded-lg">
            Try again
          </Button>
        </section>
      )}

      {!loading && !error && upcoming.length === 0 && (
        <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
          <p className="text-center text-muted-foreground">
            There are no upcoming events right now. Please check back soon.
          </p>
        </section>
      )}

      {!loading && !error && upcoming.length > 0 && (
        <>
          {/* Live figures, counted from the events on this page */}
          <section className="px-4 sm:px-6 lg:px-8 pb-8 max-w-7xl mx-auto">
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-lg p-4 text-center"
                >
                  <div className="text-2xl md:text-3xl font-bold text-amber-500">{stat.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-2">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold mb-1">Happening soon</h2>
              <p className="text-muted-foreground text-sm">The next events on the calendar</p>
            </div>
            <FeaturedSlider events={upcoming.slice(0, 5)} />
          </section>

          <section className="px-4 sm:px-6 lg:px-8 pb-8 max-w-7xl mx-auto">
            {sections.map((category) => (
              <CategorySection key={category} category={category} events={upcoming} />
            ))}
          </section>

          {cities.length > 0 && (
            <section className="px-4 sm:px-6 lg:px-8 pb-12 max-w-7xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold mb-1">Events by city</h2>
                <p className="text-muted-foreground text-sm">Cities with events you can book now</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {cities.slice(0, 8).map((city) => (
                  <Link
                    key={city.name}
                    href={`/events?location=${encodeURIComponent(city.name)}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary transition"
                  >
                    <MapPin size={20} className="text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{city.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {city.count} {city.count === 1 ? "event" : "events"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Footer />
    </main>
  )
}
