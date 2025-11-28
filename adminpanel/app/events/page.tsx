'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Calendar, MapPin, Clock, Users, CheckCircle, XCircle, Eye, Edit } from 'lucide-react'

export default function EventManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Event Management</h1>
              <p className="text-slate-gray text-sm">Approve events, monitor ongoing events, and manage listings</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search events..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                />
              </div>
              
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  12
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
                <Calendar className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">156</p>
                  <p className="text-gray-600 text-sm">Total Events</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Clock className="text-yellow-600 w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">23</p>
                  <p className="text-gray-600 text-sm">Pending Approval</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <CheckCircle className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">89</p>
                  <p className="text-gray-600 text-sm">Live Events</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Users className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">12.5K</p>
                  <p className="text-gray-600 text-sm">Total Attendees</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg mb-8">
            <div className="p-8 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">All Events</h2>
                <div className="flex space-x-2">
                  <span className="px-3 py-1 bg-emerald/10 text-emerald rounded-full text-sm">89 Live</span>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">23 Pending</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-8">
              {[
                { id: 'EVT001', name: 'Durga Puja Mahotsav 2024', organizer: 'Mumbai Cultural Events', location: 'Mumbai, Maharashtra', date: 'Dec 20-25, 2023', attendees: 5000, ticketPrice: '₹500-2000', status: 'approved', category: 'Festival', revenue: '₹25L' },
                { id: 'EVT002', name: 'Classical Music Concert', organizer: 'Delhi Theatre Society', location: 'Delhi, NCR', date: 'Dec 18, 2023', attendees: 800, ticketPrice: '₹1000-3000', status: 'approved', category: 'Concert', revenue: '₹12L' },
                { id: 'EVT003', name: 'Folk Dance Festival', organizer: 'Rajasthan Folk Committee', location: 'Jaipur, Rajasthan', date: 'Dec 22-24, 2023', attendees: 2000, ticketPrice: '₹300-1500', status: 'approved', category: 'Dance', revenue: '₹18L' },
                { id: 'EVT004', name: 'Traditional Jatra Performance', organizer: 'Bengal Jatra Organizers', location: 'Kolkata, West Bengal', date: 'Dec 28-30, 2023', attendees: 1200, ticketPrice: '₹200-800', status: 'approved', category: 'Theatre', revenue: '₹6L' },
                { id: 'EVT005', name: 'Modern Theatre Workshop', organizer: 'Theatre Troupe Mumbai', location: 'Mumbai, Maharashtra', date: 'Jan 5-7, 2024', attendees: 300, ticketPrice: '₹1500-2500', status: 'pending', category: 'Workshop', revenue: '₹4L' },
                { id: 'EVT006', name: 'Fusion Music Night', organizer: 'South India Classical Events', location: 'Chennai, Tamil Nadu', date: 'Jan 10, 2024', attendees: 600, ticketPrice: '₹800-2000', status: 'pending', category: 'Concert', revenue: '₹8L' }
              ].map((event) => (
                <div key={event.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow mb-4">
                  <div className="h-32 bg-gradient-to-r from-emerald/20 to-teal/20 flex items-center justify-center relative">
                    <Calendar className="text-emerald w-12 h-12" />
                    <span className="absolute top-2 right-2 px-2 py-1 bg-white/90 text-xs rounded-full text-gray-600">
                      {event.category}
                    </span>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900 text-sm">{event.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${event.status === 'approved' ? 'bg-emerald/10 text-emerald' : 'bg-yellow-100 text-yellow-800'}`}>
                        {event.status === 'approved' ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <MapPin size={12} className="mr-2 text-slate-gray" />
                        {event.location}
                      </div>
                      <div className="flex items-center">
                        <Clock size={12} className="mr-2 text-slate-gray" />
                        {event.date}
                      </div>
                      <div className="flex items-center">
                        <Users size={12} className="mr-2 text-slate-gray" />
                        {event.attendees.toLocaleString()} attendees
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tickets:</span>
                        <span className="font-medium text-emerald">{event.ticketPrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Revenue:</span>
                        <span className="font-medium">{event.revenue}</span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <button className="flex-1 px-3 py-2 bg-teal/10 text-teal rounded-lg text-sm hover:bg-teal/20">
                        <Eye size={12} className="inline mr-1" />
                        View
                      </button>
                      {event.status === 'pending' ? (
                        <button className="flex-1 px-3 py-2 bg-emerald text-white rounded-lg text-sm hover:bg-emerald/90">
                          Approve
                        </button>
                      ) : (
                        <button className="flex-1 px-3 py-2 bg-slate-gray/10 text-slate-gray rounded-lg text-sm hover:bg-slate-gray/20">
                          <Edit size={12} className="inline mr-1" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}