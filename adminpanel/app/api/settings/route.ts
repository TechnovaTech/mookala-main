import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const settings = await db.collection('settings').findOne({ type: 'platform' });
    
    return NextResponse.json({ 
      success: true, 
      settings: settings || { platformCharges: '' }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { platformCharges } = await request.json();
    
    if (!platformCharges) {
      return NextResponse.json({ success: false, error: 'Platform charges is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('settings').updateOne(
      { type: 'platform' },
      { 
        $set: {
          platformCharges: parseFloat(platformCharges),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save settings' }, { status: 500 });
  }
}
