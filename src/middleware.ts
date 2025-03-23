import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Set secure and SameSite attributes for cookies
  if (request.cookies.has('__vercel_live_token')) {
    const cookie = request.cookies.get('__vercel_live_token');
    if (cookie) {
      response.cookies.set({
        name: '__vercel_live_token',
        value: cookie.value,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/'
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 