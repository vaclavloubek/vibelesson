import type { Metadata } from 'next';
import { headers } from 'next/headers';
import PricingPage from '@/components/PricingPage';
import { resolvePricingCountry, resolvePricingCurrency } from '@/lib/billing-region';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const title = english ? 'Pricing — Syllonaut' : 'Ceník — Syllonaut';
  const description = english
    ? 'Syllonaut pricing for individual teachers and schools. Start free and compare upcoming paid plans.'
    : 'Ceník Syllonautu pro jednotlivé učitele a školy. Začněte zdarma a porovnejte připravované placené plány.';

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/pricing`,
      languages: {
        cs: '/cs/pricing',
        en: '/en/pricing',
        'x-default': '/en/pricing',
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/pricing`,
      siteName: 'Syllonaut',
      locale: english ? 'en_US' : 'cs_CZ',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

type PricingRouteProps = {
  searchParams: Promise<{
    signup?: string | string[];
    checkout?: string | string[];
    billing_env?: string | string[];
  }>;
};

export default async function Pricing({ searchParams }: PricingRouteProps) {
  const params = await searchParams;
  const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const billingEnvParam = Array.isArray(params.billing_env) ? params.billing_env[0] : params.billing_env;
  const billingTestEnvironment = billingEnvParam === 'live' ? 'live' : 'sandbox';
  const requestHeaders = await headers();
  const countryHeader = requestHeaders.get('x-vercel-ip-country');
  const acceptLanguage = requestHeaders.get('accept-language');
  const initialCountry = resolvePricingCountry(countryHeader, acceptLanguage);
  const currency = resolvePricingCurrency(countryHeader, acceptLanguage);

  let sandboxCheckoutEnabled = false;
  const requestedSecret = billingTestEnvironment === 'live'
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;
  const requestedSecretConfigured = billingTestEnvironment === 'live'
    ? /^(?:sk|rk)_live_/.test(requestedSecret ?? '')
    : /^(?:sk|rk)_test_/.test(requestedSecret ?? '');

  if (requestedSecretConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      sandboxCheckoutEnabled = profile?.role === 'admin';
    }
  }

  return (
    <PricingPage
      startSignup={signup === '1'}
      currency={currency}
      initialCountry={initialCountry}
      sandboxCheckoutEnabled={sandboxCheckoutEnabled}
      billingTestEnvironment={billingTestEnvironment}
      checkoutResult={checkout === 'success' || checkout === 'cancelled' ? checkout : null}
    />
  );
}
