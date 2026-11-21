/** One ticket category of an event, exactly as the backend prices and counts it. */
export interface EventTicket {
  name: string
  blockName: string
  priceType: string
  price: number
  quantity: number
  sold: number
  remaining: number
  /** Numbered seats: both are set. General admission: both are null. */
  startSeat: number | null
  endSeat: number | null
  seated: boolean
}

export interface EventPerson {
  id: string
  name: string
  image: string | null
  genre: string
  bio: string
  verified: boolean
}

export interface Event {
  id: string
  title: string
  description: string
  image: string | null
  /** Start day in local time; null when the organiser has not set a readable date. */
  date: Date | null
  endDate: Date | null
  time: string
  endTime: string
  venueName: string
  address: string
  city: string
  state: string
  category: string
  minPrice: number
  maxPrice: number
  priceDisplay: string
  isFree: boolean
  hasTickets: boolean
  isOnline: boolean
  organizer: EventPerson | null
  artists: EventPerson[]
  tags: string[]
  tickets: EventTicket[]
  capacity: number
  sold: number
  terms: string
  createdAt: Date | null
}

export interface Category {
  id: string
  name: string
  image: string | null
}

export type EventTypeFilter = "all" | "free" | "paid" | "online" | "offline"

export interface FilterOptions {
  search: string
  location: string
  category: string
  /** YYYY-MM-DD, or "" for any date. */
  date: string
  minPrice: number | null
  maxPrice: number | null
  type: EventTypeFilter
  includePast: boolean
}

export type SortOption = "soonest" | "latest" | "price-low" | "price-high" | "newest"

export interface RefundRule {
  name: string
  minHoursBefore: number
  maxHoursBefore: number | null
  refundPercent: number
  deductionFlat: number
}

export interface PaymentConfig {
  enabled: boolean
  holdMinutes: number
  refundPolicy: RefundRule[]
}

export interface PlatformInfo {
  name: string
  support: { email: string; phone: string; address: string }
  policyLinks: Record<string, string>
  maintenance: {
    active: boolean
    message: string
    endsAt: string | null
    upcomingWindow: { startsAt: string; endsAt: string; message: string } | null
  }
}

export interface BookingLine {
  category: string
  block: string
  fromSeat: number | null
  toSeat: number | null
  quantity: number
  price: number
  totalPrice: number
}

export interface Booking {
  _id: string
  userPhone: string
  eventId: string
  eventTitle: string
  eventDate: string
  eventTime: string
  venue: string
  tickets: BookingLine[]
  totalSeats: number
  totalPrice: number
  status: string
  paymentStatus: string
  amountPaid?: number
  checkedIn?: boolean
  bookingDate?: string
  expiresAt?: string
}

export interface UserProfile {
  phone: string
  name: string
  email: string
  city: string
  profileImage: string | null
  status: string
  createdAt: string | null
}
