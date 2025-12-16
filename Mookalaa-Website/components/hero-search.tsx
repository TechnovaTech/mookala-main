"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { categories } from "@/lib/mock-data"
import { useLanguage } from "@/lib/language-context"

export function HeroSearch() {
  const router = useRouter()
  const { t } = useLanguage()
  const [eventType, setEventType] = useState("")
  const [location, setLocation] = useState("")
  const [date, setDate] = useState("")

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (eventType) params.append("search", eventType)
    if (location) params.append("location", location)
    if (date) params.append("date", date)

    router.push(`/events?${params.toString()}`)
  }

  return (
    <div className="w-full">
      {/* Hero Background */}
      <div className="relative h-[500px] rounded-2xl overflow-hidden mb-8">
        <video
          autoPlay
          muted
          loop
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/video/WhatsApp Video 2025-12-01 at 3.34.23 PM.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/30 via-teal-600/30 to-blue-900/30"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent"></div>

        {/* Hero Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight text-balance">
            {t("hero.title")}
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
            {t("hero.subtitle")}
          </p>
        </div>
      </div>

      {/* Search Card */}
      <div className="backdrop-blur-xl bg-card/80 border border-border/40 rounded-2xl p-6 shadow-xl -mt-20 relative z-10 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Event Type */}
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">{t("search.eventType")}</label>
            <input
              type="text"
              placeholder={t("search.eventPlaceholder")}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              list="categories"
              className="w-full px-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
            />
            <datalist id="categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">{t("search.location")}</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("search.locationPlaceholder")}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-2 block">{t("search.date")}</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
              />
            </div>
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <Button
              onClick={handleSearch}
              size="lg"
              className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-teal-500 hover:from-amber-600 hover:to-teal-600 text-white"
            >
              <Search size={18} className="mr-2" />
              {t("search.button")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
