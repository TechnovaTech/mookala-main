'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Filter, Music, Star, Eye, Award, TrendingUp, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Shield } from 'lucide-react'

export default function ArtistManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Artist Management</h1>
              <p className="text-slate-gray text-sm">Manage artist profiles, KYC approvals, and featured artists</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search artists..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                />
              </div>
              
              {/* Notifications */}
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  3
                </span>
              </button>
              
              {/* Profile Dropdown */}
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
                
                {/* Dropdown Menu */}
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
                <Music className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">2,341</p>
                  <p className="text-gray-600 text-sm">Total Artists</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Shield className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">2,103</p>
                  <p className="text-gray-600 text-sm">Verified</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Star className="text-yellow-500 w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">156</p>
                  <p className="text-gray-600 text-sm">Featured</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Award className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">89</p>
                  <p className="text-gray-600 text-sm">Top Rated</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <TrendingUp className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹12.5L</p>
                  <p className="text-gray-600 text-sm">Total Earnings</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg mb-8">
            <div className="p-8 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">All Artists</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-8">
              {[
                { id: 'ART001', name: 'Pandit Ravi Shankar Jr.', genre: 'Classical Sitar', location: 'Mumbai', bookings: 45, rating: 4.9, price: '₹25,000', kyc: 'verified', featured: true, phone: '+91 98765 43210', email: 'ravi.shankar@music.com' },
                { id: 'ART002', name: 'Shreya Ghoshal', genre: 'Playback Singer', location: 'Mumbai', bookings: 89, rating: 4.8, price: '₹50,000', kyc: 'verified', featured: true, phone: '+91 87654 32109', email: 'shreya@vocals.com' },
                { id: 'ART003', name: 'Kathak Kiran', genre: 'Classical Dance', location: 'Delhi', bookings: 32, rating: 4.7, price: '₹15,000', kyc: 'verified', featured: false, phone: '+91 76543 21098', email: 'kiran@dance.com' },
                { id: 'ART004', name: 'Folk Fusion Band', genre: 'Folk Music', location: 'Rajasthan', bookings: 28, rating: 4.6, price: '₹35,000', kyc: 'pending', featured: false, phone: '+91 65432 10987', email: 'folkband@music.com' },
                { id: 'ART005', name: 'Theatre Troupe Mumbai', genre: 'Drama & Theatre', location: 'Mumbai', bookings: 15, rating: 4.5, price: '₹20,000', kyc: 'verified', featured: false, phone: '+91 54321 09876', email: 'troupe@theatre.com' },
                { id: 'ART006', name: 'Jatra Master', genre: 'Traditional Jatra', location: 'West Bengal', bookings: 12, rating: 4.4, price: '₹18,000', kyc: 'pending', featured: false, phone: '+91 43210 98765', email: 'jatra@traditional.com' }
              ].map((artist) => (
                <div key={artist.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-lg">
                        <Music className="text-white w-6 h-6" />
                      </div>
                      <div className="ml-3">
                        <h3 className="font-medium text-gray-900">{artist.name}</h3>
                        <p className="text-sm text-gray-500">{artist.genre}</p>
                      </div>
                    </div>
                    {artist.featured && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                        Featured
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Location:</span>
                      <span className="font-medium">{artist.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bookings:</span>
                      <span className="font-medium">{artist.bookings}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rating:</span>
                      <span className="font-medium">{artist.rating}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Price:</span>
                      <span className="font-medium text-emerald">{artist.price}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">KYC:</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${artist.kyc === 'verified' ? 'bg-emerald/10 text-emerald' : 'bg-yellow-100 text-yellow-800'}`}>
                        {artist.kyc === 'verified' ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button className="flex-1 px-3 py-2 bg-teal/10 text-teal rounded-lg text-sm hover:bg-teal/20">
                      <Eye size={14} className="inline mr-1" />
                      View
                    </button>
                    <button className={`flex-1 px-3 py-2 rounded-lg text-sm ${artist.featured ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald text-white hover:bg-emerald/90'}`}>
                      {artist.featured ? 'Unfeature' : 'Feature'}
                    </button>
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