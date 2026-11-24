import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'zyqentra_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CONSOLE_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

/** A signed, expiring session token: base64url(JSON payload) + "." + HMAC. */
export function createSessionToken(secret, now = Date.now()) {
  assertSecret(secret);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return false;
  if (!safeEqual(signature, sign(payload, secret))) return false;
  try {
    const { v, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return v === 1 && Number.isFinite(exp) && exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

/** Compare a submitted password with the configured one without leaking timing. */
export function passwordMatches(submitted, expected) {
  if (typeof expected !== 'string' || expected.length < 12) return false;
  const a = createHmac('sha256', 'zyqentra-password').update(String(submitted ?? '')).digest();
  const b = createHmac('sha256', 'zyqentra-password').update(expected).digest();
  return timingSafeEqual(a, b);
}
