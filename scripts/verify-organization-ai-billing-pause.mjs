import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error('Missing organization AI billing safeguard: ' + label);
  }
};

const migration = read('supabase/migrations/20260920103000_add_organization_ai_billing_pause.sql');
for (const [needle, label] of [
  ['private.organization_stripe_payments', 'organization Stripe payment map'],
  ['private.organization_billing_disputes', 'organization dispute ledger'],
  ['private.organization_billing_refunds', 'organization refund ledger'],
  ['private.organization_ai_billing_pause_reason', 'organization pause reason helper'],
  ['private.effective_ai_billing_paused', 'effective personal/organization pause helper'],
  ["new.organization_id is not null", 'generation boundary checks organization context'],
  ["raise exception 'billing_payment_required'", 'generation boundary fails closed'],
  ['private.effective_ai_billing_paused(v_user_id)', 'automatic grading uses effective pause'],
  ['private.effective_ai_billing_paused(p_user_id)', 'manual regrade uses effective pause'],
  ["set status = 'active',", 'card payment failure keeps licence active during grace'],
  ["past_due_at = coalesce(past_due_at, now())", 'payment failure records grace timestamp'],
  ["where status in ('active', 'past_due')", 'overdue suspension includes active grace state'],
  ["and not (status = 'active' and past_due_at is not null)", 'expiry cron preserves payment grace'],
  ['v_recovered<v_required', 'recovery requires full lost amount'],
  ['group by external_payment_intent_id', 'refund/dispute loss is deduplicated by payment intent'],
  ['organization_stripe_dispute_amount_mismatch', 'dispute amount is bounded by original payment'],
  ['organization_stripe_refund_amount_mismatch', 'refund amount matches original payment'],
  ['sync_organization_invoice_payment_event_v2', 'amount-aware organization payment sync'],
  ['sync_organization_stripe_dispute_event', 'organization dispute sync'],
  ['sync_organization_stripe_refund_state', 'organization refund sync'],
]) requireText(migration, needle, label);

const webhookLib = read('lib/stripe-webhook.ts');
for (const needle of [
  'amountDisputed: number',
  'stripe_dispute_amount_invalid',
  'stripe_dispute_currency_invalid',
  'StripeOrganizationInvoiceEventSync',
  'stripe_organization_invoice_amount_paid_invalid',
  'stripe_organization_invoice_billing_reason_invalid',
]) requireText(webhookLib, needle, 'Stripe normalization: ' + needle);

const webhookRoute = read('app/api/billing/stripe/webhook/route.ts');
for (const needle of [
  'listStripePaidInvoicePayments',
  'mappedAmount !== organizationInvoiceSync.amountPaid',
  'sync_organization_invoice_payment_event_v2',
  'sync_organization_stripe_dispute_event',
  'sync_organization_stripe_refund_state',
  'organization_stripe_dispute_payment_mapping_missing',
  'organization_stripe_refund_payment_mapping_missing',
]) requireText(webhookRoute, needle, 'Stripe routing: ' + needle);

for (const route of [
  'app/api/generate/route.ts',
  'app/api/revise/route.ts',
  'app/api/revise-block/route.ts',
]) {
  requireText(read(route), 'getEffectiveAiBillingPauseState', route + ' uses effective billing state');
}

const entitlements = read('app/api/entitlements/route.ts');
requireText(entitlements, 'aiBillingPauseScope', 'entitlements expose pause scope');
requireText(entitlements, 'aiBillingPauseManager', 'entitlements expose school-manager context');

const schoolApi = read('app/api/organizations/current/route.ts');
requireText(schoolApi, 'get_organization_ai_billing_pause_reason_server', 'school API reads organization pause');
requireText(schoolApi, 'aiBillingPauseReason', 'school API returns pause reason');

const banner = read('components/AiPaymentPauseBanner.tsx');
requireText(banner, "scope === 'organization'", 'lesson banner distinguishes organization pause');
requireText(banner, 'href="/school"', 'organization pause links to school administration');

const schoolAdmin = read('components/SchoolAdmin.tsx');
requireText(schoolAdmin, 'summary.aiBillingPaused', 'school admin shows AI billing pause');
requireText(schoolAdmin, '14 dnů', 'school manager sees payment grace deadline');

console.log('Organization AI billing pause safeguards verified.');
