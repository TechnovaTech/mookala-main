import { api } from "./api-client"
import { resolveImage } from "./config"
import type {
  Booking,
  BookingLine,
  Category,
  Event,
  EventPerson,
  EventTicket,
  PaymentConfig,
  PlatformInfo,
  RefundRule,
  UserProfile,
} from "./types"

/* ------------------------------------------------------------------ */
/* Reading what the backend stores                                     */
/* ------------------------------------------------------------------ */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** An amount stored as a number or as text such as "₹1,500.00". */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0
  const cleaned = value.replace(/[^0-9.\-]/g, "")
  const firstDot = cleaned.indexOf(".")
  const normalised =
    firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
  const parsed = parseFloat(normalised)
  return Number.isFinite(parsed) ? parsed : 0
}

/** A count stored as 120, "120" or "120 seats"; 0 when it cannot be read. */
function parseCount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  if (typeof value === "string") {
    const parsed = parseInt(value.replace(/[^0-9\-]/g, ""), 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return 0
}

/** "2026-12-05", "05/12/2026" or an ISO timestamp, as a local calendar day. */
export function parseEventDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = text(value)
  if (!raw) return null
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return new Date(+match[1], +match[2] - 1, +match[3])
  match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (match) return new Date(+match[3], +match[2] - 1, +match[1])
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatRupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return `₹${rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function toTicket(raw: any): EventTicket {
  const quantity = parseCount(raw?.quantity)
  const sold = parseCount(raw?.sold)
  const start = parseCount(raw?.startSeat)
  const end = parseCount(raw?.endSeat)
  const seated = start > 0 && end > 0
  return {
    name: text(raw?.name) || "Ticket",
    blockName: text(raw?.blockName),
    priceType: text(raw?.priceType),
    price: Math.max(0, parseAmount(raw?.price)),
    quantity,
    sold,
    remaining: Math.max(0, quantity - sold),
    startSeat: seated ? start : null,
    endSeat: seated ? end : null,
    seated,
  }
}

function toPerson(raw: any): EventPerson | null {
  if (!raw || typeof raw !== "object") return null
  const name = text(raw.name)
  if (!name) return null
  return {
    id: text(raw._id) || String(raw._id ?? ""),
    name,
    image: resolveImage(raw.profileImage),
    genre: text(raw.genre),
    bio: text(raw.bio),
    verified: raw.kycStatus === "approved",
  }
}

function toTags(raw: any): string[] {
  const names = (list: unknown): string[] =>
    Array.isArray(list)
      ? list.map((entry) => text(typeof entry === "string" ? entry : entry?.name)).filter(Boolean)
      : []
  const languages = names(raw.languages)
  if (languages.length > 0) return languages
  return names(raw.subCategories)
}

export function transformEvent(raw: any): Event {
  const tickets: EventTicket[] = Array.isArray(raw?.tickets) ? raw.tickets.map(toTicket) : []
  const prices = tickets.map((ticket) => ticket.price)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0

  let priceDisplay = "Tickets not on sale"
  if (tickets.length > 0) {
    if (maxPrice === 0) priceDisplay = "Free"
    else if (minPrice === maxPrice) priceDisplay = formatRupees(minPrice)
    else priceDisplay = `${minPrice === 0 ? "Free" : formatRupees(minPrice)} – ${formatRupees(maxPrice)}`
  }

  const venue = raw?.venue && typeof raw.venue === "object" ? raw.venue : null
  const location = raw?.location && typeof raw.location === "object" ? raw.location : {}
  const venueText = typeof raw?.venue === "string" && !/^[0-9a-f]{24}$/i.test(raw.venue) ? raw.venue.trim() : ""

  return {
    id: String(raw?._id ?? raw?.id ?? ""),
    title: text(raw?.name) || "Untitled event",
    description: text(raw?.description),
    image:
      resolveImage(raw?.media?.bannerImage) ||
      resolveImage(raw?.bannerImage) ||
      resolveImage(raw?.image) ||
      resolveImage(raw?.imageUrl),
    date: parseEventDate(raw?.startDate ?? raw?.date),
    endDate: parseEventDate(raw?.endDate),
    time: text(raw?.startTime) || text(raw?.time),
    endTime: text(raw?.endTime),
    venueName: text(location.name) || text(venue?.name) || venueText,
    address: text(location.address) || text(venue?.location?.address),
    city: text(location.city) || text(venue?.location?.city),
    state: text(location.state) || text(venue?.location?.state),
    category: text(raw?.category).replace(/^categories\./i, "") || "General",
    minPrice,
    maxPrice,
    priceDisplay,
    isFree: tickets.length > 0 && maxPrice === 0,
    hasTickets: tickets.length > 0,
    isOnline: raw?.locationType === "online",
    organizer: toPerson(raw?.organizer) || toPerson(raw?.artist),
    artists: Array.isArray(raw?.artistDetails)
      ? (raw.artistDetails.map(toPerson).filter(Boolean) as EventPerson[])
      : [],
    tags: toTags(raw ?? {}),
    tickets,
    capacity: tickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
    sold: tickets.reduce((sum, ticket) => sum + ticket.sold, 0),
    terms: text(raw?.terms),
    createdAt: parseEventDate(raw?.createdAt),
  }
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

/** Approved events. Throws ApiError when the list cannot be loaded. */
export async function fetchApprovedEvents(): Promise<Event[]> {
  const data = await api<{ events?: any[] }>("/events/approved")
  const events: Event[] = []
  for (const raw of Array.isArray(data.events) ? data.events : []) {
    try {
      const event = transformEvent(raw)
      if (event.id) events.push(event)
    } catch {
      // One unreadable event must not hide all the others.
    }
  }
  return events
}

/** One event, or null when the backend says it does not exist. */
export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    const data = await api<{ event?: any }>(`/events/${encodeURIComponent(id)}`)
    if (!data.event || data.event.status !== "approved") return null
    return transformEvent(data.event)
  } catch (error: any) {
    if (error?.status === 404 || error?.status === 400) return null
    throw error
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await api<any>("/categories")
  if (!Array.isArray(data)) return []
  return data
    .map((raw: any) => ({ id: String(raw?._id ?? ""), name: text(raw?.name), image: resolveImage(raw?.image) }))
    .filter((category: Category) => category.name)
}

export interface VenueInfo {
  name: string
  address: string
  city: string
  state: string
  seatingLayoutImage: string | null
}

export async function fetchVenueByName(name: string): Promise<VenueInfo | null> {
  if (!name) return null
  const data = await api<{ venues?: any[] }>(`/venues?name=${encodeURIComponent(name)}`)
  const venue = Array.isArray(data.venues) ? data.venues[0] : null
  if (!venue) return null
  return {
    name: text(venue.name),
    address: text(venue.location?.address),
    city: text(venue.location?.city),
    state: text(venue.location?.state),
    seatingLayoutImage: resolveImage(venue.seatingLayoutImage),
  }
}

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export async function fetchPlatform(): Promise<PlatformInfo> {
  const data = await api<any>("/public/platform")
  return {
    name: text(data.name) || "Mookalaa",
    support: {
      email: text(data.support?.email),
      phone: text(data.support?.phone),
      address: text(data.support?.address),
    },
    policyLinks: data.policyLinks && typeof data.policyLinks === "object" ? data.policyLinks : {},
    maintenance: {
      active: data.maintenance?.active === true,
      message: text(data.maintenance?.message),
      endsAt: data.maintenance?.endsAt || null,
      upcomingWindow: data.maintenance?.upcomingWindow || null,
    },
  }
}

export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  const data = await api<any>("/payment/config")
  const rules: RefundRule[] = Array.isArray(data.refundPolicy)
    ? data.refundPolicy.map((rule: any) => ({
        name: text(rule?.name),
        minHoursBefore: Number(rule?.minHoursBefore) || 0,
        maxHoursBefore: rule?.maxHoursBefore == null ? null : Number(rule.maxHoursBefore),
        refundPercent: Number(rule?.refundPercent) || 0,
        deductionFlat: Number(rule?.deductionFlat) || 0,
      }))
    : []
  return {
    enabled: data.enabled === true,
    holdMinutes: Number(data.holdMinutes) || 15,
    refundPolicy: rules,
  }
}

export interface PublishedPolicy {
  title: string
  version: string
  effectiveDate: string | null
  body: string
}

/** The published policy of a type, or null when none is published. */
export async function fetchPolicy(type: "terms" | "privacy" | "refund" | "cancellation"): Promise<PublishedPolicy | null> {
  try {
    const data = await api<{ policy?: any }>(`/public/policies/${type}`)
    if (!data.policy) return null
    return {
      title: text(data.policy.title),
      version: data.policy.version == null ? "" : String(data.policy.version),
      effectiveDate: data.policy.effectiveDate || null,
      body: typeof data.policy.body === "string" ? data.policy.body : "",
    }
  } catch (error: any) {
    if (error?.status === 404) return null
    throw error
  }
}

/* ------------------------------------------------------------------ */
/* Sign-in and profile                                                 */
/* ------------------------------------------------------------------ */

export interface OtpSent {
  message: string
  devMode: boolean
}

export async function sendOtp(phone: string): Promise<OtpSent> {
  const data = await api<any>("/public/otp/send", { body: { phone } })
  return { message: text(data.message), devMode: data.devMode === true }
}

export interface SignedIn {
  token: string
  phone: string
  profileComplete: boolean
}

/**
 * Checks the code, then makes sure the customer record exists (the OTP route
 * itself creates no account). The token is the proof of the phone for the
 * second call, so no second code is needed.
 */
export async function verifyOtp(phone: string, otp: string): Promise<SignedIn> {
  const verified = await api<any>("/public/otp/verify", { body: { phone, otp, role: "user" } })
  const token = text(verified.token)
  const verifiedPhone = text(verified.phone) || phone
  if (!token) throw new Error("The server did not return a session")
  const account = await api<any>("/user/verify-otp", { body: { phone: verifiedPhone }, token })
  return { token, phone: verifiedPhone, profileComplete: account.isProfileComplete === true }
}

export async function fetchProfile(phone: string): Promise<UserProfile> {
  const data = await api<{ user: any }>(`/user/profile?phone=${encodeURIComponent(phone)}`)
  const user = data.user || {}
  return {
    phone: text(user.phone) || phone,
    name: text(user.name),
    email: text(user.email),
    city: text(user.city),
    profileImage: resolveImage(user.profileImage),
    status: text(user.status),
    createdAt: user.createdAt || null,
  }
}

export async function saveProfile(input: {
  phone: string
  name: string
  email: string
  city: string
  /** Raw base64 without the `data:` prefix: the mobile app reads it that way. */
  profileImageBase64?: string
}): Promise<void> {
  await api("/user/profile", {
    body: {
      phone: input.phone,
      name: input.name,
      email: input.email,
      city: input.city,
      ...(input.profileImageBase64 ? { profileImage: input.profileImageBase64 } : {}),
    },
  })
}

/* ------------------------------------------------------------------ */
/* Booking and payment                                                 */
/* ------------------------------------------------------------------ */

export interface TicketRequest {
  category: string
  block: string
  fromSeat?: number
  toSeat?: number
  quantity: number
}

function toLine(raw: any): BookingLine {
  const seat = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
  return {
    category: text(raw?.category),
    block: text(raw?.block),
    fromSeat: seat(raw?.fromSeat),
    toSeat: seat(raw?.toSeat),
    quantity: Number(raw?.quantity) || 0,
    price: parseAmount(raw?.price),
    totalPrice: parseAmount(raw?.totalPrice),
  }
}

export function toBooking(raw: any): Booking {
  return {
    _id: String(raw?._id ?? ""),
    userPhone: text(raw?.userPhone),
    eventId: text(raw?.eventId),
    eventTitle: text(raw?.eventTitle),
    eventDate: text(raw?.eventDate),
    eventTime: text(raw?.eventTime),
    venue: text(raw?.venue),
    tickets: Array.isArray(raw?.tickets) ? raw.tickets.map(toLine) : [],
    totalSeats: Number(raw?.totalSeats) || 0,
    totalPrice: parseAmount(raw?.totalPrice),
    status: text(raw?.status),
    paymentStatus: text(raw?.paymentStatus),
    amountPaid: parseAmount(raw?.amountPaid),
    checkedIn: raw?.checkedIn === true,
    bookingDate: text(raw?.bookingDate),
    expiresAt: raw?.expiresAt ? String(raw.expiresAt) : undefined,
  }
}

export type OrderResult =
  | { free: true; booking: Booking }
  | {
      free: false
      bookingId: string
      orderId: string
      amount: number
      currency: string
      keyId: string
      expiresAt: string
      totalPrice: number
      totalSeats: number
      tickets: BookingLine[]
    }

/** Step one of every booking. The server prices it; nothing about money is sent. */
export async function createOrder(userPhone: string, eventId: string, tickets: TicketRequest[]): Promise<OrderResult> {
  const data = await api<any>("/payment/order", { body: { userPhone, eventId, tickets } })
  if (data.free === true) return { free: true, booking: toBooking(data.booking) }
  return {
    free: false,
    bookingId: text(data.bookingId),
    orderId: text(data.orderId),
    amount: Number(data.amount) || 0,
    currency: text(data.currency) || "INR",
    keyId: text(data.keyId),
    expiresAt: String(data.expiresAt || ""),
    totalPrice: parseAmount(data.totalPrice),
    totalSeats: Number(data.totalSeats) || 0,
    tickets: Array.isArray(data.tickets) ? data.tickets.map(toLine) : [],
  }
}

export interface CheckoutResult {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type VerifyResult = { confirmed: true; booking: Booking } | { confirmed: false; message: string }

/** Idempotent on the server: safe to call again while a payment is processing. */
export async function verifyPayment(bookingId: string, result: CheckoutResult): Promise<VerifyResult> {
  const data = await api<any>("/payment/verify", { body: { bookingId, ...result } })
  if (data.confirmed === true) return { confirmed: true, booking: toBooking(data.booking) }
  return { confirmed: false, message: text(data.message) || "Your payment is being processed." }
}

export async function fetchMyBookings(userPhone: string): Promise<Booking[]> {
  const data = await api<{ bookings?: any[] }>(`/bookings?userPhone=${encodeURIComponent(userPhone)}`)
  return (Array.isArray(data.bookings) ? data.bookings : []).map(toBooking).filter((booking) => booking._id)
}

export interface CancellationPreview {
  cancellable: boolean
  status: string
  eligible: boolean
  refundAmount: number
  deductionAmount: number
  amountPaid: number
  explanation: string
}

export async function previewCancellation(bookingId: string, userPhone: string): Promise<CancellationPreview> {
  const data = await api<any>("/bookings/cancel", { body: { bookingId, userPhone, preview: true } })
  const quote = data.quote || {}
  return {
    cancellable: data.cancellable === true,
    status: text(data.status),
    eligible: quote.eligible === true,
    refundAmount: parseAmount(quote.refundAmount),
    deductionAmount: parseAmount(quote.deductionAmount),
    amountPaid: parseAmount(quote.amountPaid),
    explanation: text(quote.explanation),
  }
}

export async function cancelBooking(bookingId: string, userPhone: string, reason: string): Promise<string> {
  const data = await api<any>("/bookings/cancel", { body: { bookingId, userPhone, reason } })
  return text(data.message) || "Booking cancelled."
}
