import { NextResponse } from 'next/server';
import { createServerAuth } from '@/lib/neon/auth';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type HandlerMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

function isNeonAuthAvailable() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) return false;
  if (process.env.VERCEL_ENV !== 'production') return true;
  if (getDatabaseBackend() !== 'neon') return false;
  assertApprovedNeonCutover();
  return true;
}

async function handle(method: HandlerMethod, request: Request, context: RouteContext) {
  if (!isNeonAuthAvailable()) {
    return NextResponse.json(
      { error: 'Neon Auth endpoint is unavailable.' },
      { status: 404 },
    );
  }

  const { path } = await context.params;
  if (method === 'POST' && path[0] === 'sign-up') {
    // The original signup flow records legal consent and verifies Turnstile.
    // Do not expose a direct Neon signup until those checks are server-side.
    return NextResponse.json({ error: 'Neon signup is not yet available.' }, { status: 403 });
  }

  // Managed Neon Auth may scope its upstream cookie to the Neon hostname.
  // Re-home proxied cookies to the exact Preview host so the browser keeps them.
  const handlers = createServerAuth(new URL(request.url).hostname).handler();
  return handlers[method](request, context);
}

export function GET(request: Request, context: RouteContext) {
  return handle('GET', request, context);
}

export function POST(request: Request, context: RouteContext) {
  return handle('POST', request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return handle('PUT', request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return handle('DELETE', request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return handle('PATCH', request, context);
}
