'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, User, Building2, FileText, Bell, ChevronDown, LogOut, Settings as SettingsIcon, CheckCircle } from 'lucide-react'

interface OrganizerDetail {
  _id: string
  phone: string
  name?: string
  email?: string
  city?: string
  status: string
  kycStatus?: string
  aadharId?: string
  panId?: string
  createdAt: string
  events: Array<{
    _id: string
    name: string
    date: string
    location: string
    status: string
  }>
}

export default function OrganizerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [organizer, setOrganizer] = useState<OrganizerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchOrganizerDetail(params.id as string)
    }
  }, [params.id])

  const fetchOrganizerDetail = async (organizerId: string) => {
    try {
      const response = await fetch(`/api/organizers/${organizerId}`)
      const data = await response.json()
      if (data.success) {
        setOrganizer(data.organizer)
      }
    } catch (error) {
      console.error('Error fetching organizer:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-gray-500">Loading organizer details...</p>
        </div>
      </div>
    )
  }

  if (!organizer) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-gray-500">Organizer not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/organizers')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">Organizer Profile</h1>
                <p className="text-slate-gray text-sm">Complete organizer information and events</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  3
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
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-emerald to-teal p-8">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <Building2 size={48} className="text-teal" />
                </div>
                <div className="text-white flex-1">
                  <h2 className="text-3xl font-bold">{organizer.name || 'Unnamed Organizer'}</h2>
                  <p className="text-white/80 mt-1">{organizer.email || organizer.phone}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full text-sm bg-white/20 text-white">
                      {organizer.status}
                    </span>
                    {organizer.kycStatus && (
                      <span className="px-3 py-1 rounded-full text-sm bg-white/20 text-white">
                        KYC: {organizer.kycStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Contact & Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                    <Phone size={24} className="text-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone Number</p>
                    <p className="text-gray-900 font-medium">{organizer.phone}</p>
                  </div>
                </div>

                {organizer.email && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <Mail size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email Address</p>
                      <p className="text-gray-900 font-medium">{organizer.email}</p>
                    </div>
                  </div>
                )}

                {organizer.city && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <MapPin size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">City</p>
                      <p className="text-gray-900 font-medium">{organizer.city}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                    <Calendar size={24} className="text-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Joined Date</p>
                    <p className="text-gray-900 font-medium">{new Date(organizer.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {organizer.aadharId && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <FileText size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Aadhar ID</p>
                      <p className="text-gray-900 font-medium">{organizer.aadharId}</p>
                    </div>
                  </div>
                )}

                {organizer.panId && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <FileText size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">PAN ID</p>
                      <p className="text-gray-900 font-medium">{organizer.panId}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {organizer.events && organizer.events.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <CheckCircle size={24} className="text-teal" />
                Created Events ({organizer.events.length})
              </h3>
              <div className="space-y-4">
                {organizer.events.map((event) => (
                  <div key={event._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                        <Building2 size={24} className="text-teal" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{event.name}</h4>
                        <p className="text-sm text-gray-500">
                          {typeof event.location === 'object' ? event.location.city : event.location}
                          {event.date && ` • ${new Date(event.date).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      event.status === 'active' ? 'bg-emerald/10 text-emerald' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!organizer.events || organizer.events.length === 0) && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-12 text-center">
              <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">No events created yet</p>
              <p className="text-gray-400 text-sm mt-2">Events will appear here once created</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
