// Referral program, phase 1 (neon/migrations/0027, REFERRALS_ENABLED).
//
// Static checks of the migration and wiring, plus the real signup action and
// lib/referral-program.ts run with Node type stripping against stubbed Neon
// Auth, cookies and SQL. No network, no database. The SQL scenarios
// themselves (rewards, caps, bonus reservation) were run on a temporary Neon
// branch; see PROJECT.md.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${repoRoot}${path}`, 'utf8');
const has = (text, needle, label) => assert.ok(text.includes(needle), label);

const migration = read('neon/migrations/0027_referral_program.sql');
const lib = read('lib/referral-program.ts');
const cron = read('app/api/cron/neon-grading/route.ts');
const rulesPage = read('app/referral/page.tsx');
const subscriptionPage = read('app/subscription/page.tsx');
const section = read('components/ReferralProgramSection.tsx');
const authControls = read('components/AuthControls.tsx');
const actions = read('app/auth/neon/actions.ts');

// 1. One place for the constants: the DB settings row equals the TS mirror.
const { REFERRAL_PROGRAM, normalizeReferralCodeInput } = await import('../lib/referral-program-config.ts');
const settings = migration.match(/values \(true, (\d+), (\d+), (\d+), (\d+), (\d+), (\d+), (\d+)\)/);
assert.ok(settings, 'settings row is inserted by 0027');
assert.deepEqual(settings.slice(1).map(Number), [
  REFERRAL_PROGRAM.rewardUnits,
  REFERRAL_PROGRAM.rewardValidMonths,
  REFERRAL_PROGRAM.qualifyWindowDays,
  REFERRAL_PROGRAM.minSubmittingParticipants,
  REFERRAL_PROGRAM.monthlyCap,
  REFERRAL_PROGRAM.totalCap,
  REFERRAL_PROGRAM.retentionMonths,
], 'private.referral_program_settings equals lib/referral-program-config.ts');
assert.deepEqual({ ...REFERRAL_PROGRAM }, {
  rewardUnits: 3, rewardValidMonths: 12, qualifyWindowDays: 60,
  minSubmittingParticipants: 5, monthlyCap: 3, totalCap: 10, retentionMonths: 12,
}, 'owner-decided constants (2026-09-28)');
for (const name of ['reward_units', 'reward_valid_months', 'qualify_window_days', 'min_submitting_participants', 'monthly_cap', 'total_cap']) {
  has(migration.slice(migration.indexOf('create or replace function private.process_referral_qualifications')), `v_settings.${name}`, `qualification reads ${name} from the settings row`);
}

// 2. Codes: random, no confusable characters, not derived from id or email.
assert.equal(normalizeReferralCodeInput(' ab c2 345 '), null, 'too short after trimming');
assert.equal(normalizeReferralCodeInput('abcd2345'), 'ABCD2345', 'case-insensitive input');
assert.equal(normalizeReferralCodeInput('ABCD2340'), null, '0 is not in the alphabet');
assert.equal(normalizeReferralCodeInput('ABCDIL23'), null, 'I and L are not in the alphabet');
assert.equal(normalizeReferralCodeInput('x'.repeat(33)), null, 'long input ignored');
assert.equal(normalizeReferralCodeInput(42), null, 'non-string ignored');
const codeFn = migration.slice(migration.indexOf('create or replace function private.get_or_create_referral_code_server'), migration.indexOf('create or replace function private.record_referral_attribution_server'));
has(codeFn, "'23456789ABCDEFGHJKMNPQRSTUVWXYZ'", 'code alphabet without 0/O/1/I/L');
has(codeFn, 'uuid_send(gen_random_uuid())', 'code bytes come from a random source');
const codeBody = codeFn.replace(/--.*$/gm, '');
assert.ok(!/p_user_id::text|md5|sha|email|hashtext/i.test(codeBody), 'code is not derived from the user id or email');
has(codeBody, 'v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);', 'code characters come only from random bytes');
has(codeFn, 'private.referral_account_is_individual(p_user_id)', 'admins and organization members get no code');

// 3. Attribution: once per invitee, immutable, immediate rejections.
has(migration, 'invitee_user_id uuid primary key references public.profiles(id)', 'at most one attribution per invitee');
has(migration, 'referral_attribution_immutable', 'referrer and invitee cannot change after signup');
const recordFn = migration.slice(migration.indexOf('create or replace function private.record_referral_attribution_server'), migration.indexOf('create or replace function private.get_referral_summary_server'));
for (const [needle, label] of [
  ["if v_referrer = p_invitee_user_id then\n    v_reason := 'self_referral';", 'own code → rejected self_referral'],
  ["v_reason := 'referrer_not_individual';", 'non-individual referrer → rejected'],
  ["private.referral_account_device_hashes(v_referrer) d\n    where d.token_hash = v_device", 'signup device among referrer devices → rejected'],
  ["v_reason := 'same_email';", 'same normalized email → rejected'],
  ["v_reason := 'disposable_email';", 'disposable domain → rejected'],
  ["if v_referrer is null then\n    return 'ignored';", 'unknown code is ignored without a row'],
  ['on conflict (invitee_user_id) do nothing', 'second attribution is ignored'],
]) has(recordFn, needle, label);
const devices = migration.slice(migration.indexOf('create or replace function private.referral_account_device_hashes'), migration.indexOf('create or replace function private.get_or_create_referral_code_server'));
has(devices, 'from private.user_trusted_devices d where d.user_id = p_user_id', 'trusted devices, including revoked ones');
assert.ok(!devices.includes('revoked_at is null'), 'revoked trusted devices still count');
has(devices, 'from private.free_device_budget_requests b', 'Free accounts: device hashes from the Free device budget (owner decision)');
has(migration, "if v_domain in ('gmail.com', 'googlemail.com') then\n    v_local := replace(split_part(v_local, '+', 1), '.', '');", 'Gmail normalization');

// 4. Qualification: idempotent grant, caps, expiry, shared device, paid plan.
const processFn = migration.slice(migration.indexOf('create or replace function private.process_referral_qualifications'), migration.indexOf('create or replace function public.reserve_lesson_generation_server'));
has(migration, 'invitee_user_id uuid unique,', 'one grant per invitee (idempotence key)');
has(processFn, 'on conflict (invitee_user_id) do nothing', 'repeated run cannot add a second grant');
has(processFn, "where a.status = 'pending'", 'only pending attributions are evaluated');
has(processFn, 'for update skip locked', 'concurrent runs do not evaluate the same attribution');
has(processFn, 'perform 1 from public.profiles p where p.id = v_row.referrer_user_id for update;', 'caps are serialized per referrer');
has(processFn, 'if v_total >= v_settings.total_cap or v_month >= v_settings.monthly_cap then', 'monthly and total caps');
has(processFn, "date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'", 'monthly cap uses the UTC calendar month');
has(processFn, "set status = 'capped'", 'over the cap → capped without a grant');
has(processFn, "set status = 'expired'", 'older than the window → expired');
has(processFn, 'u."emailVerified"', 'lesson route requires a verified email');
has(processFn, "s.status = 'ended'", 'lesson route requires an ended live lesson');
has(processFn, 'count(distinct r.participant_id)\n          from public.responses r', 'distinct participants with individual answers');
assert.ok(!processFn.includes('team_responses'), 'team answers do not count (owner decision)');
has(processFn, 'r.submitted_at is not null', 'only submitted answers count');
has(processFn, "set status = 'rejected', reject_reason = 'shared_device'", 'shared device at evaluation → rejected');
has(processFn, "v_by := 'paid_plan';", 'a live paid subscription qualifies on its own (owner decision)');
has(processFn, 'bs.livemode', 'only live subscriptions qualify');
assert.ok(!/\b(net\.|http_|pg_notify|resend)/i.test(migration), 'the migration sends nothing');

// 5. Bonus reservation: after the plan refusal, earliest expiry, units returned.
const reserveFn = migration.slice(migration.indexOf('create or replace function public.reserve_lesson_generation_server'));
has(reserveFn, 'and g.credit_grant_id is null', 'plan count ignores bonus generations');
has(reserveFn, 'if v_org_id is null and private.referral_account_is_individual(p_user_id) then', 'organization members keep the bonus frozen');
has(reserveFn, 'order by g.expires_at, g.granted_at, g.id', 'earliest expiry first');
has(reserveFn, 'and g.units_used < g.units_granted', 'only grants with units left');
has(reserveFn, 'from private.lock_free_device_budget(', 'Free device budget still applies');
assert.ok(reserveFn.indexOf('v_credit_grant_id is null') < reserveFn.indexOf('from private.lock_free_device_budget('), 'bonus is chosen after the plan refusal, before the device budget');
has(migration, "and new.status = 'failed' then\n    update private.lesson_credit_grants\n    set units_used = greatest(units_used - 1, 0)", 'a failed generation returns the unit');
has(migration, 'after update of status, credit_grant_id on public.generation_requests', 'every pending → failed path returns the unit');
assert.ok(!migration.includes('function public.get_ai_quota'), 'get_ai_quota is unchanged');
for (const table of ['referral_program_settings', 'referral_codes', 'referral_attributions', 'lesson_credit_grants']) {
  has(migration, `alter table private.${table} enable row level security;`, `${table} has RLS`);
  has(migration, `revoke all on table private.${table} from anon, anonymous, authenticated, authenticator;`, `${table} has no API grants`);
}
const functionCount = (migration.match(/create or replace function /g) ?? []).length;
assert.equal((migration.match(/ security definer\n set search_path to ''/g) ?? []).length, functionCount - 1, 'every SECURITY DEFINER function pins search_path');
assert.ok(!/grant execute/i.test(migration), 'no function is granted to API roles');

// 6. Flag and wiring.
has(lib, "process.env.REFERRALS_ENABLED === 'true'", 'flag is opt-in');
has(cron, 'if (isReferralsEnabled()) {\n    try {\n      referrals = await processReferralQualifications();', 'cron evaluates only with the flag');
has(rulesPage, 'if (!isReferralsEnabled()) notFound();', 'rules page is 404 without the flag');
assert.ok(!/Návrh k revizi|Draft for review/.test(rulesPage), 'rules are published (owner approval 2026-09-28)');

// 6b. Retention (Privacy Notice 1.12).
const purgeFn = migration.slice(migration.indexOf('create or replace function private.purge_referral_data'), migration.indexOf('create or replace function public.reserve_lesson_generation_server'));
has(purgeFn, 'make_interval(months => v_settings.retention_months)', 'retention period comes from the settings row');
has(purgeFn, "a.status in ('rejected', 'expired', 'capped')\n      and a.resolved_at < v_cutoff", 'closed attributions are deleted after the retention period');
has(purgeFn, 'set invitee_user_id = null\n  where g.invitee_user_id is not null\n    and g.expires_at < v_cutoff', 'rewarded: link removed after reward expiry + retention, grant kept for the total cap');
assert.ok(!/delete from private\.lesson_credit_grants/.test(purgeFn), 'grants are never deleted (total cap keeps counting)');
has(migration, "check ((status = 'pending') = (resolved_at is null))", 'every closed attribution has resolved_at');
has(cron, 'referralRetention = await purgeReferralData();', 'cron runs the retention purge');
assert.ok(!cron.slice(cron.indexOf('let referralRetention')).startsWith('let referralRetention: Awaited<ReturnType<typeof purgeReferralData>> = null;\n  if (isReferralsEnabled'), 'retention purge does not depend on the flag');
has(lib, "to_regprocedure('private.purge_referral_data()') is not null", 'purge is skipped until 0027 exists');
const gdpr = read('app/gdpr/page.tsx');
has(gdpr, 'Verze 1.12', 'Privacy Notice 1.12 describes the program');
has(gdpr, 'nejdéle 12 měsíců po uzavření doporučení', 'Privacy Notice retention matches the settings row');
has(subscriptionPage, 'referralSection = await getReferralSection(userId);', 'subscription page reads the section on the server');
has(authControls, 'isReferralSignupEnabled().then((enabled) => {\n      if (!enabled) return;', 'signup field only with the flag');
has(authControls, "new URLSearchParams(window.location.search).get('ref')", 'field prefilled from ?ref');
const referralEffect = authControls.slice(authControls.indexOf("if (!NEON_APP_AUTH || mode !== 'signup' || referralCheckedRef.current) return;"), authControls.indexOf('}, [mode]);'));
assert.ok(referralEffect.length > 0 && !/localStorage|sessionStorage|document\.cookie/.test(referralEffect), 'no new cookie or localStorage for the code');
assert.ok(!/referral/i.test(authControls.split('\n').filter((line) => /localStorage|sessionStorage|document\.cookie/.test(line)).join('\n')), 'no storage line mentions the referral code');
has(actions, 'const deviceToken = await ensureTrustedDeviceCookie();\n    // Needs the device hash', 'attribution is written after the device cookie exists');
assert.ok(!/email|display_name|name\b/i.test(migration.slice(migration.indexOf('create or replace function private.get_referral_summary_server'), migration.indexOf('create or replace function private.process_referral_qualifications'))), 'summary exposes no names or emails');
for (const [label, text] of [['lib/referral-program.ts', lib], ['components/ReferralProgramSection.tsx', section], ['app/referral/page.tsx', rulesPage]]) {
  assert.ok(!/resend|marketing-lifecycle|sendLifecycleEvent|sendEmail|fetch\(/i.test(text), `${label} sends nothing`);
}
const { isDisposableEmailDomain } = await import('../lib/referral-disposable-email-domains.ts');
assert.equal(isDisposableEmailDomain('a@Mailinator.com'), true, 'disposable domain detected');
assert.equal(isDisposableEmailDomain('a@gmail.com'), false, 'regular domain allowed');

// 7. The real signup action: the response never depends on the referral code.
const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return stub('export {};');
    if (specifier === 'next/server') return stub('export function after(callback) { globalThis.__after.push(callback); }');
    if (specifier === 'next/headers') return stub(`
      export async function cookies() {
        return {
          get: (name) => globalThis.__cookies.has(name) ? { value: globalThis.__cookies.get(name) } : undefined,
          set: (name, value) => { globalThis.__cookies.set(name, value); },
          delete: (name) => { globalThis.__cookies.delete(name); },
        };
      }
    `);
    if (specifier === '@/lib/neon/config') return stub('export const getDatabaseBackend = () => "neon"; export function assertApprovedNeonCutover() {}');
    if (specifier === '@/lib/neon/auth') return stub(`
      export function createServerAuth() {
        return {
          signUp: { email: async () => ({ data: { user: { id: '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f' }, token: null } }) },
          emailOtp: { sendVerificationOtp: async () => { globalThis.__otp += 1; } },
        };
      }
    `);
    if (specifier === '@/lib/neon/request-client') return stub('export async function getVerifiedNeonSession() { return { data: null }; }');
    if (specifier === '@/lib/neon/turnstile') return stub('export async function verifyNeonAuthChallenge() { return true; }');
    if (specifier === '@/lib/marketing-lifecycle') return stub('export async function startMarketingOnboarding() { globalThis.__marketing += 1; }');
    if (specifier === '@/lib/supabase/admin') return stub('export function createAdminClient() { throw new Error("not used"); }');
    if (specifier === '@/lib/neon/server') return stub(`
      export function createNeonSql() {
        const sql = (strings, ...values) => {
          const text = strings.join('?');
          return {
            text,
            values,
            then(resolve, reject) {
              globalThis.__queries.push({ text, values });
              if (text.includes('referral') && globalThis.__referralThrows) return reject(new Error('db down'));
              return resolve([]);
            },
          };
        };
        sql.transaction = async (queries) => { for (const q of queries) globalThis.__queries.push({ text: q.text, values: q.values }); return []; };
        return sql;
      }
    `);
    if (specifier.startsWith('@/')) {
      const base = `${repoRoot}${specifier.slice(2)}`;
      const file = ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find(existsSync);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

process.env.NEON_AUTH_BASE_URL = 'https://auth.example.invalid';
process.env.NEON_AUTH_COOKIE_SECRET = 'verify-referral-program';

const { signUpWithNeonForApp } = await import('../app/auth/neon/actions.ts');
const referral = await import('../lib/referral-program.ts');

async function signup(referralCode, { email = 'teacher@example.org', flag = true, dbThrows = false } = {}) {
  globalThis.__after = [];
  globalThis.__cookies = new Map();
  globalThis.__queries = [];
  globalThis.__otp = 0;
  globalThis.__marketing = 0;
  globalThis.__referralThrows = dbThrows;
  if (flag) process.env.REFERRALS_ENABLED = 'true';
  else delete process.env.REFERRALS_ENABLED;
  const result = await signUpWithNeonForApp({
    email,
    password: 'long-enough-password',
    termsAccepted: true,
    marketingConsent: false,
    locale: 'cs',
    challenge: 'token',
    ...(referralCode === undefined ? {} : { referralCode }),
  });
  const referralQueries = globalThis.__queries.filter((q) => q.text.includes('record_referral_attribution_server'));
  return { result, referralQueries, cookies: [...globalThis.__cookies.keys()].sort(), otp: globalThis.__otp };
}

const baseline = await signup(undefined);
assert.deepEqual(baseline.result, { checkEmail: true }, 'baseline signup response');
assert.equal(baseline.referralQueries.length, 0, 'no code → no referral write');
for (const [label, code, options] of [
  ['invalid code', 'not-a-code'],
  ['well-formed unknown code', 'ZZZZ2222'],
  ['valid-looking code', 'abcd2345'],
  ['code while the database fails', 'ABCD2345', { dbThrows: true }],
  ['code with the flag off', 'ABCD2345', { flag: false }],
]) {
  const run = await signup(code, options);
  assert.deepEqual(run.result, baseline.result, `${label}: same signup response`);
  assert.deepEqual(run.cookies, baseline.cookies, `${label}: same cookies (no new referral cookie)`);
  assert.equal(run.otp, baseline.otp, `${label}: verification email unchanged`);
}
assert.equal((await signup('not-a-code')).referralQueries.length, 0, 'malformed code never reaches the database');
assert.equal((await signup('ABCD2345', { flag: false })).referralQueries.length, 0, 'flag off → nothing written');
const written = await signup(' abcd 2345 ');
assert.equal(written.referralQueries.length, 1, 'valid code → one attribution call');
const [invitee, code, deviceHash, disposable] = written.referralQueries[0].values;
assert.equal(invitee, '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'attribution for the new account');
assert.equal(code, 'ABCD2345', 'normalized code');
assert.match(deviceHash, /^[0-9a-f]{64}$/, 'signup device hash is passed');
assert.equal(disposable, false, 'regular email is not disposable');
assert.equal((await signup('ABCD2345', { email: 'x@yopmail.com' })).referralQueries[0].values[3], true, 'disposable email flagged');

// 8. Library: nothing is read, written or evaluated without the flag.
delete process.env.REFERRALS_ENABLED;
globalThis.__queries = [];
assert.equal(await referral.getReferralSection('6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f'), null, 'no section without the flag');
assert.equal(await referral.processReferralQualifications(), null, 'no evaluation without the flag');
await referral.recordReferralAttributionSafely({ inviteeUserId: 'x', referralCode: 'ABCD2345', signupDeviceHash: null, email: 'a@b.cz' });
assert.equal(globalThis.__queries.length, 0, 'no database access without the flag');

console.log('Referral program checks passed.');
