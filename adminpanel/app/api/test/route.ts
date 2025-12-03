import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const admin = await db.collection('admins').findOne({ email: 'admin@mookalaa.com' });
    return NextResponse.json({ 
      success: true, 
      adminExists: !!admin,
      email: admin?.email 
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}