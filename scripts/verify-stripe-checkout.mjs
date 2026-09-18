import assert from 'node:assert/strict';
import {
  buildStripeCheckoutParams,
  isStripeSandboxSecretKey,
} from '../lib/stripe-checkout.ts';

assert.equal(isStripeSandboxSecretKey('sk_test_example'), true);
assert.equal(isStripeSandboxSecretKey('rk_test_example'), true);
assert.equal(isStripeSandboxSecretKey('sk_live_example'), false);
assert.equal(isStripeSandboxSecretKey(undefined), false);

const params = buildStripeCheckoutParams({
  priceId: 'price_test123',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  userEmail: 'teacher@example.com',
  billingCountry: 'DE',
  managedPayments: true,
  planCode: 'teacher',
  billingPeriod: 'monthly',
});

assert.equal(params.get('mode'), 'subscription');
assert.equal(params.get('line_items[0][price]'), 'price_test123');
assert.equal(params.get('billing_address_collection'), 'required');
assert.equal(params.get('managed_payments[enabled]'), 'true');
assert.equal(params.get('subscription_data[metadata][syllonaut_user_id]'), '123e4567-e89b-42d3-a456-426614174000');
assert.equal(params.get('subscription_data[metadata][syllonaut_billing_country]'), 'DE');
assert.match(params.get('integration_identifier') ?? '', /^syllonaut_web_[a-z]{8}$/);
assert.ok(!params.has('automatic_tax[enabled]'));
assert.ok(!params.has('payment_method_types[0]'));

console.log('Stripe checkout checks passed.');
