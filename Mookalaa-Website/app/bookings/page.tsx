"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Calendar, MapPin, Printer, QrCode as QrIcon, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/back-button"
import { QrCode } from "@/components/qr-code"
import {
  cancelBooking,
  fetchMyBookings,
  fetchProfile,
  formatRupees,
  previewCancellation,
  type CancellationPreview,
} from "@/lib/api"
import { ApiError, errorMessage } from "@/lib/api-client"
import { useAuth } from "@/lib/auth"
import { loginPath } from "@/lib/navigation"
import { bookingQrPayload } from "@/lib/qr"
import { bookingStatusLabel, paymentStatusLabel, printTicket, seatLabel } from "@/lib/ticket"
import { showToast } from "@/lib/toast"
import type { Booking } from "@/lib/types"

const PAGE_BACKGROUND = { background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)" }
const PANEL = { background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }

const STATUS_COLOURS: Record<string, string> = {
  confirmed: "bg-green-600",
  attended: "bg-blue-600",
  cancelled: "bg-red-600",
  pending_payment: "bg-amber-600",
  expired: "bg-gray-600",
}

function cancelErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "ALREADY_USED") return "This ticket has already been used at the gate, so it cannot be cancelled."
    if (error.code === "EVENT_STARTED") return "The event has already started, so this booking cannot be cancelled."
    if (error.code === "EXPIRED") return "This booking has expired and no longer holds any seats."
    if (error.status === 404) return "This booking could not be found on your account."
    return error.message
  }
  return "The booking could not be cancelled. Please try again."
}

interface CancelState {
  bookingId: string
  loading: boolean
  preview: CancellationPreview | null
  reason: string
  error: string
  submitting: boolean
}

export default function BookingsPage() {
  const router = useRouter()
  const { ready, phone } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [holderName, setHolderName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [qrFor, setQrFor] = useState<string | null>(null)
  const [cancel, setCancel] = useState<CancelState | null>(null)

  const load = useCallback(async () => {
    if (!phone) return
    setLoading(true)
    setError("")
    try {
      setBookings(await fetchMyBookings(phone))
    } catch (err) {
      setBookings([])
      setError(errorMessage(err, "Your bookings could not be loaded."))
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => {
    if (!ready) return
    if (!phone) {
      setLoading(false)
      return
    }
    load()
    // The name is printed on the ticket; without it the ticket shows the phone only.
    fetchProfile(phone)
      .then((profile) => setHolderName(profile.name))
      .catch(() => setHolderName(""))
  }, [ready, phone, load])

  const handlePrint = (booking: Booking) => {
    if (!phone) return
    if (printTicket(booking, { name: holderName, phone })) {
      showToast("Your ticket opened in a new window. Choose Save as PDF there to keep a copy.", "success")
    } else {
      showToast("Your browser blocked the ticket window. Allow pop-ups for this site and try again.", "error")
    }
  }

  const startCancel = async (booking: Booking) => {
    if (!phone) return
    setCancel({ bookingId: booking._id, loading: true, preview: null, reason: "", error: "", submitting: false })
    try {
      const preview = await previewCancellation(booking._id, phone)
      setCancel((state) => (state?.bookingId === booking._id ? { ...state, loading: false, preview } : state))
    } catch (err) {
      setCancel((state) =>
        state?.bookingId === booking._id ? { ...state, loading: false, error: cancelErrorMessage(err) } : state,
      )
    }
  }

  const confirmCancel = async () => {
    if (!cancel || !phone || cancel.submitting) return
    const reason = cancel.reason.trim()
    if (!reason) {
      setCancel({ ...cancel, error: "Please tell us why you are cancelling." })
      return
    }
    setCancel({ ...cancel, submitting: true, error: "" })
    try {
      const message = await cancelBooking(cancel.bookingId, phone, reason)
      setCancel(null)
      setQrFor(null)
      showToast(message, "success")
      await load()
    } catch (err) {
      setCancel((state) => (state ? { ...state, submitting: false, error: cancelErrorMessage(err) } : state))
    }
  }

  if (!ready || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={PAGE_BACKGROUND}>
        <p className="text-blue-200" role="status">
          Loading bookings...
        </p>
      </div>
    )
  }

  if (!phone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={PAGE_BACKGROUND}>
        <div className="text-center bg-white rounded-3xl p-10 shadow-2xl">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Please sign in</h1>
          <p className="text-gray-600 mb-8 text-lg">Sign in to see your bookings and tickets.</p>
          <Button onClick={() => router.push(loginPath("/bookings"))} size="lg">
            Sign in
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={PAGE_BACKGROUND}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <BackButton variant="onDark" fallbackHref="/profile" className="mb-6" />
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">My Bookings</h1>
        <p className="text-blue-200 mb-10">Your tickets, their status and their QR codes</p>

        {error && (
          <div className="text-center bg-white rounded-2xl p-8">
            <p className="text-gray-700 mb-4" role="alert">
              {error}
            </p>
            <Button onClick={load}>Try again</Button>
          </div>
        )}

        {!error && bookings.length === 0 && (
          <div className="text-center bg-white rounded-2xl p-10">
            <h2 className="text-2xl font-bold mb-3 text-gray-900">No bookings yet</h2>
            <p className="text-gray-600 mb-6">You have not booked any events with this phone number.</p>
            <Button asChild>
              <Link href="/events">Browse events</Link>
            </Button>
          </div>
        )}

        <div className="space-y-8">
          {bookings.map((booking) => {
            const usable = booking.status === "confirmed" || booking.status === "attended"
            const canCancel = booking.status === "confirmed" && !booking.checkedIn
            const cancelling = cancel?.bookingId === booking._id ? cancel : null
            return (
              <article
                key={booking._id}
                data-booking-id={booking._id}
                className="rounded-2xl shadow-2xl overflow-hidden border border-blue-800/30"
                style={PANEL}
              >
                <div className="text-white p-6" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold mb-3 break-words">{booking.eventTitle || "Event"}</h2>
                      <div className="space-y-2 text-sm text-blue-200">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-blue-300 flex-shrink-0" />
                          <span>
                            {[booking.eventDate, booking.eventTime].filter(Boolean).join(" · ") || "Date to be announced"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={16} className="text-blue-300 flex-shrink-0" />
                          <span>{booking.venue || "Venue to be announced"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        data-testid="booking-status"
                        className={`${STATUS_COLOURS[booking.status] || "bg-gray-600"} px-3 py-1 rounded-full text-xs font-bold uppercase`}
                      >
                        {bookingStatusLabel(booking)}
                      </span>
                      <span data-testid="payment-status" className="text-xs text-blue-200">
                        {paymentStatusLabel(booking)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <ul className="space-y-3 mb-6">
                    {booking.tickets.map((ticket, index) => (
                      <li
                        key={index}
                        className="flex justify-between items-center gap-4 py-3 px-4 rounded-lg border border-blue-700/30"
                        style={{ background: "rgba(30, 41, 59, 0.3)" }}
                      >
                        <span className="text-sm font-medium text-blue-100">
                          {ticket.category}
                          {ticket.block ? ` · Block ${ticket.block}` : ""} · {seatLabel(ticket)}
                        </span>
                        <span className="font-bold text-white">
                          {ticket.totalPrice === 0 ? "Free" : formatRupees(ticket.totalPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap justify-between items-end gap-4 mb-6 pt-4 border-t border-blue-700/30">
                    <div className="min-w-0">
                      <p className="text-sm text-blue-300 mb-1">Booking ID</p>
                      <p className="font-mono text-sm text-white break-all">{booking._id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-blue-300 mb-1">
                        {booking.totalSeats} {booking.totalSeats === 1 ? "seat" : "seats"}
                      </p>
                      <p className="text-2xl font-bold text-white">
                        {booking.totalPrice === 0 ? "Free" : formatRupees(booking.totalPrice)}
                      </p>
                    </div>
                  </div>

                  {booking.status === "cancelled" && (
                    <p className="text-sm text-blue-200">
                      This booking was cancelled and its ticket is no longer valid.
                      {booking.paymentStatus === "refund_requested" && " A refund has been requested and is awaiting approval."}
                      {booking.paymentStatus === "refunded" && " The refund has been paid."}
                    </p>
                  )}
                  {booking.status === "attended" && (
                    <p className="text-sm text-blue-200 mb-4">This ticket was scanned at the gate.</p>
                  )}

                  {usable && (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => handlePrint(booking)}
                        className="flex-1 min-w-[150px] text-white"
                        style={{ background: "linear-gradient(135deg, #475569 0%, #64748b 100%)" }}
                      >
                        <Printer size={16} className="mr-2" />
                        Print / save ticket
                      </Button>
                      <Button
                        onClick={() => setQrFor(qrFor === booking._id ? null : booking._id)}
                        aria-expanded={qrFor === booking._id}
                        className="flex-1 min-w-[150px] text-white"
                        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}
                      >
                        <QrIcon size={16} className="mr-2" />
                        {qrFor === booking._id ? "Hide QR" : "Show QR"}
                      </Button>
                      {canCancel && !cancelling && (
                        <Button
                          variant="outline"
                          onClick={() => startCancel(booking)}
                          className="flex-1 min-w-[150px] bg-transparent border-red-400/60 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                        >
                          <XCircle size={16} className="mr-2" />
                          Cancel booking
                        </Button>
                      )}
                    </div>
                  )}

                  {qrFor === booking._id && usable && (
                    <div className="mt-6 pt-6 border-t border-blue-700/30 text-center" data-testid="booking-qr">
                      <div className="bg-white p-3 rounded-xl inline-block mb-3">
                        <QrCode value={bookingQrPayload(booking._id)} size={200} label={`QR code for booking ${booking._id}`} />
                      </div>
                      <p className="text-xs text-blue-300">Show this QR code at the venue for entry</p>
                    </div>
                  )}

                  {cancelling && (
                    <div
                      className="mt-6 pt-6 border-t border-blue-700/30 text-blue-100"
                      role="group"
                      aria-label="Cancel this booking"
                      data-testid="cancel-panel"
                    >
                      <h3 className="text-lg font-bold text-white mb-3">Cancel this booking?</h3>
                      {cancelling.loading && <p role="status">Checking what would be refunded...</p>}

                      {cancelling.preview && (
                        <>
                          <p className="mb-2">{cancelling.preview.explanation}</p>
                          {cancelling.preview.amountPaid > 0 && (
                            <p className="mb-4 font-semibold text-white">
                              Refund: {formatRupees(cancelling.preview.refundAmount)} of{" "}
                              {formatRupees(cancelling.preview.amountPaid)} paid
                              {cancelling.preview.deductionAmount > 0
                                ? ` (${formatRupees(cancelling.preview.deductionAmount)} deducted)`
                                : ""}
                            </p>
                          )}
                          {cancelling.preview.cancellable ? (
                            <>
                              <label htmlFor={`reason-${booking._id}`} className="block text-sm font-medium mb-2">
                                Reason for cancelling (required)
                              </label>
                              <textarea
                                id={`reason-${booking._id}`}
                                rows={3}
                                maxLength={500}
                                value={cancelling.reason}
                                onChange={(e) => setCancel({ ...cancelling, reason: e.target.value, error: "" })}
                                className="w-full rounded-lg border border-blue-700/50 bg-slate-900/60 text-white px-3 py-2 text-sm mb-3"
                              />
                            </>
                          ) : (
                            <p className="mb-3" role="alert">
                              This booking can no longer be cancelled.
                            </p>
                          )}
                        </>
                      )}

                      {cancelling.error && (
                        <p role="alert" className="mb-3 text-sm text-red-300">
                          {cancelling.error}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setCancel(null)}
                          disabled={cancelling.submitting}
                          className="bg-transparent text-white border-blue-400/50 hover:bg-white/10 hover:text-white"
                        >
                          Keep my booking
                        </Button>
                        {cancelling.preview?.cancellable && (
                          <Button
                            onClick={confirmCancel}
                            disabled={cancelling.submitting || !cancelling.reason.trim()}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            {cancelling.submitting ? "Cancelling..." : "Cancel booking"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
