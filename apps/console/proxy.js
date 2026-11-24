import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session.mjs';

/**
 * Every page needs a signed console session. Server actions check it again,
 * because a proxy is a convenience, not the security boundary.
 */
export function proxy(request) {
  const isLogin = request.nextUrl.pathname.startsWith('/login');
  const signedIn = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.CONSOLE_SESSION_SECRET);
  if (isLogin) {
    return signedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (!signedIn) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
