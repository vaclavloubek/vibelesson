import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { isSupportedCountryCode } from '@/lib/countries';
import { AresRegistryError, verifyCzechOrganization, type AresVerifiedOrganization } from '@/lib/ares-registry';
import { DPA_ACCEPTANCE_KEY, TERMS_ACCEPTANCE_KEY } from '@/lib/legal';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import {
  isOrganizationPlanCode,
  organizationMinorUnitPrice,
  type OrganizationBillingPeriod,
} from '@/lib/organization-billing-catalog';
import { issueOrganizationBankInvoice } from '@/lib/organization-bank-invoice';
import { startOrganizationPayment } from '@/lib/organization-payment';
import { OrganizationStripeError } from '@/lib/organization-stripe';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { readProfileRole } from '@/lib/neon/profile-role';

function paymentDiagnostic(error: unknown) {
  if (error instanceof OrganizationStripeError) {
    return {
      code: error.code,
      stripeType: error.stripeType ?? null,
      stripeCode: error.stripeCode ?? null,
    };
  }

  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
    ? error.message
    : 'unknown_error';
  return { code, stripeType: null, stripeCode: null };
}

const InputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(200),
  registrationNumber: z.string().trim().max(80).optional().default(''),
  vatId: z.string().trim().max(80).optional().default(''),
  billingEmail: z.string().trim().email().max(254),
  billingCountry: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  billingAddress: z.object({
    line1: z.string().trim().min(2).max(160),
    line2: z.string().trim().max(160).optional().default(''),
    city: z.string().trim().min(2).max(120),
    postalCode: z.string().trim().min(2).max(32),
  }),
  planCode: z.string(),
  billingPeriod: z.enum(['monthly', 'annual']),
  paymentMethod: z.enum(['card', 'invoice']),
  environment: z.enum(['sandbox', 'live']).default('live'),
  termsAccepted: z.literal(true),
  termsVersion: z.literal(TERMS_ACCEPTANCE_KEY),
  dpaAccepted: z.literal(true),
  dpaVersion: z.literal(DPA_ACCEPTANCE_KEY),
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

  const admin = createPrivilegedRpcClient();
  let profileRole: string | null;
  try {
    profileRole = await readProfileRole(userId);
  } catch {
    return NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 });
  }

  if (input.environment === 'sandbox' && profileRole !== 'admin') {
    return NextResponse.json({ error: 'school_sandbox_billing_forbidden' }, { status: 403 });
  }
  if (
    input.environment === 'live'
    && !isPublicSchoolBillingEnabled()
    && profileRole !== 'admin'
  ) {
    return NextResponse.json({ error: 'school_live_billing_not_public' }, { status: 403 });
  }

  // LEGAL-015: invoice orders need an identified organisation; Czech ones are
  // invoiced only under the official name and seat from ARES.
  let registryVerification: AresVerifiedOrganization | { source: 'self_declared'; registrationNumber: string } | null = null;
  if (input.paymentMethod === 'invoice') {
    if (input.billingCountry === 'CZ') {
      try {
        const verified = await verifyCzechOrganization(input.registrationNumber);
        input.legalName = verified.legalName;
        input.registrationNumber = verified.registrationNumber;
        input.billingAddress = verified.billingAddress;
        registryVerification = verified;
      } catch (registryError) {
        if (!(registryError instanceof AresRegistryError)) throw registryError;
        return NextResponse.json(
          { error: registryError.code },
          { status: registryError.code === 'registry_unavailable' ? 503 : 422 },
        );
      }
    } else if (input.registrationNumber.length < 2) {
      return NextResponse.json({ error: 'registration_number_required' }, { status: 422 });
    } else {
      registryVerification = { source: 'self_declared', registrationNumber: input.registrationNumber };
    }
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

  const { data: createdOrder, error: createdOrderError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select billing_snapshot from public.organization_orders
        where id = ${orderId}::uuid and organization_id = ${organizationId}::uuid
        limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('organization_orders')
      .select('billing_snapshot').eq('id', orderId).eq('organization_id', organizationId).maybeSingle();

  if (createdOrderError || !createdOrder) {
    return NextResponse.json({ error: 'organization_order_snapshot_failed', orderCreated: true, organizationId, orderId }, { status: 500 });
  }

  const existingSnapshot = createdOrder.billing_snapshot && typeof createdOrder.billing_snapshot === 'object'
    ? createdOrder.billing_snapshot as Record<string, unknown>
    : {};
  const acceptedAt = new Date().toISOString();
  const nextSnapshot = {
    ...existingSnapshot,
    providerContact: {
      legalName: PROVIDER_CONTACT.legalName,
      businessId: PROVIDER_CONTACT.businessId,
      addressLine1: PROVIDER_CONTACT.addressLine1,
      postalCity: PROVIDER_CONTACT.postalCity,
      country: PROVIDER_CONTACT.countryEn,
      phone: PROVIDER_CONTACT.phoneE164,
      email: PROVIDER_CONTACT.email,
      website: PROVIDER_CONTACT.website,
    },
    legalAcceptance: {
      termsAccepted: true,
      termsVersion: input.termsVersion,
      acceptedAt,
      acceptedByUserId: userId,
      dpaAccepted: true,
      dpaVersion: input.dpaVersion,
      dpaAcceptedAt: acceptedAt,
      dpaAcceptedByUserId: userId,
    },
    ...(registryVerification ? { registryVerification } : {}),
  };
  const { error: environmentError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        update public.organization_orders
        set livemode = ${input.environment === 'live'},
          billing_snapshot = ${JSON.stringify(nextSnapshot)}::jsonb
        where id = ${orderId}::uuid and organization_id = ${organizationId}::uuid
        returning id
      `;
      return { error: rows.length === 1 ? null : { code: 'organization_order_not_found' } };
    })()
    : await createAdminClient().from('organization_orders')
      .update({ livemode: input.environment === 'live', billing_snapshot: nextSnapshot })
      .eq('id', orderId).eq('organization_id', organizationId);

  if (environmentError) {
    console.error('organization order environment persist failed', {
      organizationId,
      orderId,
      code: environmentError.code,
    });
    return NextResponse.json({
      error: 'organization_order_environment_failed',
      orderCreated: true,
      organizationId,
      orderId,
    }, { status: 500 });
  }

  if (input.paymentMethod === 'invoice') {
    try {
      const invoice = await issueOrganizationBankInvoice(orderId);
      return NextResponse.json({
        created: true,
        organizationId,
        orderId,
        amountMinor,
        currency: route.currency,
        status: 'awaiting_payment',
        paymentUrl: invoice.invoiceUrl,
        paymentKind: 'bank_invoice',
        invoiceNumber: invoice.invoiceNumber,
        variableSymbol: invoice.variableSymbol,
      }, { status: 201 });
    } catch (invoiceError) {
      const code = invoiceError instanceof Error ? invoiceError.message : 'unknown_error';
      console.error('organization bank invoice startup failed', {
        organizationId,
        orderId,
        error: code,
      });
      return NextResponse.json({
        error: 'organization_bank_invoice_issue_failed',
        orderCreated: true,
        organizationId,
        orderId,
        ...(input.environment === 'sandbox' && profileRole === 'admin'
          ? { diagnostic: { code, stripeType: null, stripeCode: null } }
          : {}),
      }, { status: 502 });
    }
  }

  try {
    const payment = await startOrganizationPayment({
      environment: input.environment,
      organization: {
        id: organizationId,
        name: input.name,
        legalName: input.legalName || null,
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
        externalCheckoutUrl: null,
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
    const diagnostic = input.environment === 'sandbox' && profileRole === 'admin'
      ? paymentDiagnostic(paymentError)
      : null;

    console.error('organization payment startup failed', {
      organizationId,
      orderId,
      error: paymentError instanceof Error ? paymentError.message : 'unknown',
      stripeType: paymentError instanceof OrganizationStripeError
        ? paymentError.stripeType
        : null,
      stripeCode: paymentError instanceof OrganizationStripeError
        ? paymentError.stripeCode
        : null,
    });

    return NextResponse.json({
      error: 'organization_payment_start_failed',
      orderCreated: true,
      organizationId,
      orderId,
      ...(diagnostic ? { diagnostic } : {}),
    }, { status: 502 });
  }
}
