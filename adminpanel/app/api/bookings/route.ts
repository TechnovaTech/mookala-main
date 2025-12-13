import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get('userPhone');

    if (userPhone) {
      // Get bookings for specific user
      const bookings = await db.collection('bookings')
        .find({ userPhone })
        .sort({ bookingDate: -1 })
        .toArray();
      
      return NextResponse.json({ success: true, bookings });
    } else {
      // Get all bookings for admin
      const bookings = await db.collection('bookings')
        .find({})
        .sort({ bookingDate: -1 })
        .toArray();
      
      return NextResponse.json({ success: true, bookings });
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const bookingData = await request.json();

    // Add timestamp and generate booking ID
    const booking = {
      ...bookingData,
      bookingDate: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('bookings').insertOne(booking);
    
    return NextResponse.json({ 
      success: true, 
      bookingId: result.insertedId,
      message: 'Booking created successfully' 
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}