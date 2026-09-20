import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import {
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE_MAX_AGE,
  createTrustedDeviceToken,
} from '@/lib/device-cookie';
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

function ensureTrustedDeviceCookie(response: NextResponse, request: NextRequest) {
  const current = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value ?? '';
  if (/^[0-9a-f]{64}$/.test(current)) return;

  response.cookies.set(TRUSTED_DEVICE_COOKIE, createTrustedDeviceToken(), {
    path: '/',
    maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE,
    httpOnly: true,
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
    ensureTrustedDeviceCookie(response, request);
    return response;
  }

  if ((pathname === '/pricing' || pathname === '/gdpr' || pathname === '/terms') && request.method === 'GET') {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}${pathname}`;
    const response = NextResponse.redirect(target);
    persistLocale(response, request, locale);
    ensureTrustedDeviceCookie(response, request);
    return response;
  }

  if (pathLocale && request.method === 'GET') {
    const gatewayPath = localizedAppGatewayPath(pathname, pathLocale);
    if (gatewayPath) {
      const target = request.nextUrl.clone();
      target.pathname = gatewayPath;
      const response = NextResponse.redirect(target);
      persistLocale(response, request, pathLocale);
      ensureTrustedDeviceCookie(response, request);
      return response;
    }
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(LOCALE_REQUEST_HEADER, locale);
  const response = await updateSession(request, forwardedHeaders);

  if (pathLocale && cookieLocale !== pathLocale) {
    persistLocale(response, request, pathLocale);
  }
  ensureTrustedDeviceCookie(response, request);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
