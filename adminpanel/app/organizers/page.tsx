'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Filter, Building, Calendar, Eye, CheckCircle, XCircle, Shield, Clock, Phone, Mail, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon } from 'lucide-react'

export default function OrganizerManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Organizer Management</h1>
              <p className="text-slate-gray text-sm">Manage event organizers, KYC approvals, and business verification</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search organizers..."
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
                <Building className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">456</p>
                  <p className="text-gray-600 text-sm">Total Organizers</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <CheckCircle className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">398</p>
                  <p className="text-gray-600 text-sm">Verified</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Calendar className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">1,234</p>
                  <p className="text-gray-600 text-sm">Events Created</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <XCircle className="text-yellow-600 w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">58</p>
                  <p className="text-gray-600 text-sm">Pending KYC</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg mb-8">
            <div className="p-8 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">All Organizers</h2>
                <div className="flex space-x-2">
                  <span className="px-3 py-1 bg-emerald/10 text-emerald rounded-full text-sm">398 Verified</span>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">58 Pending</span>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto p-4">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">KYC Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Events & Revenue</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location & Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[
                    { id: 'ORG001', name: 'Mumbai Cultural Events Pvt Ltd', email: 'info@mumbaiEvents.com', phone: '+91 98765 43210', kyc: 'verified', events: 45, location: 'Mumbai', type: 'Corporate', revenue: '₹12.5L', joined: 'Oct 15, 2023' },
                    { id: 'ORG002', name: 'Delhi Theatre Society', email: 'contact@delhitheatre.org', phone: '+91 87654 32109', kyc: 'verified', events: 32, location: 'Delhi', type: 'Non-Profit', revenue: '₹8.2L', joined: 'Oct 20, 2023' },
                    { id: 'ORG003', name: 'Rajasthan Folk Festival Committee', email: 'folk@rajasthan.com', phone: '+91 76543 21098', kyc: 'verified', events: 28, location: 'Jaipur', type: 'Committee', revenue: '₹15.8L', joined: 'Nov 2, 2023' },
                    { id: 'ORG004', name: 'Bengal Jatra Organizers', email: 'jatra@bengal.com', phone: '+91 65432 10987', kyc: 'pending', events: 12, location: 'Kolkata', type: 'Traditional', revenue: '₹4.2L', joined: 'Nov 8, 2023' },
                    { id: 'ORG005', name: 'South India Classical Events', email: 'classical@southindia.com', phone: '+91 54321 09876', kyc: 'pending', events: 8, location: 'Chennai', type: 'Cultural', revenue: '₹2.8L', joined: 'Nov 15, 2023' }
                  ].map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50 h-20">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-r from-indigo to-deep-blue rounded-full flex items-center justify-center">
                            <Building className="text-white w-5 h-5" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{org.name}</div>
                            <div className="text-sm text-gray-500">ID: {org.id} • {org.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-900 mb-1">
                          <Mail className="w-3 h-3 text-gray-400 mr-1" />
                          {org.email}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Phone className="w-3 h-3 text-gray-400 mr-1" />
                          {org.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {org.kyc === 'verified' ? (
                            <>
                              <Shield className="w-4 h-4 text-emerald mr-1" />
                              <span className="px-2 py-1 text-xs rounded-full bg-emerald/10 text-emerald">Verified</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-4 h-4 text-yellow-600 mr-1" />
                              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{org.events} Events</div>
                        <div className="text-sm text-gray-500">{org.revenue} Revenue</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{org.location}</div>
                        <div className="text-sm text-gray-500">{org.joined}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button className="p-1 text-teal hover:bg-teal/10 rounded" title="View Details">
                            <Eye size={16} />
                          </button>
                          <button className="p-1 text-emerald hover:bg-emerald/10 rounded" title="Approve KYC">
                            <CheckCircle size={16} />
                          </button>
                          <button className="p-1 text-red-600 hover:bg-red-50 rounded" title="Block Organizer">
                            <XCircle size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}