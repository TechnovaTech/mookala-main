"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, MapPin, Download, QrCode, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { generateQRCode } from "@/lib/qr-generator"
import { printTicketPDF } from "@/lib/pdf-direct"
import { showToast, showConfirmation } from "@/lib/toast"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showQRForBooking, setShowQRForBooking] = useState<string | null>(null)
  const router = useRouter()

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
    if (showQRForBooking === booking._id) {
      setShowQRForBooking(null)
    } else {
      setShowQRForBooking(booking._id)
      showToast('QR Code displayed successfully!', 'success')
    }
  }

  const generateQRData = (booking: any) => {
    return JSON.stringify({
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
  }

  const downloadPDF = (booking: any) => {
    try {
      printTicketPDF(booking)
      showToast('PDF download started successfully!', 'success')
    } catch (error) {
      console.error('PDF generation failed:', error)
      showToast('PDF generation failed. Please try again.', 'error')
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
      <div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'}}>
        <div className="text-center bg-white rounded-3xl p-12 shadow-2xl">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Please Login</h1>
          <p className="text-gray-600 mb-8 text-lg">You need to login to view your bookings</p>
          <Button asChild className="px-8 py-4 text-lg font-semibold rounded-xl" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'}}>
            <Link href="/login">Login</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'}}>
        <div className="text-center bg-white rounded-3xl p-12 shadow-2xl">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">No Bookings Found</h1>
          <p className="text-gray-600 mb-8 text-lg">You haven't booked any events yet</p>
          <Button asChild className="px-8 py-4 text-lg font-semibold rounded-xl" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'}}>
            <Link href="/">Browse Events</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'}}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <Button
              onClick={() => router.push('/profile')}
              className="p-3 rounded-lg shadow-lg transition-all duration-200"
              style={{background: 'linear-gradient(135deg, #475569 0%, #64748b 100%)'}}
            >
              <ArrowLeft size={20} className="text-white" />
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white">My Bookings</h1>
              <p className="text-blue-200 text-lg">Manage your event tickets and bookings</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {bookings.map((booking) => (
            <div key={booking._id} className="rounded-2xl shadow-2xl overflow-hidden border border-blue-800/30" style={{background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'}}>
              {/* Header */}
              <div className="text-white p-6 relative" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'}}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold mb-3 text-white">{booking.eventTitle}</h3>
                    <div className="space-y-2 text-sm text-blue-200">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-blue-300" />
                        <span>{booking.eventDate} • {booking.eventTime}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-blue-300" />
                        <span>{booking.venue}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-500 px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg">
                    CONFIRMED
                  </div>
                </div>
              </div>

              {/* Ticket Count */}
              <div className="px-6 py-3 border-b border-blue-700/30" style={{background: 'rgba(30, 41, 59, 0.5)'}}>
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 text-lg">🎫</span>
                  <span className="font-semibold text-blue-100">{booking.totalSeats} Tickets</span>
                </div>
              </div>

              {/* Ticket Details */}
              <div className="p-6">
                <div className="space-y-3 mb-6">
                  {booking.tickets.map((ticket: any, index: number) => (
                    <div key={index} className="flex justify-between items-center py-3 px-4 rounded-lg border border-blue-700/30" style={{background: 'rgba(30, 41, 59, 0.3)'}}>
                      <span className="text-sm font-medium text-blue-100">
                        {ticket.category} - Block {ticket.block}: {ticket.block}{ticket.fromSeat}-{ticket.block}{ticket.toSeat}
                      </span>
                      <span className="font-bold text-white text-lg">₹{ticket.totalPrice}</span>
                    </div>
                  ))}
                </div>

                {/* Booking ID and Total */}
                <div className="flex justify-between items-center mb-6 pt-4 border-t border-blue-700/30">
                  <div>
                    <p className="text-sm text-blue-300 mb-1">Booking ID</p>
                    <p className="font-bold text-lg text-white">{booking._id.substring(0, 8)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-300 mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-white">₹{booking.totalPrice}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => downloadPDF(booking)}
                    className="flex-1 py-3 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                    style={{background: 'linear-gradient(135deg, #475569 0%, #64748b 100%)'}} 
                  >
                    <Download size={16} className="mr-2" />
                    Download PDF
                  </Button>
                  <Button
                    onClick={() => showQRCode(booking)}
                    className="flex-1 py-3 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                    style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'}}
                  >
                    <QrCode size={16} className="mr-2" />
                    {showQRForBooking === booking._id ? 'Hide QR' : 'Show QR'}
                  </Button>
                </div>

                {/* QR Code Section */}
                {showQRForBooking === booking._id && (
                  <div className="mt-6 pt-6 border-t border-blue-700/30">
                    <div className="text-center">
                      <h4 className="text-lg font-bold mb-4 text-white">QR Code</h4>
                      <div className="bg-white p-4 rounded-xl inline-block mb-4">
                        <img 
                          src={generateQRCode(generateQRData(booking))} 
                          alt="QR Code" 
                          className="w-32 h-32" 
                        />
                      </div>
                      <p className="text-sm text-blue-200 mb-2">ID: {booking._id.substring(0, 8)}</p>
                      <p className="text-xs text-blue-300">Show this QR code at the venue for entry</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>


      </div>
    </div>
  )
}