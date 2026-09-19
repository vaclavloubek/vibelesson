import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { isSupportedCountryCode } from '@/lib/countries';
import {
  isOrganizationPlanCode,
  organizationMinorUnitPrice,
  type OrganizationBillingPeriod,
} from '@/lib/organization-billing-catalog';
import { startOrganizationPayment } from '@/lib/organization-payment';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().default(''),
  registrationNumber: z.string().trim().max(80).optional().default(''),
  vatId: z.string().trim().max(80).optional().default(''),
  billingEmail: z.string().trim().email().max(254),
  billingCountry: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  billingAddress: z.object({
    line1: z.string().trim().max(160).optional().default(''),
    line2: z.string().trim().max(160).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    postalCode: z.string().trim().max(32).optional().default(''),
  }).default({}),
  planCode: z.string(),
  billingPeriod: z.enum(['monthly', 'annual']),
  paymentMethod: z.enum(['card', 'invoice']),
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
    return NextResponse.json({ error: 'invalid_organization_order' }, { status: 400 });
  }

  if (!isOrganizationPlanCode(input.planCode)) {
    return NextResponse.json({ error: 'invalid_organization_plan' }, { status: 400 });
  }
  if (!isSupportedCountryCode(input.billingCountry)) {
    return NextResponse.json({ error: 'unsupported_billing_country' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 });
  }

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

  const route = billingRouteForCountry(input.billingCountry);
  const billingPeriod = input.billingPeriod as OrganizationBillingPeriod;
  const amountMinor = organizationMinorUnitPrice(
    input.planCode,
    billingPeriod,
    route.currency,
  );

  const { data, error } = await admin.rpc('create_organization_order', {
    p_owner_user_id: userId,
    p_name: input.name,
    p_legal_name: input.legalName,
    p_registration_number: input.registrationNumber,
    p_vat_id: input.vatId,
    p_billing_email: input.billingEmail.toLowerCase(),
    p_billing_country: input.billingCountry,
    p_billing_address: input.billingAddress,
    p_plan_code: input.planCode,
    p_billing_period: input.billingPeriod,
    p_currency: route.currency,
    p_amount_minor: amountMinor,
    p_payment_method: input.paymentMethod,
  });

  if (error) {
    const conflict = (error.message ?? '').includes('active_organization_membership_exists');
    console.error('create organization order failed', {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({
      error: conflict
        ? 'active_organization_membership_exists'
        : 'organization_order_failed',
    }, { status: conflict ? 409 : 500 });
  }

  const result = data as { organizationId?: string; orderId?: string } | null;
  const organizationId = result?.organizationId ?? null;
  const orderId = result?.orderId ?? null;

  if (!organizationId || !orderId) {
    return NextResponse.json(
      { error: 'organization_order_response_invalid' },
      { status: 500 },
    );
  }

  try {
    const payment = await startOrganizationPayment({
      environment: input.environment,
      organization: {
        id: organizationId,
        name: input.name,
        legalName: input.legalName || null,
        registrationNumber: input.registrationNumber || null,
        vatId: input.vatId || null,
        billingEmail: input.billingEmail.toLowerCase(),
        billingCountry: input.billingCountry,
        billingAddress: input.billingAddress,
        planCode: input.planCode,
      },
      order: {
        id: orderId,
        billingPeriod,
        currency: route.currency,
        amountMinor,
        paymentMethod: input.paymentMethod,
        externalCustomerId: null,
        externalCheckoutSessionId: null,
        externalInvoiceId: null,
        hostedInvoiceUrl: null,
      },
    });

    return NextResponse.json({
      created: true,
      organizationId,
      orderId,
      amountMinor,
      currency: route.currency,
      status: 'awaiting_payment',
      paymentUrl: payment.paymentUrl,
      paymentKind: payment.paymentKind,
    }, { status: 201 });
  } catch (paymentError) {
    console.error('organization payment startup failed', {
      organizationId,
      orderId,
      error: paymentError instanceof Error ? paymentError.message : 'unknown',
    });

    return NextResponse.json({
      error: 'organization_payment_start_failed',
      orderCreated: true,
      organizationId,
      orderId,
    }, { status: 502 });
  }
}
