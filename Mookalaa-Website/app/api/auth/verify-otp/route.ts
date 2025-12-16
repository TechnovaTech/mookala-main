import { NextRequest, NextResponse } from 'next/server'

const ADMIN_API_URL = 'http://localhost:3000/api'

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()
    
    // Forward to existing admin panel user API
    const response = await fetch(`${ADMIN_API_URL}/user/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    })
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('OTP verification error:', error)
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 })
  }
}