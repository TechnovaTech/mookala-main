import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    
    const organizers = await db.collection('organizers')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ 
      success: true, 
      organizers: organizers,
      count: organizers.length
    });
  } catch (error) {
    console.error('Error fetching organizers:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch organizers' 
    }, { status: 500 });
  }
}