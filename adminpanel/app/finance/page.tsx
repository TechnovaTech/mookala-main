'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, CreditCard, TrendingUp, DollarSign, Receipt, Eye, Download, CheckCircle } from 'lucide-react'

export default function FinanceManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Ticketing & Finance</h1>
              <p className="text-slate-gray text-sm">Manage transactions, earnings, commissions, and payouts</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                />
              </div>
              
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  5
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <DollarSign className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹45.2L</p>
                  <p className="text-gray-600 text-sm">Total Revenue</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <TrendingUp className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹6.8L</p>
                  <p className="text-gray-600 text-sm">Commission Earned</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <CreditCard className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">₹2.4L</p>
                  <p className="text-gray-600 text-sm">Pending Payouts</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Receipt className="text-slate-gray w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">1,234</p>
                  <p className="text-gray-600 text-sm">Transactions</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Payouts</h2>
              <div className="space-y-4">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">A{i}</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">Artist {i}</p>
                        <p className="text-xs text-gray-500">Event earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">₹{25 + i * 5},000</p>
                      <button className="text-xs text-emerald hover:text-emerald/80">
                        Process Payout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Commission Settings</h2>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Event Tickets</span>
                    <span className="text-sm font-bold text-emerald">15%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-emerald h-2 rounded-full" style={{width: '15%'}}></div>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Artist Bookings</span>
                    <span className="text-sm font-bold text-teal">12%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-teal h-2 rounded-full" style={{width: '12%'}}></div>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Custom Orders</span>
                    <span className="text-sm font-bold text-indigo">10%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-indigo h-2 rounded-full" style={{width: '10%'}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg mb-8">
            <div className="p-8 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
                <button className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90">
                  <Download size={16} className="mr-2" />
                  Export
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto p-4">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[1,2,3,4,5].map((i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">TXN{String(i).padStart(6, '0')}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">User {i}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Event Ticket</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">₹{500 + i * 100}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <CheckCircle className="w-4 h-4 text-emerald mr-1" />
                          <span className="px-2 py-1 text-xs rounded-full bg-emerald/10 text-emerald">Success</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">Dec {i}, 2023</td>
                      <td className="px-6 py-4">
                        <button className="p-1 text-teal hover:bg-teal/10 rounded">
                          <Eye size={16} />
                        </button>
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