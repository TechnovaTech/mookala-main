'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import { Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Building2, MapPin, Users, ArrowLeft, Armchair, Plus, X, Save } from 'lucide-react'

interface Venue {
  _id: string
  name: string
  location: {
    address: string
    city: string
    state: string
  }
  capacity: number
  amenities: string[]
  status: string
  image?: string | null
  createdAt: string
  seatCategories?: {
    VIP: string
    Premium: string
    Normal: string
    Balcony: string
  }
}

export default function VenueDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showSeatModal, setShowSeatModal] = useState(false)
  const [seatCategories, setSeatCategories] = useState({
    VIP: '',
    Premium: '',
    Normal: '',
    Balcony: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchVenueDetails()
    }
  }, [params.id])

  const fetchVenueDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/venues/${params.id}`)
      const data = await response.json()
      if (data.success) {
        setVenue(data.venue)
        if (data.venue.seatCategories) {
          setSeatCategories(data.venue.seatCategories)
        }
      }
    } catch (error) {
      console.error('Error fetching venue details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSeatCategories = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/venues/${params.id}/seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatCategories })
      })
      const data = await response.json()
      if (data.success) {
        alert('Seat categories saved successfully!')
        setShowSeatModal(false)
        fetchVenueDetails()
      } else {
        alert(data.error || 'Failed to save seat categories')
      }
    } catch (error) {
      console.error('Error saving seat categories:', error)
      alert('Failed to save seat categories')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
        </div>
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-500 text-lg font-medium">Venue not found</p>
          </div>
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
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/venues')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} className="text-slate-gray" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">{venue.name}</h1>
                <p className="text-slate-gray text-sm">Venue Details</p>
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
          {venue.image && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6 border border-gray-100">
              <img 
                src={venue.image} 
                alt={venue.name} 
                className="w-full h-96 object-cover"
              />
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-16 h-16 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md mr-4">
                  <Building2 size={32} className="text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-deep-blue">{venue.name}</h2>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                    venue.status === 'active' 
                      ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                      : 'bg-gray-100 text-gray-800 border border-gray-200'
                  }`}>
                    {venue.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSeatModal(true)}
                className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
              >
                <Armchair size={16} className="mr-2" />
                Manage Seats
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin size={20} className="mr-2 text-teal" />
                    Location
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="text-gray-700"><span className="font-medium">Address:</span> {venue.location.address}</p>
                    <p className="text-gray-700"><span className="font-medium">City:</span> {venue.location.city}</p>
                    <p className="text-gray-700"><span className="font-medium">State:</span> {venue.location.state}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <Users size={20} className="mr-2 text-teal" />
                    Capacity
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-2xl font-bold text-emerald">{venue.capacity} people</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {venue.amenities && venue.amenities.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Amenities</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex flex-wrap gap-2">
                        {venue.amenities.map((amenity, index) => (
                          <span 
                            key={index}
                            className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm text-gray-700"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Additional Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="text-gray-700">
                      <span className="font-medium">Added on:</span> {new Date(venue.createdAt).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-gray-700">
                      <span className="font-medium">Venue ID:</span> {venue._id}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {showSeatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Armchair className="text-emerald mr-3" size={24} />
                <h3 className="text-xl font-bold text-gray-900">Manage Seat Categories</h3>
              </div>
              <button onClick={() => setShowSeatModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>How to define seats:</strong> Use ranges (e.g., 1-10) or individual seats (e.g., 13, 14, 20). 
                  You can combine both: "1-10, 13, 14, 20"
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                    VIP Seats
                  </span>
                </label>
                <input
                  type="text"
                  value={seatCategories.VIP}
                  onChange={(e) => setSeatCategories({ ...seatCategories, VIP: e.target.value })}
                  placeholder="e.g., 1-10, 13, 14, 20"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                    Premium Seats
                  </span>
                </label>
                <input
                  type="text"
                  value={seatCategories.Premium}
                  onChange={(e) => setSeatCategories({ ...seatCategories, Premium: e.target.value })}
                  placeholder="e.g., 11-30, 45"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    Normal Seats
                  </span>
                </label>
                <input
                  type="text"
                  value={seatCategories.Normal}
                  onChange={(e) => setSeatCategories({ ...seatCategories, Normal: e.target.value })}
                  placeholder="e.g., 31-100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                    Balcony Seats
                  </span>
                </label>
                <input
                  type="text"
                  value={seatCategories.Balcony}
                  onChange={(e) => setSeatCategories({ ...seatCategories, Balcony: e.target.value })}
                  placeholder="e.g., 101-150"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveSeatCategories}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50"
                >
                  <Save size={16} className="mr-2" />
                  {saving ? 'Saving...' : 'Save Seat Categories'}
                </button>
                <button
                  onClick={() => setShowSeatModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
