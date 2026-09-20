import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isPublicLiveBillingEnabled } from '../lib/billing-launch.ts';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}
function requireText(text, snippet, message) {
  if (!text.includes(snippet)) throw new Error(`public billing launch regression: ${message}`);
}
const original = process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED;
try {
  delete process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED;
  assert.equal(isPublicLiveBillingEnabled(), true);
  process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED = 'false';
  assert.equal(isPublicLiveBillingEnabled(), false);
  process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED = 'true';
  assert.equal(isPublicLiveBillingEnabled(), true);
} finally {
  if (original === undefined) delete process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED;
  else process.env.STRIPE_LIVE_BILLING_PUBLIC_ENABLED = original;
}
const [pricing, pricingPage, checkout, portal] = await Promise.all([
  source('components/PricingPage.tsx'),
  source('app/pricing/page.tsx'),
  source('app/api/billing/stripe/checkout/route.ts'),
  source('app/api/billing/stripe/portal/route.ts'),
]);
requireText(pricingPage, "publicLiveBillingEnabled ? 'live' : 'sandbox'", 'public Pricing must default to LIVE when launch prerequisites are present.');
requireText(pricing, "plan.id === 'teacher' || plan.id === 'teacher-pro'", 'individual Stripe Checkout buttons must remain scoped to Teacher and Teacher Pro.');
requireText(pricing, 'Přihlásit se a koupit', 'signed-out paid CTA must lead into authentication.');
requireText(pricing, 'Individuální i školní tarify jsou aktivní.', 'individual and school paid plans must be marked live.');
requireText(pricing, '`/school?plan=${plan.id}&billing=${billing}`', 'school plan CTAs must route into the launched school billing flow.');
requireText(pricing, 'Školní správa je součástí licence.', 'school administration must be described as launched.');
requireText(checkout, 'isPublicLiveBillingEnabled()', 'Checkout API must enforce the shared public launch gate.');
requireText(portal, 'isPublicLiveBillingEnabled()', 'Customer Portal API must enforce the shared public launch gate.');
console.log('Public LIVE billing launch checks passed.');
