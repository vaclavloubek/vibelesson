import assert from 'node:assert/strict';
import {
  createStripePortalSession,
  createStripeSandboxPortalSession,
  StripePortalApiError,
} from '../lib/stripe-portal.ts';

assert.equal(typeof createStripePortalSession, 'function');
assert.equal(typeof createStripeSandboxPortalSession, 'function');
assert.equal(new StripePortalApiError('invalid_request_error', 'code', 'message').stripeCode, 'code');

const portalSource = await (await import('node:fs/promises')).readFile(new URL('../lib/stripe-portal.ts', import.meta.url), 'utf8');
assert.ok(portalSource.includes("returnPath?: 'pricing' | 'subscription'"));
assert.ok(portalSource.includes("/${locale}/${returnPath}?billing_env="));

console.log('Stripe portal checks passed.');
