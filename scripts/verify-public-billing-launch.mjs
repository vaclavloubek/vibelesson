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
requireText(pricing, "plan.id === 'teacher' || plan.id === 'teacher-pro'", 'only Teacher and Teacher Pro may receive public purchase buttons.');
requireText(pricing, 'Přihlásit se a koupit', 'signed-out paid CTA must lead into authentication.');
requireText(pricing, 'Teacher a Teacher Pro jsou aktivní.', 'individual paid plans must be marked live.');
requireText(pricing, 'Školní tarify zatím zůstávají ve fázi přípravy.', 'school plans must remain unlaunched.');
requireText(checkout, 'isPublicLiveBillingEnabled()', 'Checkout API must enforce the shared public launch gate.');
requireText(portal, 'isPublicLiveBillingEnabled()', 'Customer Portal API must enforce the shared public launch gate.');
console.log('Public LIVE billing launch checks passed.');
