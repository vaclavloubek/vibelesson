import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  createStripeSandboxPortalSession,
  StripePortalApiError,
} from '@/lib/stripe-portal';
import { isStripeSandboxSecretKey } from '@/lib/stripe-checkout';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string, diagnostics?: {
  stripeType?: string | null;
  stripeCode?: string | null;
  stripeMessage?: string | null;
}) {
  return NextResponse.json({ error, diagnostics }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY_TEST;
  if (!isStripeSandboxSecretKey(secretKey)) {
    return jsonError(503, 'sandbox_portal_not_configured');
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return jsonError(401, 'authentication_required');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('sandbox portal profile lookup failed', { code: profileError.code });
    return jsonError(500, 'profile_lookup_failed');
  }

  // Keep all sandbox billing actions admin-only until live billing launches.
  if (profile?.role !== 'admin') return jsonError(403, 'sandbox_portal_forbidden');

  const admin = createAdminClient();
  const { data: billingCustomer, error: customerError } = await admin
    .from('billing_customers')
    .select('external_customer_id')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('livemode', false)
    .maybeSingle();

  if (customerError) {
    console.error('sandbox portal customer lookup failed', { code: customerError.code });
    return jsonError(500, 'billing_customer_lookup_failed');
  }

  if (!billingCustomer?.external_customer_id) {
    return jsonError(409, 'billing_customer_not_found');
  }

  try {
    const session = await createStripeSandboxPortalSession({
      secretKey,
      customerId: billingCustomer.external_customer_id,
    });

    return NextResponse.json({ url: session.url }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('sandbox portal failed', {
      error: error instanceof Error ? error.message : 'unknown',
      userId,
    });

    if (error instanceof StripePortalApiError) {
      return jsonError(502, 'portal_creation_failed', {
        stripeType: error.stripeType,
        stripeCode: error.stripeCode,
        stripeMessage: error.stripeMessage,
      });
    }

    return jsonError(502, 'portal_creation_failed');
  }
}
