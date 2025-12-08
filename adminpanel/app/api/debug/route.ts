import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const decoded = token ? verifyToken(token) : null;
  
  return NextResponse.json({
    hasToken: !!token,
    tokenValid: !!decoded,
    token: token?.substring(0, 20) + '...',
    decoded
  });
}