import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { CURRENT_TERMS_REQUIRED_HEADER, requestRequiresCurrentTerms } from '@/lib/terms-gate';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_REQUEST_HEADER,
  localeFromPathname,
  resolveUiLocale,
} from '@/lib/i18n';

function persistLocale(response: NextResponse, request: NextRequest, locale: 'cs' | 'en') {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  });
}

function localizedAppGatewayPath(pathname: string, locale: 'cs' | 'en') {
  const prefix = `/${locale}`;
  const unprefixed = pathname.slice(prefix.length);

  if (
    unprefixed === '/new'
    || unprefixed === '/lessons'
    || unprefixed.startsWith('/lessons/')
    || unprefixed.startsWith('/s/')
    || unprefixed === '/school'
    || unprefixed.startsWith('/school/')
  ) {
    return unprefixed;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const pathLocale = localeFromPathname(pathname);
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const locale = resolveUiLocale({
    pathLocale,
    cookieLocale,
    country: request.headers.get('x-vercel-ip-country'),
    acceptLanguage: request.headers.get('accept-language'),
  });

  if (pathname === '/' && request.method === 'GET') {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}`;
    const response = NextResponse.redirect(target);
    persistLocale(response, request, locale);
    return response;
  }

  if ((pathname === '/pricing' || pathname === '/gdpr' || pathname === '/terms' || pathname === '/dpa' || pathname === '/withdrawal' || pathname === '/complaint' || pathname === '/requirements') && request.method === 'GET') {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}${pathname}`;
    const response = NextResponse.redirect(target);
    persistLocale(response, request, locale);
    return response;
  }

  if (pathLocale && request.method === 'GET') {
    const gatewayPath = localizedAppGatewayPath(pathname, pathLocale);
    if (gatewayPath) {
      const target = request.nextUrl.clone();
      target.pathname = gatewayPath;
      const response = NextResponse.redirect(target);
      persistLocale(response, request, pathLocale);
        return response;
    }
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(LOCALE_REQUEST_HEADER, locale);
  forwardedHeaders.delete(CURRENT_TERMS_REQUIRED_HEADER);
  if (requestRequiresCurrentTerms(pathname, request.method)) {
    forwardedHeaders.set(CURRENT_TERMS_REQUIRED_HEADER, '1');
  }
  assertApprovedNeonCutover();
  let response: NextResponse;
  if (getDatabaseBackend() === 'neon') {
    response = NextResponse.next({ request: { headers: forwardedHeaders } });
  } else {
    response = await updateSession(request, forwardedHeaders);
  }

  if (pathLocale && cookieLocale !== pathLocale) {
    persistLocale(response, request, pathLocale);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/stripe/webhook|api/webhooks/neon-auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
