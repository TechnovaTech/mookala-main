'use client'
import { Users, Music, Calendar, CreditCard, TrendingUp, Eye } from 'lucide-react'

const stats = [
  {
    title: 'Total Users',
    value: '12,847',
    change: '+12%',
    icon: Users,
    color: 'emerald'
  },
  {
    title: 'Active Artists',
    value: '2,341',
    change: '+8%',
    icon: Music,
    color: 'teal'
  },
  {
    title: 'Live Events',
    value: '156',
    change: '+23%',
    icon: Calendar,
    color: 'indigo'
  },
  {
    title: 'Revenue',
    value: '₹8,45,230',
    change: '+15%',
    icon: CreditCard,
    color: 'emerald'
  }
]

export default function DashboardCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => {
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
              <div className="flex items-center text-emerald text-sm font-medium">
                <TrendingUp size={16} className="mr-1" />
                {stat.change}
              </div>
            </div>
            
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
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