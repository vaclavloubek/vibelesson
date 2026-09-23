import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 12_000;
const MIN_FILL_TIME_MS = 3_000;
const MAX_FILL_TIME_MS = 2 * 60 * 60 * 1_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;

const InquirySchema = z.object({
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(3000),
  company: z.string().max(200).default(''),
  startedAt: z.number().int().positive(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function requestHost(request: Request) {
  return request.headers.get('x-forwarded-host')
    ?? request.headers.get('host')
    ?? null;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = requestHost(request);
  if (!origin || !host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function clientIdentity(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? 'unknown';
  return `${ip}|${userAgent}`;
}

function hashValue(value: string) {
  const pepper = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pepper) throw new Error('contact_rate_limit_pepper_missing');
  return createHmac('sha256', pepper).update(value).digest('hex');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function deliverInquiryEmail(email: string, message: string, idempotencyKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) {
    throw new Error('resend_api_key_missing');
  }

  const text = [
    'Nový dotaz z titulní stránky Syllonautu',
    '',
    `E-mail: ${email}`,
    '',
    'Dotaz:',
    message,
  ].join('\n');

  const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#151721;background:#f6f5f1;margin:0;padding:24px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:640px;background:#ffffff;border:1px solid #deddd7;border-radius:18px;"><tr><td style="padding:24px;"><p style="margin:0 0 8px;font-size:11px;line-height:16px;color:#5b57e8;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Nový signál z webu</p><h1 style="margin:0 0 20px;font-size:24px;line-height:30px;color:#151721;">Dotaz z titulní stránky Syllonautu</h1><p style="margin:0 0 5px;font-size:12px;line-height:18px;color:#777a83;font-weight:700;">E-mail</p><p style="margin:0 0 20px;font-size:15px;line-height:23px;color:#151721;"><a href="mailto:${escapeHtml(email)}" style="color:#5b57e8;">${escapeHtml(email)}</a></p><p style="margin:0 0 5px;font-size:12px;line-height:18px;color:#777a83;font-weight:700;">Dotaz</p><p style="margin:0;font-size:15px;line-height:24px;color:#151721;white-space:pre-wrap;">${escapeHtml(message)}</p></td></tr></table></td></tr></table></body></html>`;

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: 'Syllonaut <info@syllonaut.com>',
        to: ['vaclav@syllonaut.com', 'vaclav.loubek@gmail.com'],
        reply_to: email,
        subject: 'Nový dotaz z titulní stránky Syllonautu',
        text,
        html,
        tags: [
          { name: 'type', value: 'landing_inquiry' },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('resend_network_error');
  }

  if (!response.ok) {
    throw new Error(`resend_http_${response.status}`);
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    throw new Error('resend_response_invalid');
  }

  return payload.id;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, 'invalid_origin');
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError(413, 'payload_too_large');
  }

  let input: z.infer<typeof InquirySchema>;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return jsonError(413, 'payload_too_large');
    }
    input = InquirySchema.parse(JSON.parse(rawBody));
  } catch {
    return jsonError(400, 'invalid_inquiry');
  }

  // Honeypot: real users never see or fill this field.
  if (input.company.trim()) {
    return NextResponse.json({ sent: true }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const elapsed = Date.now() - input.startedAt;
  if (elapsed < MIN_FILL_TIME_MS || elapsed > MAX_FILL_TIME_MS) {
    return jsonError(400, 'invalid_submission_timing');
  }

  let clientHash: string;
  let emailHash: string;
  try {
    clientHash = hashValue(clientIdentity(request));
    emailHash = hashValue(input.email.toLowerCase());
  } catch (error) {
    console.error('contact inquiry hash configuration failed', {
      code: error instanceof Error ? error.message : 'unknown',
    });
    return jsonError(503, 'contact_not_configured');
  }

  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const admin = createPrivilegedRpcClient();
  const { data: reservationId, error: reservationError } = await admin.rpc(
    'reserve_contact_form_rate_limit_server',
    {
      p_client_hash: clientHash,
      p_email_hash: emailHash,
      p_window_bucket: bucket,
    },
  );

  if (reservationError) {
    console.error('contact inquiry rate reservation failed', {
      code: reservationError.code,
    });
    return jsonError(503, 'contact_unavailable');
  }

  if (typeof reservationId !== 'string' || !reservationId) {
    return jsonError(429, 'rate_limited');
  }

  try {
    await deliverInquiryEmail(
      input.email.toLowerCase(),
      input.message,
      `syllonaut:contact:${reservationId}`,
    );
  } catch (error) {
    console.error('contact inquiry email delivery failed', {
      code: error instanceof Error ? error.message : 'unknown',
    });

    // Delivery failed, so release this rate-limit reservation and let the user retry.
    await admin.rpc('release_contact_form_rate_limit_server', {
      p_reservation_id: reservationId,
    });

    return jsonError(503, 'contact_delivery_failed');
  }

  return NextResponse.json({ sent: true }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
