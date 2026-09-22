import { NextResponse } from 'next/server';
import { createServerAuth } from '@/lib/neon/auth';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type HandlerMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

function isPreviewAuthAvailable() {
  return process.env.VERCEL_ENV !== 'production'
    && Boolean(process.env.NEON_AUTH_BASE_URL)
    && Boolean(process.env.NEON_AUTH_COOKIE_SECRET);
}

async function handle(method: HandlerMethod, request: Request, context: RouteContext) {
  if (!isPreviewAuthAvailable()) {
    return NextResponse.json(
      { error: 'Neon Auth staging endpoint is unavailable.' },
      { status: 404 },
    );
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
