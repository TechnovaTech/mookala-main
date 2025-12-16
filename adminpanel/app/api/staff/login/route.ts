import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { email, password } = await request.json();

    // Find event with matching staff credentials
    const event = await db.collection('events').findOne({
      'scannerStaff': {
        $elemMatch: {
          email: email,
          password: password
        }
      }
    });

    if (!event) {
      return NextResponse.json({ error: 'Invalid credentials' }, { 
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Find the specific staff member
    const staff = event.scannerStaff.find((s: any) => s.email === email && s.password === password);

    return NextResponse.json({
      success: true,
      event: {
        _id: event._id,
        name: event.name,
        startDate: event.startDate,
        startTime: event.startTime,
        location: event.location
      },
      staff: {
        name: staff.name,
        email: staff.email,
        phone: staff.phone
      }
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}