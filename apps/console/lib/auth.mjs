import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from './session.mjs';

export async function isSignedIn() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, process.env.CONSOLE_SESSION_SECRET);
}

export async function requireSession() {
  if (!(await isSignedIn())) throw new Error('Sign in again.');
}
