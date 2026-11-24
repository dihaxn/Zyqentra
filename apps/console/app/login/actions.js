'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, passwordMatches } from '../../lib/session.mjs';

export async function signIn(_previous, form) {
  const secret = process.env.CONSOLE_SESSION_SECRET;
  const password = process.env.CONSOLE_PASSWORD;
  if (!secret || secret.length < 32 || !password || password.length < 12) {
    return { message: 'The console is not configured: set CONSOLE_PASSWORD and CONSOLE_SESSION_SECRET.' };
  }
  if (!passwordMatches(form.get('password'), password)) {
    // Slow down guessing a little; the console should also sit behind the tailnet.
    await new Promise((resolve) => setTimeout(resolve, 750));
    return { message: 'That password is not right.' };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect('/');
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
