import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'mookalaa-secret-key';

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest) {
  return request.cookies.get('auth-token')?.value || 
         request.headers.get('authorization')?.replace('Bearer ', '');
}