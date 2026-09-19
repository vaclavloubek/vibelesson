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

  const route = billingRouteForCountry(input.billingCountry);
  const billingPeriod = input.billingPeriod as OrganizationBillingPeriod;
  const amountMinor = organizationMinorUnitPrice(input.planCode, billingPeriod, route.currency);
  const admin = createAdminClient();

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
    console.error('create organization order failed', { code: error.code, message: error.message });
    return NextResponse.json({
      error: conflict ? 'active_organization_membership_exists' : 'organization_order_failed',
    }, { status: conflict ? 409 : 500 });
  }

  const result = data as { organizationId?: string; orderId?: string } | null;
  return NextResponse.json({
    created: true,
    organizationId: result?.organizationId ?? null,
    orderId: result?.orderId ?? null,
    amountMinor,
    currency: route.currency,
    status: 'awaiting_payment',
  }, { status: 201 });
}
