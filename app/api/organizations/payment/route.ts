import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { startOrganizationPayment } from '@/lib/organization-payment';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  environment: z.enum(['sandbox', 'live']).default('live'),
});

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payment_request' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (input.environment === 'sandbox' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'school_sandbox_billing_forbidden' }, { status: 403 });
  }
  if (
    input.environment === 'live'
    && !isPublicSchoolBillingEnabled()
    && profile?.role !== 'admin'
  ) {
    return NextResponse.json({ error: 'school_live_billing_not_public' }, { status: 403 });
  }

  if (organization.status !== 'awaiting_payment' && organization.status !== 'past_due') {
    return NextResponse.json({ error: 'organization_not_payable' }, { status: 409 });
  }

  const [orgResult, orderResult] = await Promise.all([
    admin
      .from('organizations')
      .select('billing_address')
      .eq('id', organization.id)
      .maybeSingle(),
    admin
      .from('organization_orders')
      .select(
        'id, billing_period, currency, amount_minor, payment_method, external_customer_id, external_checkout_session_id, external_checkout_url, external_invoice_id, hosted_invoice_url',
      )
      .eq('organization_id', organization.id)
      .in('status', ['awaiting_payment', 'ordered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (orgResult.error || orderResult.error || !orderResult.data) {
    return NextResponse.json({ error: 'payable_order_not_found' }, { status: 404 });
  }

  try {
    const payment = await startOrganizationPayment({
      environment: input.environment,
      organization: {
        id: organization.id,
        name: organization.name,
        legalName: organization.legalName,
        registrationNumber: organization.registrationNumber,
        vatId: organization.vatId,
        billingEmail: organization.billingEmail,
        billingCountry: organization.billingCountry,
        billingAddress: (orgResult.data?.billing_address ?? {}) as {
          line1?: string;
          line2?: string;
          city?: string;
          postalCode?: string;
        },
        planCode: organization.planCode,
      },
      order: {
        id: orderResult.data.id,
        billingPeriod: orderResult.data.billing_period,
        currency: orderResult.data.currency,
        amountMinor: orderResult.data.amount_minor,
        paymentMethod: orderResult.data.payment_method,
        externalCustomerId: orderResult.data.external_customer_id,
        externalCheckoutSessionId: orderResult.data.external_checkout_session_id,
        externalCheckoutUrl: orderResult.data.external_checkout_url,
        externalInvoiceId: orderResult.data.external_invoice_id,
        hostedInvoiceUrl: orderResult.data.hosted_invoice_url,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error('organization payment retry failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'organization_payment_start_failed' }, { status: 502 });
  }
}
