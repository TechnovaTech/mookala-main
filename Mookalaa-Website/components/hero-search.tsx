"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeroSearchProps {
  /** Category names from the backend, offered as suggestions. */
  categories: string[]
  /** Cities that have live events, offered as suggestions. */
  cities: string[]
}

export function HeroSearch({ categories, cities }: HeroSearchProps) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("")
  const [date, setDate] = useState("")

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    if (location.trim()) params.set("location", location.trim())
    if (date) params.set("date", date)
    const query = params.toString()
    router.push(query ? `/events?${query}` : "/events")
  }

  const field =
    "w-full px-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition"

  return (
    <div className="w-full">
      <div className="relative h-[360px] sm:h-[500px] rounded-2xl overflow-hidden mb-8">
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
          <source src="/video/WhatsApp Video 2025-12-01 at 3.34.23 PM.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/30 via-teal-600/30 to-blue-900/30"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent"></div>

        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 leading-tight text-balance">
            Discover Amazing Arts &amp; Cultural Events
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl">
            Unite Through Arts - Find Jatra, Cinema, Music, Dance &amp; More
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSearch}
        role="search"
        className="backdrop-blur-xl bg-card/80 border border-border/40 rounded-2xl p-6 shadow-xl -mt-20 relative z-10 max-w-4xl mx-auto"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="hero-search" className="text-sm font-semibold text-muted-foreground mb-2 block">
              Event or category
            </label>
            <input
              id="hero-search"
              type="text"
              placeholder="Music, dance, an event name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              list="hero-categories"
              className={field}
            />
            <datalist id="hero-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="hero-location" className="text-sm font-semibold text-muted-foreground mb-2 block">
              Location
            </label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-4 text-muted-foreground" />
              <input
                id="hero-location"
                type="text"
                placeholder="City or venue"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                list="hero-cities"
                className={`${field} pl-9`}
              />
              <datalist id="hero-cities">
                {cities.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label htmlFor="hero-date" className="text-sm font-semibold text-muted-foreground mb-2 block">
              Date
            </label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-4 text-muted-foreground" />
              <input
                id="hero-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${field} pl-9`}
              />
            </div>
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-teal-500 hover:from-amber-600 hover:to-teal-600 text-white"
            >
              <Search size={18} className="mr-2" />
              Search
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
