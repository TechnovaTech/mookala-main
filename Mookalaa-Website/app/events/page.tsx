"use client"

import { useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { EventFilters } from "@/components/event-filters"
import { EventGrid } from "@/components/event-grid"
import { mockEvents, getTranslatedEvents } from "@/lib/mock-data"
import { filterEvents, sortEvents } from "@/lib/utils-events"
import type { FilterOptions } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { LayoutGrid, Map } from "lucide-react"
import { useLanguage } from "@/lib/language-context"

export default function EventsPage() {
  const { t, language } = useLanguage()
  const searchParams = useSearchParams()
  const [mapView, setMapView] = useState(false)
  const [sortBy, setSortBy] = useState<"popular" | "date" | "recent">("popular")
  const [displayCount, setDisplayCount] = useState(12)

  const [filters, setFilters] = useState<FilterOptions>({
    location: searchParams.get("location") || "",
    category: searchParams.get("category") || "",
    date: searchParams.get("date") || "",
    priceRange: [0, 1000],
    type: "all",
  })

  const filteredAndSorted = useMemo(() => {
    const excludedCategories = ["Festivals", "Dance", "Workshops", "Custom Orders"]
    const translatedEvents = getTranslatedEvents(language)
    const eventsToFilter = translatedEvents.filter(event => !excludedCategories.includes(event.category))
    const filtered = filterEvents(eventsToFilter, filters)
    const sorted = sortEvents(filtered, sortBy)
    return sorted.slice(0, displayCount)
  }, [filters, sortBy, displayCount, language])

  const handleClearFilters = () => {
    setFilters({
      location: "",
      category: "",
      date: "",
      priceRange: [0, 1000],
      type: "all",
    })
    setSortBy("popular")
    setDisplayCount(12)
  }

  const excludedCategories = ["Festivals", "Dance", "Workshops", "Custom Orders"]
  const translatedEventsForCount = getTranslatedEvents(language)
  const totalFilteredEvents = translatedEventsForCount.filter(event => !excludedCategories.includes(event.category)).filter(event => filterEvents([event], filters).length > 0).length

  return (
    <main className="min-h-screen py-8" suppressHydrationWarning>
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" suppressHydrationWarning>
        {/* Header */}
        <div className="mb-8" suppressHydrationWarning>
          <h1 className="text-4xl font-bold mb-2" suppressHydrationWarning>{t("eventsPage.title")}</h1>
          <p className="text-muted-foreground" suppressHydrationWarning>{t("eventsPage.found")} {filteredAndSorted.length} {t("eventsPage.events")}</p>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between" suppressHydrationWarning>
          <div className="flex gap-2" suppressHydrationWarning>
            <Button
              variant={!mapView ? "default" : "outline"}
              onClick={() => setMapView(false)}
              className="rounded-lg"
              size="sm"
            >
              <LayoutGrid size={16} className="mr-2" />
              {t("eventsPage.gridView")}
            </Button>
            <Button
              variant={mapView ? "default" : "outline"}
              onClick={() => setMapView(true)}
              className="rounded-lg"
              size="sm"
            >
              <Map size={16} className="mr-2" />
              {t("eventsPage.mapView")}
            </Button>
          </div>

          <div className="flex gap-2" suppressHydrationWarning>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"
            >
              <option value="popular">{t("eventsPage.sortPopular")}</option>
              <option value="date">{t("eventsPage.sortDate")}</option>
              <option value="recent">{t("eventsPage.sortRecent")}</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8" suppressHydrationWarning>
          {/* Sidebar Filters */}
          <div className="md:col-span-1" suppressHydrationWarning>
            <EventFilters filters={filters} onFiltersChange={setFilters} onClear={handleClearFilters} />
          </div>

          {/* Main Content */}
          <div className="md:col-span-3" suppressHydrationWarning>
            {mapView ? (
              <div className="bg-muted rounded-lg h-96 flex items-center justify-center">
                <p className="text-muted-foreground">Map view coming soon</p>
              </div>
            ) : (
              <EventGrid
                events={filteredAndSorted}
                hasMore={displayCount < totalFilteredEvents}
                onLoadMore={() => setDisplayCount((prev) => prev + 12)}
                isLoading={false}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
