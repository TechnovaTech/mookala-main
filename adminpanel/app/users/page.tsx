'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Filter, UserCheck, UserX, Eye, Users, Shield, Clock, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon } from 'lucide-react'

export default function UserManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white/95 backdrop-blur-md shadow-xl border-b border-gray-100 px-8 py-6 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-deep-blue to-indigo bg-clip-text text-transparent">User Management</h1>
              <p className="text-slate-gray text-base mt-1">Manage user accounts, KYC approvals, and user activities</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="pl-10 pr-4 py-3 w-80 border border-gray-200 rounded-xl bg-gray-50/50 focus:ring-2 focus:ring-teal/20 focus:border-teal focus:bg-white outline-none transition-all duration-200"
                />
              </div>
              
              {/* Notifications */}
              <button className="relative p-3 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-xl transition-all duration-200">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  3
                </span>
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-3 bg-gray-50/80 rounded-xl px-4 py-3 hover:bg-teal/10 hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-100"
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
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 mb-8">
            <div className="p-8 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">All Users</h2>
                <div className="flex space-x-2">
                  <span className="px-3 py-1 bg-emerald/10 text-emerald rounded-full text-sm">1,247 Active</span>
                  <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm">23 Pending KYC</span>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto p-4">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">KYC Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location & Activity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { id: 'USR001', name: 'Rajesh Kumar', email: 'rajesh.kumar@gmail.com', phone: '+91 98765 43210', kyc: 'verified', joined: 'Nov 15, 2023', location: 'Mumbai', tickets: 12, orders: 3 },
                    { id: 'USR002', name: 'Priya Sharma', email: 'priya.sharma@yahoo.com', phone: '+91 87654 32109', kyc: 'verified', joined: 'Nov 18, 2023', location: 'Delhi', tickets: 8, orders: 1 },
                    { id: 'USR003', name: 'Amit Patel', email: 'amit.patel@hotmail.com', phone: '+91 76543 21098', kyc: 'verified', joined: 'Nov 20, 2023', location: 'Ahmedabad', tickets: 15, orders: 5 },
                    { id: 'USR004', name: 'Sneha Reddy', email: 'sneha.reddy@gmail.com', phone: '+91 65432 10987', kyc: 'pending', joined: 'Nov 22, 2023', location: 'Bangalore', tickets: 3, orders: 0 },
                    { id: 'USR005', name: 'Vikram Singh', email: 'vikram.singh@outlook.com', phone: '+91 54321 09876', kyc: 'pending', joined: 'Nov 25, 2023', location: 'Jaipur', tickets: 0, orders: 0 }
                  ].map((user) => (
                    <tr key={user.id} className="hover:bg-teal/5 h-20 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center">
                            <Users className="text-white w-5 h-5" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            <div className="text-sm text-gray-500">ID: {user.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{user.email}</div>
                        <div className="text-sm text-gray-500">{user.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {user.kyc === 'verified' ? (
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
                        <div className="text-sm text-gray-900">{user.location}</div>
                        <div className="text-sm text-gray-500">T:{user.tickets} | O:{user.orders}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.joined}</td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button className="p-1 text-teal hover:bg-teal/10 rounded" title="View Details">
                            <Eye size={16} />
                          </button>
                          <button className="p-1 text-emerald hover:bg-emerald/10 rounded" title="Approve KYC">
                            <UserCheck size={16} />
                          </button>
                          <button className="p-1 text-red-600 hover:bg-red-50 rounded" title="Block User">
                            <UserX size={16} />
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