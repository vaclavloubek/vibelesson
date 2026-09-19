import assert from 'node:assert/strict';
import {
  createStripePortalSession,
  createStripeSandboxPortalSession,
  StripePortalApiError,
} from '../lib/stripe-portal.ts';

assert.equal(typeof createStripePortalSession, 'function');
assert.equal(typeof createStripeSandboxPortalSession, 'function');
assert.equal(new StripePortalApiError('invalid_request_error', 'code', 'message').stripeCode, 'code');

console.log('Stripe portal checks passed.');
