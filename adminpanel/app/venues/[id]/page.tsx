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
  seatConfig?: {
    numberOfBlocks: number
    blocks: Array<{
      name: string
      type: string
      totalSeats: number
    }>
  }
}

export default function VenueDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showSeatModal, setShowSeatModal] = useState(false)

  const [seatConfig, setSeatConfig] = useState({
    numberOfBlocks: 1,
    blocks: [{
      name: 'A',
      type: 'Normal',
      totalSeats: 100
    }]
  })
  const [saving, setSaving] = useState(false)
  const [totalSeats, setTotalSeats] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    capacity: '',
    image: '',
    seatingLayoutImage: ''
  })

  useEffect(() => {
    if (params.id) {
      fetchVenueDetails()
    }
  }, [params.id])

  useEffect(() => {
    calculateTotalSeats()
  }, [seatConfig])

  const fetchVenueDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/venues/${params.id}`)
      const data = await response.json()
      if (data.success) {
        setVenue(data.venue)
        console.log('Venue seatConfig:', data.venue.seatConfig)
        // Don't automatically set seat config here, only when modal opens
        // This prevents overriding user's current work in the modal
        setEditFormData({
          name: data.venue.name,
          address: data.venue.location.address,
          city: data.venue.location.city,
          state: data.venue.location.state,
          capacity: '0',
          image: data.venue.image || '',
          seatingLayoutImage: data.venue.seatingLayoutImage || ''
        })
      }
    } catch (error) {
      console.error('Error fetching venue details:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateTotalSeats = () => {
    const total = seatConfig.blocks.reduce((sum, block) => {
      return sum + block.totalSeats
    }, 0)
    setTotalSeats(total)
  }

  const generateBlockNames = (count: number) => {
    const names = []
    for (let i = 0; i < count; i++) {
      const length = Math.floor(i / 26) + 1
      const letterIndex = i % 26
      const letter = String.fromCharCode(65 + letterIndex)
      names.push(letter.repeat(length))
    }
    return names
  }

  const handleBlockCountChange = (count: number) => {
    if (count === 0) {
      setSeatConfig({
        numberOfBlocks: 0,
        blocks: []
      })
      return
    }
    
    const blockNames = generateBlockNames(count)
    const newBlocks = blockNames.map((name, index) => {
      if (seatConfig.blocks[index]) {
        return { ...seatConfig.blocks[index], name }
      }
      return {
        name,
        type: 'Normal',
        totalSeats: 100
      }
    })
    
    setSeatConfig({
      numberOfBlocks: count,
      blocks: newBlocks
    })
  }

  const updateBlock = (index: number, field: string, value: any) => {
    const newBlocks = [...seatConfig.blocks]
    newBlocks[index] = { ...newBlocks[index], [field]: value }
    setSeatConfig({ ...seatConfig, blocks: newBlocks })
  }

  const handleSaveSeatConfig = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/venues/${params.id}/seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatConfig, totalSeats })
      })
      const data = await response.json()
      if (data.success) {
        alert('Seat configuration saved successfully!')
        setShowSeatModal(false)
        fetchVenueDetails()
      } else {
        alert(data.error || 'Failed to save seat configuration')
      }
    } catch (error) {
      console.error('Error saving seat configuration:', error)
      alert('Failed to save seat configuration')
    } finally {
      setSaving(false)
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
        setEditFormData({ ...editFormData, [field]: reader.result as string })
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
                  onClick={() => {
                    console.log('Opening seat modal, venue.seatConfig:', venue.seatConfig)
                    // Load existing seat config when opening modal
                    if (venue.seatConfig && venue.seatConfig.blocks && venue.seatConfig.blocks.length > 0) {
                      console.log('Loading existing config:', venue.seatConfig)
                      setSeatConfig(venue.seatConfig)
                    } else {
                      console.log('No existing config, using default')
                      setSeatConfig({
                        numberOfBlocks: 1,
                        blocks: [{
                          name: 'A',
                          type: 'Normal',
                          totalSeats: 100
                        }]
                      })
                    }
                    setShowSeatModal(true)
                  }}
                  className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
                >
                  <Armchair size={16} className="mr-2" />
                  Edit Seats
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
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Armchair className="text-emerald mr-3" size={24} />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Manage Seat Configuration</h3>
                  <p className="text-sm text-gray-600">Total Seats: {totalSeats}</p>
                </div>
              </div>
              <button onClick={() => setShowSeatModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Number of Blocks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of Blocks</label>
                <input
                  type="text"
                  value={seatConfig.numberOfBlocks}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '' || /^[0-9]+$/.test(value)) {
                      const num = value === '' ? 0 : parseInt(value)
                      if (num >= 0 && num <= 999) {
                        handleBlockCountChange(num)
                      }
                    }
                  }}
                  placeholder="Enter number of blocks (1-999)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                />
                <p className="text-xs text-gray-500 mt-1">Enter a number between 1-999 (A-Z, AA-ZZ, AAA-ZZZ...)</p>
              </div>

              {/* Visual Block Display */}
              {seatConfig.numberOfBlocks > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Venue Layout</h4>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {seatConfig.blocks.map((block, index) => {
                      const getBlockColor = (type: string) => {
                        switch(type) {
                          case 'VIP': return 'bg-purple-500 text-white'
                          case 'Premium': return 'bg-blue-500 text-white'
                          case 'Normal': return 'bg-green-500 text-white'
                          case 'Balcony': return 'bg-orange-500 text-white'
                          default: return 'bg-gray-500 text-white'
                        }
                      }
                      return (
                        <div key={index} className={`w-16 h-16 rounded-lg flex items-center justify-center font-bold text-lg ${getBlockColor(block.type)}`}>
                          {block.name}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 justify-center text-sm">
                    <div className="flex items-center"><div className="w-3 h-3 bg-purple-500 rounded mr-1"></div>VIP</div>
                    <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded mr-1"></div>Premium</div>
                    <div className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded mr-1"></div>Normal</div>
                    <div className="flex items-center"><div className="w-3 h-3 bg-orange-500 rounded mr-1"></div>Balcony</div>
                  </div>
                </div>
              )}

              {/* Block Configuration */}
              {seatConfig.numberOfBlocks > 0 && (
                <div className="grid gap-4">
                {seatConfig.blocks.map((block, index) => {
                  const getBlockColor = (type: string) => {
                    switch(type) {
                      case 'VIP': return 'border-purple-300 bg-purple-50'
                      case 'Premium': return 'border-blue-300 bg-blue-50'
                      case 'Normal': return 'border-green-300 bg-green-50'
                      case 'Balcony': return 'border-orange-300 bg-orange-50'
                      default: return 'border-gray-300 bg-gray-50'
                    }
                  }
                  return (
                    <div key={index} className={`border-2 rounded-lg p-4 ${getBlockColor(block.type)}`}>
                      <div className="flex items-center mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white mr-3 ${
                          block.type === 'VIP' ? 'bg-purple-500' :
                          block.type === 'Premium' ? 'bg-blue-500' :
                          block.type === 'Normal' ? 'bg-green-500' :
                          block.type === 'Balcony' ? 'bg-orange-500' : 'bg-gray-500'
                        }`}>
                          {block.name}
                        </div>
                        <h4 className="font-semibold text-gray-900">Block {block.name} Configuration</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Block Type</label>
                          <select
                            value={block.type}
                            onChange={(e) => updateBlock(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal bg-white"
                          >
                            <option value="VIP">VIP</option>
                            <option value="Premium">Premium</option>
                            <option value="Normal">Normal</option>
                            <option value="Balcony">Balcony</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Total Seats</label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={block.totalSeats}
                            onChange={(e) => updateBlock(index, 'totalSeats', parseInt(e.target.value) || 1)}
                            placeholder="e.g., 100"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal bg-white"
                          />
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-white rounded border text-sm">
                        <div className="font-medium text-gray-900 mb-2">Block Summary:</div>
                        <div className="text-gray-600 mb-3">
                          • Total seats in this block: <span className="font-semibold">{block.totalSeats}</span><br/>
                          • Seat numbering: {block.name}1, {block.name}2, {block.name}3, ..., {block.name}{block.totalSeats}
                        </div>
                        <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                          Example seats: {block.name}1, {block.name}2, {block.name}3{block.totalSeats > 3 ? `, ..., ${block.name}${block.totalSeats}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveSeatConfig}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50"
                >
                  <Save size={16} className="mr-2" />
                  {saving ? 'Saving...' : 'Save Seat Configuration'}
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
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => handleImageUpload(e, 'image')} className="hidden" id="edit-image-upload" />
                  <label htmlFor="edit-image-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {editFormData.image ? 'Change Image' : 'Upload Image'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Seating Layout Image</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {editFormData.seatingLayoutImage ? (
                    <img src={editFormData.seatingLayoutImage} alt="Seating Layout Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => handleImageUpload(e, 'seatingLayoutImage')} className="hidden" id="edit-seating-layout-upload" />
                  <label htmlFor="edit-seating-layout-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {editFormData.seatingLayoutImage ? 'Change Layout' : 'Upload Seating Layout'}
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
