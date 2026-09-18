import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { isSupportedCountryCode } from '@/lib/countries';
import { createStripeSandboxCheckout, isStripeSandboxSecretKey } from '@/lib/stripe-checkout';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  planId: z.enum(['teacher', 'teacher-pro']),
  billing: z.enum(['monthly', 'annual']),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY_TEST;
  if (!isStripeSandboxSecretKey(secretKey)) {
    return jsonError(503, 'sandbox_checkout_not_configured');
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return jsonError(401, 'authentication_required');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== userId || !authData.user.email) {
    return jsonError(401, 'authentication_required');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('sandbox checkout profile lookup failed', { code: profileError.code });
    return jsonError(500, 'profile_lookup_failed');
  }

  // Until live billing is ready, sandbox Checkout is deliberately admin-only.
  if (profile?.role !== 'admin') return jsonError(403, 'sandbox_checkout_forbidden');

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return jsonError(400, 'invalid_checkout_request');
  }

  if (!isSupportedCountryCode(input.country)) {
    return jsonError(400, 'unsupported_billing_country');
  }

  const route = billingRouteForCountry(input.country);
  const planCode = input.planId === 'teacher-pro' ? 'teacher_pro' : 'teacher';
  const admin = createAdminClient();

  const [{ data: price, error: priceError }, { data: billingCustomer, error: customerError }] = await Promise.all([
    admin
    .from('billing_prices')
    .select('external_price_id')
    .eq('provider', 'stripe')
    .eq('livemode', false)
    .eq('plan_code', planCode)
    .eq('billing_period', input.billing)
    .eq('currency', route.currency)
    .eq('active', true)
    .maybeSingle(),
    admin
      .from('billing_customers')
      .select('external_customer_id')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .eq('livemode', false)
      .maybeSingle(),
  ]);

  if (priceError) {
    console.error('sandbox checkout price lookup failed', { code: priceError.code });
    return jsonError(500, 'billing_price_lookup_failed');
  }

  if (!price?.external_price_id) {
    return jsonError(409, 'billing_price_not_configured');
  }

  if (customerError) {
    console.error('sandbox checkout customer lookup failed', { code: customerError.code });
    return jsonError(500, 'billing_customer_lookup_failed');
  }

  try {
    const session = await createStripeSandboxCheckout({
      secretKey,
      priceId: price.external_price_id,
      userId,
      userEmail: authData.user.email,
      customerId: billingCustomer?.external_customer_id ?? null,
      billingCountry: input.country,
      managedPayments: route.managedPayments,
      planCode,
      billingPeriod: input.billing,
    });

    return NextResponse.json({
      url: session.url,
      currency: route.currency,
      managedPayments: route.managedPayments,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('sandbox checkout failed', {
      error: error instanceof Error ? error.message : 'unknown',
      userId,
      planCode,
      billingPeriod: input.billing,
      currency: route.currency,
      managedPayments: route.managedPayments,
    });
    return jsonError(502, 'checkout_creation_failed');
  }
}
