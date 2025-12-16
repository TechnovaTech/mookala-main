"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { categories } from "@/lib/mock-data"
import type { FilterOptions } from "@/lib/types"
import { useLanguage } from "@/lib/language-context"

interface EventFiltersProps {
  filters: FilterOptions
  onFiltersChange: (filters: FilterOptions) => void
  onClear: () => void
}

export function EventFilters({ filters, onFiltersChange, onClear }: EventFiltersProps) {
  const { t, translateCategory } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)

  const updateFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <>
      {/* Mobile Filter Button */}
      <Button onClick={() => setIsOpen(!isOpen)} variant="outline" className="md:hidden w-full mb-4 rounded-lg">
        {t("filters.title")}
      </Button>

      {/* Filter Panel */}
      <Card className={`p-6 rounded-lg ${isOpen ? "block" : "hidden md:block"}`} suppressHydrationWarning>
        <div className="flex items-center justify-between mb-6" suppressHydrationWarning>
          <h3 className="font-bold text-lg">{t("filters.title")}</h3>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
            {t("filters.clearAll")}
          </Button>
        </div>

        <div className="space-y-6" suppressHydrationWarning>
          {/* Category Filter */}
          <div suppressHydrationWarning>
            <h4 className="font-semibold text-sm mb-3">{t("filters.category")}</h4>
            <div className="flex flex-wrap gap-2" suppressHydrationWarning>
              {categories.map((cat) => (
                <Badge
                  key={cat}
                  variant={filters.category === cat ? "default" : "outline"}
                  onClick={() => updateFilter("category", filters.category === cat ? "" : cat)}
                  className="cursor-pointer rounded-md"
                  suppressHydrationWarning
                >
                  {translateCategory(cat)}
                </Badge>
              ))}
            </div>
          </div>

          {/* Location Filter */}
          <div suppressHydrationWarning>
            <label className="font-semibold text-sm mb-3 block">{t("filters.location")}</label>
            <input
              type="text"
              placeholder={t("filters.locationPlaceholder")}
              value={filters.location}
              onChange={(e) => updateFilter("location", e.target.value)}
              className="w-full px-3 py-2 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"
            />
          </div>

          {/* Price Range */}
          <div suppressHydrationWarning>
            <label className="font-semibold text-sm mb-3 block">{t("filters.priceRange")}</label>
            <div className="flex gap-3 items-center" suppressHydrationWarning>
              <div className="flex-1" suppressHydrationWarning>
                <input
                  type="number"
                  placeholder={t("filters.min")}
                  value={filters.priceRange[0]}
                  onChange={(e) =>
                    updateFilter("priceRange", [Number.parseInt(e.target.value) || 0, filters.priceRange[1]])
                  }
                  className="w-full px-4 py-2.5 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"
                />
              </div>
              <span className="text-muted-foreground">-</span>
              <div className="flex-1" suppressHydrationWarning>
                <input
                  type="number"
                  placeholder={t("filters.max")}
                  value={filters.priceRange[1]}
                  onChange={(e) =>
                    updateFilter("priceRange", [filters.priceRange[0], Number.parseInt(e.target.value) || 1000])
                  }
                  className="w-full px-4 py-2.5 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition text-sm"
                />
              </div>
            </div>
          </div>

          {/* Event Type */}
          <div suppressHydrationWarning>
            <h4 className="font-semibold text-sm mb-3">{t("filters.eventType")}</h4>
            <div className="space-y-2" suppressHydrationWarning>
              {[
                { value: "all", label: t("filters.allTypes") },
                { value: "corporate", label: t("filters.corporate") },
                { value: "social", label: t("filters.social") },
                { value: "entertainment", label: t("filters.entertainment") },
                { value: "education", label: t("filters.education") },
                { value: "charity", label: t("filters.charity") },
                { value: "virtual", label: t("filters.virtual") },
                { value: "casting", label: t("filters.casting") },
              ].map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={type.value}
                    checked={filters.type === type.value}
                    onChange={(e) => updateFilter("type", e.target.value as any)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
