import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
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

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(LOCALE_REQUEST_HEADER, locale);
  const response = await updateSession(request, forwardedHeaders);

  if (pathLocale && cookieLocale !== pathLocale) {
    persistLocale(response, request, pathLocale);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
