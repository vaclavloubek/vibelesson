import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const auth = read('components/AuthControls.tsx');
const pricing = read('components/PricingPage.tsx');
const school = read('components/SchoolAdmin.tsx');
const individualApi = read('app/api/billing/stripe/checkout/route.ts');
const schoolApi = read('app/api/organizations/route.ts');
const footer = read('components/SiteFooter.tsx');
const proxy = read('proxy.ts');
const terms = read('app/terms/page.tsx');
const legal = read('lib/legal.ts');
const gdpr = read('app/gdpr/page.tsx');
const termsAuditMigration = read('supabase/migrations/20260921033344_add_terms_acceptance_audit.sql');

const fail = (message) => { throw new Error('[terms] ' + message); };

if (!footer.includes('/terms')) fail('footer must link to Terms');
if (!proxy.includes("pathname === '/terms'")) fail('/terms must use locale gateway');
if (!auth.includes('termsAccepted') || !auth.includes('terms_acceptance_version')) fail('registration must require and record Terms acceptance');
if (!pricing.includes('termsAccepted') || !pricing.includes('immediatePerformanceRequested')) fail('individual paid checkout must require Terms and immediate-service request');
if (!individualApi.includes('termsAccepted: z.literal(true)') || !individualApi.includes('immediatePerformanceRequested: z.literal(true)')) fail('individual checkout server must fail closed without acceptance');
if (!school.includes('termsAccepted') || !schoolApi.includes('termsAccepted: z.literal(true)')) fail('school ordering must require Terms on client and server');
if (!legal.includes("TERMS_ACCEPTANCE_KEY = '2026-09-21-v1'")) fail('shared Terms acceptance version key is missing');
if (!auth.includes('TERMS_ACCEPTANCE_KEY') || !pricing.includes('TERMS_ACCEPTANCE_KEY') || !school.includes('TERMS_ACCEPTANCE_KEY')) fail('client flows must use the shared Terms acceptance key');
if (!individualApi.includes('TERMS_ACCEPTANCE_KEY') || !schoolApi.includes('TERMS_ACCEPTANCE_KEY')) fail('server flows must use the shared Terms acceptance key');
if (!schoolApi.includes('acceptedByUserId: userId')) fail('school Terms acceptance must record the accepting account');
if (!terms.includes('88878431') || !terms.includes('289 24 Milovice – Mladá') || !terms.includes('14') || !terms.includes('coi.gov.cz')) fail('Terms page is missing provider or consumer-rights essentials');
const auditTableDefinition = termsAuditMigration.match(/create table private\.terms_acceptance_events \(([\s\S]*?)\n\);/)?.[1] ?? '';
if (!auditTableDefinition || auditTableDefinition.includes('references auth.users')) fail('Terms audit must survive account deletion and must not cascade through auth.users');
if (!termsAuditMigration.includes('alter table private.terms_acceptance_events enable row level security')) fail('Terms audit table must have RLS enabled');
if (!termsAuditMigration.includes('revoke all on table private.terms_acceptance_events from public, anon, authenticated')) fail('Terms audit table must not be client-accessible');
if (!termsAuditMigration.includes('terms_acceptance_events_append_only') || !termsAuditMigration.includes("raise exception 'terms acceptance audit is append-only'")) fail('Terms audit must be append-only');
if (!termsAuditMigration.includes("current_terms_version constant text := '1.0'") || !termsAuditMigration.includes("current_terms_acceptance_key constant text := '2026-09-21-v1'")) fail('database Terms audit constants must match the active Terms version');
if (!termsAuditMigration.includes('requested_terms_acceptance and requested_terms_acceptance_key = current_terms_acceptance_key')) fail('signup audit must only mirror explicit acceptance of the active Terms key');
if (!gdpr.includes('Souhlas s obchodními podmínkami:') || !gdpr.includes('Terms acceptance:') || !gdpr.includes('právních nároků') || !gdpr.includes('legal claims')) fail('privacy notice must disclose Terms acceptance audit and retention');
console.log('Terms acceptance contract OK');
