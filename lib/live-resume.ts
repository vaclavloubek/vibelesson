import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const LIVE_RESUME_TTL_SECONDS = 10 * 60 * 60;
const TOKEN_NAMESPACE = 'syllonaut-live-resume-v1';

export type LiveResume = {
  sessionId: string;
  userId: string;
  expiresAt: string;
};

type Payload = {
  v: 1;
  sid: string;
  sub: string;
  exp: number;
};

function cookieName(sessionId: string) {
  return `syllonaut_live_resume_${sessionId}`;
}

function secret() {
  const value = process.env.LIVE_BOOTSTRAP_SECRET;
  return value && value.length >= 24 ? value : null;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function sign(payloadPart: string, value: string) {
  return createHmac('sha256', value)
    .update(`${TOKEN_NAMESPACE}:${payloadPart}`)
    .digest('base64url');
}

function mint(sessionId: string, userId: string) {
  const value = secret();
  if (!value) return null;

  const exp = Math.floor(Date.now() / 1000) + LIVE_RESUME_TTL_SECONDS;
  const payload: Payload = { v: 1, sid: sessionId, sub: userId, exp };
  const payloadPart = encode(JSON.stringify(payload));
  return {
    token: `${payloadPart}.${sign(payloadPart, value)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

function verify(token: string, sessionId: string): LiveResume | null {
  const value = secret();
  if (!value) return null;

  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;

  try {
    const expected = Buffer.from(sign(payloadPart, value));
    const actual = Buffer.from(signaturePart);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Partial<Payload>;
    if (
      payload.v !== 1
      || payload.sid !== sessionId
      || typeof payload.sub !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(payload.sub)
      || typeof payload.exp !== 'number'
      || payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      sessionId,
      userId: payload.sub,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readLiveResume(sessionId: string) {
  const store = await cookies();
  const raw = store.get(cookieName(sessionId))?.value;
  return raw ? verify(raw, sessionId) : null;
}

export async function setLiveResumeCookie(sessionId: string, userId: string) {
  const current = mint(sessionId, userId);
  if (!current) return false;

  const store = await cookies();
  store.set(cookieName(sessionId), current.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: LIVE_RESUME_TTL_SECONDS,
  });
  return true;
}

export async function clearLiveResumeCookie(sessionId: string) {
  const store = await cookies();
  store.set(cookieName(sessionId), '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function clearAllLiveResumeCookies() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (!cookie.name.startsWith('syllonaut_live_resume_')) continue;
    store.set(cookie.name, '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
