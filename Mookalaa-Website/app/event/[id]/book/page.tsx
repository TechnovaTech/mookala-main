"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Calendar, Clock, MapPin, Minus, Plus, X, ZoomIn, ZoomOut, Download, Map } from "lucide-react"
import { fetchEventById } from "@/lib/api"
import Link from "next/link"

interface BookingPageProps {
  params: Promise<{ id: string }>
}

interface TicketSelection {
  category: string | null
  block: string | null
  fromSeat: number
  toSeat: number
  quantity: number
  price: number
}

export default function BookingPage({ params }: BookingPageProps) {
  const { id } = use(params)
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTickets, setSelectedTickets] = useState<TicketSelection[]>([
    { category: null, block: null, fromSeat: 1, toSeat: 1, quantity: 1, price: 0 }
  ])
  const [venueData, setVenueData] = useState<any>(null)
  const [imageScale, setImageScale] = useState(1.0)
  const [razorpayKeyId, setRazorpayKeyId] = useState('')

  useEffect(() => {
    async function loadEvent() {
      const eventData = await fetchEventById(id)
      setEvent(eventData)
      if (eventData) {
        await loadVenueData(eventData.location)
        await fetchPaymentConfig()
      }
      setLoading(false)
    }
    loadEvent()
  }, [id])

  const loadVenueData = async (venueName: string) => {
    if (!venueName) return
    try {
      const response = await fetch(`http://localhost:3000/api/venues?name=${encodeURIComponent(venueName)}`)
      const data = await response.json()
      if (data.success && data.venues?.length > 0) {
        setVenueData(data.venues[0])
      }
    } catch (error) {
      console.error('Error loading venue:', error)
    }
  }

  const fetchPaymentConfig = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/payment/config')
      const data = await response.json()
      if (data.success) {
        setRazorpayKeyId(data.razorpayKeyId || '')
      }
    } catch (error) {
      console.error('Error fetching payment config:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading booking details...</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Event not found</h1>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    )
  }

  const getSeatCategories = () => {
    if (!event.tickets || !Array.isArray(event.tickets)) return []
    
    return event.tickets.map((ticket: any) => ({
      name: ticket.name || 'Ticket',
      price: extractPriceFromTicket(ticket.price),
      blockName: ticket.blockName || 'A',
      priceType: ticket.priceType || 'Normal',
      startSeat: ticket.startSeat || 1,
      endSeat: ticket.endSeat || parseInt(ticket.quantity) || 100,
      seatRange: `${ticket.blockName || 'A'}${ticket.startSeat || 1} to ${ticket.blockName || 'A'}${ticket.endSeat || parseInt(ticket.quantity) || 100}`
    }))
  }

  const extractPriceFromTicket = (price: any): number => {
    if (typeof price === 'number') return price
    if (typeof price === 'string') {
      const cleanPrice = price.replace(/[₹,]/g, '')
      return parseInt(cleanPrice) || 0
    }
    return 0
  }

  const getAvailableBlocksForCategory = (categoryName: string) => {
    const categories = getSeatCategories()
    return categories.filter(cat => cat.name === categoryName)
  }

  const getBlockMinSeat = (categoryName: string, blockName: string) => {
    const blocks = getAvailableBlocksForCategory(categoryName)
    const block = blocks.find(b => b.blockName === blockName)
    return block?.startSeat || 1
  }

  const getBlockMaxSeat = (categoryName: string, blockName: string) => {
    const blocks = getAvailableBlocksForCategory(categoryName)
    const block = blocks.find(b => b.blockName === blockName)
    return block?.endSeat || 100
  }

  const addTicketSelection = () => {
    setSelectedTickets([...selectedTickets, {
      category: null,
      block: null,
      fromSeat: 1,
      toSeat: 1,
      quantity: 1,
      price: 0
    }])
  }

  const removeTicketSelection = (index: number) => {
    if (selectedTickets.length > 1) {
      setSelectedTickets(selectedTickets.filter((_, i) => i !== index))
    }
  }

  const updateTicketSelection = (index: number, field: string, value: any) => {
    const updated = [...selectedTickets]
    updated[index] = { ...updated[index], [field]: value }
    
    if (field === 'category') {
      const categories = getSeatCategories()
      const category = categories.find(c => c.name === value)
      updated[index].price = category?.price || 0
      updated[index].block = null
    }
    
    if (field === 'block') {
      const minSeat = getBlockMinSeat(updated[index].category!, value)
      updated[index].fromSeat = minSeat
      updated[index].toSeat = minSeat
      updated[index].quantity = 1
    }
    
    if (field === 'fromSeat' || field === 'toSeat') {
      const fromSeat = field === 'fromSeat' ? value : updated[index].fromSeat
      const toSeat = field === 'toSeat' ? value : updated[index].toSeat
      updated[index].quantity = Math.max(1, toSeat - fromSeat + 1)
    }
    
    setSelectedTickets(updated)
  }

  const getTotalSeats = () => {
    return selectedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
  }

  const getTotalPrice = () => {
    return selectedTickets.reduce((sum, ticket) => sum + (ticket.price * ticket.quantity), 0)
  }

  const handleProceedToPayment = () => {
    // Check if user is logged in
    const userPhone = localStorage.getItem('userPhone')
    if (!userPhone) {
      alert('Please login to book tickets')
      window.location.href = '/login'
      return
    }

    // Show booking confirmation
    showBookingConfirmation()
  }

  const checkSeatConflicts = async () => {
    const userPhone = localStorage.getItem('userPhone')
    if (!userPhone) return { hasConflict: false }
    
    try {
      const response = await fetch(`/api/bookings?userPhone=${userPhone}`)
      const data = await response.json()
      
      if (data.success && data.bookings) {
        for (const booking of data.bookings) {
          if (booking.eventId === event.id) {
            for (const selectedTicket of selectedTickets) {
              for (const existingTicket of booking.tickets) {
                if (selectedTicket.block === existingTicket.block) {
                  const selectedFrom = selectedTicket.fromSeat
                  const selectedTo = selectedTicket.toSeat
                  const existingFrom = existingTicket.fromSeat
                  const existingTo = existingTicket.toSeat
                  
                  if (selectedFrom <= existingTo && selectedTo >= existingFrom) {
                    return {
                      hasConflict: true,
                      message: `Seats ${selectedTicket.block}${selectedFrom}-${selectedTicket.block}${selectedTo} are already booked`
                    }
                  }
                }
              }
            }
          }
        }
      }
      return { hasConflict: false }
    } catch (error) {
      return { hasConflict: false }
    }
  }

  const getVenueDetails = () => {
    if (venueData) {
      return {
        name: venueData.name || event.location,
        address: venueData.location?.address || '',
        city: venueData.location?.city || '',
        state: venueData.location?.state || ''
      }
    }
    return {
      name: event.location || 'Venue TBD',
      address: '',
      city: '',
      state: ''
    }
  }

  const showBookingConfirmation = () => {
    const venue = getVenueDetails()
    const ticketDetails = selectedTickets.map(ticket => 
      `${ticket.category} - Block ${ticket.block}: ${ticket.block}${ticket.fromSeat}-${ticket.block}${ticket.toSeat} (${ticket.quantity} seats)`
    ).join('\n')
    
    const confirmed = confirm(`Booking Confirmation

Event: ${event.title}
Venue: ${venue.name}
${venue.address ? `Address: ${venue.address}\n` : ''}${venue.city ? `Location: ${venue.city}${venue.state ? `, ${venue.state}` : ''}\n` : ''}Date: ${new Date(event.date).toLocaleDateString()}
Time: ${event.time}

Ticket Details:
${ticketDetails}

Total Seats: ${getTotalSeats()}
Total Amount: ₹${getTotalPrice()}

Proceed with payment?`)

    if (confirmed) {
      initiatePayment()
    }
  }

  const initiatePayment = async () => {
    // Check for seat conflicts first
    const conflictCheck = await checkSeatConflicts()
    if (conflictCheck.hasConflict) {
      alert(conflictCheck.message || 'Some seats are already booked')
      return
    }

    if (!razorpayKeyId) {
      // Fallback to direct booking if no payment config
      confirmBooking('test_payment_' + Date.now())
      return
    }

    // Setup Razorpay payment
    const options = {
      key: razorpayKeyId,
      amount: getTotalPrice() * 100,
      name: 'Mookala Events',
      description: `Ticket booking for ${event.title}`,
      handler: function(response: any) {
        confirmBooking(response.razorpay_payment_id)
      },
      modal: {
        ondismiss: function() {
          console.log('Payment cancelled')
        }
      },
      theme: {
        color: '#9333ea'
      }
    }

    try {
      // @ts-ignore
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (error) {
      // Fallback if Razorpay not loaded
      confirmBooking('web_payment_' + Date.now())
    }
  }

  const confirmBooking = async (paymentId: string) => {
    try {
      const userPhone = localStorage.getItem('userPhone')
      const venue = getVenueDetails()
      
      const bookingData = {
        userPhone,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: new Date(event.date).toLocaleDateString(),
        eventTime: event.time,
        venue: venue.name,
        tickets: selectedTickets.map(ticket => ({
          category: ticket.category,
          block: ticket.block,
          fromSeat: ticket.fromSeat,
          toSeat: ticket.toSeat,
          quantity: ticket.quantity,
          price: ticket.price,
          totalPrice: ticket.price * ticket.quantity
        })),
        totalSeats: getTotalSeats(),
        totalPrice: getTotalPrice(),
        bookingDate: new Date().toISOString(),
        status: 'confirmed',
        paymentId: paymentId,
        paymentStatus: 'paid'
      }

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        alert('Booking confirmed successfully!')
        window.location.href = '/bookings'
      } else {
        throw new Error(result.error || 'Booking failed')
      }
    } catch (error) {
      alert('Booking failed. Please try again.')
    }
  }

  const downloadSeatingLayout = () => {
    if (!venueData?.seatingLayoutImage) {
      alert('No seating layout available')
      return
    }

    try {
      const imageData = venueData.seatingLayoutImage
      const byteCharacters = atob(imageData.split(',')[1])
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${venueData.name?.replace(/\s+/g, '_') || 'venue'}_seating_layout.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      alert('Seating layout downloaded successfully!')
    } catch (error) {
      alert('Download failed. Please try again.')
    }
  }

  const categories = getSeatCategories()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/20">
              <Link href={`/event/${id}`}>← Back</Link>
            </Button>
            <h1 className="text-2xl font-bold">Book Tickets</h1>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{event.title}</h2>
            <div className="flex items-center gap-6 text-sm opacity-90">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>{new Date(event.date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span>{event.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                <span>{event.location}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Seating Layout Viewer */}
        {venueData?.seatingLayoutImage && (
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Map size={20} className="text-purple-600" />
                <h3 className="text-lg font-semibold">Seating Layout</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setImageScale(Math.max(0.5, imageScale - 0.2))}
                  variant="outline"
                  size="sm"
                >
                  <ZoomOut size={16} />
                </Button>
                <Button
                  onClick={() => setImageScale(Math.min(3.0, imageScale + 0.2))}
                  variant="outline"
                  size="sm"
                >
                  <ZoomIn size={16} />
                </Button>
                <Button
                  onClick={downloadSeatingLayout}
                  variant="outline"
                  size="sm"
                >
                  <Download size={16} />
                </Button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 overflow-auto" style={{ height: '300px' }}>
              <div 
                className="flex items-center justify-center h-full"
                style={{ transform: `scale(${imageScale})`, transformOrigin: 'center' }}
              >
                <img
                  src={venueData.seatingLayoutImage}
                  alt="Seating Layout"
                  className="max-w-full max-h-full object-contain cursor-move"
                  onError={() => alert('Failed to load seating layout')}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Ticket Selection */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Select Tickets</h3>
            <Button onClick={addTicketSelection} variant="outline" size="sm">
              <Plus size={16} className="mr-2" />
              Add Ticket
            </Button>
          </div>

          <div className="space-y-4">
            {selectedTickets.map((ticket, index) => (
              <Card key={index} className="p-4 border-2">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">Ticket {index + 1}</h4>
                  {selectedTickets.length > 1 && (
                    <Button
                      onClick={() => removeTicketSelection(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <X size={16} />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Category</label>
                    <Select
                      value={ticket.category || ""}
                      onValueChange={(value) => updateTicketSelection(index, 'category', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.name} value={category.name}>
                            {category.priceType} - ₹{category.price} ({category.seatRange})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Block Selection */}
                  {ticket.category && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Block</label>
                      <Select
                        value={ticket.block || ""}
                        onValueChange={(value) => updateTicketSelection(index, 'block', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select block" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableBlocksForCategory(ticket.category).map((block) => (
                            <SelectItem key={block.blockName} value={block.blockName}>
                              Block {block.blockName} ({block.seatRange})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Seat Range Selection */}
                {ticket.block && (
                  <div className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">From Seat</label>
                        <Input
                          type="number"
                          value={ticket.fromSeat}
                          onChange={(e) => updateTicketSelection(index, 'fromSeat', parseInt(e.target.value) || 1)}
                          min={getBlockMinSeat(ticket.category!, ticket.block)}
                          max={getBlockMaxSeat(ticket.category!, ticket.block)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">To Seat</label>
                        <Input
                          type="number"
                          value={ticket.toSeat}
                          onChange={(e) => updateTicketSelection(index, 'toSeat', parseInt(e.target.value) || 1)}
                          min={ticket.fromSeat}
                          max={getBlockMaxSeat(ticket.category!, ticket.block)}
                        />
                      </div>
                    </div>
                    
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700">
                        Seats: {ticket.block}{ticket.fromSeat} to {ticket.block}{ticket.toSeat} ({ticket.quantity} seats) - ₹{ticket.price * ticket.quantity}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Card>

        {/* Summary */}
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Booking Summary</h3>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between">
              <span>Total Seats:</span>
              <span className="font-medium">{getTotalSeats()}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total Amount:</span>
              <span>₹{getTotalPrice()}</span>
            </div>
          </div>
          
          <Button
            onClick={handleProceedToPayment}
            disabled={getTotalSeats() === 0}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            size="lg"
          >
            Proceed to Payment
          </Button>
        </Card>
      </div>
    </div>
  )
}