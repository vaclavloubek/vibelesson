import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  organizationMinorUnitPrice,
  type OrganizationBillingPeriod,
} from '@/lib/organization-billing-catalog';
import { issueOrganizationBankInvoice } from '@/lib/organization-bank-invoice';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }
  if (organization.isInternalTest) {
    return NextResponse.json({ error: 'internal_test_organization_not_billable' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: organizationRow, error: organizationError } = await admin
    .from('organizations')
    .select('renewal_mode')
    .eq('id', organization.id)
    .maybeSingle();

  if (organizationError || !organizationRow) {
    return NextResponse.json({ error: 'organization_not_found' }, { status: 404 });
  }
  if (organizationRow.renewal_mode !== 'manual_invoice') {
    return NextResponse.json({ error: 'organization_renews_automatically' }, { status: 409 });
  }

  const { data: previousOrder } = await admin
    .from('organization_orders')
    .select('livemode')
    .eq('organization_id', organization.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const amountMinor = organizationMinorUnitPrice(
    organization.planCode,
    organization.billingPeriod as OrganizationBillingPeriod,
    organization.currency,
  );

  const { data: orderId, error: orderError } = await admin.rpc(
    'create_organization_renewal_order',
    {
      p_organization_id: organization.id,
      p_created_by: userId,
      p_amount_minor: amountMinor,
    },
  );

  if (orderError || !orderId) {
    const message = orderError?.message ?? '';
    const code = message.includes('too_early')
      ? 'organization_renewal_too_early'
      : message.includes('pending_order')
        ? 'organization_pending_order_exists'
        : message.includes('renews_automatically')
          ? 'organization_renews_automatically'
          : 'organization_renewal_order_failed';
    return NextResponse.json(
      { error: code },
      { status: code === 'organization_renewal_order_failed' ? 500 : 409 },
    );
  }

  const livemode = previousOrder?.livemode ?? true;
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
      created: true,
      orderId,
      paymentUrl: invoice.invoiceUrl,
      invoiceNumber: invoice.invoiceNumber,
      variableSymbol: invoice.variableSymbol,
    }, { status: 201 });
  } catch (error) {
    console.error('organization renewal bank invoice startup failed', {
      organizationId: organization.id,
      orderId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({
      error: 'organization_renewal_payment_start_failed',
      orderCreated: true,
      orderId,
    }, { status: 502 });
  }
}
