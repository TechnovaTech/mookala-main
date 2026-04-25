import { NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://mookala.vercel.app/api';

export async function GET() {
  try {
    const response = await fetch(`${ADMIN_API_URL}/payment/config`, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment config' },
      { status: 500 }
    );
  }
}