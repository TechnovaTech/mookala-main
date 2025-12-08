'use client'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const activities = [
  {
    id: 1,
    type: 'kyc_approved',
    message: 'KYC approved for artist "Ravi Kumar"',
    time: '2 minutes ago',
    status: 'success',
    icon: CheckCircle
  },
  {
    id: 2,
    type: 'event_pending',
    message: 'New event "Durga Puja Festival" pending approval',
    time: '15 minutes ago',
    status: 'warning',
    icon: AlertCircle
  },
  {
    id: 3,
    type: 'kyc_rejected',
    message: 'KYC rejected for organizer "Mumbai Events"',
    time: '1 hour ago',
    status: 'error',
    icon: XCircle
  },
  {
    id: 4,
    type: 'payout_completed',
    message: 'Payout of ₹25,000 completed for artist "Shreya Ghoshal"',
    time: '2 hours ago',
    status: 'success',
    icon: CheckCircle
  },
  {
    id: 5,
    type: 'event_approved',
    message: 'Event "Classical Music Night" approved and published',
    time: '3 hours ago',
    status: 'success',
    icon: CheckCircle
  }
]

const statusColors = {
  success: 'text-emerald bg-emerald/10',
  warning: 'text-yellow-600 bg-yellow-100',
  error: 'text-red-600 bg-red-100'
}

export default function RecentActivity() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
        <div className="flex items-center text-gray-500 text-sm">
          <Clock size={16} className="mr-1" />
          Live Updates
        </div>
      </div>
      
      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = activity.icon
          
          return (
            <div
              key={activity.id}
              className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className={`p-2 rounded-full ${statusColors[activity.status as keyof typeof statusColors]}`}>
                <Icon size={16} />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 font-medium">
                  {activity.message}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {activity.time}
                </p>
              </div>
              
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-emerald rounded-full"></div>
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-100">
        <button className="w-full text-center text-teal hover:text-emerald font-medium text-sm transition-colors">
          View All Activities
        </button>
      </div>
    </div>
  )
}