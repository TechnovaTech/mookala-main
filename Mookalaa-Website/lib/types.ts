// Event types and data structures
export interface Event {
  id: string
  title: string
  description: string
  image: string
  hoverVideo?: string
  date: Date
  time: string
  endDate?: Date
  location: string
  city: string
  coordinates: { lat: number; lng: number }
  category: string
  price: number
  isFree: boolean
  isOnline: boolean
  organizer: Organizer
  attendees: number
  tags: string[]
  featured?: boolean
  rating?: number
}

export interface Organizer {
  id: string
  name: string
  image: string
  verified: boolean
  events: number
  followers: number
}

export interface FilterOptions {
  location: string
  category: string
  date: string
  priceRange: [number, number]
  type: "all" | "free" | "paid" | "online" | "offline"
}

export interface EventCity {
  name: string
  country: string
  eventCount: number
  image: string
  coordinates: { lat: number; lng: number }
}
