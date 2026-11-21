import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isPasswordHash } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function samePlainText(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

/**
 * POST /api/staff/login: gate staff sign in with the email and password the
 * organiser gave them. Passwords are stored as bcrypt hashes. Rows saved before
 * hashing was introduced still hold plain text: those are accepted once and
 * replaced by a hash straight away.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : '';
    const password = typeof body?.password === 'string' ? body.password.slice(0, 200) : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers: CORS });
    }

    const { db } = await connectToDatabase();
    const events = await db
      .collection('events')
      .find(
        { 'scannerStaff.email': email },
        { projection: { name: 1, startDate: 1, startTime: 1, location: 1, scannerStaff: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    for (const event of events) {
      const list: any[] = Array.isArray(event.scannerStaff) ? event.scannerStaff : [];

      for (const staff of list) {
        if (!staff || staff.email !== email || typeof staff.password !== 'string' || !staff.password) continue;

        let matched = false;
        if (isPasswordHash(staff.password)) {
          matched = await bcrypt.compare(password, staff.password);
        } else if (samePlainText(password, staff.password)) {
          matched = true;
          // Old row: swap the plain-text password for a hash now that it has been proven.
          const hash = await bcrypt.hash(password, 10);
          await db.collection('events').updateOne(
            { _id: event._id },
            { $set: { 'scannerStaff.$[member].password': hash } },
            { arrayFilters: [{ 'member.email': email, 'member.password': staff.password }] }
          );
        }

        if (matched) {
          return NextResponse.json(
            {
              success: true,
              event: {
                _id: event._id,
                name: event.name,
                startDate: event.startDate,
                startTime: event.startTime,
                location: event.location,
              },
              staff: { name: staff.name, email: staff.email, phone: staff.phone },
            },
            { headers: CORS }
          );
        }
      }
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers: CORS });
  } catch (error) {
    console.error('Staff login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500, headers: CORS });
  }
}
