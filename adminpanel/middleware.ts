import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenEdge } from './lib/jwt-edge';
import { accessForApi, can, normaliseRole, permissionForPath } from './lib/permissions';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
};

function withCors(response: NextResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

function readToken(request: NextRequest): string | undefined {
  const cookie = request.cookies.get('auth-token')?.value;
  if (cookie) return cookie;
  const header = request.headers.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** The signed-in admin, or null. A token issued to an app user is never an admin session. */
async function readAdmin(request: NextRequest) {
  const payload = await verifyTokenEdge(readToken(request));
  if (!payload || payload.typ === 'app' || !normaliseRole(payload.role)) return null;
  return payload;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* ---------------------------- API routes ---------------------------- */
  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    const access = accessForApi(pathname, request.method);
    if (access === 'public') return withCors(NextResponse.next());

    const admin = await readAdmin(request);
    if (!admin) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'Unauthorized. Please sign in to the admin panel.' },
          { status: 401 }
        )
      );
    }

    if (access !== 'admin' && !can(admin, access)) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'You do not have permission to do this.' },
          { status: 403 }
        )
      );
    }

    return withCors(NextResponse.next());
  }

  /* ------------------------------ Pages ------------------------------ */
  const admin = await readAdmin(request);

  if (pathname === '/login') {
    if (admin) return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  if (!admin) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/') return NextResponse.redirect(new URL('/dashboard', request.url));

  // A temporary password or a required 2FA must be dealt with first: every page
  // except My Account leads there. The server checks the same rule on every API.
  if (admin.lim && pathname !== '/security/account' && pathname !== '/forbidden') {
    const account = new URL('/security/account', request.url);
    account.searchParams.set('required', String(admin.lim));
    return NextResponse.redirect(account);
  }

  const needed = permissionForPath(pathname);
  if (needed && !can(admin, needed) && pathname !== '/forbidden') {
    return NextResponse.redirect(new URL('/forbidden', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static files in /public.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml|json)$).*)'],
};
