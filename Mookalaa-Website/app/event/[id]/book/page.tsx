"use client"

import { useState, use } from "react"
import { mockEvents } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, ChevronDown } from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/lib/language-context"

interface BookingPageProps {
  params: Promise<{ id: string }>
}



const ticketTypes = [
  { id: 1, name: "General", price: 500, available: 50 },
  { id: 2, name: "VIP", price: 1500, available: 20 },
  { id: 3, name: "Premium", price: 2500, available: 10 },
]

export default function BookingPage({ params }: BookingPageProps) {
  const { id } = use(params)
  const event = mockEvents.find((e) => e.id === id)
  const { t } = useLanguage()
  
  const ticketTypes = [
    { id: 1, name: t('booking.general'), price: 500, available: 50 },
    { id: 2, name: t('booking.vip'), price: 1500, available: 20 },
    { id: 3, name: t('booking.premium'), price: 2500, available: 10 },
  ]
  
  const [step, setStep] = useState(1)
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [tickets, setTickets] = useState<{ [key: number]: number }>({})
  const [expandedVenue, setExpandedVenue] = useState<number | null>(null)

  if (!event) return null

  const venues = [
    { 
      id: 1,
      city: event.location.split(',')[0],
      name: event.location, 
      address: event.location,
      dates: [new Date(event.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })],
      status: "Fast Filling"
    },
  ]

  const times = [event.time]

  const totalAmount = Object.entries(tickets).reduce((sum, [typeId, count]) => {
    const ticket = ticketTypes.find(t => t.id === Number(typeId))
    return sum + (ticket?.price || 0) * count
  }, 0)

  const totalTickets = Object.values(tickets).reduce((sum, count) => sum + count, 0)

  const handleVenueSelect = (venueName: string, venueId: number) => {
    setSelectedVenue(venueName)
    setExpandedVenue(expandedVenue === venueId ? null : venueId)
  }

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    setStep(2)
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time)
    setStep(3)
  }

  const updateTicketCount = (typeId: number, increment: boolean) => {
    setTickets(prev => {
      const current = prev[typeId] || 0
      const newCount = increment ? current + 1 : Math.max(0, current - 1)
      if (newCount === 0) {
        const { [typeId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [typeId]: newCount }
    })
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-center gap-4 relative max-w-3xl mx-auto">
            <Link href={`/event/${id}`} className="absolute left-0 p-1">
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </Link>
            <h1 className="text-lg sm:text-xl font-bold text-center px-8 truncate">{t(`event.${event.id}.title`) || event.title}</h1>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-muted/30 border-b">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {/* Step 1 - Venue */}
            <div className="flex flex-col items-center gap-1 sm:gap-2 flex-1">
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${step >= 1 ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'} transition-all duration-300`}>
                1
              </div>
              <span className={`text-xs sm:text-sm font-medium text-center ${step >= 1 ? 'text-orange-500' : 'text-gray-400'} transition-colors duration-300`}>
                {t('booking.venue')}
              </span>
            </div>
            
            {/* Connector Line 1 */}
            <div className="flex-1 h-0.5 bg-gray-300 mx-1 sm:mx-3 relative">
              <div className={`h-full bg-orange-500 transition-all duration-500 ${step >= 2 ? 'w-full' : 'w-0'}`}></div>
            </div>
            
            {/* Step 2 - Date & Time */}
            <div className="flex flex-col items-center gap-1 sm:gap-2 flex-1">
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${step >= 2 ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'} transition-all duration-300`}>
                2
              </div>
              <span className={`text-xs sm:text-sm font-medium text-center ${step >= 2 ? 'text-orange-500' : 'text-gray-400'} transition-colors duration-300`}>
                <span className="hidden sm:inline">{t('booking.dateTime').split(' ')[0]} &</span> {t('booking.dateTime').split(' ').slice(-1)}
              </span>
            </div>
            
            {/* Connector Line 2 */}
            <div className="flex-1 h-0.5 bg-gray-300 mx-1 sm:mx-3 relative">
              <div className={`h-full bg-orange-500 transition-all duration-500 ${step >= 3 ? 'w-full' : 'w-0'}`}></div>
            </div>
            
            {/* Step 3 - Ticket */}
            <div className="flex flex-col items-center gap-1 sm:gap-2 flex-1">
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${step >= 3 ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'} transition-all duration-300`}>
                3
              </div>
              <span className={`text-xs sm:text-sm font-medium text-center ${step >= 3 ? 'text-orange-500' : 'text-gray-400'} transition-colors duration-300`}>
                {t('booking.ticket')}
              </span>
            </div>
            
            {/* Connector Line 3 */}
            <div className="flex-1 h-0.5 bg-gray-300 mx-1 sm:mx-3 relative">
              <div className={`h-full bg-orange-500 transition-all duration-500 ${step >= 4 ? 'w-full' : 'w-0'}`}></div>
            </div>
            
            {/* Step 4 - Proceed to Pay */}
            <div className="flex flex-col items-center gap-1 sm:gap-2 flex-1">
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${step >= 4 ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'} transition-all duration-300`}>
                4
              </div>
              <span className={`text-xs sm:text-sm font-medium text-center ${step >= 4 ? 'text-orange-500' : 'text-gray-400'} transition-colors duration-300`}>
                <span className="hidden sm:inline">{t('booking.proceedToPay').split(' ')[0]} {t('booking.proceedToPay').split(' ')[1]}</span>
                <span className="sm:hidden">{t('booking.proceedToPay').split(' ').slice(-1)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Step 1: Select Venue */}
        {step === 1 && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('booking.selectVenue')}</h2>
            <div className="space-y-3 sm:space-y-4">
              {venues.map((venue) => (
                <Card key={venue.id} className="overflow-hidden">
                  <button
                    onClick={() => handleVenueSelect(venue.name, venue.id)}
                    className="w-full p-4 sm:p-6 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-base sm:text-lg font-semibold">{venue.city}</h3>
                      <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform flex-shrink-0 ${expandedVenue === venue.id ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  
                  {expandedVenue === venue.id && (
                    <button
                      onClick={() => handleDateSelect(venue.dates[0])}
                      className="w-full px-4 sm:px-6 pb-4 sm:pb-6 pt-2 sm:pt-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <h4 className="text-base sm:text-lg font-semibold mb-2">{venue.name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{venue.dates[0]} | <span className="text-orange-500 font-medium">{t('booking.fastFilling')}</span></p>
                      <div className="border-t border-border my-3"></div>
                      <p className="text-sm text-muted-foreground mb-2 break-words">{venue.address}</p>
                      <span className="text-sm text-red-500 font-medium inline-block cursor-pointer">{t('booking.viewMaps')}</span>
                    </button>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Time */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto">
            <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
              {/* Status Indicators */}
              <div className="flex items-center gap-3 sm:gap-6 mb-4 sm:mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-xs sm:text-sm">{t('booking.available')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-xs sm:text-sm">{t('booking.fastFilling')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <span className="text-xs sm:text-sm">{t('booking.soldOut')}</span>
                </div>
              </div>

              {/* Select Date */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3">{t('booking.selectDate')}</h3>
                <Button
                  variant="outline"
                  className="bg-orange-400 hover:bg-orange-500 text-black border-none h-auto py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base w-full sm:w-auto rounded-lg font-medium shadow-md transition-all duration-200 active:scale-95"
                >
                  {selectedDate}
                </Button>
              </div>

              {/* Select Time */}
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3">{t('booking.selectTime')}</h3>
                <Button
                  variant="outline"
                  className="bg-orange-400 hover:bg-orange-500 text-black border-none h-auto py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base w-full sm:w-auto rounded-lg font-medium shadow-md transition-all duration-200 active:scale-95"
                >
                  {event.time}
                </Button>
              </div>
            </Card>

            {/* Proceed Button */}
            <Button
              onClick={() => setStep(3)}
              className="w-full h-12 sm:h-14 text-base sm:text-lg bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold shadow-lg transition-all duration-200 active:scale-95"
            >
              Proceed
            </Button>
          </div>
        )}

        {/* Step 3: Select Tickets */}
        {step === 3 && (
          <div className="max-w-3xl mx-auto pb-24 sm:pb-32">
            <h2 className="text-xl sm:text-2xl font-bold mb-2">{t('booking.selectTickets')}</h2>
            <p className="text-sm text-muted-foreground mb-4 sm:mb-6 break-words">{t(`location.${selectedVenue}`) || selectedVenue} - {selectedDate} - {selectedTime}</p>
            <div className="space-y-3 sm:space-y-4">
              {ticketTypes.map((ticket) => (
                <Card key={ticket.id} className="p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base sm:text-lg">{ticket.name}</h3>
                      <p className="text-sm text-muted-foreground">₹{ticket.price} {t('booking.perTicket')}</p>
                      <p className="text-xs text-muted-foreground">{ticket.available} {t('booking.available')}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateTicketCount(ticket.id, false)}
                        disabled={!tickets[ticket.id]}
                        className="h-8 w-8 p-0"
                      >
                        -
                      </Button>
                      <span className="w-6 sm:w-8 text-center font-semibold text-sm sm:text-base">{tickets[ticket.id] || 0}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateTicketCount(ticket.id, true)}
                        className="h-8 w-8 p-0"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {totalTickets > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t shadow-lg p-3 sm:p-4 z-50">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between gap-3 sm:gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-lg sm:text-2xl font-bold text-orange-500">₹{totalAmount}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">{totalTickets} {t('booking.tickets')}</p>
                    </div>
                    <Button
                      onClick={() => setStep(4)}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-6 sm:px-12 h-12 sm:h-14 text-sm sm:text-base flex-shrink-0 rounded-lg font-semibold shadow-lg transition-all duration-200 active:scale-95"
                    >
                      {t('booking.proceed')}
                    </Button>
                  </div>
                  {/* Safe area for mobile devices */}
                  <div className="h-2 sm:h-0"></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review & Proceed */}
        {step === 4 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 pb-4 sm:pb-8">
            {/* Left Side - Ticket Options */}
            <div className="order-2 lg:order-1">
              <p className="text-sm text-muted-foreground mb-3 sm:mb-4">{t('booking.selectOptions')}</p>
              <Card className="p-4 sm:p-6">
                <div className="flex items-start gap-3 mb-4">
                  <input type="radio" checked readOnly className="mt-1 flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{t('booking.mTicket')}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>🌍</span>
                      <span>{t('booking.savePlanet')}</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-3 sm:p-4 rounded-lg border border-white">
                  <h4 className="font-semibold mb-3 text-white text-sm sm:text-base">{t('booking.mTicketInfo')}</h4>
                  <ol className="space-y-2 text-xs sm:text-sm text-white">
                    <li>{t('booking.mTicketPoint1')}</li>
                    <li>{t('booking.mTicketPoint2')}</li>
                    <li>{t('booking.mTicketPoint3')}</li>
                  </ol>
                </div>
              </Card>
            </div>

            {/* Right Side - Booking Summary */}
            <div className="order-1 lg:order-2">
              <Card className="p-4 sm:p-6 mb-4">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <h3 className="font-semibold text-base sm:text-lg flex-1 min-w-0">{t(`event.${event.id}.title`) || event.title}</h3>
                  <p className="font-bold text-base sm:text-lg flex-shrink-0">₹{totalAmount}.00</p>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{totalTickets} {t('booking.tickets')}</p>
                
                <div className="border-t pt-4 space-y-2 text-sm">
                  <p className="font-medium">{t('booking.dateLabel')}, {selectedDate}, 2025</p>
                  <p>04:00 PM</p>
                  <p className="font-semibold mt-3">{t('booking.venue')}</p>
                  <p className="break-words">{t(`location.${selectedVenue}`) || selectedVenue}</p>
                  <div className="mt-3">
                    {Object.entries(tickets).map(([typeId, count]) => {
                      const ticket = ticketTypes.find(t => t.id === Number(typeId))
                      return ticket ? (
                        <p key={typeId} className="text-xs sm:text-sm">
                          {ticket.name.toUpperCase()}(₹{ticket.price}): {count} ticket(s)
                        </p>
                      ) : null
                    })}
                  </div>
                </div>
              </Card>

              <Card className="p-4 sm:p-6 mb-4">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>{t('booking.subTotal')}</span>
                    <span>₹{totalAmount}.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('booking.bookingFee')}</span>
                    <span>₹{Math.round(totalAmount * 0.095)}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between font-bold text-base">
                    <span>{t('booking.totalAmount')}</span>
                    <span>₹{totalAmount + Math.round(totalAmount * 0.095)}</span>
                  </div>
                </div>
              </Card>

              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">{t('booking.selectState')}</label>
                <select className="w-full p-3 border rounded-lg bg-background text-sm sm:text-base">
                  <option>Gujarat</option>
                  <option>Maharashtra</option>
                  <option>Rajasthan</option>
                </select>
              </div>

              <div className="flex items-start gap-2 mb-4 text-xs sm:text-sm text-muted-foreground">
                <span className="text-blue-500 flex-shrink-0">ⓘ</span>
                <p>{t('booking.consent')}</p>
              </div>

              <Button asChild className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 sm:h-14 text-sm sm:text-base rounded-lg font-semibold shadow-lg transition-all duration-200 active:scale-95">
                <Link href={`/event/${id}/book/payment?amount=${totalAmount}&tickets=${totalTickets}`}>{t('booking.proceedToPay')}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
