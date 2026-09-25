import { NextResponse } from 'next/server';
import { createServerAuth } from '@/lib/neon/auth';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { readNeonSessionTokenCookie, withHostOnlyNeonAuthCookies } from '@/lib/neon/auth-cookies';

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
      || path.join('/') === 'email-otp/send-verification-otp'
      || path.join('/') === 'email-otp/verify-email'
    ))
  )) {
    // These public entry points would bypass the app's Turnstile and signup
    // consent audit. Only the guarded server actions may invoke them.
    return NextResponse.json({ error: 'Use the application authentication form.' }, { status: 403 });
  }

  // Two session cookies of the same name (legacy `Domain=` and host-only
  // variants) would be forwarded upstream as whichever one the parser keeps,
  // which may belong to an account that already signed out. proxy.ts expires
  // the legacy variant on this response; the next request is unambiguous.
  if (readNeonSessionTokenCookie(request.headers.get('cookie')).state === 'ambiguous') {
    return NextResponse.json({ error: 'Session is ambiguous. Please retry.' }, { status: 401 });
  }

  // Managed Neon Auth may scope its upstream cookie to the Neon hostname.
  // Re-home proxied cookies as host-only cookies, the same scope the sign-in
  // and sign-out server actions use, so there is only ever one copy.
  const handlers = createServerAuth().handler();
  return withHostOnlyNeonAuthCookies(await handlers[method](request, context));
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
