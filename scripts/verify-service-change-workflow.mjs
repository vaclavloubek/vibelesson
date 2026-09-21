import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = path => fs.readFileSync(path, 'utf8');
const compiled = ts.transpileModule(read('lib/service-change-policy.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { classifyServiceChangePolicy, calculateUnusedServiceChangeRefund } = module.exports;

const announcedAt = '2026-10-01T00:00:00.000Z';
const effectiveAt = '2026-10-31T00:00:00.000Z';
assert.equal(classifyServiceChangePolicy({
  classification: 'beneficial_or_minor', legacyAvailable: false, announcedAt, effectiveAt,
}).strategy, 'apply');
assert.deepEqual(classifyServiceChangePolicy({
  classification: 'material_adverse', legacyAvailable: true, announcedAt,
  effectiveAt: '2026-10-10T00:00:00.000Z', paidPeriodEnd: '2026-11-15T00:00:00.000Z',
}), {
  policyVersion: 'hybrid-v1', strategy: 'grandfather', durableNoticeRequired: true,
  terminationRight: false, legacyUntil: '2026-11-15T00:00:00.000Z', terminationDeadline: null,
});
assert.equal(classifyServiceChangePolicy({
  classification: 'material_adverse', legacyAvailable: false, announcedAt, effectiveAt,
}).terminationDeadline, '2026-11-30T00:00:00.000Z');
assert.throws(() => classifyServiceChangePolicy({
  classification: 'material_adverse', legacyAvailable: false, announcedAt,
  effectiveAt: '2026-10-30T23:59:59.999Z',
}), /notice_too_short/);

const refund = input => calculateUnusedServiceChangeRefund({ previouslyRefundedMinor: 0, ...input });
assert.deepEqual(refund({ amountMinor: 3100, periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z', terminatedAt: '2026-10-16T12:00:00.000Z' }), {
  methodVersion: 'unused-period-v1', retainedMinor: 1550, totalRefundEntitlementMinor: 1550,
  refundDueMinor: 1550, rounding: 'retained_floor_minor_unit',
});
assert.equal(refund({ amountMinor: 12000, periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2027-01-01T00:00:00.000Z', terminatedAt: '2026-07-02T12:00:00.000Z' }).refundDueMinor, 6000);
assert.equal(refund({ amountMinor: 999, periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z', terminatedAt: '2026-10-01T00:00:00.000Z' }).refundDueMinor, 999);
assert.equal(refund({ amountMinor: 100, periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-10-04T00:00:00.000Z', terminatedAt: '2026-10-02T00:00:00.000Z' }).retainedMinor, 33);
assert.equal(calculateUnusedServiceChangeRefund({ amountMinor: 1000, previouslyRefundedMinor: 400,
  periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z',
  terminatedAt: '2026-10-16T12:00:00.000Z' }).refundDueMinor, 100);
assert.equal(refund({ amountMinor: 36600, periodStart: '2028-01-01T00:00:00.000Z',
  periodEnd: '2029-01-01T00:00:00.000Z', terminatedAt: '2028-07-02T00:00:00.000Z' }).retainedMinor, 18300);

const terms = read('app/terms/page.tsx');
const snapshot = read('lib/individual-contract-snapshot.ts');
const termsContent = read('lib/terms-content.ts');
const migration = read('supabase/migrations/20260921100213_add_service_change_workflow.sql');
const publishApi = read('app/api/admin/service-changes/route.ts');
const terminateApi = read('app/api/legal/service-changes/terminate/route.ts');
const notices = read('components/ServiceChangeNotices.tsx');
const delivery = read('lib/service-change-email.ts');
const stripe = read('lib/stripe-withdrawal.ts');
const webhook = read('app/api/billing/stripe/webhook/route.ts');
const vercel = read('vercel.json');

for (const source of [terms, snapshot]) assert.match(source, /TERMS_SERVICE_CHANGE_CLAUSE/);
assert.match(termsContent, /standardně alespoň 30 dnů předem/);
for (const table of ['service_change_releases', 'service_change_deliveries', 'service_change_termination_requests']) {
  assert.match(migration, new RegExp(`alter table private\\.${table} enable row level security`));
}
assert.match(migration, /service_change_release_immutable/);
assert.match(migration, /service_change_delivery_sent_evidence_immutable/);
assert.match(migration, /service_change_termination_calculation_immutable/);
assert.match(migration, /immediate_termination_confirmed boolean not null/);
assert.match(migration, /effective_at >= created_at \+ interval '30 days'/);
assert.match(migration, /greatest\(p_sent_at,r\.effective_at\)\+interval '30 days'/);
assert.match(migration, /from public,anon,authenticated/);
assert.match(migration, /to service_role/);
assert.match(publishApi, /isSuperadminUserId/);
assert.match(delivery, /Idempotency-Key/);
assert.match(delivery, /noticeSha256/);
assert.match(terminateApi, /authenticatedUserId/);
assert.match(terminateApi, /confirmImmediateTermination:z\.literal\(true\)/);
assert.match(read('lib/service-change-termination.ts'), /service_change_plan_history_review_required/);
assert.match(notices, /Terminate because of this change/);
assert.match(stripe, /syllonaut_service_change_termination_id/);
assert.match(webhook, /reconcileServiceChangeRefundEvent/);
assert.match(vercel, /\/api\/cron\/service-changes/);

console.log('Service change workflow OK');
