import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { isSupportedCountryCode } from '@/lib/countries';
import { createStripeCheckout, isStripeLiveSecretKey, isStripeSandboxSecretKey, StripeCheckoutApiError } from '@/lib/stripe-checkout';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  planId: z.enum(['teacher', 'teacher-pro']),
  billing: z.enum(['monthly', 'annual']),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  environment: z.enum(['sandbox', 'live']).default('sandbox'),
});

function jsonError(status: number, error: string, diagnostics?: { stripeType?: string | null; stripeCode?: string | null; stripeMessage?: string | null }) {
  return NextResponse.json({ error, diagnostics }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try { input = InputSchema.parse(await request.json()); }
  catch { return jsonError(400, 'invalid_checkout_request'); }

  const livemode = input.environment === 'live';
  const secretKey = livemode ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
  if (livemode) {
    if (!isStripeLiveSecretKey(secretKey)) return jsonError(503, 'live_checkout_not_configured');
  } else if (!isStripeSandboxSecretKey(secretKey)) {
    return jsonError(503, 'sandbox_checkout_not_configured');
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return jsonError(401, 'authentication_required');
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== userId || !authData.user.email) return jsonError(401, 'authentication_required');

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (profileError) {
    console.error('billing checkout profile lookup failed', { code: profileError.code, livemode });
    return jsonError(500, 'profile_lookup_failed');
  }
  if (!livemode && profile?.role !== 'admin') return jsonError(403, 'sandbox_checkout_forbidden');
  const publicLiveBillingEnabled = process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED === 'true';
  if (livemode && !publicLiveBillingEnabled && profile?.role !== 'admin') return jsonError(403, 'live_checkout_acceptance_only');

  if (!isSupportedCountryCode(input.country)) return jsonError(400, 'unsupported_billing_country');
  const route = billingRouteForCountry(input.country);
  const planCode = input.planId === 'teacher-pro' ? 'teacher_pro' : 'teacher';
  const admin = createAdminClient();

  const [priceResult, customerResult, subscriptionResult] = await Promise.all([
    admin.from('billing_prices').select('external_price_id').eq('provider', 'stripe').eq('livemode', livemode).eq('plan_code', planCode).eq('billing_period', input.billing).eq('currency', route.currency).eq('active', true).maybeSingle(),
    admin.from('billing_customers').select('external_customer_id').eq('user_id', userId).eq('provider', 'stripe').eq('livemode', livemode).maybeSingle(),
    livemode
      ? admin.from('billing_subscriptions').select('currency,status').eq('user_id', userId).eq('provider', 'stripe').eq('livemode', true).in('status', ['trialing', 'active', 'past_due']).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (priceResult.error) {
    console.error('billing checkout price lookup failed', { code: priceResult.error.code, livemode });
    return jsonError(500, 'billing_price_lookup_failed');
  }
  if (!priceResult.data?.external_price_id) return jsonError(409, 'billing_price_not_configured');
  if (customerResult.error) {
    console.error('billing checkout customer lookup failed', { code: customerResult.error.code, livemode });
    return jsonError(500, 'billing_customer_lookup_failed');
  }
  if (subscriptionResult.error) {
    console.error('billing checkout subscription lookup failed', { code: subscriptionResult.error.code, livemode });
    return jsonError(500, 'billing_subscription_lookup_failed');
  }
  if (livemode && subscriptionResult.data) {
    if (subscriptionResult.data.currency !== route.currency) return jsonError(409, 'billing_currency_migration_required');
    return jsonError(409, 'active_subscription_exists');
  }

  try {
    const session = await createStripeCheckout({
      secretKey,
      livemode,
      priceId: priceResult.data.external_price_id,
      userId,
      userEmail: authData.user.email,
      customerId: customerResult.data?.external_customer_id ?? null,
      billingCountry: input.country,
      managedPayments: route.managedPayments,
      planCode,
      billingPeriod: input.billing,
    });
    return NextResponse.json({ url: session.url, environment: input.environment, currency: route.currency, managedPayments: route.managedPayments }, {
      status: 200, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('billing checkout failed', {
      error: error instanceof Error ? error.message : 'unknown', userId, planCode,
      billingPeriod: input.billing, currency: route.currency, managedPayments: route.managedPayments, livemode,
    });
    if (error instanceof StripeCheckoutApiError) {
      return jsonError(502, 'checkout_creation_failed', {
        stripeType: error.stripeType, stripeCode: error.stripeCode, stripeMessage: error.stripeMessage,
      });
    }
    return jsonError(502, 'checkout_creation_failed');
  }
}
