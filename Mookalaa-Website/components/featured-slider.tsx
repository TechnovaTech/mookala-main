"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import type { Event } from "@/lib/types"
import { EventCard } from "./event-card"

export function FeaturedSlider({ events }: { events: Event[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const count = events.length

  useEffect(() => {
    if (!autoPlay || count < 2) return
    const interval = setInterval(() => setCurrentIndex((prev) => (prev + 1) % count), 5000)
    return () => clearInterval(interval)
  }, [autoPlay, count])

  useEffect(() => {
    if (currentIndex >= count) setCurrentIndex(0)
  }, [count, currentIndex])

  if (count === 0) return null

  const move = (step: number) => {
    setAutoPlay(false)
    setCurrentIndex((prev) => (prev + step + count) % count)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    if (distance > 50) move(1)
    if (distance < -50) move(-1)
  }

  return (
    <div className="relative" onMouseEnter={() => setAutoPlay(false)} onMouseLeave={() => setAutoPlay(true)}>
      <div
        className="relative overflow-hidden rounded-2xl"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {events.map((event) => (
            <div key={event.id} className="min-w-full">
              <EventCard event={event} variant="featured" />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {events.map((event, index) => (
            <button
              key={event.id}
              type="button"
              aria-label={`Show ${event.title}`}
              aria-current={index === currentIndex}
              onClick={() => {
                setAutoPlay(false)
                setCurrentIndex(index)
              }}
              className={`h-2 rounded-full transition-all ${index === currentIndex ? "bg-primary w-8" : "bg-muted-foreground/40 w-2"}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
