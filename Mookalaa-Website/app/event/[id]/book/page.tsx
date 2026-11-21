"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Calendar, CheckCircle, Clock, MapPin, Minus, Plus, X, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  createOrder,
  fetchEventById,
  fetchPaymentConfig,
  fetchVenueByName,
  formatRupees,
  verifyPayment,
  type OrderResult,
  type TicketRequest,
  type VenueInfo,
} from "@/lib/api"
import { ApiError, errorMessage } from "@/lib/api-client"
import { useAuth } from "@/lib/auth"
import { loginPath } from "@/lib/navigation"
import { loadRazorpay, openRazorpay, type RazorpaySuccess } from "@/lib/razorpay"
import { seatLabel } from "@/lib/ticket"
import { formatDate, isPastEvent } from "@/lib/utils-events"
import type { Booking, Event, EventTicket, PaymentConfig, RefundRule } from "@/lib/types"

interface BookingPageProps {
  params: Promise<{ id: string }>
}

interface Line {
  key: number
  ticketIndex: number | null
  fromSeat: string
  toSeat: string
  quantity: number
}

type PaidOrder = Extract<OrderResult, { free: false }>

type Phase = "select" | "review" | "pay" | "confirming" | "confirmed" | "refund" | "failed"

const MAX_SEATS = 100
const MAX_LINES = 20
const VERIFY_EVERY_MS = 4000
const VERIFY_ATTEMPTS = 30

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : null
}

function ticketLabel(ticket: EventTicket): string {
  const parts = [ticket.name]
  if (ticket.blockName) parts.push(`Block ${ticket.blockName}`)
  parts.push(ticket.price === 0 ? "Free" : formatRupees(ticket.price))
  if (ticket.seated) parts.push(`seats ${ticket.startSeat}-${ticket.endSeat}`)
  parts.push(ticket.remaining === 0 ? "sold out" : `${ticket.remaining} left`)
  return parts.join(" · ")
}

/** What is wrong with one line, or "" when it can be sent. */
function lineProblem(line: Line, tickets: EventTicket[]): string {
  if (line.ticketIndex === null) return "Choose a ticket category."
  const ticket = tickets[line.ticketIndex]
  if (!ticket) return "Choose a ticket category."
  if (ticket.remaining === 0) return `${ticket.name} is sold out.`

  if (ticket.seated) {
    const from = wholeNumber(line.fromSeat)
    const to = wholeNumber(line.toSeat)
    if (from === null || to === null) return "Enter the first and last seat number."
    if (from > to) return "The first seat must not be after the last seat."
    if (from < (ticket.startSeat as number) || to > (ticket.endSeat as number)) {
      return `Seats in this block run from ${ticket.startSeat} to ${ticket.endSeat}.`
    }
    if (to - from + 1 > ticket.remaining) return `Only ${ticket.remaining} seats are left in this block.`
    return ""
  }

  if (!Number.isInteger(line.quantity) || line.quantity < 1) return "Choose at least one ticket."
  if (line.quantity > ticket.remaining) return `Only ${ticket.remaining} tickets are left.`
  return ""
}

function lineSeats(line: Line, tickets: EventTicket[]): number {
  const ticket = line.ticketIndex === null ? null : tickets[line.ticketIndex]
  if (!ticket) return 0
  if (!ticket.seated) return line.quantity
  const from = wholeNumber(line.fromSeat)
  const to = wholeNumber(line.toSeat)
  return from !== null && to !== null && to >= from ? to - from + 1 : 0
}

function ruleText(rule: RefundRule): string {
  const window =
    rule.maxHoursBefore === null
      ? `${rule.minHoursBefore} hours or more before the event`
      : `${rule.minHoursBefore} to ${rule.maxHoursBefore} hours before the event`
  const fee = rule.deductionFlat > 0 ? `, less a ${formatRupees(rule.deductionFlat)} fee` : ""
  return `${window}: ${rule.refundPercent}% refund${fee}`
}

function orderErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "The booking could not be started. Please try again."
  switch (error.code) {
    case "PAYMENTS_UNAVAILABLE":
      return "Paid booking is unavailable right now, so nothing was booked and nothing was charged. Please try again later."
    case "GATEWAY_ERROR":
      return "The payment could not be started and no seats were held. Please try again in a moment."
    case "SEATS_TAKEN":
      return `${error.message}. Please choose different seats.`
    case "SOLD_OUT":
      return `${error.message}. Please choose another ticket.`
    default:
      if (error.status === 401) return "Your session has expired. Please sign in again to book."
      return error.message
  }
}

export default function BookingPage({ params }: BookingPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { ready, session } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [venue, setVenue] = useState<VenueInfo | null>(null)
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [imageScale, setImageScale] = useState(1)

  const nextKey = useRef(1)
  const [lines, setLines] = useState<Line[]>([{ key: 0, ticketIndex: null, fromSeat: "", toSeat: "", quantity: 1 }])
  const [showProblems, setShowProblems] = useState(false)

  const [phase, setPhase] = useState<Phase>("select")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [order, setOrder] = useState<PaidOrder | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [pendingPayment, setPendingPayment] = useState<RazorpaySuccess | null>(null)
  const [confirmNote, setConfirmNote] = useState("")
  const [confirmStalled, setConfirmStalled] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const loadEvent = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const eventData = await fetchEventById(id)
      setEvent(eventData)
      if (eventData) {
        // The seating plan and the payment settings are loaded alongside; the
        // page says so when either is missing rather than guessing.
        const [venueResult, configResult] = await Promise.allSettled([
          fetchVenueByName(eventData.venueName),
          fetchPaymentConfig(),
        ])
        setVenue(venueResult.status === "fulfilled" ? venueResult.value : null)
        setConfig(configResult.status === "fulfilled" ? configResult.value : null)
      }
    } catch (err) {
      setEvent(null)
      setLoadError(errorMessage(err, "This event could not be loaded."))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadEvent()
  }, [loadEvent])

  /* ----------------------------- Selection ----------------------------- */

  const tickets = useMemo(() => event?.tickets ?? [], [event])

  const problems = useMemo(() => {
    const perLine = lines.map((line) => lineProblem(line, tickets))

    // The same seats may not be asked for twice in one booking.
    lines.forEach((line, index) => {
      if (perLine[index] || line.ticketIndex === null) return
      const ticket = tickets[line.ticketIndex]
      if (!ticket.seated) return
      const from = wholeNumber(line.fromSeat) as number
      const to = wholeNumber(line.toSeat) as number
      for (let other = 0; other < index; other++) {
        const otherLine = lines[other]
        if (perLine[other] || otherLine.ticketIndex === null) continue
        const otherTicket = tickets[otherLine.ticketIndex]
        if (!otherTicket.seated) continue
        const sameBlock = (otherTicket.blockName || otherTicket.name) === (ticket.blockName || ticket.name)
        const otherFrom = wholeNumber(otherLine.fromSeat) as number
        const otherTo = wholeNumber(otherLine.toSeat) as number
        if (sameBlock && from <= otherTo && to >= otherFrom) {
          perLine[index] = "These seats overlap with another line of this booking."
        }
      }
    })
    return perLine
  }, [lines, tickets])

  const totalSeats = lines.reduce((sum, line) => sum + lineSeats(line, tickets), 0)
  const estimatedTotal = lines.reduce((sum, line) => {
    const ticket = line.ticketIndex === null ? null : tickets[line.ticketIndex]
    return sum + (ticket ? ticket.price * lineSeats(line, tickets) : 0)
  }, 0)

  const overallProblem = problems.some(Boolean)
    ? "Please fix the highlighted tickets."
    : totalSeats > MAX_SEATS
      ? `A single booking can have at most ${MAX_SEATS} seats.`
      : ""
  const selectionValid = !overallProblem && totalSeats > 0

  const updateLine = (key: number, change: Partial<Line>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))
  }

  const chooseTicket = (key: number, value: string) => {
    const index = value === "" ? null : Number(value)
    const ticket = index === null ? null : tickets[index]
    updateLine(key, {
      ticketIndex: index,
      fromSeat: ticket?.seated ? String(ticket.startSeat) : "",
      toSeat: ticket?.seated ? String(ticket.startSeat) : "",
      quantity: 1,
    })
  }

  const addLine = () => {
    setLines((current) => [
      ...current,
      { key: nextKey.current++, ticketIndex: null, fromSeat: "", toSeat: "", quantity: 1 },
    ])
  }

  const requestLines = (): TicketRequest[] =>
    lines.map((line) => {
      const ticket = tickets[line.ticketIndex as number]
      if (ticket.seated) {
        const from = wholeNumber(line.fromSeat) as number
        const to = wholeNumber(line.toSeat) as number
        return { category: ticket.name, block: ticket.blockName, fromSeat: from, toSeat: to, quantity: to - from + 1 }
      }
      return { category: ticket.name, block: ticket.blockName, quantity: line.quantity }
    })

  const proceed = () => {
    setMessage("")
    if (!selectionValid) {
      setShowProblems(true)
      return
    }
    if (!session) {
      router.push(loginPath(`/event/${id}/book`))
      return
    }
    setPhase("review")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  /* --------------------------- Order and payment --------------------------- */

  const backToSelection = useCallback(
    (note: string) => {
      setOrder(null)
      setPendingPayment(null)
      setPhase("select")
      setMessage(note)
      loadEvent() // seat counts may have changed
    },
    [loadEvent],
  )

  const confirmPayment = useCallback(async (paidOrder: PaidOrder, payment: RazorpaySuccess) => {
    setPendingPayment(payment)
    setPhase("confirming")
    setConfirmStalled(false)
    setConfirmNote("Confirming your payment with the bank. Please do not close this page or pay again.")

    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      if (!alive.current) return
      try {
        const result = await verifyPayment(paidOrder.bookingId, payment)
        if (!alive.current) return
        if (result.confirmed) {
          setBooking(result.booking)
          setPhase("confirmed")
          return
        }
        setConfirmNote(`${result.message} Please do not pay again.`)
      } catch (err) {
        if (!alive.current) return
        if (err instanceof ApiError) {
          if (err.code === "SEATS_LOST_REFUND_REQUESTED") {
            setMessage(err.message)
            setPhase("refund")
            return
          }
          // A definite "no" from the server: the signature, order or capture is wrong.
          if ([400, 402, 404].includes(err.status)) {
            setMessage(err.message)
            setPhase("failed")
            return
          }
        }
        // 502, 503 or no connection: the payment is not known to have failed.
        setConfirmNote(
          "We could not reach the payment service just now and are trying again. Your payment is not lost. Please do not pay again.",
        )
      }
      await new Promise((resolve) => window.setTimeout(resolve, VERIFY_EVERY_MS))
    }

    if (alive.current) {
      setConfirmStalled(true)
      setConfirmNote(
        "This is taking longer than usual. Your payment is not lost: the ticket will appear in My bookings as soon as it is confirmed.",
      )
    }
  }, [])

  const openCheckout = useCallback(
    async (paidOrder: PaidOrder) => {
      if (!event || !session) return
      setBusy(true)
      setMessage("")
      const loaded = await loadRazorpay()
      if (!alive.current) return
      setBusy(false)
      if (!loaded) {
        setMessage(
          "The payment window could not be loaded. Nothing was charged. Check your connection and press Pay now again.",
        )
        return
      }
      try {
        openRazorpay(
          {
            key: paidOrder.keyId,
            amount: paidOrder.amount,
            currency: paidOrder.currency,
            order_id: paidOrder.orderId,
            name: "Mookalaa",
            description: `Tickets for ${event.title}`.slice(0, 250),
            prefill: { contact: session.phone },
            theme: { color: "#124972" },
            handler: (response) => {
              confirmPayment(paidOrder, response)
            },
            modal: {
              ondismiss: () => {
                if (alive.current) {
                  setMessage("The payment window was closed and nothing was charged. Your seats stay held until the timer runs out.")
                }
              },
            },
          },
          (reason) => {
            if (alive.current) setMessage(`${reason} Nothing was booked. You can try again while your seats are held.`)
          },
        )
      } catch {
        setMessage("The payment window could not be opened. Nothing was charged. Please press Pay now again.")
      }
    },
    [event, session, confirmPayment],
  )

  const placeOrder = async () => {
    if (!event || !session || busy) return
    setBusy(true)
    setMessage("")
    try {
      const result = await createOrder(session.phone, event.id, requestLines())
      if (result.free) {
        setBooking(result.booking)
        setPhase("confirmed")
      } else {
        setOrder(result)
        setPhase("pay")
        setBusy(false)
        openCheckout(result)
        return
      }
    } catch (err) {
      const text = orderErrorMessage(err)
      if (err instanceof ApiError && (err.code === "SEATS_TAKEN" || err.code === "SOLD_OUT" || err.status === 401)) {
        backToSelection(text)
      } else {
        setMessage(text)
      }
    }
    setBusy(false)
  }

  // Countdown for the seat hold.
  useEffect(() => {
    if (phase !== "pay" || !order) return
    const expires = new Date(order.expiresAt).getTime()
    if (!Number.isFinite(expires)) return
    const tick = () => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) backToSelection("The 15-minute hold on your seats ran out before payment. Nothing was charged. Please choose your seats again.")
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [phase, order, backToSelection])

  /* ------------------------------- Screens ------------------------------- */

  if (loading && !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p role="status">Loading booking details...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <p className="text-muted-foreground mb-4" role="alert">
            {loadError}
          </p>
          <Button onClick={loadEvent} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Event not found</h1>
          <Button asChild>
            <Link href="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    )
  }

  const past = isPastEvent(event)
  const paid = estimatedTotal > 0
  const paymentsOff = config !== null && !config.enabled
  const holdMinutes = config?.holdMinutes ?? 15
  const gradient = "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"

  const notice = message && (
    <p role="alert" className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {message}
    </p>
  )

  const selectedSummary = (
    <ul className="space-y-2">
      {lines.map((line) => {
        const ticket = tickets[line.ticketIndex as number]
        if (!ticket) return null
        const seats = lineSeats(line, tickets)
        const where = ticket.seated
          ? line.fromSeat === line.toSeat
            ? `Seat ${ticket.blockName}${line.fromSeat}`
            : `Seats ${ticket.blockName}${line.fromSeat} to ${ticket.blockName}${line.toSeat}`
          : `${seats} ${seats === 1 ? "ticket" : "tickets"}`
        return (
          <li key={line.key} className="flex justify-between gap-4 text-sm">
            <span>
              {ticket.name}
              {ticket.blockName ? ` · Block ${ticket.blockName}` : ""} · {where}
            </span>
            <span className="font-medium flex-shrink-0">
              {ticket.price === 0 ? "Free" : `${seats} × ${formatRupees(ticket.price)}`}
            </span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/20 hover:text-white">
              <Link href={`/event/${id}`}>← Back</Link>
            </Button>
            <p className="text-2xl font-bold">Book Tickets</p>
          </div>
          <h1 className="text-xl font-semibold break-words mb-2">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm opacity-90">
            <span className="flex items-center gap-2">
              <Calendar size={16} />
              {formatDate(event.date)}
            </span>
            {event.time && (
              <span className="flex items-center gap-2">
                <Clock size={16} />
                {event.time}
              </span>
            )}
            {event.venueName && (
              <span className="flex items-center gap-2">
                <MapPin size={16} />
                {[event.venueName, event.city].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ---------- Confirmed by the server ---------- */}
        {phase === "confirmed" && booking && (
          <Card className="p-6 sm:p-8 text-center gap-4" data-testid="booking-confirmed">
            <CheckCircle className="mx-auto text-green-500" size={56} />
            <h2 className="text-2xl font-bold">Booking confirmed</h2>
            <p className="text-muted-foreground">
              {booking.totalSeats} {booking.totalSeats === 1 ? "seat" : "seats"} for {booking.eventTitle}
              {booking.totalPrice > 0 ? ` · ${formatRupees(booking.totalPrice)} paid` : " · free entry"}
            </p>
            <ul className="text-sm space-y-1">
              {booking.tickets.map((line, index) => (
                <li key={index}>
                  {line.category}
                  {line.block ? ` · Block ${line.block}` : ""} · {seatLabel(line)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground break-all">Booking ID: {booking._id}</p>
            <Button asChild className={gradient} size="lg">
              <Link href="/bookings">View my ticket</Link>
            </Button>
          </Card>
        )}

        {/* ---------- Payment arrived after the hold: refund requested ---------- */}
        {phase === "refund" && (
          <Card className="p-6 sm:p-8 text-center gap-4">
            <h2 className="text-2xl font-bold">Seats no longer available</h2>
            <p role="alert">{message}</p>
            <p className="text-sm text-muted-foreground">
              No ticket was issued. Keep this reference for support: {order?.bookingId}
            </p>
            <Button asChild variant="outline">
              <Link href={`/event/${id}`}>Back to the event</Link>
            </Button>
          </Card>
        )}

        {/* ---------- The server refused the payment ---------- */}
        {phase === "failed" && (
          <Card className="p-6 sm:p-8 text-center gap-4">
            <h2 className="text-2xl font-bold">Payment not confirmed</h2>
            <p role="alert">{message}</p>
            <p className="text-sm text-muted-foreground">
              No ticket was issued. If money left your account, contact support with this reference: {order?.bookingId}
            </p>
            <Button variant="outline" onClick={() => backToSelection("")}>
              Start again
            </Button>
          </Card>
        )}

        {/* ---------- Waiting for the server to confirm a payment ---------- */}
        {phase === "confirming" && order && (
          <Card className="p-6 sm:p-8 text-center gap-4">
            <h2 className="text-2xl font-bold">Payment processing</h2>
            <p role="status">{confirmNote}</p>
            <p className="text-sm text-muted-foreground">Reference: {order.bookingId}</p>
            {confirmStalled && pendingPayment && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => confirmPayment(order, pendingPayment)}>Check again</Button>
                <Button asChild variant="outline">
                  <Link href="/bookings">Go to My bookings</Link>
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* ---------- Seats held, waiting for payment ---------- */}
        {phase === "pay" && order && (
          <Card className="p-6 gap-4" data-testid="pay-step">
            <h2 className="text-xl font-semibold">Complete your payment</h2>
            {notice}
            <p role="timer" className="rounded-lg bg-muted px-4 py-3">
              Your seats are held for{" "}
              <strong>
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </strong>{" "}
              more minutes. After that they are released.
            </p>
            <ul className="space-y-2 text-sm">
              {order.tickets.map((line, index) => (
                <li key={index} className="flex justify-between gap-4">
                  <span>
                    {line.category}
                    {line.block ? ` · Block ${line.block}` : ""} · {seatLabel(line)}
                  </span>
                  <span className="font-medium">{formatRupees(line.totalPrice)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-lg font-bold border-t border-border pt-4">
              <span>Amount to pay</span>
              <span>{formatRupees(order.totalPrice)}</span>
            </div>
            <Button onClick={() => openCheckout(order)} disabled={busy} className={gradient} size="lg">
              {busy ? "Opening payment..." : "Pay now"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => backToSelection("You left the payment step. Nothing was charged; the held seats are released when the timer runs out.")}
            >
              Choose different seats
            </Button>
          </Card>
        )}

        {/* ---------- Review before anything is sent ---------- */}
        {phase === "review" && (
          <Card className="p-6 gap-5" data-testid="review-step">
            <h2 className="text-xl font-semibold">Review your booking</h2>
            {notice}
            {selectedSummary}
            <div className="flex justify-between text-lg font-bold border-t border-border pt-4">
              <span>Total</span>
              <span>{paid ? formatRupees(estimatedTotal) : "Free"}</span>
            </div>

            {paid && (
              <>
                <p className="text-sm text-muted-foreground">
                  The final amount is confirmed by Mookalaa when the order is created. Your seats are then held for{" "}
                  {holdMinutes} minutes while you pay.
                </p>
                <div className="rounded-lg border border-border p-4">
                  <h3 className="font-semibold mb-2">Cancellation and refund policy</h3>
                  {config === null ? (
                    <p className="text-sm" role="alert">
                      The refund policy could not be loaded, so payment cannot start yet.{" "}
                      <button type="button" className="underline" onClick={loadEvent}>
                        Try again
                      </button>
                    </p>
                  ) : config.refundPolicy.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No refund rules are published at the moment, so a cancelled booking may not be refunded.
                    </p>
                  ) : (
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                      {config.refundPolicy.map((rule, index) => (
                        <li key={index}>{ruleText(rule)}</li>
                      ))}
                      <li>Outside these periods no refund is given.</li>
                    </ul>
                  )}
                </div>
                {paymentsOff && (
                  <p role="alert" className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                    Online payment is switched off at the moment, so paid tickets cannot be booked right now.
                  </p>
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setPhase("select")} disabled={busy} className="sm:flex-1">
                Change selection
              </Button>
              <Button
                onClick={placeOrder}
                disabled={busy || (paid && config === null)}
                className={`sm:flex-1 ${gradient}`}
                size="lg"
              >
                {busy ? "Please wait..." : paid ? "Continue to payment" : "Confirm free booking"}
              </Button>
            </div>
          </Card>
        )}

        {/* ---------- Choosing tickets ---------- */}
        {phase === "select" && (
          <>
            {notice}

            {past ? (
              <Card className="p-6 text-center gap-3">
                <h2 className="text-xl font-semibold">This event has ended</h2>
                <p className="text-muted-foreground">Tickets can no longer be booked.</p>
              </Card>
            ) : tickets.length === 0 ? (
              <Card className="p-6 text-center gap-3">
                <h2 className="text-xl font-semibold">Tickets are not on sale</h2>
                <p className="text-muted-foreground">The organiser has not put any tickets on sale for this event.</p>
              </Card>
            ) : (
              <>
                {venue?.seatingLayoutImage && (
                  <Card className="p-6 mb-6 gap-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">Seating layout</h2>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setImageScale((scale) => Math.max(0.6, scale - 0.2))}
                          variant="outline"
                          size="sm"
                          aria-label="Zoom out"
                        >
                          <ZoomOut size={16} />
                        </Button>
                        <Button
                          onClick={() => setImageScale((scale) => Math.min(3, scale + 0.2))}
                          variant="outline"
                          size="sm"
                          aria-label="Zoom in"
                        >
                          <ZoomIn size={16} />
                        </Button>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 overflow-auto" style={{ height: "300px" }}>
                      <img
                        src={venue.seatingLayoutImage}
                        alt={`Seating layout of ${venue.name}`}
                        style={{ width: `${imageScale * 100}%`, maxWidth: "none" }}
                      />
                    </div>
                  </Card>
                )}

                <Card className="p-6 mb-6 gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold">Select tickets</h2>
                    <Button onClick={addLine} variant="outline" size="sm" disabled={lines.length >= MAX_LINES}>
                      <Plus size={16} className="mr-2" />
                      Add another
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {lines.map((line, index) => {
                      const ticket = line.ticketIndex === null ? null : tickets[line.ticketIndex]
                      const problem = problems[index]
                      const showProblem = problem && (showProblems || line.ticketIndex !== null)
                      const seats = lineSeats(line, tickets)
                      return (
                        <div key={line.key} className="rounded-lg border-2 border-border p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium">Ticket {index + 1}</h3>
                            {lines.length > 1 && (
                              <Button
                                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-500"
                                aria-label={`Remove ticket ${index + 1}`}
                              >
                                <X size={16} />
                              </Button>
                            )}
                          </div>

                          <label htmlFor={`category-${line.key}`} className="block text-sm font-medium mb-2">
                            Category
                          </label>
                          <select
                            id={`category-${line.key}`}
                            value={line.ticketIndex === null ? "" : String(line.ticketIndex)}
                            onChange={(e) => chooseTicket(line.key, e.target.value)}
                            className="w-full px-3 py-2 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                          >
                            <option value="">Select a category</option>
                            {tickets.map((option, optionIndex) => (
                              <option key={optionIndex} value={optionIndex} disabled={option.remaining === 0}>
                                {ticketLabel(option)}
                              </option>
                            ))}
                          </select>

                          {ticket?.seated && (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                <label htmlFor={`from-${line.key}`} className="block text-sm font-medium mb-2">
                                  First seat
                                </label>
                                <Input
                                  id={`from-${line.key}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={ticket.startSeat ?? 1}
                                  max={ticket.endSeat ?? undefined}
                                  value={line.fromSeat}
                                  onChange={(e) => updateLine(line.key, { fromSeat: e.target.value })}
                                />
                              </div>
                              <div>
                                <label htmlFor={`to-${line.key}`} className="block text-sm font-medium mb-2">
                                  Last seat
                                </label>
                                <Input
                                  id={`to-${line.key}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={ticket.startSeat ?? 1}
                                  max={ticket.endSeat ?? undefined}
                                  value={line.toSeat}
                                  onChange={(e) => updateLine(line.key, { toSeat: e.target.value })}
                                />
                              </div>
                            </div>
                          )}

                          {ticket && !ticket.seated && (
                            <div className="mt-4">
                              <span className="block text-sm font-medium mb-2">Number of tickets</span>
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label="One ticket fewer"
                                  disabled={line.quantity <= 1}
                                  onClick={() => updateLine(line.key, { quantity: line.quantity - 1 })}
                                >
                                  <Minus size={16} />
                                </Button>
                                <span className="w-10 text-center font-semibold" aria-live="polite">
                                  {line.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label="One ticket more"
                                  disabled={line.quantity >= Math.min(ticket.remaining, MAX_SEATS)}
                                  onClick={() => updateLine(line.key, { quantity: line.quantity + 1 })}
                                >
                                  <Plus size={16} />
                                </Button>
                              </div>
                            </div>
                          )}

                          {showProblem ? (
                            <p role="alert" className="mt-3 text-sm text-red-400">
                              {problem}
                            </p>
                          ) : (
                            ticket &&
                            seats > 0 && (
                              <p className="mt-3 text-sm text-muted-foreground">
                                {seats} {seats === 1 ? "seat" : "seats"} ·{" "}
                                {ticket.price === 0 ? "Free" : formatRupees(ticket.price * seats)}
                              </p>
                            )
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seats are checked when you continue. If one you chose has just been taken, we will tell you and
                    nothing is charged.
                  </p>
                </Card>

                <Card className="p-6 gap-4">
                  <h2 className="text-xl font-semibold">Booking summary</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total seats</span>
                      <span className="font-medium">{totalSeats}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total amount</span>
                      <span>{totalSeats === 0 ? "-" : estimatedTotal === 0 ? "Free" : formatRupees(estimatedTotal)}</span>
                    </div>
                  </div>

                  {paid && paymentsOff && (
                    <p role="alert" className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                      Online payment is switched off at the moment, so paid tickets cannot be booked right now.
                    </p>
                  )}
                  {showProblems && overallProblem && (
                    <p role="alert" className="text-sm text-red-400">
                      {overallProblem}
                    </p>
                  )}

                  <Button
                    onClick={proceed}
                    disabled={!selectionValid}
                    className={`w-full ${gradient}`}
                    size="lg"
                  >
                    {!ready || session ? "Review booking" : "Sign in to book"}
                  </Button>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
