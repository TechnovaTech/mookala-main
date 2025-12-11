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
    
    // Find organizer by phone if organizerPhone is provided
    if (eventData.organizerPhone) {
      const organizer = await db.collection('organizers').findOne({ phone: eventData.organizerPhone });
      if (!organizer) {
        return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
      }
      eventData.organizerId = organizer._id;
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
      languages: eventData.languages || eventData.language ? [eventData.language] : [],
      description: eventData.description || null,
      terms: eventData.terms || null,
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