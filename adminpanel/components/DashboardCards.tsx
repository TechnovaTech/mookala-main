'use client'
import { useEffect, useState } from 'react'
import { Users, Music, Calendar, CreditCard, Eye } from 'lucide-react'

interface Stats {
  totalUsers: number
  activeArtists: number
  liveEvents: number
  revenue: number
}

export default function DashboardCards() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setStats(d.stats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const inr = (n: number) => n.toLocaleString('en-IN')

  const cards = [
    { title: 'Total Users', value: stats ? inr(stats.totalUsers) : '—', icon: Users, color: 'emerald' },
    { title: 'Active Artists', value: stats ? inr(stats.activeArtists) : '—', icon: Music, color: 'teal' },
    { title: 'Live Events', value: stats ? inr(stats.liveEvents) : '—', icon: Calendar, color: 'indigo' },
    { title: 'Revenue', value: stats ? `₹${inr(stats.revenue)}` : '—', icon: CreditCard, color: 'emerald' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.title}
            className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-emerald/20 group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg bg-${stat.color}/10 group-hover:bg-${stat.color}/20 transition-colors`}>
                <Icon className={`text-${stat.color} w-6 h-6`} />
              </div>
            </div>

            <div>
              {loading ? (
                <div className="h-8 w-24 bg-gray-100 rounded animate-pulse mb-1" />
              ) : (
                <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
              )}
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center text-gray-500 text-xs">
                <Eye size={12} className="mr-1" />
                View Details
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
