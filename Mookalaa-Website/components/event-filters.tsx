"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { EventTypeFilter, FilterOptions } from "@/lib/types"

interface EventFiltersProps {
  filters: FilterOptions
  onFiltersChange: (filters: FilterOptions) => void
  onClear: () => void
  categories: string[]
}

const TYPES: { value: EventTypeFilter; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
  { value: "offline", label: "In person" },
  { value: "online", label: "Online" },
]

function toPrice(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function EventFilters({ filters, onFiltersChange, onClear, categories }: EventFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)

  const update = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const field =
    "w-full px-3 py-2 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="md:hidden w-full mb-4 rounded-lg"
        aria-expanded={isOpen}
      >
        {isOpen ? "Hide filters" : "Show filters"}
      </Button>

      <Card className={`p-6 rounded-lg ${isOpen ? "block" : "hidden md:block"}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">Filters</h2>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
            Clear all
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="filter-search" className="font-semibold text-sm mb-2 block">
              Search
            </label>
            <input
              id="filter-search"
              type="search"
              placeholder="Event, artist, venue..."
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              className={field}
            />
          </div>

          {categories.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Category</h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const active = filters.category.toLowerCase() === category.toLowerCase()
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update("category", active ? "" : category)}
                    >
                      <Badge variant={active ? "default" : "outline"} className="cursor-pointer rounded-md">
                        {category}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="filter-location" className="font-semibold text-sm mb-2 block">
              Location
            </label>
            <input
              id="filter-location"
              type="text"
              placeholder="City or venue"
              value={filters.location}
              onChange={(e) => update("location", e.target.value)}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="filter-date" className="font-semibold text-sm mb-2 block">
              Date
            </label>
            <input
              id="filter-date"
              type="date"
              value={filters.date}
              onChange={(e) => update("date", e.target.value)}
              className={field}
            />
          </div>

          <fieldset>
            <legend className="font-semibold text-sm mb-2">Ticket price (₹)</legend>
            <div className="flex gap-3 items-center">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Lowest price"
                placeholder="Min"
                value={filters.minPrice ?? ""}
                onChange={(e) => update("minPrice", toPrice(e.target.value))}
                className={field}
              />
              <span className="text-muted-foreground">-</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Highest price"
                placeholder="Any"
                value={filters.maxPrice ?? ""}
                onChange={(e) => update("maxPrice", toPrice(e.target.value))}
                className={field}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold text-sm mb-2">Show</legend>
            <div className="space-y-2">
              {TYPES.map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="event-type"
                    value={type.value}
                    checked={filters.type === type.value}
                    onChange={() => update("type", type.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.includePast}
              onChange={(e) => update("includePast", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Include past events</span>
          </label>
        </div>
      </Card>
    </>
  )
}
