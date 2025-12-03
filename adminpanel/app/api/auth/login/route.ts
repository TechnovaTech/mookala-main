import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '@/lib/mongodb';

const JWT_SECRET = process.env.JWT_SECRET || 'mookalaa-secret-key';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const { db } = await connectToDatabase();
    
    const admin = await db.collection('admins').findOne({ email });
    
    if (!admin) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, admin.password);

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = jwt.sign(
      { email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const response = NextResponse.json({ success: true, token });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}