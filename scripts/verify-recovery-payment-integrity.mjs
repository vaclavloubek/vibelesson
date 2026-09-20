import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing recovery-payment safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['add column if not exists amount_paid bigint', 'payment map stores amount_paid'],
  ['add column if not exists currency text', 'payment map stores currency'],
  ['add column if not exists billing_reason text', 'payment map stores billing reason'],
  ['try_release_individual_ai_billing_losses', 'recovery is aggregated by unrecovered loss'],
  ['sum(p.amount_paid)', 'confirmed payments are accumulated'],
  ['v_recovered < v_required', 'small payment cannot release a larger loss'],
  ['sync_stripe_invoice_payment_event_v2', 'amount-aware payment sync exists'],
  ['alter column amount_paid set not null', 'amount metadata becomes mandatory at cutover'],
  ['revoke execute on function public.sync_stripe_invoice_payment_event(', 'legacy recovery path is revoked'],
]) requireText(migrations, needle, label);

const webhookLib = read('lib/stripe-webhook.ts');
for (const needle of [
  'amountPaid: number',
  "currency: 'czk' | 'eur' | 'usd'",
  'billingReason: string',
  'stripe_invoice_amount_paid_invalid',
  'stripe_invoice_billing_reason_invalid',
]) requireText(webhookLib, needle, 'invoice normalization: ' + needle);

const paymentLookup = read('lib/stripe-invoice-payments.ts');
for (const needle of [
  'amount_paid',
  'currency',
  'status_transitions',
  'stripe_invoice_payment_pagination_unsupported',
  'listStripePaidInvoicePayments',
]) requireText(paymentLookup, needle, 'exact invoice-payment accounting: ' + needle);

const webhookRoute = read('app/api/billing/stripe/webhook/route.ts');
for (const needle of [
  'listStripePaidInvoicePayments',
  'mappedAmount !== invoiceSync.amountPaid',
  "sync_stripe_invoice_payment_event_v2",
  'p_amount_paid: payment.amountPaid',
  'p_billing_reason: invoiceSync.billingReason',
]) requireText(webhookRoute, needle, 'payment recovery webhook: ' + needle);

const changeRoute = read('app/api/billing/stripe/subscription/change/route.ts');
requireText(changeRoute, 'getIndividualAiBillingPauseReason', 'plan change checks billing pause reason');
requireText(changeRoute, "pauseReason === 'dispute' || pauseReason === 'refund'", 'refund/dispute block plan change');
requireText(changeRoute, 'billing_recovery_required_before_plan_change', 'server returns explicit recovery lock');

const banner = read('components/AiPaymentPauseBanner.tsx');
requireText(banner, 'pokryjí ztracenou částku', 'dispute copy explains amount-qualified recovery');
requireText(banner, 'pokryjí vrácenou částku', 'refund copy explains amount-qualified recovery');

const subscription = read('components/SubscriptionManagement.tsx');
requireText(subscription, 'billing_recovery_required_before_plan_change', 'subscription UI handles server recovery lock');

console.log('Recovery-payment integrity safeguards verified.');
