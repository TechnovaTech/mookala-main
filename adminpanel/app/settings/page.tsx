'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, DollarSign, Save } from 'lucide-react'

export default function SettingsPage() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [platformCharges, setPlatformCharges] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()
      if (data.success && data.settings) {
        setPlatformCharges(data.settings.platformCharges || '')
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformCharges })
      })
      const data = await response.json()
      if (data.success) {
        alert('Settings saved successfully!')
      } else {
        alert(data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Settings</h1>
              <p className="text-slate-gray text-sm">Configure platform settings</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search settings..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
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
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 max-w-2xl">
            <div className="flex items-center mb-6">
              <DollarSign className="text-emerald w-8 h-8 mr-3" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Platform Charges</h2>
                <p className="text-sm text-slate-gray">Set the platform commission percentage</p>
              </div>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Platform Charges (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={platformCharges}
                      onChange={(e) => setPlatformCharges(e.target.value)}
                      placeholder="Enter percentage (e.g., 10)"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald focus:border-emerald outline-none text-lg"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg">%</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    This percentage will be charged on all transactions
                  </p>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving || !platformCharges}
                  className="w-full flex items-center justify-center px-6 py-3 bg-emerald text-white rounded-lg hover:bg-emerald/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Save size={20} className="mr-2" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
