import assert from 'node:assert/strict';
import fs from 'node:fs';

// LEGAL-017: evidenced complaint workflow (receipt, 30-day resolution, written resolution).
const read = (path) => fs.readFileSync(path, 'utf8');

const migration = read('neon/migrations/0011_customer_complaints_legal_017.sql');
for (const [needle, label] of [
  ['create table if not exists private.customer_complaints', 'complaint receipt table'],
  ['create table if not exists private.customer_complaint_resolutions', 'complaint resolution table'],
  ['create table if not exists private.customer_complaint_email_deliveries', 'confirmation delivery table'],
  ['resolution_due_at timestamptz not null', '30-day deadline is stored per complaint'],
  ['constraint customer_complaints_client_request_unique unique (user_id, client_request_id)', 'idempotent submission'],
  ['customer_complaints_append_only', 'receipt evidence is append-only'],
  ['customer_complaint_resolutions_append_only', 'resolution evidence is append-only'],
  ["check (outcome = 'rejected' or remedy_applied is not null)", 'accepted outcomes state the remedy provided'],
  ['explanation text not null', 'every resolution has a written explanation'],
  ['alter table private.customer_complaints enable row level security', 'RLS on complaint receipts'],
  ["array['anon', 'anonymous', 'authenticated', 'authenticator']", 'Data API roles lose table access'],
]) {
  assert.ok(migration.includes(needle), `migration is missing: ${label}`);
}
assert.ok(!/references\s+(auth|public|neon_auth|app_identity)\./.test(migration), 'complaint evidence must not cascade with account deletion');

const options = read('lib/complaint-options.ts');
assert.ok(options.includes('COMPLAINT_RESOLUTION_DAYS = 30'), 'resolution deadline is 30 days');
for (const code of ['ai_generation', 'live_lesson', 'grading', 'billing', 'account', 'other']) {
  assert.ok(options.includes(`${code}:`) && migration.includes(`'${code}'`), `subject area ${code} must match the DB constraint`);
}
for (const code of ['bring_into_conformity', 'price_reduction', 'termination', 'accepted', 'partially_accepted', 'rejected']) {
  assert.ok(options.includes(`${code}:`) && migration.includes(`'${code}'`), `code ${code} must match the DB constraint`);
}

const lib = read('lib/complaints.ts');
for (const [needle, label] of [
  ["import 'server-only';", 'complaint library is server-only'],
  ["to_regclass('private.customer_complaints')", 'feature stays off until migration 0011 exists'],
  ['now() + make_interval(days => ${COMPLAINT_RESOLUTION_DAYS}::int)', 'deadline is computed by the database clock'],
  ['on conflict (user_id, client_request_id) do nothing', 'retried submission returns the original receipt'],
  ["insert into private.customer_complaint_email_deliveries (complaint_id, kind)\n      select id, 'receipt' from inserted", 'receipt and pending confirmation are created in one statement'],
  ['idempotencyKey: `syllonaut:complaint:${complaintId}:${kind}-v1`', 'confirmation emails are idempotent'],
  ["if (input.outcome !== 'rejected' && !input.remedyApplied)", 'accepted resolutions require the remedy provided'],
  ['on conflict (complaint_id) do nothing', 'a complaint is resolved only once'],
  ["and c.resolution_due_at < now() + interval '7 days'", 'operator is reminded before the deadline'],
  ['MAX_COMPLAINTS_PER_DAY', 'submissions are rate limited per account'],
]) {
  assert.ok(lib.includes(needle), `complaint library is missing: ${label}`);
}

const api = read('app/api/legal/complaint/route.ts');
assert.ok(api.includes("request.headers.get('origin') !== new URL(request.url).origin"), 'complaint API requires same origin');
assert.ok(api.includes('authenticatedUserId: userId'), 'complaints must not depend on accepting newer Terms');
assert.ok(api.includes("deliverComplaintEmail(receipt.complaintId, 'receipt', userId)"), 'receipt confirmation is sent immediately');

const adminApi = read('app/api/admin/complaints/route.ts');
assert.ok(adminApi.includes('isSuperadminUserId(userId)'), 'complaint resolution is superadmin-only');
assert.ok(adminApi.includes("deliverComplaintEmail(input.complaintId, 'resolution')"), 'resolution confirmation is sent on resolve');
assert.ok(read('app/admin/complaints/page.tsx').includes('isSuperadminUserId(userId)'), 'admin page is superadmin-only');

const cron = read('app/api/cron/complaints/route.ts');
assert.ok(cron.includes("'Bearer ' + secret") && cron.includes('runComplaintMaintenance'), 'complaint cron is protected and runs maintenance');
assert.ok(read('vercel.json').includes('/api/cron/complaints'), 'complaint cron is scheduled');

assert.ok(read('proxy.ts').includes("pathname === '/complaint'"), 'complaint page uses the locale gateway');
assert.ok(fs.existsSync('app/[locale]/complaint/page.tsx'), 'localized complaint route exists');
assert.ok(read('components/SiteFooter.tsx').includes('/complaint`'), 'footer links the complaint page');
assert.ok(read('app/complaint/page.tsx').includes('complaintsAvailable()'), 'complaint page falls back to email until the evidence store exists');

const termsContent = read('lib/terms-content.ts');
assert.ok(termsContent.includes('TERMS_COMPLAINT_CLAUSE'), 'Terms define the complaint clause');
assert.ok(read('app/gdpr/page.tsx').includes('Reklamaci (jméno, kontaktní e-mail'), 'Privacy Notice covers complaint records');

console.log('LEGAL-017 complaint workflow checks passed.');
