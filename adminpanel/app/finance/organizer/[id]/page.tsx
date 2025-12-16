'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '../../../../components/Sidebar'
import { ArrowLeft, Calendar, MapPin } from 'lucide-react'

export default function OrganizerEventsPage() {
  const params = useParams()
  const router = useRouter()
  const [events, setEvents] = useState([])
  const [organizer, setOrganizer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchOrganizerEvents(params.id as string)
    }
  }, [params.id])

  const fetchOrganizerEvents = async (organizerId: string) => {
    setLoading(true)
    try {
      const [eventsRes, organizerRes] = await Promise.all([
        fetch(`/api/events/organizer/${organizerId}`),
        fetch(`/api/organizers/${organizerId}`)
      ])
      
      const eventsData = await eventsRes.json()
      const organizerData = await organizerRes.json()
      
      setEvents(eventsData.events || [])
      setOrganizer(organizerData.organizer)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/finance')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} className="text-slate-gray" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">Organizer Events</h1>
                <p className="text-slate-gray text-sm">{organizer?.name || 'Loading...'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="p-10 mt-24">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Events by {organizer?.name}</h2>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="grid gap-4">
                {events.map((event: any) => (
                  <div 
                    key={event._id}
                    onClick={() => router.push(`/finance/event/${event._id}`)}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{event.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {event.startDate}
                          </span>
                          <span className="flex items-center">
                            <MapPin className="w-4 h-4 mr-1" />
                            {event.location?.city || 'Online'}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            event.status === 'approved' ? 'bg-green-100 text-green-800' :
                            event.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {event.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {events.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No events found for this organizer
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}