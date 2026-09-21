import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WITHDRAWAL_CALCULATION_METHOD,
  WITHDRAWAL_WINDOW_MS,
  calculateIndividualWithdrawal,
} from '../lib/individual-withdrawal.ts';

const day = 24 * 60 * 60 * 1000;
const base = Date.parse('2026-10-01T00:00:00.000Z');

const tenDays = calculateIndividualWithdrawal({
  contractAmountMinor: 10_000,
  paymentAmountMinor: 10_000,
  priorRefundedMinor: 0,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 30 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + 10 * day).toISOString(),
  immediatePerformanceRequested: true,
});
assert.equal(tenDays.eligible, true);
assert.equal(tenDays.calculationMethod, WITHDRAWAL_CALCULATION_METHOD);
assert.equal(tenDays.retainedAmountMinor, 3333);
assert.equal(tenDays.targetTotalRefundMinor, 6667);
assert.equal(tenDays.refundNowMinor, 6667);

const consumerFriendlyRounding = calculateIndividualWithdrawal({
  contractAmountMinor: 100,
  paymentAmountMinor: 100,
  priorRefundedMinor: 0,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 3 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + day).toISOString(),
  immediatePerformanceRequested: true,
});
assert.equal(consumerFriendlyRounding.retainedAmountMinor, 33);
assert.equal(consumerFriendlyRounding.refundNowMinor, 67);

const noImmediateStart = calculateIndividualWithdrawal({
  contractAmountMinor: 10_000,
  paymentAmountMinor: 10_000,
  priorRefundedMinor: 0,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 30 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + 10 * day).toISOString(),
  immediatePerformanceRequested: false,
});
assert.equal(noImmediateStart.retainedAmountMinor, 0);
assert.equal(noImmediateStart.refundNowMinor, 10_000);

const priorRefund = calculateIndividualWithdrawal({
  contractAmountMinor: 10_000,
  paymentAmountMinor: 10_000,
  priorRefundedMinor: 1000,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 30 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + 10 * day).toISOString(),
  immediatePerformanceRequested: true,
});
assert.equal(priorRefund.targetTotalRefundMinor, 6667);
assert.equal(priorRefund.refundNowMinor, 5667);

const expired = calculateIndividualWithdrawal({
  contractAmountMinor: 10_000,
  paymentAmountMinor: 10_000,
  priorRefundedMinor: 0,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 30 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + WITHDRAWAL_WINDOW_MS + 1).toISOString(),
  immediatePerformanceRequested: true,
});
assert.equal(expired.eligible, false);
assert.equal(expired.reason, 'withdrawal_window_expired');
assert.equal(expired.refundNowMinor, 0);

const beforeServiceStart = calculateIndividualWithdrawal({
  contractAmountMinor: 10_000,
  paymentAmountMinor: 10_000,
  priorRefundedMinor: 0,
  contractConcludedAt: new Date(base).toISOString(),
  serviceStartedAt: new Date(base + day).toISOString(),
  periodStart: new Date(base).toISOString(),
  periodEnd: new Date(base + 30 * day).toISOString(),
  withdrawalReceivedAt: new Date(base + 12 * 60 * 60 * 1000).toISOString(),
  immediatePerformanceRequested: true,
});
assert.equal(beforeServiceStart.retainedAmountMinor, 0);
assert.equal(beforeServiceStart.refundNowMinor, 10_000);

const stripeSource = await readFile(new URL('../lib/stripe-withdrawal.ts', import.meta.url), 'utf8');
assert(stripeSource.includes("body.set('payment_intent', input.paymentIntentId)"));
assert(stripeSource.includes("body.set('reason', 'requested_by_customer')"));
assert(stripeSource.includes("method: 'DELETE'"));
assert(stripeSource.includes("'idempotency-key': idempotencyKey"));
assert(stripeSource.includes('syllonaut_withdrawal_refund_'));
assert(stripeSource.includes('syllonaut_withdrawal_cancel_'));

const [routeSource, serviceSource, componentSource, gateSource, migrationSource] = await Promise.all([
  readFile(new URL('../app/api/billing/stripe/withdrawal/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../lib/individual-withdrawal-service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../components/WithdrawalManagement.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../lib/terms-gate.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260921074647_add_individual_prorata_withdrawal_workflow.sql', import.meta.url), 'utf8'),
]);
assert(routeSource.includes('confirm: z.literal(true)'));
assert(routeSource.indexOf('createStripeWithdrawalRefund') < routeSource.indexOf('cancelStripeSubscriptionForWithdrawal'));
assert(routeSource.includes('reserve_individual_withdrawal_for_service'));
assert(routeSource.includes('fail_individual_withdrawal_for_service'));
assert(serviceSource.includes("billing_reason = 'subscription_create'") || migrationSource.includes("billing_reason = 'subscription_create'"));
assert(serviceSource.includes("return { kind: 'manual_review', reason: 'subscription_changed' }"));
assert(componentSource.includes('AI allowance usage does not increase that amount by itself'));
assert(!gateSource.includes("pathname === '/api/billing/stripe/withdrawal'"));
assert(migrationSource.includes('alter table private.individual_withdrawal_requests enable row level security'));
assert(migrationSource.includes('individual_withdrawal_legal_fields_immutable'));
assert(migrationSource.includes('to service_role'));

console.log('Pro-rata withdrawal calculation, audit and Stripe idempotency contract: OK');
