"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, CheckCircle, Clock, ExternalLink, MapPin, Share2, Ticket } from "lucide-react"
import { EventCard } from "@/components/event-card"
import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchApprovedEvents, fetchEventById, formatRupees } from "@/lib/api"
import { errorMessage } from "@/lib/api-client"
import { showToast } from "@/lib/toast"
import { addToCalendar, formatDate, isPastEvent, mapsLink, shareEvent } from "@/lib/utils-events"
import type { Event } from "@/lib/types"

interface EventDetailProps {
  params: Promise<{ id: string }>
}

export default function EventDetailPage({ params }: EventDetailProps) {
  const { id } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const eventData = await fetchEventById(id)
      setEvent(eventData)
      if (eventData) {
        // Related events are optional: the page is complete without them.
        fetchApprovedEvents()
          .then((all) =>
            setRelatedEvents(
              all
                .filter((e) => e.id !== eventData.id && e.category === eventData.category && !isPastEvent(e))
                .slice(0, 4),
            ),
          )
          .catch(() => setRelatedEvents([]))
      }
    } catch (err) {
      setEvent(null)
      setError(errorMessage(err, "This event could not be loaded."))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <main className="min-h-screen py-12 text-center">
        <p className="text-muted-foreground" role="status">
          Loading event...
        </p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen py-12 text-center px-4">
        <p className="text-muted-foreground mb-4" role="alert">
          {error}
        </p>
        <Button onClick={load} variant="outline">
          Try again
        </Button>
      </main>
    )
  }

  if (!event) {
    return (
      <main className="min-h-screen py-12 text-center px-4">
        <h1 className="text-2xl font-bold mb-4">Event not found</h1>
        <p className="text-muted-foreground mb-6">This event does not exist or is no longer listed.</p>
        <Button asChild>
          <Link href="/events">Browse events</Link>
        </Button>
      </main>
    )
  }

  const past = isPastEvent(event)
  const seatsLeft = event.tickets.reduce((sum, ticket) => sum + ticket.remaining, 0)
  const soldOut = event.hasTickets && seatsLeft === 0
  const canBook = event.hasTickets && !past && !soldOut
  const directions = event.isOnline ? null : mapsLink(event)
  const whereLine = [event.address, event.city, event.state].filter(Boolean).join(", ")

  const handleShare = async () => {
    const result = await shareEvent(event)
    if (result === "copied") showToast("Link copied to the clipboard", "success")
    if (result === "failed") showToast("This browser could not share or copy the link", "error")
  }

  const handleCalendar = () => {
    if (!addToCalendar(event)) showToast("Your browser blocked the calendar window. Allow pop-ups and try again.", "error")
  }

  const bookLabel = past ? "This event has ended" : soldOut ? "Sold out" : "Tickets are not on sale"

  return (
    <main className="min-h-screen py-8">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <BackButton fallbackHref="/events" className="mb-4" />

            {event.image && (
              <div className="rounded-2xl overflow-hidden bg-muted mb-6 max-h-[420px]">
                <img src={event.image} alt="" className="w-full h-full max-h-[420px] object-cover" />
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className="rounded-md">{event.category}</Badge>
              {event.isFree && (
                <Badge variant="secondary" className="rounded-md">
                  Free
                </Badge>
              )}
              {event.isOnline && (
                <Badge variant="outline" className="rounded-md">
                  Online
                </Badge>
              )}
              {past && (
                <Badge variant="outline" className="rounded-md">
                  Ended
                </Badge>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold mb-4 break-words">{event.title}</h1>
            {event.description && (
              <p className="text-lg text-muted-foreground mb-6 whitespace-pre-line break-words">{event.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-semibold">
                    {formatDate(event.date)}
                    {event.endDate && event.date && event.endDate > event.date ? ` to ${formatDate(event.endDate)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-semibold">
                    {event.time || "To be announced"}
                    {event.time && event.endTime ? ` to ${event.endTime}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={20} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Venue</p>
                  <p className="font-semibold">
                    {event.isOnline ? "Online event" : event.venueName || "To be announced"}
                  </p>
                </div>
              </div>
              {event.hasTickets && (
                <div className="flex items-center gap-3">
                  <Ticket size={20} className="text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Availability</p>
                    <p className="font-semibold">
                      {soldOut ? "Sold out" : `${seatsLeft.toLocaleString("en-IN")} of ${event.capacity.toLocaleString("en-IN")} seats left`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              {canBook ? (
                <Button
                  asChild
                  className="flex-1 min-w-[160px] rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                >
                  <Link href={`/event/${id}/book`}>Book Tickets</Link>
                </Button>
              ) : (
                <Button disabled className="flex-1 min-w-[160px] rounded-lg">
                  {bookLabel}
                </Button>
              )}
              {event.date && !past && (
                <Button onClick={handleCalendar} variant="outline" className="rounded-lg">
                  <Calendar size={18} className="mr-2" />
                  Add to calendar
                </Button>
              )}
              <Button variant="outline" onClick={handleShare} className="rounded-lg">
                <Share2 size={18} className="mr-2" />
                Share
              </Button>
            </div>

            {event.artists.length > 0 && (
              <Card className="p-6 rounded-lg mb-8 gap-4">
                <h2 className="font-bold text-lg">{event.artists.length === 1 ? "Artist" : "Artists"}</h2>
                <div className="space-y-5">
                  {event.artists.map((artist) => (
                    <div key={artist.id || artist.name} className="flex items-start gap-4">
                      {artist.image ? (
                        <img src={artist.image} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold flex-shrink-0">
                          {artist.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold">{artist.name}</h3>
                        {artist.genre && <p className="text-sm text-primary">{artist.genre}</p>}
                        {artist.bio && <p className="text-sm text-muted-foreground mt-1 break-words">{artist.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {event.organizer && (
              <Card className="p-6 rounded-lg mb-8 gap-4">
                <h2 className="font-bold text-lg">Organised by</h2>
                <div className="flex items-center gap-4">
                  {event.organizer.image ? (
                    <img src={event.organizer.image} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-xl font-bold">
                      {event.organizer.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{event.organizer.name}</h3>
                    {event.organizer.verified && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                        <CheckCircle size={16} /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {!event.isOnline && (event.venueName || whereLine) && (
              <Card className="p-6 rounded-lg mb-8 gap-3">
                <h2 className="font-bold text-lg">Location</h2>
                <div>
                  {event.venueName && <p className="font-semibold">{event.venueName}</p>}
                  {whereLine && <p className="text-muted-foreground">{whereLine}</p>}
                </div>
                {directions && (
                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline w-fit"
                  >
                    Open in Google Maps <ExternalLink size={16} />
                  </a>
                )}
              </Card>
            )}

            {event.terms && (
              <Card className="p-6 rounded-lg mb-8 gap-3">
                <h2 className="font-bold text-lg">Terms for this event</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{event.terms}</p>
              </Card>
            )}

            {relatedEvents.length > 0 && (
              <div>
                <h2 className="font-bold text-lg mb-4">More in {event.category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {relatedEvents.map((related) => (
                    <EventCard key={related.id} event={related} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="p-6 rounded-lg lg:sticky lg:top-24 gap-4">
              <h2 className="font-bold text-lg">Tickets</h2>

              <div className="bg-gradient-to-br from-purple-600/10 to-pink-600/10 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Price</p>
                <p className="text-3xl font-bold">{event.priceDisplay}</p>
              </div>

              {event.tickets.length > 0 && (
                <ul className="space-y-2">
                  {event.tickets.map((ticket, index) => (
                    <li
                      key={`${ticket.name}-${ticket.blockName}-${index}`}
                      className="p-3 rounded-lg bg-muted border border-border flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {ticket.name}
                          {ticket.blockName ? ` · Block ${ticket.blockName}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.remaining === 0 ? "Sold out" : `${ticket.remaining} left`}
                        </p>
                      </div>
                      <p className="font-semibold flex-shrink-0">
                        {ticket.price === 0 ? "Free" : formatRupees(ticket.price)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {canBook ? (
                <Button
                  asChild
                  size="lg"
                  className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                >
                  <Link href={`/event/${id}/book`}>Book Tickets</Link>
                </Button>
              ) : (
                <Button disabled size="lg" className="w-full rounded-lg">
                  {bookLabel}
                </Button>
              )}

              {event.tags.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {event.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="rounded-md text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
