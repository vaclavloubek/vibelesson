export const UI_LOCALES = ['cs', 'en'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const LOCALE_COOKIE = 'syllonaut_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const LOCALE_REQUEST_HEADER = 'x-syllonaut-locale';

export function normalizeUiLocale(value?: string | null): UiLocale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'cs' || normalized === 'en' ? normalized : null;
}

export function localeFromPathname(pathname: string): UiLocale | null {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return normalizeUiLocale(firstSegment);
}

export function localeFromCountry(country?: string | null): UiLocale | null {
  const normalized = country?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized === 'CZ' || normalized === 'SK' ? 'cs' : 'en';
}

export function localeFromAcceptLanguage(value?: string | null): UiLocale | null {
  if (!value) return null;

  const languages = value
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params
        .map((param) => param.trim().match(/^q=([0-9.]+)$/i))
        .find(Boolean);
      const q = quality ? Number(quality[1]) : 1;
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .sort((left, right) => right.q - left.q);

  for (const { tag } of languages) {
    const primary = tag.split('-')[0];
    if (primary === 'cs' || primary === 'sk') return 'cs';
    if (primary === 'en') return 'en';
  }

  return null;
}

export function resolveUiLocale({
  pathLocale,
  cookieLocale,
  country,
  acceptLanguage,
}: {
  pathLocale?: string | null;
  cookieLocale?: string | null;
  country?: string | null;
  acceptLanguage?: string | null;
}): UiLocale {
  return normalizeUiLocale(pathLocale)
    ?? normalizeUiLocale(cookieLocale)
    ?? localeFromCountry(country)
    ?? localeFromAcceptLanguage(acceptLanguage)
    ?? 'en';
}
