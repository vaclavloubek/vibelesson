// A full refund of the current paid period ends an individual subscription
// immediately; a full refund pauses AI only while an individual subscription
// is still live (migration 0022).
//
// Runs the real app/api/billing/stripe/webhook/route.ts (Node type stripping)
// with signed events, a fake Stripe API behind global fetch and stubbed
// database RPCs. No network, no database.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${repoRoot}${path}`, 'utf8');

// 1. Migration 0022 (static).
const migration = read('neon/migrations/0022_refund_pause_requires_live_individual_subscription.sql');
const refundBranch = migration.slice(migration.indexOf('from private.individual_billing_refunds r'), migration.indexOf("then 'refund'"));
for (const needle of [
  "and bs.status in ('trialing', 'active', 'past_due')",
  "and bp.audience = 'individual'",
  'and bs.livemode = true',
  "and bs.provider = 'stripe'",
  ') and exists (',
]) assert.ok(refundBranch.includes(needle), `0022 refund branch requires a live individual subscription: ${needle}`);
assert.ok(migration.includes('create or replace function private.individual_ai_billing_pause_reason(p_user_id uuid)'), '0022 keeps the signature');
assert.ok(migration.includes('security definer') && migration.includes("set search_path = ''"), '0022 keeps security definer and empty search_path');
assert.ok(migration.includes('revoke all on function private.individual_ai_billing_pause_reason(uuid)\n  from public, anon, authenticated, service_role;'), '0022 keeps the revoke');
const order = ["then null", "then 'dispute'", "then 'refund'", "then 'past_due'"].map((needle) => migration.indexOf(needle));
assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), '0022 keeps the branch order');
assert.ok(!/\b(update|delete|insert)\b[^;]*individual_billing_refunds/i.test(migration), '0022 does not touch refund rows');

// 2. Webhook route with a fake Stripe.
const LIVE_SECRET = 'whsec_verify_full_refund';
process.env.STRIPE_WEBHOOK_SECRET_LIVE = LIVE_SECRET;
process.env.STRIPE_SECRET_KEY_LIVE = 'rk_live_verify_full_refund';

const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return stub('export {};');
    if (specifier === 'next/server') return stub(`
      export const NextResponse = { json: (body, init) => Response.json(body, init) };
      export function after(callback) { globalThis.__after.push(callback); }
    `);
    if (specifier === '@/lib/neon/billing-rpc') return stub('export const syncStripeBillingRpc = (name, args) => globalThis.__rpc(name, args);');
    if (specifier === '@/lib/neon/privileged-rpc') return stub(`
      export const createPrivilegedRpcClient = () => ({ rpc: async (name, args) => { globalThis.__privileged.push(name); return { error: null }; } });
    `);
    if (specifier === '@/lib/supabase/admin') return stub('export function createAdminClient() { throw new Error("not used"); }');
    if (specifier === '@/lib/neon/config') return stub('export const getDatabaseBackend = () => "neon"; export function assertApprovedNeonCutover() {}');
    if (specifier === '@/lib/neon/server') return stub('export function createNeonSql() { throw new Error("not used"); }');
    if (specifier === '@/lib/billing-email') return stub(`
      export class BillingEmailDeliveryError extends Error {}
      export const billingLifecycleNotification = () => null;
      export async function deliverBillingLifecycleEmail() {}
    `);
    if (specifier === '@/lib/marketing-lifecycle') return stub(`
      export async function emitSubscriptionEnded() {} export async function emitSubscriptionRenewingSoon() {}
      export async function emitSubscriptionUpgraded() {} export async function loadOrganizationFirstActivation() { return null; }
      export function scheduleOrganizationOwnerActivated() {} export async function syncMarketingPlan() {}
    `);
    if (specifier.startsWith('@/')) {
      const base = `${repoRoot}${specifier.slice(2)}`;
      const file = ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find(existsSync);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__after = [];
globalThis.__privileged = [];

const CHARGE = 'ch_3Full';
const PI = 'pi_3Full';
const SUB = 'sub_1Full';
const CURRENT_INVOICE = 'in_1Current';

let stripe;
function resetStripe(overrides = {}) {
  stripe = {
    charge: { amount: 32900, amount_refunded: 32900 },
    refunds: [{ id: 're_3Full', status: 'succeeded', reason: 'requested_by_customer', metadata: {} }],
    subscription: { status: 'active', latest_invoice: CURRENT_INVOICE },
    paymentInvoice: CURRENT_INVOICE,
    failDelete: false,
    failSubscriptionGet: false,
    deletes: [],
    subscriptionGets: 0,
    ...overrides,
  };
}

let rpcMode = 'individual';
globalThis.__rpc = async (name) => {
  if (name === 'sync_ai_grading_topup_refund_event') {
    return rpcMode === 'topup'
      ? { data: { revoked: true }, error: null }
      : { data: null, error: { message: 'ai_grading_topup_payment_mapping_missing' } };
  }
  if (name === 'sync_stripe_refund_state') {
    return rpcMode === 'organization'
      ? { data: null, error: { message: 'stripe_refund_payment_mapping_missing' } }
      : { data: { userId: '00000000-0000-4000-8000-000000000001', subscriptionId: SUB, fullRefund: true }, error: null };
  }
  if (name === 'sync_organization_stripe_refund_state') return { data: { organization: true }, error: null };
  throw new Error(`unexpected rpc ${name}`);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.stripe.com', 'only the Stripe API is called');
  const path = url.pathname.replace(/^\/v1\//, '');
  const method = init.method ?? 'GET';
  const refundObject = (refund) => ({
    object: 'refund', amount: stripe.charge.amount, currency: 'czk', payment_intent: PI, ...refund,
  });

  if (method === 'GET' && path === `charges/${CHARGE}`) {
    const { amount, amount_refunded } = stripe.charge;
    return json({ id: CHARGE, object: 'charge', amount, amount_refunded, refunded: amount_refunded >= amount, payment_intent: PI });
  }
  if (method === 'GET' && path === 'refunds') {
    assert.equal(url.searchParams.get('charge'), CHARGE);
    return json({ object: 'list', has_more: false, data: stripe.refunds.map(refundObject) });
  }
  if (method === 'GET' && path.startsWith('refunds/')) {
    const refund = stripe.refunds.find((item) => item.id === path.slice('refunds/'.length));
    return refund ? json(refundObject(refund)) : json({ error: { code: 'resource_missing' } }, 404);
  }
  if (method === 'GET' && path === `subscriptions/${SUB}`) {
    stripe.subscriptionGets += 1;
    if (stripe.failSubscriptionGet) return json({ error: { type: 'api_error' } }, 500);
    return json({ id: SUB, object: 'subscription', livemode: true, ...stripe.subscription });
  }
  if (method === 'GET' && path === 'invoice_payments') {
    assert.equal(url.searchParams.get('payment[type]'), 'payment_intent');
    assert.equal(url.searchParams.get('payment[payment_intent]'), PI);
    return json({ object: 'list', has_more: false, data: stripe.paymentInvoice ? [{ invoice: stripe.paymentInvoice, status: 'paid' }] : [] });
  }
  if (method === 'DELETE' && path === `subscriptions/${SUB}`) {
    stripe.deletes.push({ body: String(init.body), idempotencyKey: init.headers?.['idempotency-key'] ?? null });
    if (stripe.failDelete) return json({ error: { type: 'api_error' } }, 500);
    stripe.subscription = { ...stripe.subscription, status: 'canceled' };
    return json({ id: SUB, object: 'subscription', livemode: true, status: 'canceled', canceled_at: 1790000000 });
  }
  throw new Error(`unexpected Stripe call ${method} ${path}`);
};

const { POST } = await import('../app/api/billing/stripe/webhook/route.ts');

let eventCounter = 0;
async function deliver(type, { refundId = 're_3Full', livemode = true } = {}) {
  eventCounter += 1;
  const object = type === 'charge.refunded'
    ? { id: CHARGE, object: 'charge' }
    : { id: refundId, object: 'refund', charge: CHARGE };
  const body = JSON.stringify({
    id: `evt_verify${eventCounter}`, type, livemode, created: 1790000000 + eventCounter, data: { object },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', LIVE_SECRET).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  const response = await POST(new Request('https://www.syllonaut.com/api/billing/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}`, 'content-length': String(Buffer.byteLength(body)) },
    body,
  }));
  return { status: response.status, body: await response.json() };
}

const quiet = { info: console.info, warn: console.warn, error: console.error };
console.info = console.warn = console.error = () => {};
try {
  // Full refund of the current invoice → immediate cancellation, exactly once.
  resetStripe();
  rpcMode = 'individual';
  let result = await deliver('charge.refunded');
  assert.equal(result.status, 200);
  assert.equal(result.body.subscriptionCancellation, 'canceled', 'full refund of the current invoice cancels');
  assert.equal(stripe.deletes.length, 1);
  assert.equal(stripe.deletes[0].body, 'invoice_now=false&prorate=false', 'immediate cancel without invoice or proration');
  assert.equal(stripe.deletes[0].idempotencyKey, `syllonaut-full-refund-cancel-${SUB}`);
  for (const type of ['refund.created', 'refund.updated', 'charge.refunded']) {
    result = await deliver(type);
    assert.equal(result.status, 200);
    assert.equal(result.body.subscriptionCancellation, 'subscription_not_live', `${type} after cancellation is a no-op`);
  }
  assert.equal(stripe.deletes.length, 1, 'repeated events cancel only once');

  // Refund reason 'duplicate' keeps the subscription.
  resetStripe({ refunds: [{ id: 're_3Full', status: 'succeeded', reason: 'duplicate', metadata: {} }] });
  result = await deliver('refund.created');
  assert.equal(result.body.subscriptionCancellation, 'duplicate');
  result = await deliver('charge.refunded');
  assert.equal(result.body.subscriptionCancellation, 'duplicate');
  assert.equal(stripe.deletes.length, 0, 'duplicate-payment refund never cancels');
  assert.equal(stripe.subscriptionGets, 0, 'duplicate is decided before touching the subscription');

  // Partial refund keeps the subscription.
  resetStripe({ charge: { amount: 32900, amount_refunded: 10000 } });
  result = await deliver('charge.refunded');
  assert.equal(result.status, 200);
  assert.equal(result.body.fullRefund, false);
  assert.equal(result.body.subscriptionCancellation, null, 'partial refund is not considered');
  assert.equal(stripe.deletes.length + stripe.subscriptionGets, 0);

  // Refund of an older invoice keeps the subscription.
  resetStripe({ subscription: { status: 'active', latest_invoice: 'in_1Newer' } });
  result = await deliver('charge.refunded');
  assert.equal(result.body.subscriptionCancellation, 'not_current_invoice');
  assert.equal(stripe.deletes.length, 0, 'older invoice never cancels');

  // Refunds created by withdrawal or service change keep their own path.
  for (const metadata of [
    { syllonaut_withdrawal_id: '11111111-1111-4111-8111-111111111111' },
    { syllonaut_service_change_termination_id: '22222222-2222-4222-8222-222222222222' },
  ]) {
    resetStripe({ refunds: [{ id: 're_3Full', status: 'succeeded', reason: 'requested_by_customer', metadata }] });
    globalThis.__privileged = [];
    result = await deliver('refund.updated');
    assert.equal(result.status, 200);
    assert.equal(result.body.subscriptionCancellation, 'app_managed_refund', `skip ${Object.keys(metadata)[0]}`);
    assert.equal(stripe.deletes.length, 0);
    assert.equal(globalThis.__privileged.length, 1, 'existing withdrawal/service-change reconciliation still runs');
  }

  // Failed or reversed refunds never cancel.
  resetStripe({ refunds: [
    { id: 're_3Full', status: 'succeeded', reason: 'requested_by_customer', metadata: {} },
    { id: 're_3Failed', status: 'failed', reason: 'requested_by_customer', metadata: {} },
  ] });
  result = await deliver('refund.failed', { refundId: 're_3Failed' });
  assert.equal(result.body.subscriptionCancellation, 'refund_failed');
  resetStripe({ refunds: [{ id: 're_3Full', status: 'canceled', reason: 'requested_by_customer', metadata: {} }], charge: { amount: 32900, amount_refunded: 0 } });
  result = await deliver('refund.updated');
  assert.equal(result.body.subscriptionCancellation, null, 'reversed refund is no longer a full refund');
  assert.equal(stripe.deletes.length, 0);

  // Stripe failure → 500 so Stripe retries; the retry then cancels.
  resetStripe({ failDelete: true });
  result = await deliver('charge.refunded');
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'full_refund_subscription_cancel_failed');
  stripe.failDelete = false;
  result = await deliver('charge.refunded');
  assert.equal(result.status, 200);
  assert.equal(result.body.subscriptionCancellation, 'canceled', 'retry after failure cancels');
  resetStripe({ failSubscriptionGet: true });
  result = await deliver('refund.created');
  assert.equal(result.status, 500, 'subscription lookup failure also returns 500');
  assert.equal(stripe.deletes.length, 0);

  // Organization refunds and AI grading pack refunds are untouched.
  for (const mode of ['organization', 'topup']) {
    resetStripe();
    rpcMode = mode;
    result = await deliver('charge.refunded');
    assert.equal(result.status, 200);
    assert.equal(stripe.subscriptionGets + stripe.deletes.length, 0, `${mode} refund never touches an individual subscription`);
  }
} finally {
  Object.assign(console, quiet);
}

// 3. The withdrawal cancellation keeps its behaviour (no idempotency key).
const withdrawal = read('lib/individual-withdrawal.ts');
assert.ok(withdrawal.includes('(await cancelWithdrawnSubscription(key,evidence.subscriptionId)).canceledAt'), 'withdrawal cancels without an idempotency key, as before');

console.log('Full refund cancels the current individual subscription once; duplicate, partial, older-invoice, app-managed and failed refunds do not; AI refund pause requires a live subscription.');
