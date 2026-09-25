import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { billingRouteForCountry } from '@/lib/billing-region';
import { isSupportedCountryCode } from '@/lib/countries';
import {
  TERMS_ACCEPTANCE_KEY,
  TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE,
  TERMS_VERSION,
} from '@/lib/legal';
import { buildAiGradingTopupContractSnapshotDocuments } from '@/lib/individual-contract-snapshot';
import {
  AI_GRADING_TOPUP_PACK_CODES,
  aiGradingTopupMinorUnitPrice,
  aiGradingTopupQuantity,
} from '@/lib/ai-grading-topup-catalog';
import {
  getAiGradingTopupEligibility,
  getAiGradingTopupPriceId,
  isAiGradingTopupsEnabled,
} from '@/lib/ai-grading-topups';
import {
  createStripeTopupCheckout,
  isStripeLiveSecretKey,
  isStripeSandboxSecretKey,
  StripeCheckoutApiError,
} from '@/lib/stripe-checkout';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  pack: z.enum(AI_GRADING_TOPUP_PACK_CODES),
  environment: z.enum(['sandbox', 'live']).default('live'),
  // Sandbox only (admin acceptance): the billing country to route by. LIVE
  // always follows the Teacher Pro subscription's verified billing country.
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  termsAccepted: z.literal(true),
  immediateDeliveryRequested: z.literal(true),
  withdrawalLossAcknowledged: z.literal(true),
  termsVersion: z.string().min(1).max(64),
  locale: z.enum(['cs', 'en']),
});

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!isAiGradingTopupsEnabled()) return new NextResponse(null, { status: 404 });

  let input: z.infer<typeof InputSchema>;
  try { input = InputSchema.parse(await request.json()); }
  catch { return jsonError(400, 'invalid_topup_checkout_request'); }

  // Terms 1.12 (article 5a) must be the current Terms before any pack is sold.
  if (!TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE) return jsonError(409, 'topup_terms_not_active');
  if (input.termsVersion !== TERMS_ACCEPTANCE_KEY) return jsonError(409, 'terms_version_outdated');

  const livemode = input.environment === 'live';
  const secretKey = livemode ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
  if (livemode ? !isStripeLiveSecretKey(secretKey) : !isStripeSandboxSecretKey(secretKey)) {
    return jsonError(503, livemode ? 'live_checkout_not_configured' : 'sandbox_checkout_not_configured');
  }
  if (getDatabaseBackend() !== 'neon') return jsonError(503, 'topup_backend_not_configured');
  assertApprovedNeonCutover();

  const { supabase, userId, authenticatedUserId, termsAcceptanceRequired } = await getAuthenticatedUserId();
  if (termsAcceptanceRequired && authenticatedUserId) return jsonError(428, 'terms_reconsent_required');
  if (!userId) return jsonError(401, 'authentication_required');
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== userId || !authData.user.email) return jsonError(401, 'authentication_required');

  const deviceGate = await requireTrustedDeviceForPaidAccess(userId);
  if (!deviceGate.allowed) {
    return jsonError(403, 'trusted_device_required', { message: trustedDeviceErrorMessage(deviceGate), code: deviceGate.code });
  }

  const sql = createNeonSql();
  let billingCountry: string;
  let currency: 'czk' | 'eur' | 'usd';
  let managedPayments: boolean;
  let customerId: string | null;
  if (livemode) {
    const eligibility = await getAiGradingTopupEligibility(userId, true);
    if (!eligibility.eligible) return jsonError(403, 'topup_not_eligible', { reason: eligibility.reason });
    ({ billingCountry, currency, managedPayments, customerId } = eligibility);
  } else {
    // Sandbox mirrors the subscription checkout: admin acceptance only.
    const [profile] = await sql`select role from public.profiles where id = ${userId}::uuid limit 1` as Array<{ role: string | null }>;
    if (profile?.role !== 'admin') return jsonError(403, 'sandbox_checkout_forbidden');
    if (!input.country || !isSupportedCountryCode(input.country)) return jsonError(400, 'unsupported_billing_country');
    const route = billingRouteForCountry(input.country);
    billingCountry = input.country;
    currency = route.currency;
    managedPayments = route.managedPayments;
    const customers = await sql`
      select external_customer_id from public.billing_customers
      where user_id = ${userId}::uuid and provider = 'stripe' and livemode = false limit 2
    ` as Array<{ external_customer_id: string | null }>;
    if (customers.length > 1) return jsonError(500, 'billing_customer_lookup_failed');
    customerId = customers[0]?.external_customer_id ?? null;
  }

  let priceId: string | null;
  try {
    priceId = await getAiGradingTopupPriceId(input.pack, currency, livemode);
  } catch (error) {
    console.error('topup checkout price lookup failed', { error: error instanceof Error ? error.message : 'unknown', livemode });
    return jsonError(500, 'billing_price_lookup_failed');
  }
  if (!priceId) return jsonError(409, 'billing_price_not_configured');

  const snapshotId = randomUUID();
  const quantity = aiGradingTopupQuantity(input.pack);
  const amountMinor = aiGradingTopupMinorUnitPrice(input.pack, currency);
  let documents: ReturnType<typeof buildAiGradingTopupContractSnapshotDocuments>;
  try {
    documents = buildAiGradingTopupContractSnapshotDocuments({
      locale: input.locale,
      packCode: input.pack,
      currency,
      amountMinor,
      billingCountry,
      capturedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('topup contract snapshot render failed', { error: error instanceof Error ? error.message : 'unknown', userId });
    return jsonError(500, 'contract_snapshot_render_failed');
  }

  try {
    const session = await createStripeTopupCheckout({
      secretKey: secretKey!,
      livemode,
      priceId,
      userId,
      userEmail: authData.user.email,
      customerId,
      billingCountry,
      managedPayments,
      packCode: input.pack,
      quantity,
      termsVersion: input.termsVersion,
      contractSnapshotId: snapshotId,
      locale: input.locale,
    });

    try {
      const rows = await sql`
        select public.create_ai_grading_topup_contract_snapshot(
          ${snapshotId}::uuid, ${userId}::uuid, ${livemode}, ${input.pack}, ${quantity},
          ${currency}, ${amountMinor}, ${billingCountry}, ${TERMS_VERSION}, ${input.termsVersion},
          ${input.locale}, ${input.immediateDeliveryRequested}, ${input.withdrawalLossAcknowledged},
          ${documents.contractHtml}, ${documents.contentSha256}, ${session.id}
        ) as snapshot_id
      `;
      if (rows.length !== 1 || rows[0].snapshot_id !== snapshotId) throw new Error('unexpected_snapshot_result');
    } catch (error) {
      console.error('topup contract snapshot store failed', {
        error: error instanceof Error ? error.message : 'unknown', userId, livemode, checkoutSessionId: session.id,
      });
      return jsonError(500, 'contract_snapshot_store_failed');
    }

    return NextResponse.json({ url: session.url, currency, managedPayments }, {
      status: 200, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('topup checkout failed', {
      error: error instanceof Error ? error.message : 'unknown', userId, pack: input.pack, currency, livemode,
    });
    if (error instanceof StripeCheckoutApiError) {
      return jsonError(502, 'checkout_creation_failed', {
        diagnostics: { stripeType: error.stripeType, stripeCode: error.stripeCode, stripeMessage: error.stripeMessage },
      });
    }
    return jsonError(502, 'checkout_creation_failed');
  }
}
