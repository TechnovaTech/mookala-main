'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, Camera, Plus, X, Upload, Trash2, Edit } from 'lucide-react'

interface Professional {
  _id: string
  name: string
  type: string // photographer | videographer
  phone: string
  city: string
  price: string
  image: string
  bio: string
  portfolio: string
  experience: string
  status: string
  createdAt: string
}

const EMPTY_FORM = {
  name: '',
  type: 'photographer',
  phone: '',
  city: '',
  price: '',
  image: '',
  bio: '',
  portfolio: '',
  experience: '',
}

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<Professional | null>(null)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    fetchProfessionals()
  }, [])

  const fetchProfessionals = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/professionals')
      const data = await response.json()
      if (data.success) setProfessionals(data.professionals)
    } catch (error) {
      console.error('Error fetching professionals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setFormData({ ...formData, image: reader.result as string })
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const url = editing ? `/api/professionals/${editing._id}` : '/api/professionals'
      const method = editing ? 'PUT' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await response.json()
      if (data.success) {
        alert(editing ? 'Professional updated!' : 'Professional added!')
        setShowModal(false)
        setFormData({ ...EMPTY_FORM })
        setEditing(null)
        fetchProfessionals()
      } else {
        alert(data.error || 'Failed to save professional')
      }
    } catch (error) {
      console.error('Error saving professional:', error)
      alert('Failed to save professional')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (p: Professional) => {
    setEditing(p)
    setFormData({
      name: p.name,
      type: p.type || 'photographer',
      phone: p.phone || '',
      city: p.city || '',
      price: p.price || '',
      image: p.image || '',
      bio: p.bio || '',
      portfolio: p.portfolio || '',
      experience: p.experience || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this professional?')) return
    try {
      const response = await fetch(`/api/professionals/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        alert('Professional deleted!')
        fetchProfessionals()
      }
    } catch (error) {
      console.error('Error deleting professional:', error)
    }
  }

  const visible = professionals.filter((p) => filterType === 'all' || p.type === filterType)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Hire Professionals</h1>
              <p className="text-slate-gray text-sm">Manage photographers & videographers</p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>

              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
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
                      onClick={() => (window.location.href = '/login')}
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
                <Camera className="text-emerald mr-3" size={24} />
                <h2 className="text-xl font-bold text-gray-900">Professionals ({visible.length})</h2>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal outline-none"
                >
                  <option value="all">All</option>
                  <option value="photographer">Photographers</option>
                  <option value="videographer">Videographers</option>
                </select>
                <button
                  onClick={() => { setEditing(null); setFormData({ ...EMPTY_FORM }); setShowModal(true) }}
                  className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
                >
                  <Plus size={16} className="mr-2" />
                  Add Professional
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {visible.map((p) => (
                  <div key={p._id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-full h-48 object-cover" />
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center bg-gray-100">
                        <Camera className="text-gray-400" size={40} />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-deep-blue">{p.name}</h3>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-teal/10 text-teal border border-teal/20 capitalize">
                          {p.type}
                        </span>
                      </div>
                      {p.city && <p className="text-sm text-slate-gray mb-1">City: {p.city}</p>}
                      {p.phone && <p className="text-sm text-slate-gray mb-1">Phone: {p.phone}</p>}
                      {p.price && <p className="text-sm text-slate-gray mb-1">Price: {p.price}</p>}
                      {p.experience && <p className="text-sm text-slate-gray mb-3">Experience: {p.experience}</p>}
                      <div className="flex space-x-3">
                        <button onClick={() => handleEdit(p)} className="flex items-center text-blue-600 hover:text-blue-800 text-sm">
                          <Edit size={14} className="mr-1" />
                          Edit
                        </button>
                        <button onClick={() => handleDelete(p._id)} className="flex items-center text-red-600 hover:text-red-800 text-sm">
                          <Trash2 size={14} className="mr-1" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="text-center py-20">
                <Camera className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No professionals found</p>
                <p className="text-gray-400 text-sm">Add photographers or videographers to display in the app</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">{editing ? 'Edit Professional' : 'Add Professional'}</h3>
              <button onClick={() => { setShowModal(false); setEditing(null); setFormData({ ...EMPTY_FORM }) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photo</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {formData.image ? (
                    <img src={formData.image} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="pro-upload" />
                  <label htmlFor="pro-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {formData.image ? 'Change Photo' : 'Upload Photo'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal">
                  <option value="photographer">Photographer</option>
                  <option value="videographer">Videographer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price (e.g. ₹5000/day)</label>
                  <input type="text" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Experience</label>
                  <input type="text" value={formData.experience} onChange={(e) => setFormData({ ...formData, experience: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" placeholder="e.g. 5 years" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio Link (Optional)</label>
                <input type="url" value={formData.portfolio} onChange={(e) => setFormData({ ...formData, portfolio: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bio (Optional)</label>
                <textarea value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <button type="submit" disabled={submitting} className="w-full py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50">
                {submitting ? 'Saving...' : editing ? 'Update Professional' : 'Add Professional'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
