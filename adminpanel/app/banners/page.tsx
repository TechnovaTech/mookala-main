'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, Image, Plus, X, Upload, Trash2, Edit } from 'lucide-react'

interface Banner {
  _id: string
  title: string
  image: string
  mediaType?: string
  link?: string
  order: number
  status: string
  createdAt: string
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    image: '',
    mediaType: 'image',
    link: '',
    order: '1'
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)

  useEffect(() => {
    fetchBanners()
  }, [])

  const fetchBanners = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/banners')
      const data = await response.json()
      console.log('Banner fetch response:', data)
      if (data.success && data.banners) {
        setBanners(data.banners)
      } else if (Array.isArray(data)) {
        setBanners(data)
      } else {
        setBanners([])
      }
    } catch (error) {
      console.error('Error fetching banners:', error)
      setBanners([])
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result as string, mediaType })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.image) {
      alert('Please upload an image or video')
      return
    }
    
    setSubmitting(true)
    try {
      const url = editingBanner ? `/api/banners/${editingBanner._id}` : '/api/banners'
      const method = editingBanner ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await response.json()
      if (data.success) {
        alert(editingBanner ? 'Banner updated successfully!' : 'Banner added successfully!')
        setShowModal(false)
        setFormData({ title: '', image: '', mediaType: 'image', link: '', order: '1' })
        setEditingBanner(null)
        fetchBanners()
      } else {
        alert(data.error || `Failed to ${editingBanner ? 'update' : 'add'} banner`)
      }
    } catch (error) {
      console.error(`Error ${editingBanner ? 'updating' : 'adding'} banner:`, error)
      alert(`Failed to ${editingBanner ? 'update' : 'add'} banner`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner)
    setFormData({
      title: banner.title,
      image: banner.image,
      mediaType: banner.mediaType || 'image',
      link: banner.link || '',
      order: banner.order.toString()
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this banner?')) return
    try {
      const response = await fetch(`/api/banners/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        alert('Banner deleted successfully!')
        fetchBanners()
      }
    } catch (error) {
      console.error('Error deleting banner:', error)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Homepage Banners</h1>
              <p className="text-slate-gray text-sm">Manage homepage banner images</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search banners..."
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
                <Image className="text-emerald mr-3" size={24} />
                <h2 className="text-xl font-bold text-gray-900">All Banners ({banners.length})</h2>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all"
              >
                <Plus size={16} className="mr-2" />
                Add Banner
              </button>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {banners.map((banner) => (
                  <div key={banner._id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-all">
                    {banner.mediaType === 'video' ? (
                      <video src={banner.image} className="w-full h-48 object-cover" controls />
                    ) : (
                      <img src={banner.image} alt={banner.title} className="w-full h-48 object-cover" />
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-deep-blue">{banner.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          banner.status === 'active' 
                            ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {banner.status}
                        </span>
                      </div>
                      {banner.link && <p className="text-sm text-slate-gray mb-2">Link: {banner.link}</p>}
                      <p className="text-sm text-slate-gray mb-3">Order: {banner.order}</p>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleEdit(banner)}
                          className="flex items-center text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <Edit size={14} className="mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(banner._id)}
                          className="flex items-center text-red-600 hover:text-red-800 text-sm"
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && banners.length === 0 && (
              <div className="text-center py-20">
                <Image className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No banners found</p>
                <p className="text-gray-400 text-sm">Add banners to display on homepage</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">{editingBanner ? 'Edit Banner' : 'Add New Banner'}</h3>
              <button onClick={() => { setShowModal(false); setEditingBanner(null); setFormData({ title: '', image: '', mediaType: 'image', link: '', order: '1' }) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image/Video</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {formData.image ? (
                    formData.mediaType === 'video' ? (
                      <video src={formData.image} className="w-full h-32 object-cover rounded-lg mb-2" controls />
                    ) : (
                      <img src={formData.image} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                    )
                  ) : (
                    <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  )}
                  <input type="file" accept="image/*,video/*" onChange={handleImageUpload} className="hidden" id="banner-upload" />
                  <label htmlFor="banner-upload" className="cursor-pointer text-sm text-teal hover:text-teal/80">
                    {formData.image ? 'Change Media' : 'Upload Image/Video'}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Link (Optional)</label>
                <input type="url" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                <input type="number" required value={formData.order} onChange={(e) => setFormData({ ...formData, order: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal" />
              </div>
              <button type="submit" disabled={submitting} className="w-full py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50">
                {submitting ? (editingBanner ? 'Updating...' : 'Adding...') : (editingBanner ? 'Update Banner' : 'Add Banner')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
