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
import { createOrganizationQuotePdfBuffer } from '@/lib/organization-quote-pdf';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().default(''),
  registrationNumber: z.string().trim().max(80).optional().default(''),
  vatId: z.string().trim().max(80).optional().default(''),
  billingCountry: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  billingAddress: z.object({
    line1: z.string().trim().max(160).optional().default(''),
    line2: z.string().trim().max(160).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    postalCode: z.string().trim().max(32).optional().default(''),
  }).default({
    line1: '',
    line2: '',
    city: '',
    postalCode: '',
  }),
  planCode: z.string(),
  billingPeriod: z.enum(['monthly', 'annual']),
  locale: z.enum(['cs', 'en']).default('cs'),
});

function safeFilename(planCode: string) {
  return 'syllonaut-nabidka-' + planCode.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.pdf';
}

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_quote_request' }, { status: 400 });
  }

  if (!isOrganizationPlanCode(input.planCode)) {
    return NextResponse.json({ error: 'invalid_organization_plan' }, { status: 400 });
  }
  if (!isSupportedCountryCode(input.billingCountry)) {
    return NextResponse.json({ error: 'unsupported_billing_country' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (
    process.env.STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED !== 'true'
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

  try {
    const pdf = await createOrganizationQuotePdfBuffer({
      locale: input.locale,
      organizationName: input.name,
      legalName: input.legalName || null,
      registrationNumber: input.registrationNumber || null,
      vatId: input.vatId || null,
      billingCountry: input.billingCountry,
      address: input.billingAddress,
      planCode: input.planCode,
      billingPeriod,
      currency: route.currency,
      amountMinor,
      createdAt: new Date(),
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + safeFilename(input.planCode) + '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('organization quote PDF generation failed', error);
    return NextResponse.json({ error: 'organization_quote_pdf_failed' }, { status: 500 });
  }
}
