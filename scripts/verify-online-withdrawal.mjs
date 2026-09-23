import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260921133000_add_online_withdrawal_legal_012.sql');
const form = read('lib/withdrawal-form.ts');
const contract = read('lib/individual-contract-snapshot.ts');
const terms = read('app/terms/page.tsx');
const publicPage = read('app/withdrawal/page.tsx');
const subscription = read('components/SubscriptionManagement.tsx');
const subscriptionPage = read('app/subscription/page.tsx');
const api = read('app/api/legal/withdrawal/route.ts');
const workflow = read('lib/online-withdrawal.ts');
const privacy = read('app/gdpr/page.tsx');
const proxy = read('proxy.ts');

for (const phrase of [
  'Vzorový formulář pro odstoupení od smlouvy',
  'vyplňte tento formulář a pošlete jej zpět pouze v případě',
  'Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*)',
  'Datum objednání (*) / datum obdržení (*)',
  'Jméno a příjmení spotřebitele/spotřebitelů',
  'Adresa spotřebitele/spotřebitelů',
  'pouze pokud je tento formulář zasílán v listinné podobě',
  '(*) Nehodící se škrtněte nebo údaje doplňte',
]) assert.ok(form.includes(phrase), `statutory form phrase missing: ${phrase}`);

assert.ok(contract.includes('buildStatutoryWithdrawalFormHtml'), 'contract attachment must use the shared statutory form');
assert.ok(terms.includes('WITHDRAWAL_FORM_COPY') && terms.includes('/withdrawal'), 'Terms must expose the shared form and public route');
assert.ok(publicPage.includes('WITHDRAWAL_FORM_COPY') && publicPage.includes('PrintPageButton'), 'public printable form is missing');
assert.ok(proxy.includes("pathname === '/withdrawal'"), 'public form must use the locale gateway');
// LEGAL-020: statutory notice per NV 29/2023 Sb. as amended by 66/2026 Sb. (withdrawal function).
const termsContent = fs.readFileSync('lib/terms-content.ts', 'utf8');
assert.ok(termsContent.includes('Můžete rovněž odstoupit od smlouvy online na syllonaut.com/cs/subscription'), 'statutory online-withdrawal sentence must name where the button is');
assert.ok(termsContent.includes('Využijete-li této možnosti, bez zbytečného odkladu Vám potvrdíme přijetí prohlášení o odstoupení od smlouvy v textové podobě (například prostřednictvím elektronické pošty), včetně jeho obsahu a data a času jeho odeslání.'), 'statutory acknowledgment wording from NV 66/2026 must be verbatim');
for (const [source, label] of [[terms, 'Terms'], [contract, 'contract snapshot'], [publicPage, 'public withdrawal page']]) {
  assert.ok(source.includes('TERMS_ONLINE_WITHDRAWAL_NOTICE'), `${label} must use the statutory online-withdrawal notice`);
}
assert.ok(publicPage.includes('<SignInControl />') && publicPage.includes('accountUser ? <Link href="/subscription#withdrawal">'), 'signed-out visitors must be offered sign-in instead of a dead-end withdrawal link');

assert.ok(subscriptionPage.includes('getOnlineWithdrawalOpportunity(userId)'), 'subscription page must load the contract-specific opportunity');
assert.ok(subscription.includes("ui('Odstoupit od smlouvy', 'Withdraw from contract')"), 'first statutory online button is missing');
assert.ok(subscription.includes("ui('Potvrdit odstoupení od smlouvy', 'Confirm withdrawal from contract')"), 'confirmation button is missing');
assert.ok(subscription.includes('consumerConfirmed') && subscription.includes('electronicContact'), 'consumer assertion and electronic contact are required');
assert.ok(subscription.includes('zákonný vzorový formulář'), 'email/post alternative must remain visible');

assert.ok(api.includes("request.headers.get('origin') !== new URL(request.url).origin"), 'online submission must require same-origin');
assert.ok(api.includes('authenticatedUserId: userId'), 'online submission must require the authenticated account');
assert.ok(api.includes('opportunity.snapshotId !== input.snapshotId'), 'API must bind the submission to the account opportunity');
assert.ok(api.includes('registerOnlineWithdrawal') && api.includes('deliverOnlineWithdrawalConfirmation'), 'registration and durable confirmation must both run');
assert.ok(workflow.includes('IdempotencyKey') || workflow.includes('idempotencyKey'), 'confirmation email must be idempotent');
assert.ok(workflow.includes('noticeSha256') && workflow.includes('submittedAt'), 'confirmation must carry evidence hash and server time');

for (const table of ['individual_withdrawal_online_submissions', 'individual_withdrawal_confirmation_deliveries']) {
  assert.ok(migration.includes(`create table private.${table}`), `${table} must be private`);
  assert.ok(migration.includes(`alter table private.${table} enable row level security`), `${table} must enable RLS`);
  assert.ok(migration.includes(`revoke all on private.${table} from public,anon,authenticated,service_role`), `${table} must deny direct roles`);
}
assert.ok(migration.includes('individual_withdrawal_online_submissions_append_only'), 'submission evidence must be append-only');
assert.ok(migration.includes("v_submitted_at timestamptz := clock_timestamp()"), 'submission time must be server generated');
assert.ok(migration.includes("extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256')"), 'database must hash the canonical notice');
assert.ok(migration.includes("v_submitted_at > v_snapshot.accepted_at + interval '14 days'"), 'deadline must be checked transactionally');
assert.ok(migration.includes("notification_type='subscription_activated'"), 'submission must bind to activated contract evidence');
assert.ok(migration.includes("'statement',case when p_locale='cs'"), 'database must persist exact notice content');
assert.ok(migration.includes('to service_role'), 'all online withdrawal RPCs must remain service-role only');
assert.ok(!migration.includes('grant execute') || !/grant execute[\s\S]*to authenticated/.test(migration), 'clients must not execute evidence RPCs directly');

assert.ok(privacy.includes('Online odstoupení od smlouvy:') && privacy.includes('Online contract withdrawal:'), 'privacy notice must disclose online withdrawal evidence');
assert.ok(privacy.includes('Neměnný záznam odstoupení') && privacy.includes('immutable withdrawal record'), 'privacy notice must describe retention');

console.log('LEGAL-012 statutory form, online withdrawal evidence and durable confirmation checks passed.');
