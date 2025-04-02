import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Set SameSite=None for cross-site cookies
  response.cookies.set({
    name: '__vercel_live_token',
    value: request.cookies.get('__vercel_live_token')?.value || '',
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  return response;
}

export const config = {
  matcher: '/:path*',
}; 