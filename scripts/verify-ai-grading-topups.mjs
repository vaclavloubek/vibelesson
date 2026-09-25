import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  throw new Error(`AI grading top-up regression: ${message}`);
};
const equal = (actual, expected, label) => {
  if (actual !== expected) fail(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
};
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) fail(label);
};

// 1. Catalog (decided prices; Syllonaut is not a VAT payer).
const catalog = await import('../lib/ai-grading-topup-catalog.ts');
const expected = {
  grading_60: [60, 99, 3.99, 4.49],
  grading_100: [100, 149, 5.99, 6.49],
  grading_200: [200, 279, 11.49, 12.49],
};
for (const [pack, [quantity, czk, eur, usd]] of Object.entries(expected)) {
  equal(catalog.aiGradingTopupQuantity(pack), quantity, `${pack} quantity`);
  equal(catalog.aiGradingTopupDisplayPrice(pack, 'czk'), czk, `${pack} CZK`);
  equal(catalog.aiGradingTopupDisplayPrice(pack, 'eur'), eur, `${pack} EUR`);
  equal(catalog.aiGradingTopupDisplayPrice(pack, 'usd'), usd, `${pack} USD`);
}
equal(catalog.aiGradingTopupMinorUnitPrice('grading_200', 'eur'), 1149, 'minor units are rounded cents');
equal(catalog.AI_GRADING_TOPUP_VALIDITY_MONTHS, 12, 'packs are valid 12 months');

// 2. Communication with purchased suggestions.
const comm = await import('../lib/ai-grading-quota-communication.ts');
const base = { lesson_used: 1, lesson_limit: 25, lesson_remaining: 24, revision_used: 0, revision_limit: 40, revision_remaining: 40, lesson_unlimited: false, revision_unlimited: false, grading_unlimited: false, grading_enabled: true, plan_code: 'teacher_pro' };
const withCredit = comm.aiUsageRows({ ...base, grading_used: 60, grading_limit: 60, grading_remaining: 0, grading_credit_remaining: 100, grading_credit_next_expiry: '2027-09-24T22:00:00.000Z' }).find((row) => row.kind === 'grading');
equal(withCredit.exhausted, false, 'plan used up but packs left is not exhausted (no amber)');
equal(comm.aiUsageCreditText(withCredit, false), '+ 100 dokoupených (platné do 25. 9. 2027)', 'CS purchased line');
equal(comm.aiUsageCreditText(withCredit, true), '+ 100 purchased (valid until 25 Sept 2027)', 'EN purchased line');
equal(comm.shouldShowTopupLink(withCredit, true), false, 'no buy link with more than 10 left in total');
const low = comm.aiUsageRows({ ...base, grading_used: 55, grading_limit: 60, grading_remaining: 5, grading_credit_remaining: 5 }).find((row) => row.kind === 'grading');
equal(comm.shouldShowTopupLink(low, true), true, 'buy link at 10 left in total (plan + packs)');
equal(comm.shouldShowTopupLink(low, false), false, 'no buy link when top-ups are off or not Teacher Pro');
const state = { gradingEnabled: true, gradingUnlimited: false, gradingUsed: 60, gradingLimit: 60, gradingRemaining: 0, windowEnd: null, scope: 'individual' };
equal(comm.isGradingQuotaExhausted({ ...state, creditRemaining: 3 }), false, 'packs left: not exhausted');
equal(comm.isGradingQuotaExhausted({ ...state, creditRemaining: 0 }), true, 'plan and packs used up: exhausted');
equal(comm.canRequestAiForPendingQuota({ ...state, creditRemaining: 3 }, 2), true, 'button when packs are left and responses wait');
equal(comm.canRequestAiForPendingQuota({ ...state, creditRemaining: 0 }, 2), false, 'no button without suggestions');
equal(comm.canRequestAiForPendingQuota({ ...state, creditRemaining: 3 }, 0), false, 'no button without waiting responses');
equal(comm.requestAiForPendingButtonText(1, false), 'Požádat AI o návrhy pro 1 čekající odpověď', 'CS button (1)');
equal(comm.requestAiForPendingButtonText(3, false), 'Požádat AI o návrhy pro 3 čekající odpovědi', 'CS button (3)');
equal(comm.requestAiForPendingButtonText(7, false), 'Požádat AI o návrhy pro 7 čekajících odpovědí', 'CS button (7)');
equal(comm.requestAiForPendingButtonText(7, true), 'Ask AI for suggestions for 7 waiting responses', 'EN button');
equal(comm.shouldShowLowGradingNotice({ ...state, gradingRemaining: 0, creditRemaining: 4 }), true, 'low notice counts plan + packs');
equal(comm.topupLinkText(false), 'Dokoupit návrhy', 'CS link text');

// 3. Flag: everything off by default.
const topups = read('lib/ai-grading-topups.ts');
requireText(topups, "process.env.AI_GRADING_TOPUPS_ENABLED === 'true'", 'flag is opt-in');
for (const route of ['app/api/billing/stripe/topup/checkout/route.ts', 'app/api/sessions/[id]/evaluations/request-ai-suggestions/route.ts']) {
  requireText(read(route), 'if (!isAiGradingTopupsEnabled()) return new NextResponse(null, { status: 404 });', `${route} returns 404 when the flag is off`);
}
requireText(topups, "if (!isAiGradingTopupsEnabled()) return null;", 'no offer without the flag');
requireText(read('app/lessons/page.tsx'), "topupsAvailable={isAiGradingTopupsEnabled() && aiQuota?.plan_code === 'teacher_pro' && aiQuota.quota_scope === 'individual'}", 'panel link only for individual Teacher Pro with the flag');
requireText(read('app/sessions/[id]/page.tsx'), 'topupsEnabled={isAiGradingTopupsEnabled()}', 'banner gets the flag');
requireText(read('app/pricing/page.tsx'), 'aiGradingTopupsEnabled={isAiGradingTopupsEnabled()}', 'Pricing mentions packs only with the flag');
requireText(read('components/PricingPage.tsx'), "{topupsEnabled && plan.id === 'teacher-pro' ? (", 'Pricing shows packs only on Teacher Pro');

// 4. Eligibility and checkout gates.
requireText(topups, "row.plan_code !== 'teacher_pro' || row.role === 'admin'", 'only Teacher Pro');
requireText(topups, "if (row.in_organization) return { eligible: false, reason: 'organization_member' };", 'not for organisation members');
requireText(topups, "if (row.subscription_status === 'past_due' || row.paused) return { eligible: false, reason: 'ai_paused' };", 'not while past_due or AI paused');
const checkout = read('app/api/billing/stripe/topup/checkout/route.ts');
for (const [needle, label] of [
  ["if (!TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE) return jsonError(409, 'topup_terms_not_active');", 'no sale before Terms 1.12 is active'],
  ['immediateDeliveryRequested: z.literal(true)', 'immediate delivery consent required'],
  ['withdrawalLossAcknowledged: z.literal(true)', 'withdrawal loss acknowledgement required'],
  ['requireTrustedDeviceForPaidAccess(userId)', 'trusted device gate'],
  ["return jsonError(428, 'terms_reconsent_required')", 'current Terms acceptance gate'],
  ["if (profile?.role !== 'admin') return jsonError(403, 'sandbox_checkout_forbidden');", 'sandbox is admin acceptance only'],
  ['create_ai_grading_topup_contract_snapshot', 'contract snapshot stored with the checkout session'],
]) requireText(checkout, needle, label);

// 5. Legal: Terms 1.12 prepared but inactive in this release.
const legal = read('lib/legal.ts');
requireText(legal, 'export const TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE: boolean = true;', 'article 5a is part of Terms 1.12 after the legal review');
requireText(legal, "export const TERMS_AI_GRADING_TOPUP_TERMS_VERSION = '1.12';", 'prepared Terms version');
requireText(legal, "export const TERMS_VERSION = '1.12';", 'current Terms are 1.12');
requireText(legal, "  '2026-09-24-v12',", 'Terms 1.11 acceptances stay sufficient for ordinary product use');
const termsContent = read('lib/terms-content.ts');
for (const needle of ['12 měsíců od potvrzení platby', 'nejdříve ten, jehož platnost skončí nejdříve', 'nevyčerpané návrhy se zmrazí', 'ztrácíte právo od smlouvy o balíčku odstoupit', 'nevyčerpané návrhy z tohoto balíčku zanikají', 'valid for 12 months from payment confirmation']) {
  requireText(termsContent, needle, `article 5a covers: ${needle}`);
}
requireText(read('app/terms/page.tsx'), '{TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE ? (', 'Terms page renders 5a only when active');
requireText(read('lib/individual-contract-snapshot.ts'), "throw new Error('topup_terms_not_active');", 'pack snapshot refuses inactive Terms');

// 6. Database contract (neon/migrations/0019).
const migration = read('neon/migrations/0019_ai_grading_topups.sql');
for (const [needle, label] of [
  ['create table if not exists private.ai_grading_credit_grants', 'grant ledger'],
  ['external_checkout_session_id text not null unique', 'one grant per Checkout Session'],
  ['add column if not exists credit_grant_id uuid', 'budget requests reference packs'],
  ["    and r.credit_grant_id is null\n    and r.created_at >= v_window_start", 'plan allowance and cost ceiling ignore pack rows'],
  ['order by g.expires_at, g.purchased_at, g.id', 'earliest expiry first'],
  ['for update of g;', 'pack row lock'],
  ['and g.livemode', 'only LIVE packs are consumed'],
  ["if v_org_id is null and v_plan_code = 'teacher_pro' then", 'packs only for individual Teacher Pro'],
  [') + v_reservation <= g.quantity * 0.100000', 'pack cost ceiling quantity x $0.10'],
  ['   grading_credit_remaining integer,\n   grading_credit_next_expiry timestamp with time zone\n )', 'get_ai_quota appends the credit columns at the end'],
  ["on conflict (external_checkout_session_id) do nothing", 'idempotent grant'],
  ["raise exception 'ai_grading_topup_snapshot_mismatch'", 'paid amount must match the snapshot'],
  ["revoke_reason = 'refund'", 'refund revokes the pack'],
  ["revoke_reason = 'dispute'", 'dispute revokes the pack'],
  ['insert into private.individual_billing_disputes', 'dispute uses the existing AI pause ledger'],
  ["and e.grader_version = 'manual-budget-v1'\n    and not e.teacher_confirmed", 'RPC requeues only unconfirmed quota fallbacks'],
  ["if not private.trusted_device_hash_valid(p_user_id, p_device_token_hash) then", 'RPC trusted device check'],
  ['revoke all on table private.ai_grading_credit_grants from anon, anonymous, authenticated, authenticator;', 'deny-all grants'],
]) requireText(migration, needle, label);
const insertNotice = migration.indexOf('insert into private.ai_grading_quota_notices');
const packSelect = migration.indexOf('from private.ai_grading_credit_grants g\n      where g.user_id = v_user_id');
if (!(packSelect > 0 && insertNotice > packSelect)) fail('the quota notice is recorded only after no pack is left');
requireText(read('lib/neon/privileged-rpc.ts'), "'request_ai_suggestions_for_manual_evaluations_server',", 'RPC allowlisted');
const billingRpc = read('lib/neon/billing-rpc.ts');
for (const name of ['grant_ai_grading_credit_from_checkout', 'sync_ai_grading_topup_refund_event', 'sync_ai_grading_topup_dispute_event']) {
  requireText(billingRpc, `${name}: [`, `${name} allowlisted with its audited signature`);
}

// 7. Webhook ordering: packs first, subscriptions unchanged.
const webhook = read('app/api/billing/stripe/webhook/route.ts');
const topupIndex = webhook.indexOf('normalizeStripeTopupCheckoutEvent(event)');
if (topupIndex < 0 || topupIndex > webhook.indexOf('normalizeStripeOrganizationInvoiceEvent(event)')) fail('pack checkouts are handled before invoices');
if (webhook.indexOf("'sync_ai_grading_topup_dispute_event'") > webhook.indexOf("'sync_stripe_dispute_event'")) fail('pack disputes are checked before subscription disputes');
if (webhook.indexOf("'sync_ai_grading_topup_refund_event'") > webhook.indexOf("'sync_stripe_refund_state'")) fail('pack refunds are checked before subscription refunds');
requireText(webhook, "if (!topupResult.error.message?.includes('ai_grading_topup_payment_mapping_missing')) {", 'non-pack disputes fall through');
requireText(webhook, "if (!topupRefund.error.message?.includes('ai_grading_topup_payment_mapping_missing')) {", 'non-pack refunds fall through');

// 8. Price script safety.
const priceScript = read('scripts/create-ai-grading-topup-prices.mjs');
requireText(priceScript, "if (mode === 'live' && !args.has('--confirm-live')) throw new Error('LIVE requires --confirm-live');", 'LIVE prices need explicit confirmation');
requireText(priceScript, 'transfer_lookup_key', 'prices are idempotent by lookup key');

console.log('AI grading top-up checks passed.');
