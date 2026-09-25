import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error('[dpa] ' + message); };

const legal = read('lib/legal.ts');
const dpa = read('lib/dpa-document.ts');
const page = read('app/dpa/page.tsx');
const localized = read('app/[locale]/dpa/page.tsx');
const proxy = read('proxy.ts');
const footer = read('components/SiteFooter.tsx');
const terms = read('app/terms/page.tsx');
const gdpr = read('app/gdpr/page.tsx');
const school = read('components/SchoolAdmin.tsx');
const schoolApi = read('app/api/organizations/route.ts');

if (!legal.includes("DPA_VERSION = '1.4'")) fail('active DPA version is missing');
if (!legal.includes("DPA_ACCEPTANCE_KEY = '2026-09-25-dpa-v5'")) fail('active DPA acceptance key is missing');
// DPA 1.4: Syllonaut Help is a purpose of processing and an OpenAI purpose.
if (!dpa.includes('Nápovědy Syllonautu (odpovědi AI na dotazy učitelů') || !dpa.includes('Syllonaut Help (AI answers to teachers’ questions')) fail('DPA section 2 must list Syllonaut Help as a purpose of processing');
if (!dpa.includes('odpovědi Nápovědy Syllonautu na cestách, které používají OpenAI') || !dpa.includes('Syllonaut Help answers on routes that use OpenAI')) fail('DPA must list Syllonaut Help as an OpenAI sub-processor purpose');

for (const needle of [
  'Dokumentované pokyny',
  'Důvěrnost, řízení přístupu',
  'Další zpracovatelé',
  'Porušení zabezpečení osobních údajů',
  'Vrácení a výmaz dat Správce',
  'Doložení souladu a audity',
  'Mezinárodní předávání',
  'Documented instructions',
  'Sub-processors and changes to the list',
  'Personal-data breaches',
  'Return and deletion of Controller Data',
  'Demonstrating compliance and audits',
  'International transfers',
]) {
  if (!dpa.includes(needle)) fail('Article 28 DPA content missing: ' + needle);
}

for (const provider of [
  'Neon (Databricks)',
  'Supabase',
  'Vercel',
  'Cloudflare',
  'Resend',
  'OpenAI',
  'Amazon Web Services (Bedrock)',
  'Microsoft Azure',
]) {
  if (!dpa.includes(provider)) fail('sub-processor list missing: ' + provider);
}

if (!dpa.includes('15 dnů předem') || !dpa.includes('10 dnů vznést námitku')) {
  fail('sub-processor change notice/objection procedure is missing');
}
if (!dpa.includes('zero data retention') || !dpa.includes('zero-data-retention')) {
  fail('DPA must document current AI zero-data-retention control');
}
for (const identity of [
  'Databricks, Inc. (parent company of Neon, LLC)',
  'Databricks, Inc. (mateřská společnost Neon, LLC)',
  '160 Spear Street, Suite 1300, San Francisco, CA 94105, United States',
  'privacy@databricks.com',
  'Supabase, Inc.',
  '970 Toa Payoh North #07-04, Singapore 318992',
  'privacy@supabase.io',
  'Vercel Inc.',
  '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
  'privacy@vercel.com',
  'Cloudflare, Inc.',
  '101 Townsend St., San Francisco, CA 94107, United States',
  'privacyquestions@cloudflare.com',
  'Plus Five Five, Inc.',
  '2261 Market Street #5039, San Francisco, CA 94114, United States',
  'privacy@resend.com',
  'OpenAI Ireland Limited',
  '117–126 Sheriff Street Upper',
  'privacy@openai.com',
  'Amazon Web Services EMEA SARL',
  '38 Avenue John F. Kennedy, L-1855 Luxembourg',
  'aws-EU-privacy@amazon.com',
  'Microsoft Ireland Operations Limited',
  'One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, Ireland',
  'Data Protection Officer',
]) {
  if (!dpa.includes(identity)) fail('sub-processor identity/contact missing: ' + identity);
}
// LEGAL-022: production infrastructure after the Neon cutover.
for (const needle of [
  'AWS eu-central-1',
  'Neon Auth',
  'Data API',
  'Read-only backup of the former database',
  'Záloha dřívější databáze jen pro čtení',
  'SUPABASE_BACKUP_DELETION_DATE',
  'Workers / Durable Objects',
  '7 days after the session’s last activity',
  '7 dní po poslední aktivitě hodiny',
  'individual Free, Teacher or Teacher Pro account',
  'individuálním účtem Free, Teacher či Teacher Pro',
]) {
  if (!dpa.includes(needle)) fail('DPA 1.2 production infrastructure/scope missing: ' + needle);
}
if (dpa.includes('Autentizace, PostgreSQL databáze') || dpa.includes('Authentication, PostgreSQL database and related backend')) fail('Supabase must not be described as the production database');
const liveWorker = read('cloudflare/live-control/src/index.ts');
if (!liveWorker.includes('const LIVE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;')) fail('live-control retention changed; update the DPA and Privacy Notice');
// Live-control Durable Objects run in the Cloudflare EU jurisdiction; every stub must come from the EU subnamespace.
if (!liveWorker.includes("env.LIVE_SESSION.jurisdiction('eu')") || /env\.LIVE_SESSION\.(idFromName|newUniqueId|idFromString|get|getByName)\(/.test(liveWorker)) {
  fail('every LiveSession stub must be obtained from the EU jurisdiction subnamespace');
}
if (!dpa.includes('jen v jurisdikci EU') || !dpa.includes('only in the Cloudflare EU jurisdiction')) fail('DPA must state that live-control Durable Objects run in the EU jurisdiction');
if (!gdpr.includes('jen v jurisdikci EU') || !gdpr.includes('only in the EU jurisdiction')) fail('Privacy Notice must state that live-control Durable Objects run in the EU jurisdiction');
if (!terms.includes('TERMS_DPA_SCOPE_CLAUSE')) fail('Terms must extend the DPA to individual accounts used in teaching');

for (const field of ['subprocessor.legalEntity', 'subprocessor.address', 'subprocessor.contact']) {
  if (!page.includes(field)) fail('public DPA must render sub-processor identity field: ' + field);
}

if (!page.includes('getDpaDocument(locale)')) fail('public DPA page must render the authoritative document');
if (!localized.includes("@/app/dpa/page")) fail('localized DPA route is missing');
if (!proxy.includes("pathname === '/dpa'")) fail('/dpa must use locale gateway');
if (!footer.includes('/dpa')) fail('footer must link to DPA');
if (!terms.includes('/dpa') || !terms.includes('DPA_VERSION')) fail('Terms must incorporate the current DPA for organisation processing');

if (gdpr.includes('U budoucích školních účtů') || gdpr.includes('For future school accounts')) {
  fail('Privacy Notice must not describe commercial organisation processing as future');
}
for (const needle of [
  'Přijetí DPA organizací:',
  'Organisation DPA acceptance:',
  'organizace správcem a Syllonaut zpracovatelem',
  'organisation is the controller and Syllonaut is the processor',
  '/dpa',
]) {
  if (!gdpr.includes(needle)) fail('Privacy Notice DPA disclosure missing: ' + needle);
}

for (const needle of [
  'dpaAccepted',
  'setDpaAccepted',
  'DPA_ACCEPTANCE_KEY',
  '/dpa',
  'zpracovatelskou smlouvu (DPA)',
  'Data Processing Agreement (DPA)',
  'busy || !termsAccepted || !dpaAccepted',
]) {
  if (!school.includes(needle)) fail('school DPA acceptance UX missing: ' + needle);
}

for (const needle of [
  'DPA_ACCEPTANCE_KEY',
  'dpaAccepted: z.literal(true)',
  'dpaVersion: z.literal(DPA_ACCEPTANCE_KEY)',
  'dpaAccepted: true',
  'dpaVersion: input.dpaVersion',
  'dpaAcceptedAt: acceptedAt',
  'dpaAcceptedByUserId: userId',
]) {
  if (!schoolApi.includes(needle)) fail('school DPA server evidence missing: ' + needle);
}

console.log('Organization DPA contract OK');
