export type BillingCurrency = 'czk' | 'eur' | 'usd';

const EURO_AREA_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

function normalizeCountry(country?: string | null) {
  const normalized = country?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function countryFromAcceptLanguage(value?: string | null) {
  if (!value) return null;

  for (const part of value.split(',')) {
    const locale = part.trim().split(';', 1)[0];
    const match = locale.match(/[-_]([A-Za-z]{2})(?:$|[-_])/);
    if (match) return match[1].toUpperCase();
  }

  return null;
}

export function pricingCurrencyForCountry(country?: string | null): BillingCurrency {
  const normalized = normalizeCountry(country);
  if (normalized === 'CZ') return 'czk';
  if (normalized && EURO_AREA_COUNTRIES.has(normalized)) return 'eur';
  return 'usd';
}

export function resolvePricingCountry(
  countryHeader?: string | null,
  acceptLanguage?: string | null,
) {
  return normalizeCountry(countryHeader) ?? countryFromAcceptLanguage(acceptLanguage);
}

export function resolvePricingCurrency(
  countryHeader?: string | null,
  acceptLanguage?: string | null,
): BillingCurrency {
  return pricingCurrencyForCountry(resolvePricingCountry(countryHeader, acceptLanguage));
}

export function billingRouteForCountry(country?: string | null) {
  const currency = pricingCurrencyForCountry(country);
  return {
    currency,
    managedPayments: currency !== 'czk',
  } as const;
}
