const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000/api';

function transformEvent(adminEvent: any) {
  const getImageUrl = (event: any) => {
    // Check for base64 encoded image in media.bannerImage
    if (event.media?.bannerImage) {
      return `data:image/jpeg;base64,${event.media.bannerImage}`;
    }
    // Check for regular image URLs
    if (event.bannerImage) return event.bannerImage.startsWith('http') ? event.bannerImage : `http://localhost:3000${event.bannerImage}`;
    if (event.image) return event.image.startsWith('http') ? event.image : `http://localhost:3000${event.image}`;
    if (event.imageUrl) return event.imageUrl.startsWith('http') ? event.imageUrl : `http://localhost:3000${event.imageUrl}`;
    return '/placeholder.svg';
  };

  const cleanCategory = (cat: string) => {
    if (!cat) return 'General';
    // Remove 'categories.' prefix if it exists
    return cat.replace(/^categories\./, '');
  };

  return {
    id: adminEvent._id || adminEvent.id,
    title: adminEvent.name || adminEvent.title,
    description: adminEvent.description || '',
    image: getImageUrl(adminEvent),
    date: new Date(adminEvent.date || adminEvent.startDate),
    time: adminEvent.startTime || adminEvent.time || '12:00 PM',
    endDate: adminEvent.endDate ? new Date(adminEvent.endDate) : undefined,
    location: adminEvent.location?.name || adminEvent.location?.address || (typeof adminEvent.venue === 'object' ? adminEvent.venue.name : adminEvent.venue) || 'TBA',
    city: adminEvent.location?.city || (typeof adminEvent.venue === 'object' ? adminEvent.venue.city : adminEvent.city) || 'TBA',
    coordinates: { lat: 0, lng: 0 },
    category: cleanCategory(adminEvent.category || adminEvent.genre),
    price: adminEvent.price || adminEvent.ticketPrice || 0,
    isFree: adminEvent.isFree || adminEvent.price === 0,
    isOnline: adminEvent.isOnline || false,
    organizer: {
      id: adminEvent.organizer?.id || '1',
      name: adminEvent.organizer?.name || adminEvent.organizerName || 'Organizer',
      image: adminEvent.organizer?.image || '/placeholder.svg',
      verified: adminEvent.organizer?.verified || false,
      events: adminEvent.organizer?.events || 0,
      followers: adminEvent.organizer?.followers || 0,
    },
    attendees: adminEvent.attendees || 0,
    tags: adminEvent.tags || [],
    featured: adminEvent.featured || false,
    rating: adminEvent.rating || 0,
  };
}

export async function fetchApprovedEvents(category?: string) {
  try {
    const url = category 
      ? `${ADMIN_API_URL}/events/approved?category=${encodeURIComponent(category)}`
      : `${ADMIN_API_URL}/events/approved`;
    
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }
    
    const data = await response.json();
    const events = data.events || [];
    return events.map(transformEvent);
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
}

export async function fetchCategories() {
  try {
    const response = await fetch(`${ADMIN_API_URL}/genres`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch categories');
    }
    
    const data = await response.json();
    return data.genres || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

async function fetchOrganizerEventCount(organizerId: string) {
  try {
    const response = await fetch(`${ADMIN_API_URL}/organizers/${organizerId}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      return data.organizer?.events?.length || 0;
    }
  } catch (error) {
    console.error('Error fetching organizer events:', error);
  }
  return 0;
}

export async function fetchEventById(id: string) {
  try {
    const response = await fetch(`${ADMIN_API_URL}/events/${id}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch event');
    }
    
    const data = await response.json();
    if (data.event) {
      const event = transformEvent(data.event);
      // Fetch organizer's total event count
      if (data.event.organizerId) {
        const eventCount = await fetchOrganizerEventCount(data.event.organizerId);
        event.organizer.events = eventCount;
      }
      return event;
    }
    return null;
  } catch (error) {
    console.error('Error fetching event:', error);
    return null;
  }
}
