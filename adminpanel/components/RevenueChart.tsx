'use client'
import { useEffect, useState } from 'react'
import { Filter } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

interface Point {
  month: string
  revenue: number
}

export default function RevenueChart() {
  const [data, setData] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.monthlyRevenue)) setData(d.monthlyRevenue)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Revenue Analytics</h2>
        <button className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          <Filter size={14} className="mr-1" />
          Monthly
        </button>
      </div>

      <div className="h-64">
        {loading ? (
          <div className="h-full bg-gray-100 rounded-lg animate-pulse" />
        ) : data.length === 0 ? (
          <div className="h-full bg-gradient-to-br from-teal/10 to-emerald/10 rounded-lg flex items-center justify-center">
            <p className="text-gray-500 text-sm">No revenue data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
              />
              <Tooltip
                formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
