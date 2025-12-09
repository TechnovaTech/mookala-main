'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import { Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Building2, MapPin, Users, ArrowLeft, Armchair, Plus, X, Save, Edit, Upload } from 'lucide-react'

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
  const [seatCategories, setSeatCategories] = useState<{[key: string]: string}>({
    VIP: '',
    Premium: '',
    Normal: '',
    Balcony: ''
  })
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [seatConflicts, setSeatConflicts] = useState<{[key: string]: string[]}>({})
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    capacity: '',
    image: ''
  })

  useEffect(() => {
    if (params.id) {
      fetchVenueDetails()
    }
  }, [params.id])

  useEffect(() => {
    checkSeatConflicts()
  }, [seatCategories])

  const fetchVenueDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/venues/${params.id}`)
      const data = await response.json()
      if (data.success) {
        setVenue(data.venue)
        if (data.venue.seatCategories) {
          setSeatCategories(data.venue.seatCategories)
        } else {
          setSeatCategories({
            VIP: '',
            Premium: '',
            Normal: '',
            Balcony: ''
          })
        }
        setEditFormData({
          name: data.venue.name,
          address: data.venue.location.address,
          city: data.venue.location.city,
          state: data.venue.location.state,
          capacity: data.venue.capacity.toString(),
          image: data.venue.image || ''
        })
      }
    } catch (error) {
      console.error('Error fetching venue details:', error)
    } finally {
      setLoading(false)
    }
  }

  const parseSeatNumbers = (seatString: string): number[] => {
    const seats: number[] = []
    const parts = seatString.split(',').map(p => p.trim())
    parts.forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim()))
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            seats.push(i)
          }
        }
      } else {
        const num = parseInt(part)
        if (!isNaN(num)) seats.push(num)
      }
    })
    return seats
  }

  const checkSeatConflicts = () => {
    const conflicts: {[key: string]: string[]} = {}
    const categorySeats: {[key: string]: number[]} = {}
    
    Object.entries(seatCategories).forEach(([category, seatString]) => {
      if (seatString.trim()) {
        categorySeats[category] = parseSeatNumbers(seatString)
      }
    })
    
    Object.entries(categorySeats).forEach(([category, seats]) => {
      seats.forEach(seat => {
        Object.entries(categorySeats).forEach(([otherCategory, otherSeats]) => {
          if (category !== otherCategory && otherSeats.includes(seat)) {
            if (!conflicts[category]) conflicts[category] = []
            if (!conflicts[category].includes(`${seat} is used in ${otherCategory}`)) {
              conflicts[category].push(`${seat} is used in ${otherCategory}`)
            }
          }
        })
      })
    })
    
    setSeatConflicts(conflicts)
    return Object.keys(conflicts).length === 0
  }

  const handleSaveSeatCategories = async () => {
    if (!checkSeatConflicts()) {
      alert('Please resolve seat conflicts before saving')
      return
    }
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/svg+xml']
      if (!validTypes.includes(file.type)) {
        alert('Only PNG, JPG, and SVG files are allowed')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setEditFormData({ ...editFormData, image: reader.result as string })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUpdateVenue = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(`/api/venues/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      })
      const data = await response.json()
      if (data.success) {
        alert('Venue updated successfully!')
        setShowEditModal(false)
        fetchVenueDetails()
      } else {
        alert(data.error || 'Failed to update venue')
      }
    } catch (error) {
      console.error('Error updating venue:', error)
      alert('Failed to update venue')
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
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                >
                  <Edit size={16} className="mr-2" />
                  Edit Venue
                </button>
                <button
                  onClick={() => setShowSeatModal(true)}
                  className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
                >
                  <Armchair size={16} className="mr-2" />
                  Manage Seats
                </button>
              </div>
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

              {Object.keys(seatCategories).map((categoryName) => (
                <div key={categoryName} className="flex items-start space-x-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {editingCategoryName === categoryName ? (
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onBlur={() => {
                            if (newCategoryName && newCategoryName !== categoryName) {
                              const newCategories = { ...seatCategories }
                              newCategories[newCategoryName] = newCategories[categoryName]
                              delete newCategories[categoryName]
                              setSeatCategories(newCategories)
                            }
                            setEditingCategoryName(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                          className="px-2 py-1 border border-teal rounded text-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="inline-flex items-center">
                          <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                          {categoryName}
                          <button
                            onClick={() => {
                              setEditingCategoryName(categoryName)
                              setNewCategoryName(categoryName)
                            }}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            <Edit size={14} />
                          </button>
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={seatCategories[categoryName]}
                      onChange={(e) => setSeatCategories({ ...seatCategories, [categoryName]: e.target.value })}
                      placeholder="e.g., 1-10, 13, 14, 20"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                    />
                    {seatConflicts[categoryName] && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        {seatConflicts[categoryName].map((conflict, idx) => (
                          <div key={idx}>⚠️ {conflict}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const newCategories = { ...seatCategories }
                      delete newCategories[categoryName]
                      setSeatCategories(newCategories)
                    }}
                    className="mt-8 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete category"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"/>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              ))}

              <button
                onClick={() => {
                  const newCategoryKey = `Category ${Object.keys(seatCategories).length + 1}`
                  setSeatCategories({ ...seatCategories, [newCategoryKey]: '' })
                }}
                className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-teal hover:text-teal transition-all flex items-center justify-center"
              >
                <Plus size={16} className="mr-2" />
                Add New Category
              </button>

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

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Edit Venue</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateVenue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Image</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {editFormData.image ? (
                    <img src={editFormData.image} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleImageUpload} className="hidden" id="edit-image-upload" />
                  <label htmlFor="edit-image-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {editFormData.image ? 'Change Image' : 'Upload Image'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Name</label>
                <input type="text" required value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input type="text" required value={editFormData.address} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input type="text" required value={editFormData.city} onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input type="text" required value={editFormData.state} onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Capacity</label>
                <input type="number" required value={editFormData.capacity} onChange={(e) => setEditFormData({ ...editFormData, capacity: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <button type="submit" disabled={saving} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Updating...' : 'Update Venue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
