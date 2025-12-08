import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    
    const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
    
    return NextResponse.json({ 
      success: true, 
      users: users.map(user => ({
        id: user._id,
        phone: user.phone,
        name: user.name || 'N/A',
        email: user.email || 'N/A',
        city: user.city || 'N/A',
        status: user.status || 'pending',
        isActive: user.isActive !== false,
        genres: user.genres || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }))
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}