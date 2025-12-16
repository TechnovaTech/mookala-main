"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, MapPin, Download, QrCode } from "lucide-react"
import Link from "next/link"
import { generateQRCode } from "@/lib/qr-generator"
import { printTicketPDF } from "@/lib/pdf-direct"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookings()
  }, [])

  const loadBookings = async () => {
    const userPhone = localStorage.getItem('userPhone')
    if (!userPhone) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/bookings?userPhone=${userPhone}`)
      const data = await response.json()
      
      if (data.success) {
        setBookings(data.bookings || [])
      } else {
        setBookings([])
      }
    } catch (error) {
      console.error('Error loading bookings:', error)
      setBookings([])
    }
    
    setLoading(false)
  }

  const showQRCode = (booking: any) => {
    const qrData = JSON.stringify({
      bookingId: booking._id,
      eventTitle: booking.eventTitle,
      eventDate: booking.eventDate,
      eventTime: booking.eventTime,
      venue: booking.venue,
      totalSeats: booking.totalSeats,
      totalPrice: booking.totalPrice,
      tickets: booking.tickets,
      status: booking.status,
    })

    // Create QR code display modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div class="text-center">
          <h3 class="text-lg font-bold mb-4">QR Code - ${booking.eventTitle}</h3>
          <div id="qrcode" class="flex justify-center mb-4"></div>
          <p class="text-sm text-gray-600 mb-4">Show this QR code at the venue for entry</p>
          <button onclick="this.closest('.fixed').remove()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Close
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    // Generate actual QR code
    const qrElement = document.getElementById('qrcode')
    if (qrElement) {
      const qrImageUrl = generateQRCode(qrData)
      qrElement.innerHTML = `
        <img src="${qrImageUrl}" alt="QR Code" class="mx-auto border rounded" />
        <p class="text-xs text-gray-500 mt-2">Booking ID: ${booking._id.substring(0, 8)}</p>
      `
    }
  }

  const downloadPDF = (booking: any) => {
    try {
      printTicketPDF(booking)
    } catch (error) {
      console.error('PDF generation failed:', error)
      alert('PDF generation failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading bookings...</p>
      </div>
    )
  }

  const userPhone = localStorage.getItem('userPhone')
  if (!userPhone) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please Login</h1>
          <p className="text-gray-600 mb-6">You need to login to view your bookings</p>
          <Button asChild>
            <Link href="/login">Login</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">No Bookings Found</h1>
          <p className="text-gray-600 mb-6">You haven't booked any events yet</p>
          <Button asChild>
            <Link href="/">Browse Events</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Bookings</h1>
          <p className="text-gray-600">Manage your event tickets and bookings</p>
        </div>

        <div className="space-y-6">
          {bookings.map((booking) => (
            <Card key={booking._id} className="overflow-hidden bg-white rounded-xl shadow-lg">
              {/* Header - Dark Blue Background */}
              <div className="bg-slate-800 text-white p-6 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold mb-3">{booking.eventTitle.toUpperCase()}</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>{booking.eventDate} • {booking.eventTime}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} />
                        <span>{booking.venue}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-500 px-4 py-2 rounded-full text-sm font-bold">
                    CONFIRMED
                  </div>
                </div>
              </div>

              {/* Ticket Count */}
              <div className="bg-gray-50 px-6 py-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">🎫</span>
                  <span className="font-semibold">{booking.totalSeats} Tickets</span>
                </div>
              </div>

              {/* Ticket Details */}
              <div className="p-6">
                <div className="space-y-3 mb-6">
                  {booking.tickets.map((ticket: any, index: number) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {ticket.category} - Block {ticket.block} - Block {ticket.block}: {ticket.block}{ticket.fromSeat}-{ticket.block}{ticket.toSeat}
                      </span>
                      <span className="font-bold">₹{ticket.totalPrice}</span>
                    </div>
                  ))}
                </div>

                {/* Booking ID and Total */}
                <div className="flex justify-between items-center mb-6 pt-4 border-t">
                  <div>
                    <p className="text-sm text-gray-500">Booking ID</p>
                    <p className="font-bold text-lg">{booking._id.substring(0, 8)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-2xl font-bold">₹{booking.totalPrice}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => downloadPDF(booking)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white"
                  >
                    <Download size={16} className="mr-2" />
                    Download PDF
                  </Button>
                  <Button
                    onClick={() => showQRCode(booking)}
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white"
                  >
                    <QrCode size={16} className="mr-2" />
                    Show QR
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}