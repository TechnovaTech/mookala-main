'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, MapPin, Users, Clock, Video, Music, ArrowLeft, Mail, Phone, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

interface Event {
  _id: string;
  name: string;
  category?: string;
  subCategories?: string[];
  languages?: string[];
  description?: string;
  terms?: string;
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
  media?: {
    bannerImage?: string;
    promotionalVideo?: string;
    images?: string[];
  };
  organizer: {
    name: string;
    email: string;
    phone?: string;
  };
  artist?: {
    name: string;
    email: string;
    phone?: string;
  };
  artistDetails?: Array<{
    _id: string;
    name: string;
    genre?: string;
    email?: string;
    phone?: string;
  }>;
  tickets?: Array<{
    name: string;
    price: string;
    quantity: string;
  }>;
  createdAt: string;
}

export default function EventDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchEventDetails(params.id as string);
    }
  }, [params.id]);

  const fetchEventDetails = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      const data = await response.json();
      setEvent(data.event);
    } catch (error) {
      console.error('Error fetching event details:', error);
    } finally {
      setLoading(false);
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
      case 'venue': return <MapPin className="w-5 h-5" />;
      case 'online': return <Video className="w-5 h-5" />;
      case 'recorded': return <Music className="w-5 h-5" />;
      default: return <MapPin className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Event Not Found</h1>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/events')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} className="text-slate-gray" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-deep-blue">Event Details</h1>
                <p className="text-slate-gray text-sm">View complete event information</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
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
          <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">{event.name}</h2>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-2">
                  {getLocationTypeIcon(event.locationType)}
                  <span className="capitalize">{event.locationType} Event</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{event.startDate} at {event.startTime}</span>
                </div>
              </div>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(event.status)}`}>
              {event.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Category & Details */}
          {(event.category || event.description || event.terms) && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Event Details</h2>
              <div className="space-y-4">
                {event.category && (
                  <div>
                    <h3 className="font-semibold mb-2">Category</h3>
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {event.category}
                    </span>
                  </div>
                )}
                {event.subCategories && event.subCategories.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Sub Categories</h3>
                    <div className="flex flex-wrap gap-2">
                      {event.subCategories.map((sub, index) => (
                        <span key={index} className="inline-block px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {event.languages && event.languages.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Languages</h3>
                    <div className="flex flex-wrap gap-2">
                      {event.languages.map((lang, index) => (
                        <span key={index} className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {event.description && (
                  <div>
                    <h3 className="font-semibold mb-2">Description</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">{event.description}</p>
                  </div>
                )}
                {event.terms && (
                  <div>
                    <h3 className="font-semibold mb-2">Terms & Conditions</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">{event.terms}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Event Details Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Event Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Date & Time</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span>Start: {event.startDate} at {event.startTime}</span>
                  </div>
                  {event.endDate && event.endTime && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>End: {event.endDate} at {event.endTime}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Location Details</h3>
                {event.locationType === 'venue' && event.location ? (
                  <div className="space-y-1 text-sm">
                    <p><strong>Venue:</strong> {event.location.name}</p>
                    <p><strong>Address:</strong> {event.location.address}</p>
                    <p><strong>City:</strong> {event.location.city}</p>
                  </div>
                ) : event.locationType === 'recorded' && event.recordedDetails ? (
                  <div className="space-y-1 text-sm">
                    <p><strong>Platform:</strong> {event.recordedDetails.platform}</p>
                    <p><strong>Video Link:</strong> 
                      <a href={event.recordedDetails.videoLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                        {event.recordedDetails.videoLink}
                      </a>
                    </p>
                    {event.recordedDetails.accessInstructions && (
                      <div className="mt-2">
                        <strong>Access Instructions:</strong>
                        <p className="mt-1 p-2 bg-gray-50 rounded text-xs">{event.recordedDetails.accessInstructions}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm">Online Event</p>
                )}
              </div>
            </div>
          </div>

          {/* Organizer/Artist Details */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Contact Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {event.organizer && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Organizer Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Name:</strong> {event.organizer.name}</p>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span>{event.organizer.email}</span>
                    </div>
                    {event.organizer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        <span>{event.organizer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(event.artist || (event.artistDetails && event.artistDetails.length > 0)) && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    Artist Details
                  </h3>
                  {event.artist && (
                    <div className="space-y-2 text-sm mb-4">
                      <p><strong>Name:</strong> {event.artist.name}</p>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-500" />
                        <span>{event.artist.email}</span>
                      </div>
                      {event.artist.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <span>{event.artist.phone}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {event.artistDetails && event.artistDetails.length > 0 && (
                    <div className="space-y-3">
                      {event.artistDetails.map((artist, index) => (
                        <div key={artist._id} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium">{artist.name}</p>
                          {artist.genre && <p className="text-sm text-gray-600">Genre: {artist.genre}</p>}
                          {artist.email && (
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <Mail className="w-3 h-3 text-gray-500" />
                              <span>{artist.email}</span>
                            </div>
                          )}
                          {artist.phone && (
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <Phone className="w-3 h-3 text-gray-500" />
                              <span>{artist.phone}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tickets */}
          {event.tickets && event.tickets.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Ticket Information</h2>
              <div className="grid gap-4">
                {event.tickets.map((ticket, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold">{ticket.name}</h3>
                        <p className="text-sm text-gray-600">Quantity: {ticket.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">{ticket.price}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media */}
          {event.media && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Media</h2>
              <div className="space-y-4">
                {event.media.bannerImage && (
                  <div>
                    <h3 className="font-semibold mb-2">Banner Image</h3>
                    <img 
                      src={`data:image/jpeg;base64,${event.media.bannerImage}`} 
                      alt="Event Banner" 
                      className="max-w-md rounded-lg shadow-sm"
                    />
                  </div>
                )}
                {event.media.promotionalVideo && (
                  <div>
                    <h3 className="font-semibold mb-2">Promotional Video</h3>
                    <a 
                      href={event.media.promotionalVideo} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {event.media.promotionalVideo}
                    </a>
                  </div>
                )}
                {event.media.images && event.media.images.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Gallery Images ({event.media.images.length})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {event.media.images.map((image, index) => (
                        <img 
                          key={index}
                          src={`data:image/jpeg;base64,${image}`} 
                          alt={`Gallery ${index + 1}`} 
                          className="w-full h-24 object-cover rounded-lg shadow-sm"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Event Metadata</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Event ID:</strong> {event._id}</p>
              <p><strong>Created:</strong> {new Date(event.createdAt).toLocaleString()}</p>
              <p><strong>Status:</strong> {event.status}</p>
            </div>
          </div>
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}