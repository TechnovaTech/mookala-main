'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, Building2, MapPin, Plus, X, Upload } from 'lucide-react'

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
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    image: '',
    seatingLayoutImage: ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchVenues()
  }, [])

  const fetchVenues = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/venues')
      const data = await response.json()
      if (data.success) {
        setVenues(data.venues)
      }
    } catch (error) {
      console.error('Error fetching venues:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0]
    if (file) {
      const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/svg+xml']
      if (!validTypes.includes(file.type)) {
        alert('Only PNG, JPG, JPEG, and SVG files are allowed')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData({ ...formData, [field]: reader.result as string })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const response = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await response.json()
      if (data.success) {
        alert('Venue added successfully!')
        setShowModal(false)
        setFormData({ name: '', address: '', city: '', state: '', image: '', seatingLayoutImage: '' })
        fetchVenues()
      } else {
        alert(data.error || 'Failed to add venue')
      }
    } catch (error) {
      console.error('Error adding venue:', error)
      alert('Failed to add venue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Venue Manager</h1>
              <p className="text-slate-gray text-sm">Manage all venues on the platform</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search venues..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>
              
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
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Building2 className="text-emerald mr-3" size={24} />
                <h2 className="text-xl font-bold text-gray-900">All Venues ({venues.length})</h2>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
              >
                <Plus size={16} className="mr-2" />
                Add Venue
              </button>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {venues.map((venue) => (
                  <div key={venue._id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all">
                    {venue.image && (
                      <div className="w-full h-40 overflow-hidden">
                        <img src={venue.image} alt={venue.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                          <Building2 size={24} className="text-white" />
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          venue.status === 'active' 
                            ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {venue.status}
                        </span>
                      </div>

                      <button 
                        onClick={() => window.location.href = `/venues/${venue._id}`}
                        className="text-lg font-bold text-deep-blue mb-2 hover:text-teal cursor-pointer transition-colors"
                      >
                        {venue.name}
                      </button>
                      
                      <div className="space-y-2 text-sm text-slate-gray">
                        <div className="flex items-start">
                          <MapPin size={16} className="mr-2 mt-0.5 text-teal" />
                          <div>
                            <p>{venue.location.address}</p>
                            <p>{venue.location.city}, {venue.location.state}</p>
                          </div>
                        </div>
                        <p><span className="font-medium text-deep-blue">Capacity:</span> {venue.capacity} people</p>
                        {venue.amenities && venue.amenities.length > 0 && (
                          <p><span className="font-medium text-deep-blue">Amenities:</span> {venue.amenities.join(', ')}</p>
                        )}
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs text-slate-gray">
                          Added: {new Date(venue.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && venues.length === 0 && (
              <div className="text-center py-20">
                <Building2 className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No venues found</p>
                <p className="text-gray-400 text-sm">Venues will appear here once added</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Add New Venue</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Image</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {formData.image ? (
                    <img src={formData.image} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => handleImageUpload(e, 'image')} className="hidden" id="image-upload" />
                  <label htmlFor="image-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {formData.image ? 'Change Image' : 'Upload Image'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Seating Layout Image</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {formData.seatingLayoutImage ? (
                    <img src={formData.seatingLayoutImage} alt="Seating Layout Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => handleImageUpload(e, 'seatingLayoutImage')} className="hidden" id="seating-layout-upload" />
                  <label htmlFor="seating-layout-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {formData.seatingLayoutImage ? 'Change Layout' : 'Upload Seating Layout'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Name</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input type="text" required value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input type="text" required value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input type="text" required value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50">
                {submitting ? 'Adding...' : 'Add Venue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
