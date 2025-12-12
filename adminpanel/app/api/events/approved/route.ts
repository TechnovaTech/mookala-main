import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    // Build match criteria
    const matchCriteria: any = {
      status: 'approved',
      $or: [
        { artistResponse: 'accepted' },
        { 
          $and: [
            { $or: [{ artists: { $exists: false } }, { artists: { $size: 0 } }] },
            { artistResponse: { $exists: false } }
          ]
        }
      ]
    };
    
    // Add category filter if provided
    if (category) {
      matchCriteria.category = { $regex: new RegExp(category, 'i') };
    }
    
    const events = await db.collection('events').aggregate([
      {
        $match: matchCriteria
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
          path: '$venueDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          venue: {
            $ifNull: ['$venueDetails', '$venue']
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]).toArray();

    return NextResponse.json({ 
      success: true, 
      events: events,
      count: events.length
    });
  } catch (error) {
    console.error('Error fetching approved events:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch events' 
    }, { status: 500 });
  }
}
