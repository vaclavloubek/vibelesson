import { createHmac } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 2_000;
const CAPABILITY_TTL_SECONDS = 4 * 60 * 60;

type LiveRole = 'teacher' | 'student';
type CapabilityPayload = { v: 1; sid: string; role: LiveRole; sub: string; exp: number };

function config() {
  const baseUrl = process.env.LIVE_CONTROL_PLANE_URL?.replace(/\/$/, '');
  const bootstrapSecret = process.env.LIVE_CONTROL_PLANE_BOOTSTRAP_SECRET;
  const capabilitySecret = process.env.LIVE_CONTROL_PLANE_CAPABILITY_SECRET;
  if (!baseUrl || !bootstrapSecret || !capabilitySecret) return null;
  return { baseUrl, bootstrapSecret, capabilitySecret };
}

function signCapability(payload: CapabilityPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function serverRequest(path: string, body: unknown) {
  const cfg = config();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Syllonaut-Bootstrap': cfg.bootstrapSecret },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error('Live control plane server request failed', response.status, path);
      return null;
    }
    return await response.json() as Record<string, unknown>;
  } catch (error) {
    console.error('Live control plane server request failed', path, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createLiveCapability(sessionId: string, role: LiveRole, subject: string) {
  const cfg = config();
  if (!cfg) return null;
  const exp = Math.floor(Date.now() / 1000) + CAPABILITY_TTL_SECONDS;
  return {
    baseUrl: cfg.baseUrl,
    token: signCapability({ v: 1, sid: sessionId, role, sub: subject, exp }, cfg.capabilitySecret),
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function mirrorLiveSnapshot(sessionId: string, scope: string, state: unknown) {
  return serverRequest(`/v1/sessions/${encodeURIComponent(sessionId)}/mirror`, { scope, state });
}

export async function pushLiveControlEvent(sessionId: string, type: string, payload: unknown, operationId: string) {
  return serverRequest(`/v1/sessions/${encodeURIComponent(sessionId)}/server-event`, { type, payload, operationId });
}
