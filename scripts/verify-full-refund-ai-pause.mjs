import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing full-refund AI safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['private.individual_billing_refunds', 'private cumulative refund ledger'],
  ["then 'refund'", 'full refund pause reason'],
  ['sync_stripe_refund_state', 'service-only canonical refund state sync'],
  ['p_fully_refunded is distinct from (p_amount_refunded >= p_amount_total)', 'full refund is amount-authoritative'],
  ['try_release_individual_ai_billing_losses', 'full refund unlock is amount-qualified'],
  ["'refund_reversed'", 'failed/reversed refund can release the lock'],
]) requireText(migrations, needle, label);

const webhookLib = read('lib/stripe-webhook.ts');
for (const needle of [
  'SUPPORTED_STRIPE_REFUND_EVENTS',
  'normalizeStripeRefundEvent',
  "'charge.refunded'",
  "'refund.failed'",
]) requireText(webhookLib, needle, 'Stripe refund webhook normalization: ' + needle);

const refundLookup = read('lib/stripe-refunds.ts');
for (const needle of [
  'retrieveStripeChargeRefundState',
  'amount_refunded',
  'payload.refunded === true',
  'stripe_refund_state_inconsistent',
]) requireText(refundLookup, needle, 'canonical Charge refund lookup: ' + needle);

const webhookRoute = read('app/api/billing/stripe/webhook/route.ts');
for (const needle of [
  'retrieveStripeChargeRefundState',
  "sync_stripe_refund_state",
  'stripe_refund_payment_mapping_missing',
  'sync_organization_stripe_refund_state',
]) requireText(webhookRoute, needle, 'Stripe refund route: ' + needle);

const billing = read('lib/individual-ai-billing.ts');
requireText(billing, "'refund'", 'refund is a recognized pause reason');
requireText(billing, 'fully refunded', 'server error message explains full refund');

const banner = read('components/AiPaymentPauseBanner.tsx');
requireText(banner, "reason === 'refund'", 'user-facing refund warning');
requireText(banner, 'pokryjí vrácenou částku', 'refund recovery amount is explained');

const subscription = read('components/SubscriptionManagement.tsx');
requireText(subscription, "aiBillingPauseReason === 'refund'", 'subscription management explains refund state');
requireText(subscription, 'Platba vrácena', 'subscription status identifies refunded payment');

console.log('Individual full-refund AI pause safeguards verified.');
