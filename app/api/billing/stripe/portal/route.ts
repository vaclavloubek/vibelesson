import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createStripePortalSession, StripePortalApiError } from '@/lib/stripe-portal';
import { isPublicLiveBillingEnabled } from '@/lib/billing-launch';
import { isStripeLiveSecretKey, isStripeSandboxSecretKey } from '@/lib/stripe-checkout';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  environment: z.enum(['sandbox', 'live']).default('sandbox'),
  locale: z.enum(['cs', 'en']).default('cs'),
  returnPath: z.enum(['pricing', 'subscription']).default('pricing'),
});

function jsonError(status: number, error: string, diagnostics?: { stripeType?: string | null; stripeCode?: string | null; stripeMessage?: string | null }) {
  return NextResponse.json({ error, diagnostics }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    const body = await request.text();
    input = InputSchema.parse(body ? JSON.parse(body) : {});
  } catch { return jsonError(400, 'invalid_portal_request'); }

  const livemode = input.environment === 'live';
  const secretKey = livemode ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
  if (livemode) {
    if (!isStripeLiveSecretKey(secretKey)) return jsonError(503, 'live_portal_not_configured');
  } else if (!isStripeSandboxSecretKey(secretKey)) {
    return jsonError(503, 'sandbox_portal_not_configured');
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return jsonError(401, 'authentication_required');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (profileError) {
    console.error('billing portal profile lookup failed', { code: profileError.code, livemode });
    return jsonError(500, 'profile_lookup_failed');
  }

  if (!livemode && profile?.role !== 'admin') return jsonError(403, 'sandbox_portal_forbidden');
  const publicLiveBillingEnabled = isPublicLiveBillingEnabled();
  if (livemode && !publicLiveBillingEnabled && profile?.role !== 'admin') return jsonError(403, 'live_portal_acceptance_only');

  const admin = createAdminClient();
  const { data: billingCustomer, error: customerError } = await admin.from('billing_customers').select('external_customer_id')
    .eq('user_id', userId).eq('provider', 'stripe').eq('livemode', livemode).maybeSingle();
  if (customerError) {
    console.error('billing portal customer lookup failed', { code: customerError.code, livemode });
    return jsonError(500, 'billing_customer_lookup_failed');
  }
  if (!billingCustomer?.external_customer_id) return jsonError(409, 'billing_customer_not_found');

  try {
    const session = await createStripePortalSession({
      secretKey,
      livemode,
      customerId: billingCustomer.external_customer_id,
      locale: input.locale,
      returnPath: input.returnPath,
    });
    return NextResponse.json({ url: session.url, environment: input.environment }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('billing portal failed', { error: error instanceof Error ? error.message : 'unknown', userId, livemode });
    if (error instanceof StripePortalApiError) {
      return jsonError(502, 'portal_creation_failed', {
        stripeType: error.stripeType, stripeCode: error.stripeCode, stripeMessage: error.stripeMessage,
      });
    }
    return jsonError(502, 'portal_creation_failed');
  }
}
