import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('lib/withdrawal-calculation.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { calculateWithdrawal: calculate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const base = {
  amountMinor: 19900, currency: 'czk',
  periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z',
  serviceStartedAt: '2026-10-01T00:00:00Z', withdrawalReceivedAt: '2026-10-06T00:00:00Z',
  immediatePerformanceRequested: true, proportionateChargeDisclosed: true, previouslyRefundedMinor: 0,
};
assert.equal(calculate(base).retainedMinor, 3209);
assert.equal(calculate(base).refundDueMinor, 16691);
assert.equal(calculate({ ...base, withdrawalReceivedAt: base.periodStart }).refundDueMinor, 19900);
assert.equal(calculate({ ...base, withdrawalReceivedAt: '2026-10-01T12:00:00Z' }).retainedMinor, 320);
assert.equal(calculate({ ...base, amountMinor: 1 }).retainedMinor, 0);
assert.equal(calculate({ ...base, immediatePerformanceRequested: false }).refundDueMinor, 19900);
assert.equal(calculate({ ...base, proportionateChargeDisclosed: false }).refundDueMinor, 19900);
assert.equal(calculate({ ...base, previouslyRefundedMinor: 1000 }).refundDueMinor, 15691);
assert.equal(calculate({ ...base, previouslyRefundedMinor: 19000 }).refundDueMinor, 0);
assert.equal(calculate({ ...base, withdrawalReceivedAt: '2026-12-01T00:00:00Z' }).retainedMinor, 19900);
assert.equal(calculate({ ...base, serviceStartedAt: '2026-10-05T00:00:00Z' }).retainedMinor, 641);
assert.equal(calculate({ ...base, amountMinor: 36500, periodEnd: '2027-10-01T00:00:00Z' }).retainedMinor, 500);
assert.equal(calculate({ ...base, amountMinor: 36600, periodStart: '2028-01-01T00:00:00Z', serviceStartedAt: '2028-01-01T00:00:00Z', periodEnd: '2029-01-01T00:00:00Z', withdrawalReceivedAt: '2028-01-06T00:00:00Z' }).retainedMinor, 500);
assert.equal(calculate({ ...base, periodStart: '2026-10-01T02:00:00+02:00', withdrawalReceivedAt: '2026-10-06T02:00:00+02:00' }).retainedMinor, 3209);
assert.equal(calculate({ ...base, currency: 'eur' }).retainedMinor, 3209);
assert.equal(calculate({ ...base, currency: 'usd' }).retainedMinor, 3209);
assert.equal(calculate({ ...base, aiUsed: 1000000 }).refundDueMinor, calculate(base).refundDueMinor);
assert.throws(() => calculate({ ...base, periodEnd: base.periodStart }));
assert.throws(() => calculate({ ...base, amountMinor: -1 }));
assert.throws(() => calculate({ ...base, amountMinor: Number.MAX_SAFE_INTEGER + 1 }));
assert.throws(() => calculate({ ...base, previouslyRefundedMinor: 20000 }));
assert.throws(() => calculate({ ...base, withdrawalReceivedAt: '2026-10-01' }));
assert.throws(() => calculate({ ...base, serviceStartedAt: '2026-09-01T00:00:00Z' }));
// A later tariff/catalog price cannot alter the price of this original contract.
assert.deepEqual(calculate({ ...base, currentPlanAmountMinor: 99900 }), { ...calculate(base), currentPlanAmountMinor: 99900 });
console.log('Withdrawal time, annual/leap period, same-day, rounding, consent and prior-refund calculations passed.');
