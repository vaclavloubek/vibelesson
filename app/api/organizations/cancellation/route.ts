import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { updateOrganizationSubscriptionCancellation } from '@/lib/organization-stripe';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
});

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_cancellation_request' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }
  if (organization.renewalMode !== 'automatic_card') {
    return NextResponse.json({ error: 'organization_not_card_subscription' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from('organization_orders')
    .select('external_subscription_id, livemode')
    .eq('organization_id', organization.id)
    .not('external_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError || !order?.external_subscription_id) {
    return NextResponse.json({ error: 'organization_subscription_not_found' }, { status: 404 });
  }

  const livemode = Boolean(order.livemode);
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (livemode && !isPublicSchoolBillingEnabled() && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'school_live_billing_not_public' }, { status: 403 });
  }

  const secretKey = livemode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;
  if (!secretKey) {
    return NextResponse.json({ error: 'school_billing_not_configured' }, { status: 503 });
  }

  try {
    await updateOrganizationSubscriptionCancellation({
      secretKey,
      livemode,
      subscriptionId: order.external_subscription_id,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });

    const { error } = await admin.rpc('set_organization_cancel_at_period_end', {
      p_organization_id: organization.id,
      p_cancel_at_period_end: input.cancelAtPeriodEnd,
    });
    if (error) throw new Error('organization_cancel_state_sync_failed');

    return NextResponse.json({
      updated: true,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error('organization cancellation update failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'organization_cancellation_failed' }, { status: 502 });
  }
}
