'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, CreditCard, TrendingUp, DollarSign, Receipt, Eye, Download, CheckCircle, ArrowRight } from 'lucide-react'

export default function FinanceManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [organizers, setOrganizers] = useState<any[]>([])
  const [selectedOrganizer, setSelectedOrganizer] = useState<string | null>(null)
  const [organizerEvents, setOrganizerEvents] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [eventDetails, setEventDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchOrganizers()
  }, [])

  const fetchOrganizers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/organizers')
      const data = await response.json()
      setOrganizers(data.organizers || [])
    } catch (error) {
      console.error('Error fetching organizers:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrganizerEvents = async (organizerId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/events/organizer/${organizerId}`)
      const data = await response.json()
      setOrganizerEvents(data.events || [])
      setSelectedOrganizer(organizerId)
    } catch (error) {
      console.error('Error fetching organizer events:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEventDetails = async (eventId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/events/${eventId}/payment-details`)
      const data = await response.json()
      setEventDetails(data.eventDetails)
      setSelectedEvent(eventId)
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
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Ticketing & Finance</h1>
              <p className="text-slate-gray text-sm">Manage transactions, earnings, commissions, and payouts</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                />
              </div>
              
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  5
                </span>
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-3 bg-gray-50 rounded-lg px-3 py-2 hover:bg-teal/10 transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-sm font-bold">A</span>
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-deep-blue">Admin User</p>
                    <p className="text-xs text-slate-gray">Super Admin</p>
                  </div>
                  <ChevronDown size={16} className={`text-slate-gray transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <User size={16} className="mr-3 text-slate-gray" />
                      Profile Settings
                    </button>
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <SettingsIcon size={16} className="mr-3 text-slate-gray" />
                      Account Settings
                    </button>
                    <hr className="my-2 border-gray-200" />
                    <button 
                      onClick={() => window.location.href = '/login'}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={16} className="mr-3" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-10 mt-24">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <DollarSign className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹45.2L</p>
                  <p className="text-gray-600 text-sm">Total Revenue</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <TrendingUp className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹6.8L</p>
                  <p className="text-gray-600 text-sm">Commission Earned</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <CreditCard className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹2.4L</p>
                  <p className="text-gray-600 text-sm">Pending Payouts</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Receipt className="text-slate-gray w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">1,234</p>
                  <p className="text-gray-600 text-sm">Transactions</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Payouts</h2>
              <div className="space-y-4">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">A{i}</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">Artist {i}</p>
                        <p className="text-xs text-gray-500">Event earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">₹{25 + i * 5},000</p>
                      <button className="text-xs text-emerald hover:text-emerald/80">
                        Process Payout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Commission Settings</h2>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Event Tickets</span>
                    <span className="text-sm font-bold text-emerald">15%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-emerald h-2 rounded-full" style={{width: '15%'}}></div>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Artist Bookings</span>
                    <span className="text-sm font-bold text-teal">12%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-teal h-2 rounded-full" style={{width: '12%'}}></div>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Custom Orders</span>
                    <span className="text-sm font-bold text-indigo">10%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-indigo h-2 rounded-full" style={{width: '10%'}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg mb-8">
            <div className="p-8 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Payment History by Organizer</h2>
                {selectedOrganizer && (
                  <button 
                    onClick={() => {
                      setSelectedOrganizer(null)
                      setSelectedEvent(null)
                      setEventDetails(null)
                    }}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    Back to Organizers
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-6">
              {!selectedOrganizer ? (
                <div className="grid gap-4">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald"></div>
                    </div>
                  ) : (
                    organizers.map((organizer) => (
                      <div 
                        key={organizer._id} 
                        onClick={() => window.location.href = `/finance/organizer/${organizer._id}`}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center">
                            <span className="text-white font-bold">{organizer.name?.charAt(0) || 'O'}</span>
                          </div>
                          <div className="ml-4">
                            <h3 className="font-semibold">{organizer.name}</h3>
                            <p className="text-sm text-gray-600">{organizer.email}</p>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                      </div>
                    ))
                  )}
                </div>
              ) : !selectedEvent ? (
                <div className="grid gap-4">
                  <h3 className="text-lg font-semibold mb-4">Events by Organizer</h3>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald"></div>
                    </div>
                  ) : (
                    organizerEvents.map((event) => (
                      <div 
                        key={event._id}
                        onClick={() => fetchEventDetails(event._id)}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div>
                          <h4 className="font-semibold">{event.name}</h4>
                          <p className="text-sm text-gray-600">{event.startDate} • {event.status}</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">Event Payment Details</h3>
                    <button 
                      onClick={() => setSelectedEvent(null)}
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      Back to Events
                    </button>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald"></div>
                    </div>
                  ) : eventDetails ? (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-blue-800">Total Tickets</h4>
                          <p className="text-2xl font-bold text-blue-900">{eventDetails.totalTickets}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-green-800">Tickets Sold</h4>
                          <p className="text-2xl font-bold text-green-900">{eventDetails.ticketsSold}</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <h4 className="font-semibold text-purple-800">Total Revenue</h4>
                          <p className="text-2xl font-bold text-purple-900">₹{eventDetails.totalRevenue}</p>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold mb-3">Ticket Breakdown</h4>
                        <div className="space-y-2">
                          {eventDetails.tickets?.map((ticket: any, index: number) => (
                            <div key={index} className="flex justify-between items-center p-2 bg-white rounded">
                              <span>{ticket.name}</span>
                              <div className="text-right">
                                <div className="font-semibold">₹{ticket.price}</div>
                                <div className="text-sm text-gray-600">{ticket.sold}/{ticket.quantity} sold</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">No payment details available</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}