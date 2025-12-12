'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, User, Music, DollarSign, FileText, Image, Bell, ChevronDown, LogOut, Settings as SettingsIcon, CheckCircle, Clock } from 'lucide-react'

interface ArtistDetail {
  _id: string
  phone: string
  name?: string
  email?: string
  city?: string
  bio?: string
  genre?: string
  pricing?: string
  status: string
  createdAt: string
  profileImage?: string
  bannerImage?: string
  media?: Array<{data: string, type: string} | string>
  events?: any[]
  followersCount?: number
  followers?: string[]
}

export default function ArtistDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [artist, setArtist] = useState<ArtistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchArtistDetail(params.id as string)
    }
  }, [params.id])

  const fetchArtistDetail = async (artistId: string) => {
    try {
      const response = await fetch(`/api/artist/${artistId}`)
      const data = await response.json()
      if (data.success) {
        setArtist(data.artist)
      }
    } catch (error) {
      console.error('Error fetching artist:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-gray-500">Loading artist details...</p>
        </div>
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-gray-500">Artist not found</p>
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
                onClick={() => router.push('/artists')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">Artist Profile</h1>
                <p className="text-slate-gray text-sm">Complete artist information and portfolio</p>
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
          {/* Artist Header Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-6">
            {artist.bannerImage && (
              <div className="h-48 w-full overflow-hidden">
                <img src={artist.bannerImage} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`${artist.bannerImage ? 'bg-white' : 'bg-gradient-to-r from-emerald to-teal'} p-8`}>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                  {artist.profileImage ? (
                    <img src={artist.profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={48} className="text-teal" />
                  )}
                </div>
                <div className={`${artist.bannerImage ? 'text-gray-900' : 'text-white'} flex-1`}>
                  <h2 className="text-3xl font-bold">{artist.name || 'Unnamed Artist'}</h2>
                  <p className={`${artist.bannerImage ? 'text-gray-600' : 'text-white/80'} mt-1`}>{artist.email || artist.phone}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      artist.status === 'completed' 
                        ? artist.bannerImage ? 'bg-emerald/20 text-emerald' : 'bg-white/20 text-white'
                        : artist.status === 'verified'
                        ? 'bg-yellow-400 text-yellow-900'
                        : artist.bannerImage ? 'bg-gray-200 text-gray-700' : 'bg-white/10 text-white'
                    }`}>
                      {artist.status}
                    </span>
                    {artist.genre && (
                      <span className={`px-3 py-1 rounded-full text-sm ${artist.bannerImage ? 'bg-teal/20 text-teal' : 'bg-white/20 text-white'}`}>
                        {artist.genre}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-sm ${artist.bannerImage ? 'bg-blue-100 text-blue-700' : 'bg-white/20 text-white'}`}>
                      {artist.followersCount || 0} Followers
                    </span>
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
                    <p className="text-gray-900 font-medium">{artist.phone}</p>
                  </div>
                </div>

                {artist.email && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <Mail size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email Address</p>
                      <p className="text-gray-900 font-medium">{artist.email}</p>
                    </div>
                  </div>
                )}

                {artist.city && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <MapPin size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">City</p>
                      <p className="text-gray-900 font-medium">{artist.city}</p>
                    </div>
                  </div>
                )}

                {artist.pricing && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                      <DollarSign size={24} className="text-teal" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Pricing</p>
                      <p className="text-gray-900 font-medium">₹{artist.pricing}/hour</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                    <Calendar size={24} className="text-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Joined Date</p>
                    <p className="text-gray-900 font-medium">{formatDate(artist.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio Section */}
          {artist.bio && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText size={24} className="text-teal" />
                Biography
              </h3>
              <p className="text-gray-700 leading-relaxed">{artist.bio}</p>
            </div>
          )}

          {/* Media Gallery */}
          {artist.media && artist.media.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Image size={24} className="text-teal" />
                Media Gallery ({artist.media.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {artist.media.map((media, idx) => {
                  const mediaUrl = typeof media === 'string' ? media : media.data;
                  return (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-all">
                      <img 
                        src={mediaUrl} 
                        alt={`Media ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage%3C/text%3E%3C/svg%3E'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Events Section */}
          {artist.events && artist.events.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <CheckCircle size={24} className="text-teal" />
                Accepted Events ({artist.events.length})
              </h3>
              <div className="space-y-4">
                {artist.events.map((event, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-teal/10 rounded-lg flex items-center justify-center">
                        <Music size={24} className="text-teal" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{event.name || 'Event'}</h4>
                        <p className="text-sm text-gray-500">{event.date ? new Date(event.date).toLocaleDateString() : 'Date TBD'}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald/10 text-emerald rounded-full text-sm font-medium">
                      Accepted
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty States */}
          {(!artist.media || artist.media.length === 0) && (!artist.events || artist.events.length === 0) && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-12 text-center">
              <Clock size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">No additional information available</p>
              <p className="text-gray-400 text-sm mt-2">Media and events will appear here once added</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
