import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifySubscriptionChange } from '../lib/subscription-change-policy.ts';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`subscription management regression: ${message}`);
}

assert.equal(classifySubscriptionChange('teacher', 'monthly', 'teacher', 'monthly'), 'none');
assert.equal(classifySubscriptionChange('teacher', 'monthly', 'teacher_pro', 'monthly'), 'immediate_upgrade');
assert.equal(classifySubscriptionChange('teacher', 'annual', 'teacher_pro', 'annual'), 'immediate_upgrade');
assert.equal(classifySubscriptionChange('teacher_pro', 'monthly', 'teacher', 'monthly'), 'scheduled');
assert.equal(classifySubscriptionChange('teacher', 'monthly', 'teacher', 'annual'), 'scheduled');
assert.equal(classifySubscriptionChange('teacher', 'monthly', 'teacher_pro', 'annual'), 'scheduled');

const [
  menu,
  page,
  component,
  changeRoute,
  stripeManagement,
  state,
  portalRoute,
  pricing,
  email,
  version,
] = await Promise.all([
  source('components/PublicHeaderAccountMenu.tsx'),
  source('app/subscription/page.tsx'),
  source('components/SubscriptionManagement.tsx'),
  source('app/api/billing/stripe/subscription/change/route.ts'),
  source('lib/stripe-subscription-management.ts'),
  source('lib/billing-subscription-state.ts'),
  source('app/api/billing/stripe/portal/route.ts'),
  source('components/PricingPage.tsx'),
  source('lib/billing-email-core.ts'),
  source('lib/version.ts'),
]);

requireText(menu, '/subscription', 'account menu must link directly to subscription management.');
requireText(page, 'getLiveSubscriptionManagementState', 'subscription page must load server-authoritative billing state.');
requireText(component, 'Změnit tarif', 'management UI must expose plan changes.');
requireText(component, 'Platba, faktury a zrušení', 'management UI must keep payment, invoice and cancellation entry point.');
requireText(component, "action: 'cancel_scheduled_change'", 'user must be able to cancel a Syllonaut-managed future change.');

requireText(changeRoute, ".eq('currency', currentPriceRow.currency)", 'target prices must stay in the current subscription currency.');
requireText(changeRoute, 'subscription_cancellation_scheduled', 'plan changes must stop while cancellation is scheduled.');
requireText(changeRoute, 'subscription_schedule_conflict', 'unknown external schedules must fail closed.');
requireText(changeRoute, 'subscription_payment_issue', 'past-due subscriptions must resolve payment before changing plans.');

requireText(stripeManagement, "params.set('proration_behavior', 'always_invoice')", 'same-period upgrade must invoice the proration immediately.');
requireText(stripeManagement, "params.set('payment_behavior', 'pending_if_incomplete')", 'upgrade must apply only after successful payment.');
requireText(stripeManagement, "params.set('from_subscription', subscriptionId)", 'future changes must use the existing subscription.');
requireText(stripeManagement, "params.set('end_behavior', 'release')", 'future schedule must release back to a normal subscription.');
requireText(stripeManagement, "/release'", 'scheduled changes must be reversible without canceling the subscription.');
requireText(stripeManagement, 'syllonaut_managed_change', 'schedule replacement must be limited to Syllonaut-managed schedules.');

requireText(state, "retrieveStripePrice", 'displayed management prices must come from the live Stripe catalog.');
requireText(portalRoute, "returnPath: z.enum(['pricing', 'subscription'])", 'Stripe Portal must support returning to subscription management.');
requireText(pricing, '/subscription', 'paid Pricing management CTA must route through Syllonaut management.');
requireText(email, 'const subscriptionUrl =', 'lifecycle emails must link active subscription management to the dedicated page.');
requireText(version, "APP_VERSION = '0.9.20'", 'internal 0.9.21 must not change the dashboard-visible 0.9.20 release.');

console.log('Subscription management checks passed.');
