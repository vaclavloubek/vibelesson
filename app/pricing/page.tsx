import type { Metadata } from 'next';
import { headers } from 'next/headers';
import PricingPage from '@/components/PricingPage';
import { resolvePricingCountry, resolvePricingCurrency } from '@/lib/billing-region';
import { createClient } from '@/lib/supabase/server';

const title = 'Ceník — Syllonaut';
const description = 'Ceník Syllonautu pro jednotlivé učitele a školy. Začněte zdarma a porovnejte připravované placené plány.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title,
    description,
    url: '/pricing',
    siteName: 'Syllonaut',
    locale: 'cs_CZ',
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

type PricingRouteProps = {
  searchParams: Promise<{
    signup?: string | string[];
    checkout?: string | string[];
  }>;
};

export default async function Pricing({ searchParams }: PricingRouteProps) {
  const params = await searchParams;
  const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const requestHeaders = await headers();
  const countryHeader = requestHeaders.get('x-vercel-ip-country');
  const acceptLanguage = requestHeaders.get('accept-language');
  const initialCountry = resolvePricingCountry(countryHeader, acceptLanguage);
  const currency = resolvePricingCurrency(countryHeader, acceptLanguage);

  let sandboxCheckoutEnabled = false;
  if (/^(?:sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY_TEST ?? '')) {
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
      checkoutResult={checkout === 'success' || checkout === 'cancelled' ? checkout : null}
    />
  );
}
