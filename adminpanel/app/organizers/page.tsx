'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, Filter, ChevronDown, LogOut, User, Settings as SettingsIcon, Building2, RefreshCw } from 'lucide-react'

interface Organizer {
  _id: string;
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  status: string;
  kycStatus?: string;
  aadharId?: string;
  panId?: string;
  createdAt: string;
}

export default function OrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const fetchOrganizers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/organizers');
      const data = await response.json();
      if (data.success) {
        setOrganizers(data.organizers);
      }
    } catch (error) {
      console.error('Error fetching organizers:', error);
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
              <h1 className="text-2xl font-bold text-deep-blue">Organizers</h1>
              <p className="text-slate-gray text-sm">Manage and view all registered organizers on the platform.</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search organizers..."
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
                <h2 className="text-xl font-bold text-gray-900">All Organizers ({organizers.length})</h2>
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
                {organizers.map((organizer) => (
                  <div 
                    key={organizer._id} 
                    onClick={() => window.location.href = `/organizers/${organizer._id}`}
                    className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white font-semibold text-lg">
                          {organizer.name ? organizer.name.charAt(0).toUpperCase() : 'O'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          organizer.status === 'profile_completed' 
                            ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                            : organizer.status === 'verified'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {organizer.status}
                        </span>
                        {organizer.kycStatus && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            organizer.kycStatus === 'approved' 
                              ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                              : organizer.kycStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            KYC: {organizer.kycStatus}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-deep-blue mb-2">
                      {organizer.name || 'Unnamed Organizer'}
                    </h3>
                    
                    <div className="space-y-2 text-sm text-slate-gray">
                      <p><span className="font-medium text-deep-blue">Phone:</span> {organizer.phone}</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-slate-gray">
                        Joined: {new Date(organizer.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && organizers.length === 0 && (
              <div className="text-center py-20">
                <Building2 className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No organizers found</p>
                <p className="text-gray-400 text-sm">Organizers will appear here once they register</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}