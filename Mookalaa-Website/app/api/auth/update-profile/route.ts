import { NextRequest, NextResponse } from 'next/server'

const ADMIN_API_URL = 'http://localhost:3000/api'

export async function POST(request: NextRequest) {
  try {
    const profileData = await request.json()
    
    // Forward to existing admin panel user API
    const response = await fetch(`${ADMIN_API_URL}/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    })
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json({ success: false, error: 'Profile update failed' }, { status: 500 })
  }
}