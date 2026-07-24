'use client'
import { useEffect, useState } from 'react'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface Activity {
  type: string
  message: string
  time: string
  status: string
}

const statusColors: Record<string, string> = {
  success: 'text-emerald bg-emerald/10',
  warning: 'text-yellow-600 bg-yellow-100',
  error: 'text-red-600 bg-red-100',
}

const statusIcon: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle,
}

export default function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.recentActivity)) setActivities(d.recentActivity)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
        <div className="flex items-center text-gray-500 text-sm">
          <Clock size={16} className="mr-1" />
          Live Updates
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm">No recent activity yet</div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const Icon = statusIcon[activity.status] || AlertCircle
            return (
              <div
                key={index}
                className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className={`p-2 rounded-full ${statusColors[activity.status] || statusColors.warning}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium">{activity.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-emerald rounded-full"></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
