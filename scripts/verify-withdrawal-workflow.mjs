import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const nativeRequire = createRequire(import.meta.url);
let mocks = {};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = name => mocks[name] ?? (name.startsWith('@/') ? load(name.slice(2) + '.ts') : nativeRequire(name));
  new Function('require', 'exports', code)(require, exports);
  return exports;
}

const userId = '11111111-1111-4111-8111-111111111111';
const receiptId = '22222222-2222-4222-8222-222222222222';
const snapshotId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
const end = Date.parse('2026-11-01T00:00:00Z') / 1000;
let state, snapshot, subscription, charge, existing, submitted, canceled, failure;

function requestFromEvidence(evidence) {
  return {
    id: requestId, status: 'processing', external_subscription_id: 'sub_fixture',
    external_payment_intent_id: 'pi_fixture', external_refund_id: null, refund_status: null,
    refund_amount_minor: evidence.refundDueMinor, prior_refunded_minor: evidence.previouslyRefundedMinor,
    subscription_cancelled_at: null, first_attempt_at: null, calculation_evidence: evidence,
  };
}

function reset() {
  submitted = 0; canceled = 0; existing = null; failure = null;
  snapshot = {
    snapshot_id: snapshotId, plan_code: 'teacher', billing_period: 'monthly', amount_minor: 19900,
    currency: 'czk', immediate_performance_requested: true, terms_acceptance_key: '2026-09-21-v3',
    accepted_at: '2026-10-01T00:00:00Z', contract_html: 'contract', withdrawal_form_html: 'form',
    external_checkout_session_id: 'cs_live_fixture',
  };
  snapshot.content_sha256 = createHash('sha256').update('contract\n--syllonaut-withdrawal-form--\nform').digest('hex');
  state = {
    receipt: {
      id: receiptId, user_id: userId, snapshot_id: snapshotId,
      withdrawal_sent_at: '2026-10-05T23:00:00Z', withdrawal_received_at: '2026-10-06T00:00:00Z',
      notice_sha256: 'a'.repeat(64), request_id: null,
    },
    request: null,
  };
  subscription = {
    id: 'sub_fixture', customer: 'cus_fixture', status: 'active', latest_invoice: 'in_fixture',
    metadata: { syllonaut_user_id: userId, syllonaut_contract_snapshot_id: snapshotId, syllonaut_plan_code: 'teacher', syllonaut_billing_period: 'monthly' },
    items: { data: [{ id: 'si_fixture', price: { id: 'price_fixture' }, current_period_start: start, current_period_end: end }] },
  };
  charge = { id: 'ch_fixture', amount: 19900, amount_refunded: 0, currency: 'czk', customer: 'cus_fixture', payment_intent: 'pi_fixture' };
}

const chain = {
  select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
  async maybeSingle() { return { data: { created_at: '2026-10-01T00:00:00Z', external_event_id: 'evt_activation' } }; },
};
mocks['@/lib/supabase/admin'] = { createAdminClient: () => ({
  from: () => chain,
  rpc: async (name, args) => {
    if (name === 'get_individual_withdrawal_for_service') return { data: structuredClone(state) };
    if (name === 'get_individual_contract_snapshot_for_delivery') return { data: [snapshot] };
    if (name === 'get_individual_withdrawal_context_for_service') return { data: {
      status: 'ok', snapshot: { id: snapshotId, planCode: 'teacher', billingPeriod: 'monthly', currency: 'czk', amountMinor: 19900, immediatePerformanceRequested: true, acceptedAt: snapshot.accepted_at, termsAcceptanceKey: snapshot.terms_acceptance_key },
      payment: { paymentIntentId: 'pi_fixture', amountPaid: 19900, currency: 'czk', paidAt: '2026-10-01T00:00:00Z' }, priorRefundedMinor: 0,
    } };
    if (name === 'reserve_individual_withdrawal_v2_for_service') {
      state.request = requestFromEvidence(args.p_calculation_evidence);
      state.receipt.request_id = requestId;
      return { data: structuredClone(state.request) };
    }
    if (name === 'claim_individual_withdrawal_for_service') {
      state.request.first_attempt_at ??= '2026-10-06T01:00:00Z';
      return { data: '55555555-5555-4555-8555-555555555555' };
    }
    if (name === 'reconcile_individual_withdrawal_refund_for_service') {
      state.request.external_refund_id = args.p_refund_id;
      state.request.refund_status = args.p_status;
      state.request.status = args.p_status === 'succeeded' ? 'refund_succeeded' : 'refund_pending';
      return { data: null };
    }
    if (name === 'record_individual_withdrawal_cancellation_for_service') {
      canceled++;
      state.request.subscription_cancelled_at = args.p_cancelled_at;
      if (state.request.refund_amount_minor === 0 || state.request.refund_status === 'succeeded') state.request.status = 'completed';
      return { data: null };
    }
    if (name === 'fail_individual_withdrawal_execution_for_service') {
      failure = args;
      state.request.status = 'needs_attention';
      return { data: null };
    }
    throw new Error(name);
  },
}) };
mocks['@/lib/neon/config'] = { getDatabaseBackend: () => 'supabase' };
mocks['@/lib/neon/privileged-rpc'] = {
  createPrivilegedRpcClient: mocks['@/lib/supabase/admin'].createAdminClient,
};
mocks['@/lib/neon/server'] = { createNeonSql: () => { throw new Error('Unexpected Neon access in Supabase regression test.'); } };
mocks['@/lib/stripe-subscription-management'] = {
  retrieveStripeSubscription: async () => subscription,
  singleSubscriptionItem: s => s.items.data[0], subscriptionCustomerId: s => s.customer,
  subscriptionLatestInvoiceId: s => s.latest_invoice, subscriptionScheduleId: s => s.schedule ?? null,
};
mocks['@/lib/stripe-withdrawal'] = {
  stripeReference: v => typeof v === 'string' ? v : v.id,
  getWithdrawalCharge: async () => charge,
  findWithdrawalStripeRefund: async () => existing,
  cancelWithdrawnSubscription: async () => { subscription.status = 'canceled'; return { canceledAt: '2026-10-06T01:00:00Z' }; },
  createWithdrawalStripeRefund: async (_key, args) => {
    submitted++;
    return { id: 're_fixture', status: 'succeeded', amount: args.amountMinor, currency: args.currency, payment_intent: args.paymentIntentId };
  },
  withdrawalStripeRequest: async (_key, path) => path.startsWith('checkout/') ? {
    id: 'cs_live_fixture', customer: 'cus_fixture', subscription: 'sub_fixture', invoice: 'in_fixture',
    metadata: { syllonaut_user_id: userId, syllonaut_contract_snapshot_id: snapshotId },
  } : {
    id: 'in_fixture', customer: 'cus_fixture', amount_paid: 19900, currency: 'czk',
    status_transitions: { paid_at: start }, lines: { data: [{ period: { start, end } }] },
  },
};

const { prepareWithdrawal, executeWithdrawal } = load('lib/individual-withdrawal.ts');
reset();
const calculation = await prepareWithdrawal(receiptId, 'key');
assert.equal(calculation.refundDueMinor, 16691);
assert.equal(submitted, 0);
await executeWithdrawal(receiptId, 'key');
assert.equal(submitted, 1);
assert.equal(canceled, 1);
assert.equal(state.request.status, 'completed');
await executeWithdrawal(receiptId, 'key');
assert.equal(submitted, 1);

for (const mutation of [
  () => { subscription.latest_invoice = 'in_upgrade'; },
  () => { subscription.metadata.syllonaut_plan_code = 'teacher_pro'; },
  () => { subscription.schedule = 'sub_sched_fixture'; },
  () => { subscription.pending_update = {}; },
  () => { charge.amount = 29900; },
  () => { charge.customer = 'cus_other'; },
  () => { snapshot.content_sha256 = 'broken'; },
]) {
  reset(); mutation();
  await assert.rejects(prepareWithdrawal(receiptId, 'key'));
  assert.equal(submitted, 0);
}
reset();
await prepareWithdrawal(receiptId, 'key');
subscription.latest_invoice = 'in_upgrade';
await assert.rejects(executeWithdrawal(receiptId, 'key'));
assert.equal(submitted, 0);
assert.equal(failure.p_failure_stage, 'finalize');

reset();
await prepareWithdrawal(receiptId, 'key');
charge.amount_refunded = 100;
await assert.rejects(executeWithdrawal(receiptId, 'key'));
assert.equal(submitted, 0);
assert.equal(failure.p_failure_stage, 'refund');

reset();
await prepareWithdrawal(receiptId, 'key');
charge.amount_refunded = 16691;
existing = { id: 're_fixture', status: 'succeeded', amount: 16691, currency: 'czk', payment_intent: 'pi_fixture' };
await executeWithdrawal(receiptId, 'key');
assert.equal(submitted, 0);
assert.equal(state.request.external_refund_id, 're_fixture');

reset();
await prepareWithdrawal(receiptId, 'key');
state.request.calculation_evidence.refundDueMinor++;
await assert.rejects(executeWithdrawal(receiptId, 'key'));
assert.equal(submitted, 0);

const sql = fs.readFileSync('supabase/migrations/20260921081333_add_withdrawal_refund_evidence.sql', 'utf8');
assert.ok(sql.includes("interval '23 hours'"));
assert.ok(sql.includes('withdrawal_sent_at>p_contract_concluded_at'));
assert.ok(sql.includes('withdrawal_received_at'));
assert.ok(sql.includes('from public,anon,authenticated'));
const route = fs.readFileSync('app/api/admin/withdrawals/route.ts', 'utf8');
assert.ok(route.includes('isSuperadminUserId(userId)'));
assert.ok(route.includes('same_origin_required'));
console.log('Withdrawal workflow: immutable receipt, original-contract binding, sent-at eligibility, plan review and retry recovery passed.');
