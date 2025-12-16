'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../../components/Sidebar'
import { ArrowLeft, Calendar, MapPin, Users, DollarSign, TrendingUp, Receipt } from 'lucide-react'

export default function EventPaymentDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [eventDetails, setEventDetails] = useState(null)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchEventDetails(params.id as string)
    }
  }, [params.id])

  const fetchEventDetails = async (eventId: string) => {
    setLoading(true)
    try {
      const [detailsRes, bookingsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/payment-details`),
        fetch(`/api/events/${eventId}/bookings`)
      ])
      
      const detailsData = await detailsRes.json()
      const bookingsData = await bookingsRes.json()
      
      setEventDetails(detailsData.eventDetails)
      setBookings(bookingsData.bookings || [])
    } catch (error) {
      console.error('Error fetching event details:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} className="text-slate-gray" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">Payment Details</h1>
                <p className="text-slate-gray text-sm">{eventDetails?.eventName || 'Loading...'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="p-10 mt-24">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
            </div>
          ) : eventDetails ? (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center">
                    <Receipt className="text-blue-500 w-8 h-8" />
                    <div className="ml-3">
                      <p className="text-2xl font-bold">{eventDetails.totalTickets}</p>
                      <p className="text-gray-600 text-sm">Total Tickets</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center">
                    <Users className="text-green-500 w-8 h-8" />
                    <div className="ml-3">
                      <p className="text-2xl font-bold">{eventDetails.ticketsSold}</p>
                      <p className="text-gray-600 text-sm">Tickets Sold</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center">
                    <TrendingUp className="text-orange-500 w-8 h-8" />
                    <div className="ml-3">
                      <p className="text-2xl font-bold">{eventDetails.totalTickets - eventDetails.ticketsSold}</p>
                      <p className="text-gray-600 text-sm">Remaining</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center">
                    <DollarSign className="text-purple-500 w-8 h-8" />
                    <div className="ml-3">
                      <p className="text-2xl font-bold">₹{eventDetails.totalRevenue}</p>
                      <p className="text-gray-600 text-sm">Total Revenue</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ticket Breakdown */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4">Ticket Breakdown</h3>
                <div className="space-y-4">
                  {eventDetails.tickets?.map((ticket: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                          <Receipt className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{ticket.name}</h4>
                          <p className="text-sm text-gray-600">Price: {ticket.price}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{ticket.sold}/{ticket.quantity}</p>
                        <p className="text-sm text-gray-600">Sold/Total</p>
                        <p className="text-sm font-semibold text-green-600">₹{ticket.revenue?.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress Bars */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4">Sales Progress</h3>
                <div className="space-y-4">
                  {eventDetails.tickets?.map((ticket: any, index: number) => {
                    const percentage = (ticket.sold / ticket.quantity) * 100
                    return (
                      <div key={index}>
                        <div className="flex justify-between mb-2">
                          <span className="font-medium">{ticket.name}</span>
                          <span className="text-sm text-gray-600">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No payment details available
            </div>
          )}
        </main>
      </div>
    </div>
  )
}