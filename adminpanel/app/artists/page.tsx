'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, Filter, ChevronDown, LogOut, User, Settings as SettingsIcon, Music, RefreshCw } from 'lucide-react'

interface Artist {
  _id: string;
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  bio?: string;
  genre?: string;
  pricing?: string;
  status: string;
  createdAt: string;
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/artists');
      const data = await response.json();
      if (data.success) {
        setArtists(data.artists);
      }
    } catch (error) {
      console.error('Error fetching artists:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Artists</h1>
              <p className="text-slate-gray text-sm">Manage and view all registered artists on the platform.</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search artists..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>
              
              <button 
                onClick={fetchArtists}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all disabled:opacity-50"
              >
                <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
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
                <Music className="text-emerald mr-3" size={24} />
                <h2 className="text-xl font-bold text-gray-900">All Artists ({artists.length})</h2>
              </div>
              <button className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                <Filter size={14} className="mr-1" />
                Filter
              </button>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {artists.map((artist) => (
                  <div key={artist._id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white font-semibold text-lg">
                          {artist.name ? artist.name.charAt(0).toUpperCase() : 'A'}
                        </span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        artist.status === 'completed' 
                          ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                          : artist.status === 'verified'
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                          : 'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        {artist.status}
                      </span>
                    </div>

                    <button 
                      onClick={() => window.location.href = `/artists/${artist._id}`}
                      className="text-lg font-bold text-deep-blue mb-2 hover:text-teal cursor-pointer transition-colors"
                    >
                      {artist.name || 'Unnamed Artist'}
                    </button>
                    
                    <div className="space-y-2 text-sm text-slate-gray">
                      <p><span className="font-medium text-deep-blue">Phone:</span> {artist.phone}</p>
                      {artist.email && <p><span className="font-medium text-deep-blue">Email:</span> {artist.email}</p>}
                      {artist.city && <p><span className="font-medium text-deep-blue">City:</span> {artist.city}</p>}
                      {artist.genre && <p><span className="font-medium text-deep-blue">Genre:</span> {artist.genre}</p>}
                      {artist.pricing && <p><span className="font-medium text-deep-blue">Pricing:</span> ₹{artist.pricing}/hour</p>}
                    </div>

                    {artist.bio && (
                      <div className="mt-3">
                        <p className="text-sm text-slate-gray line-clamp-3 bg-gray-50 p-3 rounded-lg">{artist.bio}</p>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-slate-gray">
                        Joined: {new Date(artist.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && artists.length === 0 && (
              <div className="text-center py-20">
                <Music className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No artists found</p>
                <p className="text-gray-400 text-sm">Artists will appear here once they register</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}