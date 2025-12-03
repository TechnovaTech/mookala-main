import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenEdge } from './lib/jwt-edge';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log('Middleware:', pathname);

  // Skip middleware for API routes, static files, and login
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname === '/login'
  ) {
    console.log('Skipping middleware for:', pathname);
    return NextResponse.next();
  }

  // Protect dashboard and root
  if (pathname === '/' || pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token')?.value;
    console.log('Checking auth for:', pathname, 'Token exists:', !!token);
    
    if (!token) {
      console.log('No token, redirecting to login');
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const isValid = verifyTokenEdge(token, process.env.JWT_SECRET || 'mookalaa-secret-key');
    console.log('Token valid:', isValid);
    
    if (!isValid) {
      console.log('Invalid token, redirecting to login');
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
};