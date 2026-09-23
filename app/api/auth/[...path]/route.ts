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
  if (method === 'POST' && (
    path[0] === 'sign-up'
    || (getDatabaseBackend() === 'neon' && (
      path.join('/') === 'sign-in/email'
      || path.join('/') === 'request-password-reset'
    ))
  )) {
    // These public entry points would bypass the app's Turnstile and signup
    // consent audit. Only the guarded server actions may invoke them.
    return NextResponse.json({ error: 'Use the application authentication form.' }, { status: 403 });
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
