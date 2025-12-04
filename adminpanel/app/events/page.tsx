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
  media?: {
    bannerImage?: string;
    images?: string[];
  };
  tickets?: Array<{
    name: string;
    price: string;
    quantity: string;
  }>;
  createdAt: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);

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

  const fetchEventDetails = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      const data = await response.json();
      setSelectedEvent(data.event);
      setShowEventModal(true);
    } catch (error) {
      console.error('Error fetching event details:', error);
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

        <main className="p-6 mt-24">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{events.length}</p>
                  <p className="text-sm text-gray-600">Total Events</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.status === 'pending').length}</p>
                  <p className="text-sm text-gray-600">Pending Approval</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{events.filter(e => e.status === 'approved').length}</p>
                  <p className="text-sm text-gray-600">Live Events</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">12.5K</p>
                  <p className="text-sm text-gray-600">Total Attendees</p>
                </div>
              </div>
            </div>
          </div>

          {/* All Events Section */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">All Events</h2>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    {events.filter(e => e.status === 'approved').length} Live
                  </span>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                    {events.filter(e => e.status === 'pending').length} Pending
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map((event) => (
                  <div key={event._id} className="bg-gray-50 rounded-lg p-6 border">
                    <div className="flex justify-end items-start mb-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(event.status)}`}>
                        {event.status === 'approved' ? 'Approved' : event.status === 'pending' ? 'Pending' : 'Rejected'}
                      </span>
                    </div>
                    
                    <div className="text-center mb-4">
                      {event.media?.bannerImage ? (
                        <img 
                          src={`data:image/jpeg;base64,${event.media.bannerImage}`} 
                          alt={event.name}
                          className="w-full h-32 rounded-lg mb-3 object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                          {getLocationTypeIcon(event.locationType)}
                        </div>
                      )}
                    </div>
                    
                    <h3 className="font-bold text-lg mb-2 text-center">{event.name}</h3>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{event.location?.city || event.organizer?.name || 'Online'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{event.startDate}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{Math.floor(Math.random() * 5000) + 500} attendees</span>
                      </div>
                    </div>
                    
                    {event.tickets && event.tickets.length > 0 && (
                      <div className="space-y-1 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tickets:</span>
                          <span className="font-medium text-teal-600">
                            {event.tickets.length === 1 
                              ? event.tickets[0].price
                              : `₹${Math.min(...event.tickets.map(t => parseInt(t.price.replace(/[^0-9]/g, ''))))}-${Math.max(...event.tickets.map(t => parseInt(t.price.replace(/[^0-9]/g, ''))))}`
                            }
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchEventDetails(event._id)}
                        className="flex-1 px-3 py-2 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 flex items-center justify-center gap-1"
                      >
                        👁️ View
                      </button>
                      {event.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateEventStatus(event._id, 'approved')}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateEventStatus(event._id, 'rejected')}
                            className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No events found.</p>
            </div>
          )}
        </main>
      </div>

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold">{selectedEvent.name}</h2>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="grid gap-6">
                {/* Event Info */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3">Event Details</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>Date:</strong> {selectedEvent.startDate}</p>
                      <p><strong>Time:</strong> {selectedEvent.startTime}</p>
                      <p><strong>Type:</strong> {selectedEvent.locationType}</p>
                      <p><strong>Status:</strong> <span className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedEvent.status)}`}>{selectedEvent.status}</span></p>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-3">Location</h3>
                    {selectedEvent.location ? (
                      <div className="space-y-1 text-sm">
                        <p><strong>Venue:</strong> {selectedEvent.location.name}</p>
                        <p><strong>Address:</strong> {selectedEvent.location.address}</p>
                        <p><strong>City:</strong> {selectedEvent.location.city}</p>
                      </div>
                    ) : (
                      <p className="text-sm">Online Event</p>
                    )}
                  </div>
                </div>

                {/* Organizer Info */}
                <div>
                  <h3 className="font-semibold mb-3">Organizer Details</h3>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <p><strong>Name:</strong> {selectedEvent.organizer?.name || 'N/A'}</p>
                    <p><strong>Email:</strong> {selectedEvent.organizer?.email || 'N/A'}</p>
                  </div>
                </div>

                {/* Media */}
                {selectedEvent.media && (
                  <div>
                    <h3 className="font-semibold mb-3">Media</h3>
                    <div className="grid gap-4">
                      {selectedEvent.media.bannerImage && (
                        <div>
                          <p className="text-sm font-medium mb-2">Banner Image:</p>
                          <img 
                            src={`data:image/jpeg;base64,${selectedEvent.media.bannerImage}`} 
                            alt="Event Banner" 
                            className="max-w-md rounded-lg"
                          />
                        </div>
                      )}
                      {selectedEvent.media.images && selectedEvent.media.images.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Gallery ({selectedEvent.media.images.length} images):</p>
                          <div className="grid grid-cols-4 gap-2">
                            {selectedEvent.media.images.slice(0, 8).map((image, index) => (
                              <img 
                                key={index}
                                src={`data:image/jpeg;base64,${image}`} 
                                alt={`Gallery ${index + 1}`} 
                                className="w-full h-20 object-cover rounded"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tickets */}
                {selectedEvent.tickets && selectedEvent.tickets.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">Tickets</h3>
                    <div className="grid gap-2">
                      {selectedEvent.tickets.map((ticket, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium">{ticket.name}</p>
                            <p className="text-sm text-gray-600">Qty: {ticket.quantity}</p>
                          </div>
                          <p className="font-bold text-green-600">{ticket.price}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}