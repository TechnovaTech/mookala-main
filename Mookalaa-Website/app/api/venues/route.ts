import { NextRequest, NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    const url = name 
      ? `${ADMIN_API_URL}/venues?name=${encodeURIComponent(name)}`
      : `${ADMIN_API_URL}/venues`;
    
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch venues' },
      { status: 500 }
    );
  }
}