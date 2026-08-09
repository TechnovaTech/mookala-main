import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    
    const events = await db.collection('events').aggregate([
      {
        $lookup: {
          from: 'organizers',
          localField: 'organizerId',
          foreignField: '_id',
          as: 'organizer'
        }
      },
      {
        $lookup: {
          from: 'artists',
          localField: 'organizerId',
          foreignField: '_id',
          as: 'artist'
        }
      },
      {
        $lookup: {
          from: 'venues',
          let: { venueId: { $toObjectId: '$venue' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$venueId'] } } }
          ],
          as: 'venueDetails'
        }
      },
      {
        $unwind: {
          path: '$organizer',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$artist',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$venueDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]).toArray();

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const eventData = await request.json();
    console.log('Received event data:', eventData);
    
    // Find the creator by phone if organizerPhone is provided.
    // Events can be created by an organizer or by an artist, so look in the
    // collection matching the sent role first, then fall back to the other.
    if (eventData.organizerPhone) {
      const collections = eventData.organizerRole === 'artist'
        ? ['artists', 'organizers']
        : ['organizers', 'artists'];

      let creator = null;
      let creatorRole = null;
      for (const collection of collections) {
        creator = await db.collection(collection).findOne({ phone: eventData.organizerPhone });
        if (creator) {
          creatorRole = collection === 'artists' ? 'artist' : 'organizer';
          break;
        }
      }

      if (!creator) {
        return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
      }
      eventData.organizerId = creator._id;
      eventData.creatorRole = creatorRole;
      delete eventData.organizerPhone;
      delete eventData.organizerRole;
    }
    
    // Convert organizerId and artist IDs to ObjectId
    if (eventData.organizerId) {
      eventData.organizerId = new ObjectId(eventData.organizerId);
    }
    
    if (eventData.artists && Array.isArray(eventData.artists)) {
      eventData.artists = eventData.artists.map((id: string) => new ObjectId(id));
    }
    
    const newEvent = {
      ...eventData,
      category: eventData.category || null,
      subCategories: eventData.subCategories && Array.isArray(eventData.subCategories)
        ? eventData.subCategories.filter((sub: any) => sub && sub.trim() !== '')
        : [],
      languages: eventData.languages && Array.isArray(eventData.languages) 
        ? eventData.languages.filter((lang: any) => lang && lang.trim() !== '') 
        : eventData.language 
        ? [eventData.language] 
        : [],
      scannerStaff: eventData.scannerStaff && Array.isArray(eventData.scannerStaff)
        ? eventData.scannerStaff.filter((staff: any) => staff && staff.name && staff.email)
        : [],
      description: eventData.description || null,
      terms: eventData.terms || null,
      photographyContact: eventData.photographyContact || null,
      status: eventData.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('events').insertOne(newEvent);
    
    return NextResponse.json({ 
      message: 'Event created successfully',
      eventId: result.insertedId 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}