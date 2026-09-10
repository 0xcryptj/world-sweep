import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/home', '/wallet', '/profile'];

export default auth((req) => {
  const isAuthenticated = Boolean(req.auth);
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !isAuthenticated) {
    return NextResponse.redirect(new URL('/enter', req.url));
  }

  if ((pathname === '/' || pathname === '/enter') && isAuthenticated) {
    return NextResponse.redirect(new URL('/home', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/', '/enter', '/home/:path*', '/wallet/:path*', '/profile/:path*'],
};
