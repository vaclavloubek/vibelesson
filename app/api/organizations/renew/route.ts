import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { issueOrganizationBankInvoice } from '@/lib/organization-bank-invoice';
import { organizationMinorUnitPrice } from '@/lib/organization-billing-catalog';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }
  if (organization.renewalMode !== 'manual_invoice') {
    return NextResponse.json({ error: 'organization_renews_automatically' }, { status: 409 });
  }

  const route = billingRouteForCountry(organization.billingCountry);
  if (route.currency !== organization.currency) {
    return NextResponse.json({ error: 'organization_billing_route_mismatch' }, { status: 409 });
  }

  const admin = createAdminClient();
  const [previousOrderResult, profileResult] = await Promise.all([
    admin.from('organization_orders').select('livemode').eq('organization_id', organization.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ]);

  if (previousOrderResult.error) {
    return NextResponse.json({ error: 'organization_billing_lookup_failed' }, { status: 500 });
  }

  const livemode = previousOrderResult.data?.livemode !== false;
  if (livemode && !isPublicSchoolBillingEnabled() && profileResult.data?.role !== 'admin') {
    return NextResponse.json({ error: 'school_live_billing_not_public' }, { status: 403 });
  }

  const amountMinor = organizationMinorUnitPrice(
    organization.planCode,
    organization.billingPeriod,
    organization.currency,
  );

  const { data: orderId, error: createError } = await admin.rpc(
    'create_organization_renewal_order',
    {
      p_organization_id: organization.id,
      p_created_by: userId,
      p_amount_minor: amountMinor,
    },
  );

  if (createError) {
    const message = createError.message ?? '';
    const code = message.includes('too_early')
      ? 'organization_renewal_too_early'
      : message.includes('pending_order')
        ? 'organization_pending_order_exists'
        : 'organization_renewal_failed';
    return NextResponse.json(
      { error: code },
      { status: code === 'organization_renewal_failed' ? 500 : 409 },
    );
  }

  const { error: environmentError } = await admin
    .from('organization_orders')
    .update({ livemode, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('organization_id', organization.id);

  if (environmentError) {
    return NextResponse.json({ error: 'organization_renewal_link_failed' }, { status: 500 });
  }

  try {
    const invoice = await issueOrganizationBankInvoice(String(orderId));
    return NextResponse.json({
      renewed: false,
      orderId,
      paymentUrl: invoice.invoiceUrl,
      invoiceNumber: invoice.invoiceNumber,
      variableSymbol: invoice.variableSymbol,
    }, { status: 201 });
  } catch (error) {
    console.error('organization renewal bank invoice start failed', {
      organizationId: organization.id,
      orderId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({
      error: 'organization_payment_start_failed',
      orderCreated: true,
      orderId,
    }, { status: 502 });
  }
}
