import type { Metadata } from 'next';
import { headers } from 'next/headers';
import PricingPage from '@/components/PricingPage';
import { resolvePricingCountry, resolvePricingCurrency } from '@/lib/billing-region';
import { isPublicLiveBillingEnabled } from '@/lib/billing-launch';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { isAiGradingTopupsEnabled } from '@/lib/ai-grading-topups';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const title = english ? 'Pricing — Syllonaut' : 'Ceník — Syllonaut';
  const description = english
    ? 'Syllonaut pricing for teachers and schools: AI lesson creation, live teaching and evaluation in one workflow. Start free; paid plans add capacity and advanced tools.'
    : 'Ceník Syllonautu pro učitele a školy: AI příprava lekce, živá výuka a vyhodnocení v jednom toku. Začněte zdarma; placené tarify přidají kapacitu a pokročilé nástroje.';

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
    session_id?: string | string[];
  }>;
};

export default async function Pricing({ searchParams }: PricingRouteProps) {
  const params = await searchParams;
  const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const billingEnvParam = Array.isArray(params.billing_env) ? params.billing_env[0] : params.billing_env;
  const requestedBillingEnvironment = billingEnvParam === 'live' || billingEnvParam === 'sandbox'
    ? billingEnvParam
    : null;
  const sessionIdParam = Array.isArray(params.session_id) ? params.session_id[0] : params.session_id;
  const checkoutSessionId = typeof sessionIdParam === 'string' && /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionIdParam)
    ? sessionIdParam
    : null;
  const requestHeaders = await headers();
  const countryHeader = requestHeaders.get('x-vercel-ip-country');
  const acceptLanguage = requestHeaders.get('accept-language');
  const initialCountry = resolvePricingCountry(countryHeader, acceptLanguage);
  const currency = resolvePricingCurrency(countryHeader, acceptLanguage);

  const liveSecretConfigured = /^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY_LIVE ?? '');
  const publicLiveBillingEnabled = isPublicLiveBillingEnabled() && liveSecretConfigured;
  const publicSchoolBillingEnabled = isPublicSchoolBillingEnabled() && liveSecretConfigured;
  let billingTestEnvironment: 'sandbox' | 'live' = publicLiveBillingEnabled ? 'live' : 'sandbox';
  let sandboxCheckoutEnabled = false;
  let activePlanCode: 'teacher' | 'teacher-pro' | null = null;

  if (publicLiveBillingEnabled || requestedBillingEnvironment || checkout === 'success') {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, active_plan_code')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.role === 'admin' && requestedBillingEnvironment) {
        const requestedSecret = requestedBillingEnvironment === 'live'
          ? process.env.STRIPE_SECRET_KEY_LIVE
          : process.env.STRIPE_SECRET_KEY_TEST;
        const requestedSecretConfigured = requestedBillingEnvironment === 'live'
          ? /^(?:sk|rk)_live_/.test(requestedSecret ?? '')
          : /^(?:sk|rk)_test_/.test(requestedSecret ?? '');

        if (requestedSecretConfigured) {
          billingTestEnvironment = requestedBillingEnvironment;
          sandboxCheckoutEnabled = true;
        }
      }

      if (profile?.active_plan_code === 'teacher') activePlanCode = 'teacher';
      if (profile?.active_plan_code === 'teacher_pro') activePlanCode = 'teacher-pro';
    }
  }

  return (
    <PricingPage
      startSignup={signup === '1'}
      currency={currency}
      initialCountry={initialCountry}
      sandboxCheckoutEnabled={sandboxCheckoutEnabled}
      publicLiveBillingEnabled={publicLiveBillingEnabled}
      publicSchoolBillingEnabled={publicSchoolBillingEnabled}
      billingTestEnvironment={billingTestEnvironment}
      checkoutResult={checkout === 'success' || checkout === 'cancelled' ? checkout : null}
      checkoutSessionId={checkoutSessionId}
      activePlanCode={activePlanCode}
      aiGradingTopupsEnabled={isAiGradingTopupsEnabled()}
    />
  );
}
