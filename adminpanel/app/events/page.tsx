'use client';

import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Clock, Video, Music, Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

interface Event {
  _id: string;
  name: string;
  locationType: string;
  status: string;
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  location?: {
    name: string;
    address: string;
    city: string;
  };
  recordedDetails?: {
    platform: string;
    videoLink: string;
    accessInstructions: string;
  };
  organizer: {
    name: string;
    email: string;
  };
  artistDetails: Array<{
    _id: string;
    name: string;
    genre: string;
  }>;
  createdAt: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateEventStatus = async (eventId: string, status: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        fetchEvents();
      }
    } catch (error) {
      console.error('Error updating event status:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLocationTypeIcon = (type: string) => {
    switch (type) {
      case 'venue': return <MapPin className="w-4 h-4" />;
      case 'online': return <Video className="w-4 h-4" />;
      case 'recorded': return <Music className="w-4 h-4" />;
      default: return <MapPin className="w-4 h-4" />;
    }
  };

  const filteredEvents = events.filter(event => 
    filter === 'all' || event.status === filter
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Events Management</h1>
              <p className="text-slate-gray text-sm">Manage and approve event requests from organizers.</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search events..."
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Events Management</h1>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            onClick={() => setFilter('all')}
          >
            All ({events.length})
          </button>
          <button
            className={`px-4 py-2 rounded ${filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({events.filter(e => e.status === 'pending').length})
          </button>
          <button
            className={`px-4 py-2 rounded ${filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            onClick={() => setFilter('approved')}
          >
            Approved ({events.filter(e => e.status === 'approved').length})
          </button>
          <button
            className={`px-4 py-2 rounded ${filter === 'rejected' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected ({events.filter(e => e.status === 'rejected').length})
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredEvents.map((event) => (
          <div key={event._id} className="bg-white rounded-lg shadow-md border">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold mb-2">{event.name}</h2>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      {getLocationTypeIcon(event.locationType)}
                      <span className="capitalize">{event.locationType}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{event.startDate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{event.startTime}</span>
                    </div>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(event.status)}`}>
                  {event.status}
                </span>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Organizer Details</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Name:</strong> {event.organizer?.name || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Email:</strong> {event.organizer?.email || 'N/A'}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Location Details</h4>
                  {event.locationType === 'venue' && event.location ? (
                    <div className="text-sm text-gray-600">
                      <p><strong>Venue:</strong> {event.location.name}</p>
                      <p><strong>Address:</strong> {event.location.address}</p>
                      <p><strong>City:</strong> {event.location.city}</p>
                    </div>
                  ) : event.locationType === 'recorded' && event.recordedDetails ? (
                    <div className="text-sm text-gray-600">
                      <p><strong>Platform:</strong> {event.recordedDetails.platform}</p>
                      <p><strong>Video Link:</strong> 
                        <a href={event.recordedDetails.videoLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                          {event.recordedDetails.videoLink}
                        </a>
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">Online Event</p>
                  )}
                </div>
              </div>

              {event.artistDetails && event.artistDetails.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Artists ({event.artistDetails.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {event.artistDetails.map((artist) => (
                      <span key={artist._id} className="px-2 py-1 bg-gray-100 border rounded text-sm">
                        {artist.name} - {artist.genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {event.status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => updateEventStatus(event._id, 'approved')}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateEventStatus(event._id, 'rejected')}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-500">
                Created: {new Date(event.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

          {filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No events found.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}