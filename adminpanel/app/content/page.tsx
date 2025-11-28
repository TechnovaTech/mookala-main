'use client'
import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Image, FileText, Star, Send, Eye, Edit, Plus } from 'lucide-react'

export default function ContentManagement() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Content Management</h1>
              <p className="text-slate-gray text-sm">Manage banners, featured artists, blogs, and push notifications</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search content..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                />
              </div>
              
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  2
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
                <Image className="text-emerald w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">12</p>
                  <p className="text-gray-600 text-sm">Active Banners</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Star className="text-yellow-500 w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">45</p>
                  <p className="text-gray-600 text-sm">Featured Artists</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <FileText className="text-indigo w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">28</p>
                  <p className="text-gray-600 text-sm">Blog Posts</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Send className="text-teal w-8 h-8" />
                <div className="ml-3">
                  <p className="text-2xl font-bold">156</p>
                  <p className="text-gray-600 text-sm">Notifications Sent</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div className="bg-white rounded-xl shadow-lg">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Homepage Banners</h2>
                  <button className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90">
                    <Plus size={16} className="mr-2" />
                    Add Banner
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                {[1,2,3].map((i) => (
                  <div key={i} className="flex items-center space-x-4 p-3 border border-gray-200 rounded-lg">
                    <div className="w-16 h-12 bg-gradient-to-r from-emerald/20 to-teal/20 rounded flex items-center justify-center">
                      <Image className="text-emerald w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900">Festival Banner {i}</h3>
                      <p className="text-xs text-gray-500">Active • 1920x1080</p>
                    </div>
                    <div className="flex space-x-2">
                      <button className="p-1 text-teal hover:bg-teal/10 rounded">
                        <Eye size={16} />
                      </button>
                      <button className="p-1 text-slate-gray hover:bg-slate-gray/10 rounded">
                        <Edit size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Send Notification</h2>
                </div>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <input
                      type="text"
                      placeholder="Notification title..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                    <textarea
                      rows={3}
                      placeholder="Notification message..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none">
                      <option>All Users</option>
                      <option>Artists Only</option>
                      <option>Organizers Only</option>
                    </select>
                  </div>
                  <button className="w-full flex items-center justify-center px-4 py-2 bg-teal text-white rounded-lg hover:bg-teal/90">
                    <Send size={16} className="mr-2" />
                    Send Notification
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Featured Artists</h2>
                <button className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90">
                  <Plus size={16} className="mr-2" />
                  Add Featured
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6">
              {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center mb-3">
                    <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">A{i}</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="font-medium text-gray-900">Artist {i}</h3>
                      <p className="text-sm text-gray-500">Classical Music</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-yellow-500">
                      <Star size={14} className="mr-1" />
                      <span className="text-sm">4.{8 + i}</span>
                    </div>
                    <button className="px-3 py-1 bg-emerald/10 text-emerald rounded text-sm hover:bg-emerald/20">
                      Featured
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