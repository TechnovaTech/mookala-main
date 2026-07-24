'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, ClipboardList, Trash2 } from 'lucide-react'

interface HireRequest {
  _id: string
  professionalId: string
  professionalName: string
  type: string
  userPhone: string
  userName: string
  eventDate: string
  city: string
  message: string
  status: string
  createdAt: string
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  accepted: 'bg-emerald/10 text-emerald border-emerald/20',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
}

export default function HireRequestsPage() {
  const [requests, setRequests] = useState<HireRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/hire-requests')
      const data = await response.json()
      if (data.success) setRequests(data.requests)
    } catch (error) {
      console.error('Error fetching hire requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/hire-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (data.success) fetchRequests()
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this request?')) return
    try {
      const response = await fetch(`/api/hire-requests/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) fetchRequests()
    } catch (error) {
      console.error('Error deleting request:', error)
    }
  }

  const visible = requests.filter((r) => {
    const q = search.toLowerCase()
    return (
      !q ||
      r.professionalName.toLowerCase().includes(q) ||
      r.userName.toLowerCase().includes(q) ||
      r.userPhone.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Hire Requests</h1>
              <p className="text-slate-gray text-sm">Photographer / videographer booking requests</p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search requests..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>

              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
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
                      onClick={() => (window.location.href = '/login')}
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
            <div className="flex items-center mb-6">
              <ClipboardList className="text-emerald mr-3" size={24} />
              <h2 className="text-xl font-bold text-gray-900">All Requests ({visible.length})</h2>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-20">
                <ClipboardList className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No hire requests yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-sm text-slate-gray">
                      <th className="py-3 px-2">Professional</th>
                      <th className="py-3 px-2">Type</th>
                      <th className="py-3 px-2">User</th>
                      <th className="py-3 px-2">Event Date</th>
                      <th className="py-3 px-2">City</th>
                      <th className="py-3 px-2">Message</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r._id} className="border-b border-gray-100 text-sm">
                        <td className="py-3 px-2 font-medium text-deep-blue">{r.professionalName || '-'}</td>
                        <td className="py-3 px-2 capitalize">{r.type || '-'}</td>
                        <td className="py-3 px-2">
                          <div>{r.userName || '-'}</div>
                          <div className="text-slate-gray text-xs">{r.userPhone}</div>
                        </td>
                        <td className="py-3 px-2">{r.eventDate || '-'}</td>
                        <td className="py-3 px-2">{r.city || '-'}</td>
                        <td className="py-3 px-2 max-w-[180px] truncate" title={r.message}>{r.message || '-'}</td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center space-x-2">
                            <select
                              value={r.status}
                              onChange={(e) => updateStatus(r._id, e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-teal outline-none"
                            >
                              <option value="pending">Pending</option>
                              <option value="accepted">Accepted</option>
                              <option value="rejected">Rejected</option>
                              <option value="completed">Completed</option>
                            </select>
                            <button onClick={() => handleDelete(r._id)} className="text-red-600 hover:text-red-800">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
