import { NextRequest, NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get('userPhone');
    
    const url = userPhone 
      ? `${ADMIN_API_URL}/bookings?userPhone=${userPhone}`
      : `${ADMIN_API_URL}/bookings`;
    
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const bookingData = await request.json();
    
    const response = await fetch(`${ADMIN_API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}