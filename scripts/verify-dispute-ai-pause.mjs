import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing dispute AI safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['private.stripe_subscription_payments', 'payment-intent to subscription mapping'],
  ['private.individual_billing_disputes', 'private dispute ledger'],
  ['individual_ai_billing_pause_reason', 'central pause reason'],
  ["then 'dispute'", 'open dispute pause reason'],
  ["release_reason = 'subsequent_payment'", 'lost dispute unlock after later payment'],
  ["^d[pu]_[A-Za-z0-9_]+$", 'both Stripe dispute ID prefixes are accepted'],
  ['sync_stripe_dispute_event', 'service-only dispute event sync'],
  ["p_status in ('won', 'warning_closed')", 'won dispute automatic unlock'],
  ["charge.dispute.funds_reinstated", 'late win/funds reinstatement unlock'],
]) requireText(migrations, needle, label);

const webhookLib = read('lib/stripe-webhook.ts');
for (const needle of [
  'SUPPORTED_STRIPE_DISPUTE_EVENTS',
  'normalizeStripeDisputeEvent',
  'invoiceId',
  'paidAt',
  'paymentIntentId',
]) requireText(webhookLib, needle, 'Stripe webhook normalization: ' + needle);

const webhookRoute = read('app/api/billing/stripe/webhook/route.ts');
for (const needle of [
  'listStripePaidInvoicePaymentIntents',
  "sync_stripe_invoice_payment_event",
  "sync_stripe_dispute_event",
  "stripe_dispute_payment_mapping_missing",
]) requireText(webhookRoute, needle, 'Stripe webhook route: ' + needle);

const billing = read('lib/individual-ai-billing.ts');
requireText(billing, 'getIndividualAiBillingPauseReason', 'server reads a reason, not only a boolean');
requireText(billing, "'dispute'", 'dispute is a recognized pause reason');

const banner = read('components/AiPaymentPauseBanner.tsx');
requireText(banner, "reason === 'dispute'", 'user-facing dispute warning');
requireText(banner, 'další potvrzené platbě', 'lost dispute recovery is explained');

const subscription = read('components/SubscriptionManagement.tsx');
requireText(subscription, "aiBillingPauseReason === 'dispute'", 'subscription page explains dispute state');

console.log('Individual dispute AI pause safeguards verified.');
