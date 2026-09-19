import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { updateOrganizationSubscriptionCancellation } from '@/lib/organization-stripe';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
});

export async function PATCH(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_subscription_update' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: organizationRow, error: organizationError } = await admin
    .from('organizations')
    .select('renewal_mode, status')
    .eq('id', organization.id)
    .maybeSingle();

  if (organizationError || !organizationRow) {
    return NextResponse.json({ error: 'organization_not_found' }, { status: 404 });
  }
  if (organizationRow.renewal_mode !== 'automatic_card') {
    return NextResponse.json({ error: 'organization_not_card_subscription' }, { status: 409 });
  }
  if (!['active', 'past_due'].includes(organizationRow.status)) {
    return NextResponse.json({ error: 'organization_not_cancellable' }, { status: 409 });
  }

  const { data: order, error: orderError } = await admin
    .from('organization_orders')
    .select('external_subscription_id, livemode')
    .eq('organization_id', organization.id)
    .not('external_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError || !order?.external_subscription_id) {
    return NextResponse.json({ error: 'organization_subscription_not_ready' }, { status: 409 });
  }

  const secretKey = order.livemode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;

  if (!secretKey) {
    return NextResponse.json({ error: 'organization_billing_not_configured' }, { status: 503 });
  }

  try {
    const stripe = await updateOrganizationSubscriptionCancellation({
      secretKey,
      livemode: Boolean(order.livemode),
      subscriptionId: order.external_subscription_id,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });

    const { error } = await admin.rpc('set_organization_cancel_at_period_end', {
      p_organization_id: organization.id,
      p_cancel_at_period_end: input.cancelAtPeriodEnd,
    });

    if (error) {
      console.error('organization cancellation state persistence failed', {
        organizationId: organization.id,
        code: error.code,
      });
      return NextResponse.json(
        { error: 'organization_cancellation_persist_failed' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      updated: true,
      cancelAtPeriodEnd: stripe.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error('organization Stripe cancellation update failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'organization_subscription_update_failed' },
      { status: 502 },
    );
  }
}
