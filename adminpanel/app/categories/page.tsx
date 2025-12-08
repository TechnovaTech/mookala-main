'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Tag, Plus, Edit2, Trash2, Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon } from 'lucide-react'

export default function CategoryManager() {
  const [categories, setCategories] = useState([
    { id: 1, name: 'Concerts', type: 'Event', count: 45 },
    { id: 2, name: 'Theatre', type: 'Event', count: 32 },
    { id: 3, name: 'Jatra', type: 'Event', count: 18 },
    { id: 4, name: 'Classical', type: 'Genre', count: 25 },
    { id: 5, name: 'Rock', type: 'Genre', count: 38 },
  ])
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Category Manager</h1>
              <p className="text-slate-gray text-sm">Manage event categories and genres</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search categories..."
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
          <div className="flex items-center justify-between mb-6">
            <button className="bg-gradient-to-r from-emerald to-teal text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:shadow-lg transition-all">
              <Plus size={20} />
              Add Category
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left text-gray-700 font-semibold px-6 py-4">Category Name</th>
                  <th className="text-left text-gray-700 font-semibold px-6 py-4">Type</th>
                  <th className="text-left text-gray-700 font-semibold px-6 py-4">Count</th>
                  <th className="text-right text-gray-700 font-semibold px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-t border-gray-100 hover:bg-gray-50 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-lg flex items-center justify-center">
                          <Tag size={20} className="text-white" />
                        </div>
                        <span className="text-gray-900 font-medium">{category.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600">{category.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600">{category.count} items</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-all text-gray-600 hover:text-gray-900">
                          <Edit2 size={18} />
                        </button>
                        <button className="p-2 hover:bg-red-50 rounded-lg transition-all text-gray-600 hover:text-red-600">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
