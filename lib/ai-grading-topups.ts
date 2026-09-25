import 'server-only';

import { billingRouteForCountry } from '@/lib/billing-region';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import {
  AI_GRADING_TOPUP_PACK_CODES,
  aiGradingTopupDisplayPrice,
  aiGradingTopupQuantity,
  type AiGradingTopupPackCode,
} from '@/lib/ai-grading-topup-catalog';
import type { IndividualBillingCurrency } from '@/lib/individual-billing-catalog';

// Server flag for the whole top-up purchase flow (phase 2). Off unless set to
// exactly "true": the UI offers nothing and the top-up API routes return 404.
export function isAiGradingTopupsEnabled() {
  return process.env.AI_GRADING_TOPUPS_ENABLED === 'true';
}

export type AiGradingTopupIneligibleReason =
  | 'not_teacher_pro'
  | 'no_active_subscription'
  | 'organization_member'
  | 'ai_paused'
  | 'currency_route_mismatch';

export type AiGradingTopupEligibility =
  | {
      eligible: true;
      livemode: boolean;
      currency: IndividualBillingCurrency;
      billingCountry: string;
      managedPayments: boolean;
      customerId: string | null;
      subscriptionId: string;
    }
  | { eligible: false; reason: AiGradingTopupIneligibleReason };

type EligibilityRow = {
  plan_code: string | null;
  role: string | null;
  in_organization: boolean;
  paused: boolean;
  subscription_id: string | null;
  subscription_status: string | null;
  currency: string | null;
  billing_country: string | null;
  customer_id: string | null;
};

// Packs are for individual Teacher Pro with an active (trialing/active)
// subscription only: not Teacher, Free, organisation members, past_due or any
// AI billing pause. Currency and billing country follow the subscription, and
// the pack is paid by the same Stripe customer.
export async function getAiGradingTopupEligibility(userId: string, livemode = true): Promise<AiGradingTopupEligibility> {
  if (getDatabaseBackend() !== 'neon') return { eligible: false, reason: 'no_active_subscription' };
  assertApprovedNeonCutover();
  const sql = createNeonSql();
  const rows = await sql`
    select
      p.active_plan_code as plan_code,
      p.role,
      exists (select 1 from private.current_active_organization(p.id)) as in_organization,
      private.effective_ai_billing_paused(p.id) as paused,
      bs.external_subscription_id as subscription_id,
      bs.status as subscription_status,
      bs.currency,
      bc.billing_country,
      coalesce(bs.external_customer_id, bc.external_customer_id) as customer_id
    from public.profiles p
    left join lateral (
      select s.external_subscription_id, s.status, s.currency, s.external_customer_id
      from public.billing_subscriptions s
      where s.user_id = p.id
        and s.provider = 'stripe'
        and s.livemode = ${livemode}
        and s.plan_code = 'teacher_pro'
        and s.status in ('trialing', 'active', 'past_due')
      order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end, s.updated_at desc
      limit 1
    ) bs on true
    left join public.billing_customers bc
      on bc.user_id = p.id and bc.provider = 'stripe' and bc.livemode = ${livemode}
    where p.id = ${userId}::uuid
    limit 1
  ` as EligibilityRow[];
  const row = rows[0];
  if (!row || row.plan_code !== 'teacher_pro' || row.role === 'admin') return { eligible: false, reason: 'not_teacher_pro' };
  if (row.in_organization) return { eligible: false, reason: 'organization_member' };
  if (!row.subscription_id || !row.subscription_status) return { eligible: false, reason: 'no_active_subscription' };
  if (row.subscription_status === 'past_due' || row.paused) return { eligible: false, reason: 'ai_paused' };
  if (!['trialing', 'active'].includes(row.subscription_status)) return { eligible: false, reason: 'no_active_subscription' };
  const currency = row.currency;
  if (currency !== 'czk' && currency !== 'eur' && currency !== 'usd') return { eligible: false, reason: 'currency_route_mismatch' };
  const billingCountry = row.billing_country?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(billingCountry)) return { eligible: false, reason: 'currency_route_mismatch' };
  const route = billingRouteForCountry(billingCountry);
  if (route.currency !== currency) return { eligible: false, reason: 'currency_route_mismatch' };
  return {
    eligible: true,
    livemode,
    currency,
    billingCountry,
    managedPayments: route.managedPayments,
    customerId: row.customer_id,
    subscriptionId: row.subscription_id,
  };
}

export async function getAiGradingTopupPriceId(
  packCode: AiGradingTopupPackCode,
  currency: IndividualBillingCurrency,
  livemode: boolean,
) {
  assertApprovedNeonCutover();
  const sql = createNeonSql();
  const rows = await sql`
    select external_price_id from private.billing_topup_prices
    where pack_code = ${packCode} and currency = ${currency} and livemode = ${livemode} and active
    limit 2
  ` as Array<{ external_price_id: string }>;
  if (rows.length > 1) throw new Error('duplicate_topup_price');
  return rows[0]?.external_price_id ?? null;
}

export type AiGradingTopupOffer = {
  currency: IndividualBillingCurrency;
  packs: Array<{ packCode: AiGradingTopupPackCode; quantity: number; price: number }>;
};

// What /subscription shows: null unless the flag is on and the account is
// eligible for LIVE purchases.
export async function getAiGradingTopupOffer(userId: string): Promise<AiGradingTopupOffer | null> {
  if (!isAiGradingTopupsEnabled()) return null;
  const eligibility = await getAiGradingTopupEligibility(userId, true);
  if (!eligibility.eligible) return null;
  return {
    currency: eligibility.currency,
    packs: AI_GRADING_TOPUP_PACK_CODES.map((packCode) => ({
      packCode,
      quantity: aiGradingTopupQuantity(packCode),
      price: aiGradingTopupDisplayPrice(packCode, eligibility.currency),
    })),
  };
}
