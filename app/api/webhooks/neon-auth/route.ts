import { NextResponse } from 'next/server';
import {
  lookupNeonAuthEmailLocale,
  neonAuthEmailAllowedOrigins,
  NeonAuthEmailDeliveryError,
  sendNeonAuthEmail,
} from '@/lib/neon-auth-email';
import {
  neonAuthEmailAction,
  NeonAuthEmailPayloadError,
  renderNeonAuthEmail,
  type NeonAuthWebhookPayload,
} from '@/lib/neon-auth-email-core';
import {
  NeonAuthWebhookSignatureError,
  verifyNeonAuthWebhookSignature,
  type NeonAuthJwk,
} from '@/lib/neon-auth-webhook-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const JWKS_MIN_REFRESH_MS = 30_000;

let jwksCache: { keys: NeonAuthJwk[]; fetchedAt: number } | null = null;

async function loadJwks(authBaseUrl: string, { refresh }: { refresh: boolean }) {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_MIN_REFRESH_MS;
  if (jwksCache && (!refresh || fresh)) return jwksCache.keys;
  let body: { keys?: unknown };
  try {
    const response = await fetch(`${authBaseUrl.replace(/\/$/, '')}/.well-known/jwks.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error('jwks_http');
    body = await response.json() as { keys?: unknown };
  } catch {
    throw new NeonAuthWebhookSignatureError('jwks_unavailable');
  }
  const keys = Array.isArray(body.keys) ? body.keys as NeonAuthJwk[] : [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

export async function POST(request: Request) {
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!authBaseUrl) return NextResponse.json({ error: 'unavailable' }, { status: 404 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  try {
    await verifyNeonAuthWebhookSignature({
      rawBody,
      signature: request.headers.get('x-neon-signature'),
      kid: request.headers.get('x-neon-signature-kid'),
      timestamp: request.headers.get('x-neon-timestamp'),
      loadJwks: (options) => loadJwks(authBaseUrl, options),
    });
  } catch (error) {
    const code = error instanceof NeonAuthWebhookSignatureError ? error.code : 'verification_failed';
    // A JWKS outage is transient; let Neon retry. Everything else is a hard reject.
    return NextResponse.json({ error: code }, { status: code === 'jwks_unavailable' ? 503 : 401 });
  }

  let payload: NeonAuthWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'payload_invalid' }, { status: 400 });
  }

  if (payload.event_type !== 'send.otp' && payload.event_type !== 'send.magic_link') {
    // Only email delivery events are subscribed; acknowledge anything else.
    return NextResponse.json({ ok: true });
  }

  try {
    const { recipient, eventId, userId, action } = neonAuthEmailAction(payload, {
      authBaseUrl,
      allowedAppOrigins: neonAuthEmailAllowedOrigins(),
    });
    const locale = await lookupNeonAuthEmailLocale({ userId, email: recipient });
    await sendNeonAuthEmail({
      to: recipient,
      rendered: renderNeonAuthEmail(action, locale),
      idempotencyKey: `neon-auth/${eventId}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NeonAuthEmailPayloadError) {
      console.warn('neon_auth_email_rejected', { code: error.code, event: payload.event_type });
      return NextResponse.json({ error: error.code }, { status: 422 });
    }
    const code = error instanceof NeonAuthEmailDeliveryError ? error.code : 'delivery_failed';
    console.error('neon_auth_email_failed', { code, event: payload.event_type });
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
