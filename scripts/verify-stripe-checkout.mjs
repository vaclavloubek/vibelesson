import assert from 'node:assert/strict';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import { TERMS_ACCEPTANCE_KEY } from '../lib/legal.ts';
import {
  buildStripeCheckoutParams,
  buildStripeTopupCheckoutParams,
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
  termsVersion: TERMS_ACCEPTANCE_KEY,
  immediatePerformanceRequested: true,
  contractSnapshotId: '223e4567-e89b-42d3-a456-426614174001',
});
assert.equal(params.get('mode'), 'subscription');
assert.equal(params.get('line_items[0][price]'), 'price_test123');
assert.equal(params.get('billing_address_collection'), 'required');
assert.equal(params.get('customer'), 'cus_existing123');
assert.equal(params.has('customer_email'), false);
assert.equal(params.get('managed_payments[enabled]'), 'true');
assert.equal(params.get('subscription_data[metadata][syllonaut_user_id]'), '123e4567-e89b-42d3-a456-426614174000');
assert.equal(params.get('subscription_data[metadata][syllonaut_billing_country]'), 'DE');
assert.equal(params.get('metadata[syllonaut_terms_version]'), TERMS_ACCEPTANCE_KEY);
assert.equal(params.get('metadata[syllonaut_immediate_service]'), 'true');
assert.equal(params.get('metadata[syllonaut_contract_snapshot_id]'), '223e4567-e89b-42d3-a456-426614174001');
assert.equal(params.get('subscription_data[metadata][syllonaut_contract_snapshot_id]'), '223e4567-e89b-42d3-a456-426614174001');
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
  termsVersion: TERMS_ACCEPTANCE_KEY,
  immediatePerformanceRequested: true,
  contractSnapshotId: '223e4567-e89b-42d3-a456-426614174001',
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
        syllonaut_contract_snapshot_id: '223e4567-e89b-42d3-a456-426614174001',
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
  expectedContractSnapshotId: '223e4567-e89b-42d3-a456-426614174001',
}, billingRouteForCountry, async (url) => {
  successfulLookupUrl = String(url);
  return checkoutListResponse('FR');
});
assert.equal(verifiedSameRoute.billingCountry, 'FR');
assert.equal(verifiedSameRoute.checkoutSessionId, 'cs_live_regression001');
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
  expectedContractSnapshotId: '223e4567-e89b-42d3-a456-426614174001',
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

// AI grading suggestion packs (phase 2): one-time Checkout (mode=payment).
const topupBase = {
  livemode: false,
  priceId: 'price_topup123',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  userEmail: 'teacher@example.com',
  customerId: 'cus_existing123',
  packCode: 'grading_100',
  quantity: 100,
  termsVersion: TERMS_ACCEPTANCE_KEY,
  contractSnapshotId: '323e4567-e89b-42d3-a456-426614174002',
  locale: 'cs',
};
const czkTopup = buildStripeTopupCheckoutParams({ ...topupBase, billingCountry: 'CZ', managedPayments: false });
assert.equal(czkTopup.get('mode'), 'payment');
assert.equal(czkTopup.get('submit_type'), 'pay');
assert.equal(czkTopup.get('customer'), 'cus_existing123', 'packs reuse the subscription customer');
assert.equal(czkTopup.get('managed_payments[enabled]'), 'false');
assert.equal(czkTopup.get('invoice_creation[enabled]'), 'true', 'CZK packs create a paid invoice like the subscription');
assert.equal(czkTopup.get('invoice_creation[invoice_data][metadata][syllonaut_purchase_kind]'), 'ai_grading_topup');
assert.equal(czkTopup.get('metadata[syllonaut_purchase_kind]'), 'ai_grading_topup');
assert.equal(czkTopup.get('metadata[syllonaut_user_id]'), topupBase.userId);
assert.equal(czkTopup.get('metadata[syllonaut_pack_code]'), 'grading_100');
assert.equal(czkTopup.get('metadata[syllonaut_contract_snapshot_id]'), topupBase.contractSnapshotId);
assert.equal(czkTopup.get('payment_intent_data[metadata][syllonaut_pack_code]'), 'grading_100', 'refund/dispute lookups can see the pack on the payment');
assert.ok(!czkTopup.has('subscription_data[metadata][syllonaut_user_id]'), 'packs never carry subscription metadata');
assert.match(czkTopup.get('success_url') ?? '', /\/cs\/subscription\?topup=success&billing_env=sandbox&session_id=\{CHECKOUT_SESSION_ID\}#dokoupit$/);
assert.match(czkTopup.get('integration_identifier') ?? '', /^syllonaut_topup_[a-z]{8}$/);
const eurTopup = buildStripeTopupCheckoutParams({ ...topupBase, billingCountry: 'DE', managedPayments: true, locale: 'en' });
assert.equal(eurTopup.get('managed_payments[enabled]'), 'true');
assert.ok(![...eurTopup.keys()].some((key) => key.startsWith('invoice_creation')), 'Managed Payments must not send invoice_creation');
assert.ok(!eurTopup.has('automatic_tax[enabled]') && !eurTopup.has('payment_method_types[0]'), 'Managed Payments controls tax and payment methods');
const newCustomerTopup = buildStripeTopupCheckoutParams({ ...topupBase, customerId: null, billingCountry: 'US', managedPayments: true });
assert.equal(newCustomerTopup.get('customer_email'), 'teacher@example.com');
console.log('Stripe top-up checkout checks passed.');
