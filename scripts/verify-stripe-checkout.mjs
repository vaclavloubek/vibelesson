import assert from 'node:assert/strict';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import {
  buildStripeCheckoutParams,
  isStripeLiveSecretKey,
  isStripeSandboxSecretKey,
  verifyStripeCheckoutBillingCountry,
} from '../lib/stripe-checkout.ts';

assert.equal(isStripeSandboxSecretKey('sk_test_example'), true);
assert.equal(isStripeSandboxSecretKey('rk_test_example'), true);
assert.equal(isStripeSandboxSecretKey('sk_live_example'), false);
assert.equal(isStripeLiveSecretKey('sk_live_example'), true);
assert.equal(isStripeLiveSecretKey('rk_live_example'), true);
assert.equal(isStripeLiveSecretKey('rk_test_example'), false);
assert.equal(isStripeSandboxSecretKey(undefined), false);

const params = buildStripeCheckoutParams({
  livemode: false,
  priceId: 'price_test123',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  userEmail: 'teacher@example.com',
  customerId: 'cus_existing123',
  billingCountry: 'DE',
  managedPayments: true,
  planCode: 'teacher',
  billingPeriod: 'monthly',
});
assert.equal(params.get('mode'), 'subscription');
assert.equal(params.get('line_items[0][price]'), 'price_test123');
assert.equal(params.get('billing_address_collection'), 'required');
assert.equal(params.get('customer'), 'cus_existing123');
assert.equal(params.has('customer_email'), false);
assert.equal(params.get('managed_payments[enabled]'), 'true');
assert.equal(params.get('subscription_data[metadata][syllonaut_user_id]'), '123e4567-e89b-42d3-a456-426614174000');
assert.equal(params.get('subscription_data[metadata][syllonaut_billing_country]'), 'DE');
assert.match(params.get('integration_identifier') ?? '', /^syllonaut_web_[a-z]{8}$/);
assert.match(params.get('success_url') ?? '', /billing_env=sandbox/);
assert.ok(!params.has('automatic_tax[enabled]'));
assert.ok(!params.has('payment_method_types[0]'));

const firstPurchaseParams = buildStripeCheckoutParams({
  livemode: true,
  priceId: 'price_live123',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  userEmail: 'teacher@example.com',
  customerId: null,
  billingCountry: 'CZ',
  managedPayments: false,
  planCode: 'teacher',
  billingPeriod: 'monthly',
});
assert.equal(firstPurchaseParams.get('customer_email'), 'teacher@example.com');
assert.equal(firstPurchaseParams.has('customer'), false);
assert.match(firstPurchaseParams.get('success_url') ?? '', /billing_env=live/);

function checkoutListResponse(country, {
  currency = 'eur',
  managedPayments = true,
  declaredCountry = 'DE',
} = {}) {
  return new Response(JSON.stringify({
    object: 'list',
    data: [{
      id: 'cs_live_regression001',
      livemode: true,
      mode: 'subscription',
      status: 'complete',
      subscription: 'sub_regression001',
      customer: 'cus_regression001',
      client_reference_id: '123e4567-e89b-42d3-a456-426614174000',
      currency,
      managed_payments: { enabled: managedPayments },
      customer_details: { address: { country } },
      metadata: {
        syllonaut_user_id: '123e4567-e89b-42d3-a456-426614174000',
        syllonaut_billing_country: declaredCountry,
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

let successfulLookupUrl = '';
const verifiedSameRoute = await verifyStripeCheckoutBillingCountry({
  secretKey: 'rk_live_regression',
  livemode: true,
  subscriptionId: 'sub_regression001',
  customerId: 'cus_regression001',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  declaredBillingCountry: 'DE',
  expectedCurrency: 'eur',
  expectedManagedPayments: true,
}, billingRouteForCountry, async (url) => {
  successfulLookupUrl = String(url);
  return checkoutListResponse('FR');
});
assert.equal(verifiedSameRoute.billingCountry, 'FR');
assert.match(successfulLookupUrl, /customer=cus_regression001/);
assert.doesNotMatch(successfulLookupUrl, /subscription=/);

await assert.rejects(
  () => verifyStripeCheckoutBillingCountry({
    secretKey: 'rk_live_regression',
    livemode: true,
    subscriptionId: 'sub_regression001',
    customerId: 'cus_regression001',
    userId: '123e4567-e89b-42d3-a456-426614174000',
    declaredBillingCountry: 'DE',
    expectedCurrency: 'eur',
    expectedManagedPayments: true,
  }, billingRouteForCountry, async () => checkoutListResponse('US')),
  /stripe_checkout_actual_country_route_mismatch/,
);

await assert.rejects(
  () => verifyStripeCheckoutBillingCountry({
    secretKey: 'rk_live_regression',
    livemode: true,
    subscriptionId: 'sub_regression001',
    customerId: 'cus_regression001',
    userId: '123e4567-e89b-42d3-a456-426614174000',
    declaredBillingCountry: 'DE',
    expectedCurrency: 'eur',
    expectedManagedPayments: true,
  }, billingRouteForCountry, async () => checkoutListResponse(null)),
  /stripe_checkout_actual_billing_country_missing/,
);

let attempts = 0;
const verifiedAfterRace = await verifyStripeCheckoutBillingCountry({
  secretKey: 'rk_live_regression',
  livemode: true,
  subscriptionId: 'sub_regression001',
  customerId: 'cus_regression001',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  declaredBillingCountry: 'DE',
  expectedCurrency: 'eur',
  expectedManagedPayments: true,
}, billingRouteForCountry, async () => {
  attempts += 1;
  if (attempts === 1) {
    return new Response(JSON.stringify({ object: 'list', data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return checkoutListResponse('DE');
});
assert.equal(attempts, 2);
assert.equal(verifiedAfterRace.billingCountry, 'DE');

console.log('Stripe checkout checks passed.');
