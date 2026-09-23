import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

// Managed Neon Auth signs webhooks with Ed25519 detached JWS:
// X-Neon-Signature = "<header>..<signature>", signed over
// "<header>." + base64url("<timestamp>." + base64url(rawBody)).

export const NEON_AUTH_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export class NeonAuthWebhookSignatureError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'NeonAuthWebhookSignatureError';
  }
}

export type NeonAuthJwk = JsonWebKey & { kid?: string };

export async function verifyNeonAuthWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  kid: string | null;
  timestamp: string | null;
  loadJwks: (options: { refresh: boolean }) => Promise<NeonAuthJwk[]>;
  now?: number;
}) {
  const { rawBody, signature, kid, timestamp } = input;
  if (!signature || !kid || !timestamp) throw new NeonAuthWebhookSignatureError('headers_missing');
  if (!/^\d{10,16}$/.test(timestamp)) throw new NeonAuthWebhookSignatureError('timestamp_invalid');

  const age = (input.now ?? Date.now()) - Number(timestamp);
  if (Math.abs(age) > NEON_AUTH_WEBHOOK_MAX_AGE_MS) throw new NeonAuthWebhookSignatureError('timestamp_stale');

  const parts = signature.split('.');
  if (parts.length !== 3 || !parts[0] || parts[1] !== '' || !parts[2]) {
    throw new NeonAuthWebhookSignatureError('signature_format_invalid');
  }
  const [headerB64, , signatureB64] = parts;

  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch {
    throw new NeonAuthWebhookSignatureError('signature_header_invalid');
  }
  if (header.alg !== 'EdDSA' || (header.kid !== undefined && header.kid !== kid)) {
    throw new NeonAuthWebhookSignatureError('signature_header_invalid');
  }

  let jwk = (await input.loadJwks({ refresh: false })).find((key) => key.kid === kid);
  // Neon rotates signing keys without reconfiguration; refetch once on a miss.
  if (!jwk) jwk = (await input.loadJwks({ refresh: true })).find((key) => key.kid === kid);
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new NeonAuthWebhookSignatureError('signing_key_unknown');
  }

  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url');
  const signedPayloadB64 = Buffer.from(`${timestamp}.${payloadB64}`, 'utf8').toString('base64url');
  const signingInput = Buffer.from(`${headerB64}.${signedPayloadB64}`);

  let valid = false;
  try {
    const { kid: _kid, ...keyMaterial } = jwk;
    valid = verify(null, signingInput, createPublicKey({ key: keyMaterial, format: 'jwk' }), Buffer.from(signatureB64, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw new NeonAuthWebhookSignatureError('signature_invalid');
}
