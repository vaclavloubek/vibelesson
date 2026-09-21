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
const contractSnapshot = read('lib/individual-contract-snapshot.ts');
const contractSnapshotMigration = read('supabase/migrations/20260921045117_add_individual_contract_snapshots.sql');
const contractLinkMigration = read('supabase/migrations/20260921045911_atomically_link_individual_contract_snapshot.sql');
const reconsentMigration = read('supabase/migrations/20260921063215_add_terms_reconsent_rpcs.sql');
const terms11Migration = read('supabase/migrations/20260921071533_update_terms_1_1_legal_007.sql');
const termsContent = read('lib/terms-content.ts');
const serverAuth = read('lib/auth.ts');
const termsAcceptance = read('lib/terms-acceptance.ts');
const termsGate = read('lib/terms-gate.ts');
const termsPageGate = read('lib/terms-page-gate.ts');
const reconsentApi = read('app/api/legal/terms/reconsent/route.ts');
const reconsentPage = read('app/terms/accept/page.tsx');
const reconsentForm = read('components/TermsReconsentForm.tsx');
const newLessonPage = read('app/new/page.tsx');
const lessonsPage = read('app/lessons/page.tsx');
const lessonPage = read('app/lessons/[id]/page.tsx');
const worksheetPage = read('app/lessons/[id]/worksheet/page.tsx');
const teacherSessionPage = read('app/sessions/[id]/page.tsx');
const presenterPage = read('app/sessions/[id]/presenter/page.tsx');
const schoolPage = read('app/school/page.tsx');
const schoolInvitePage = read('app/school/invite/page.tsx');
const sharedLessonPage = read('app/s/[token]/page.tsx');
const sharedImportButton = read('components/ImportSharedLessonButton.tsx');
const organizationSubscription = read('app/api/organizations/subscription/route.ts');
const organizationCancellation = read('app/api/organizations/cancellation/route.ts');

const fail = (message) => { throw new Error('[terms] ' + message); };

if (!footer.includes('/terms')) fail('footer must link to Terms');
if (!proxy.includes("pathname === '/terms'")) fail('/terms must use locale gateway');
if (!auth.includes('termsAccepted') || !auth.includes('terms_acceptance_version')) fail('registration must require and record Terms acceptance');
if (!pricing.includes('termsAccepted') || !pricing.includes('immediatePerformanceRequested')) fail('individual paid checkout must require Terms and immediate-service request');
if (!individualApi.includes('termsAccepted: z.literal(true)') || !individualApi.includes('immediatePerformanceRequested: z.literal(true)')) fail('individual checkout server must fail closed without acceptance');
if (!individualApi.includes("locale: z.enum(['cs', 'en'])")) fail('individual checkout must bind the contract snapshot language');
if (!individualApi.includes('create_and_link_individual_contract_snapshot')) fail('individual checkout must persist immutable contract evidence before returning the payment URL');
if (!individualApi.includes('contract_snapshot_store_failed')) fail('individual checkout must fail closed when immutable contract evidence cannot be stored');
if (!individualApi.includes('contractSnapshotId: snapshotId')) fail('Stripe checkout must carry the immutable contract snapshot ID');
if (!school.includes('termsAccepted') || !schoolApi.includes('termsAccepted: z.literal(true)')) fail('school ordering must require Terms on client and server');
if (!legal.includes("TERMS_VERSION = '1.1'") || !legal.includes("TERMS_ACCEPTANCE_KEY = '2026-09-21-v2'")) fail('shared Terms version/key is missing');
if (!auth.includes('TERMS_ACCEPTANCE_KEY') || !pricing.includes('TERMS_ACCEPTANCE_KEY') || !school.includes('TERMS_ACCEPTANCE_KEY')) fail('client flows must use the shared Terms acceptance key');
if (!individualApi.includes('TERMS_ACCEPTANCE_KEY') || !schoolApi.includes('TERMS_ACCEPTANCE_KEY')) fail('server flows must use the shared Terms acceptance key');
if (!schoolApi.includes('acceptedByUserId: userId')) fail('school Terms acceptance must record the accepting account');
if (!terms.includes('88878431') || !terms.includes('289 24 Milovice – Mladá') || !terms.includes('14') || !terms.includes('coi.gov.cz')) fail('Terms page is missing provider or consumer-rights essentials');
const auditTableDefinition = termsAuditMigration.match(/create table private\.terms_acceptance_events \(([\s\S]*?)\n\);/)?.[1] ?? '';
if (!auditTableDefinition || auditTableDefinition.includes('references auth.users')) fail('Terms audit must survive account deletion and must not cascade through auth.users');
if (!termsAuditMigration.includes('alter table private.terms_acceptance_events enable row level security')) fail('Terms audit table must have RLS enabled');
if (!termsAuditMigration.includes('revoke all on table private.terms_acceptance_events from public, anon, authenticated')) fail('Terms audit table must not be client-accessible');
if (!termsAuditMigration.includes('terms_acceptance_events_append_only') || !termsAuditMigration.includes("raise exception 'terms acceptance audit is append-only'")) fail('Terms audit must be append-only');
if (!termsAuditMigration.includes("current_terms_version constant text := '1.0'") || !termsAuditMigration.includes("current_terms_acceptance_key constant text := '2026-09-21-v1'")) fail('historical signup audit migration must remain immutable');
if (!terms11Migration.includes("current_terms_version constant text := '1.1'") || !terms11Migration.includes("current_terms_acceptance_key constant text := '2026-09-21-v2'")) fail('Terms 1.1 migration must update signup audit constants');
if (!termsAuditMigration.includes('requested_terms_acceptance and requested_terms_acceptance_key = current_terms_acceptance_key')) fail('signup audit must only mirror explicit acceptance of the active Terms key');
if (!contractSnapshot.includes("TERMS_VERSION !== '1.1'") || !contractSnapshot.includes("TERMS_ACCEPTANCE_KEY !== '2026-09-21-v2'")) fail('immutable contract builder must hard-pin the supported Terms version');
if (!terms.includes('TERMS_PLAN_PRICING_CLAUSE') || !contractSnapshot.includes('TERMS_PLAN_PRICING_CLAUSE')) fail('public Terms and immutable contract snapshot must share the plan/pricing conflict clause');
if (!termsContent.includes('následný platební doklad již sjednané podmínky jednostranně nemění') || !termsContent.includes('later payment document does not unilaterally change the terms already agreed')) fail('LEGAL-007 protective clause is missing');
if (/rozhodují údaje výslovně zobrazené[\s\S]*platebním dokladu/.test(terms) || /resulting payment document govern that order/.test(terms)) fail('LEGAL-007 priority clause must not return');
if (!contractSnapshot.includes('88878431') || !contractSnapshot.includes('289 24 Milovice – Mladá') || !contractSnapshot.includes('Vzorový formulář pro odstoupení') || !contractSnapshot.includes('Model withdrawal form')) fail('immutable contract documents must include provider and withdrawal essentials');
if (!contractSnapshot.includes("createHash('sha256')") || !contractSnapshot.includes('--syllonaut-withdrawal-form--')) fail('immutable contract documents must carry a deterministic integrity hash');
const snapshotTableDefinition = contractSnapshotMigration.match(/create table private\.individual_contract_snapshots \(([\s\S]*?)\n\);/)?.[1] ?? '';
if (!snapshotTableDefinition || snapshotTableDefinition.includes('references auth.users')) fail('paid contract evidence must survive account deletion and must not cascade through auth.users');
if (!contractSnapshotMigration.includes('individual_contract_snapshots_append_only') || !contractSnapshotMigration.includes('individual contract evidence is append-only')) fail('paid contract evidence must be append-only');
if (!contractSnapshotMigration.includes('enable row level security') || !contractSnapshotMigration.includes('revoke all on table private.individual_contract_snapshots from public, anon, authenticated')) fail('paid contract evidence must not be client-readable');
if (!contractLinkMigration.includes('individual_contract_checkout_links_append_only')) fail('Stripe checkout linkage must be append-only');
if (!contractLinkMigration.includes('create_and_link_individual_contract_snapshot')) fail('contract snapshot and checkout linkage must be atomic');
if (!contractLinkMigration.includes('get_individual_contract_snapshot_for_delivery')) fail('activation email must have a scoped service-only evidence lookup');
if (!contractLinkMigration.includes('grant execute on function public.get_individual_contract_snapshot_for_delivery') || !contractLinkMigration.includes('to service_role')) fail('contract evidence delivery lookup must remain service-role only');
if (!gdpr.includes('Potvrzení placené individuální smlouvy:') || !gdpr.includes('Paid individual contract evidence:') || !gdpr.includes('Neměnný snapshot placené individuální smlouvy') || !gdpr.includes('immutable paid individual contract snapshot')) fail('privacy notice must disclose immutable paid-contract evidence and retention');
if (!gdpr.includes('Souhlas s obchodními podmínkami:') || !gdpr.includes('Terms acceptance:') || !gdpr.includes('právních nároků') || !gdpr.includes('legal claims')) fail('privacy notice must disclose Terms acceptance audit and retention');

for (const functionName of [
  'has_current_terms_acceptance_for_service',
  'record_current_terms_reconsent_for_service',
]) {
  if (!reconsentMigration.includes(`function public.${functionName}`)) fail('Terms re-consent RPC missing: ' + functionName);
  if (!reconsentMigration.includes(`revoke execute on function public.${functionName}(uuid) from public, anon, authenticated`)) fail('Terms re-consent RPC must revoke client execution: ' + functionName);
  if (!reconsentMigration.includes(`grant execute on function public.${functionName}(uuid) to service_role`)) fail('Terms re-consent RPC must be service-role only: ' + functionName);
}
if (!reconsentMigration.includes("acceptance_key = '2026-09-21-v1'") || !reconsentMigration.includes("'1.0'") || !reconsentMigration.includes("'reconsent'")) fail('historical Terms 1.0 re-consent migration must remain immutable');
if (!terms11Migration.includes("acceptance_key = '2026-09-21-v2'") || !terms11Migration.includes("'1.1'") || !terms11Migration.includes("'reconsent'")) fail('Terms 1.1 migration must update re-consent RPC constants');
for (const functionName of ['has_current_terms_acceptance_for_service','record_current_terms_reconsent_for_service']) {
  if (!terms11Migration.includes(`revoke execute on function public.${functionName}(uuid) from public, anon, authenticated`)) fail('Terms 1.1 migration must preserve client EXECUTE revocation: ' + functionName);
  if (!terms11Migration.includes(`grant execute on function public.${functionName}(uuid) to service_role`)) fail('Terms 1.1 migration must preserve service-role-only EXECUTE: ' + functionName);
}
if (!reconsentMigration.includes("and tae.source = 'reconsent'")) fail('re-consent API must return the re-consent event timestamp');
if (!termsAcceptance.includes("admin.rpc('has_current_terms_acceptance_for_service'") || !termsAcceptance.includes("admin.rpc('record_current_terms_reconsent_for_service'")) fail('server Terms helper must use service-only RPCs');
if (!reconsentApi.includes('termsAccepted: z.literal(true)') || !reconsentApi.includes('termsVersion: z.literal(TERMS_ACCEPTANCE_KEY)')) fail('re-consent API must fail closed on explicit current Terms acceptance');
if (!reconsentApi.includes('recordCurrentTermsReconsent(userId)')) fail('re-consent API must persist server audit');
if (!reconsentForm.includes('useState(false)') || !reconsentForm.includes('TERMS_ACCEPTANCE_KEY') || !reconsentForm.includes('/api/legal/terms/reconsent')) fail('re-consent form must be explicit, versioned and server-recorded');
if (!reconsentPage.includes('if (alreadyAccepted) redirect(returnTo)')) fail('already accepted users must leave the re-consent page without re-accepting');
if (!termsPageGate.includes('hasCurrentTermsAcceptance') || !termsPageGate.includes('termsReconsentPath(returnTo)')) fail('server pages must fail closed to the re-consent route');

if (!proxy.includes('forwardedHeaders.delete(CURRENT_TERMS_REQUIRED_HEADER)') || !proxy.includes('requestRequiresCurrentTerms(pathname, request.method)')) fail('proxy must overwrite the internal Terms gate marker from trusted path/method data');
if (!serverAuth.includes("requestHeaders.get(CURRENT_TERMS_REQUIRED_HEADER) === '1'") || !serverAuth.includes('termsAcceptanceRequired = !(await hasCurrentTermsAcceptance(authenticatedUserId))')) fail('shared server auth must enforce the proxy-marked Terms gate');
if (!serverAuth.includes('userId: termsAcceptanceRequired ? null : authenticatedUserId')) fail('protected product mutations must fail closed when current Terms are missing');

for (const [name, source] of [
  ['new lesson', newLessonPage],
  ['lesson library', lessonsPage],
  ['lesson editor', lessonPage],
  ['worksheet', worksheetPage],
  ['teacher session', teacherSessionPage],
  ['presenter', presenterPage],
]) {
  if (!source.includes('requireCurrentTermsForPage')) fail(name + ' page must require current Terms before working use');
}
if (!newLessonPage.includes('if (userId)')) fail('guest /new flow must remain available; Terms page gate is only for signed-in users');
if (!schoolPage.includes('termsAcceptanceRequired') || !school.includes("termsReconsentPath('/school')")) fail('school admin must expose and handle Terms re-consent state');
if (!school.includes('(response.status === 401 || response.status === 428)')) fail('school admin must redirect protected actions to re-consent without blocking billing reads');
if (!schoolInvitePage.includes('requireCurrentTermsForPage')) fail('signed-in school invitation acceptance must require current Terms');
if (!sharedLessonPage.includes('termsAcceptanceRequired') || !sharedImportButton.includes('termsReconsentPath')) fail('shared lesson preview must stay readable while import routes through re-consent');

const organizationExemptBlock = termsGate.match(/const ORGANIZATION_BILLING_EXEMPT_PREFIXES = \[([\s\S]*?)\];/)?.[1] ?? '';
for (const allowedPath of [
  '/api/organizations/cancellation',
  '/api/organizations/subscription',
  '/api/organizations/payment',
  '/api/organizations/invoices/',
]) {
  if (!organizationExemptBlock.includes(allowedPath)) fail('billing/cancellation exemption missing: ' + allowedPath);
}
if (organizationExemptBlock.includes('/api/organizations/renewal') || organizationExemptBlock.includes('/api/organizations/renew')) fail('new organization renewal must not bypass current Terms');
if (!termsGate.includes("pathname === '/api/billing/stripe/subscription/change'")) fail('individual plan changes must require current Terms');
for (const source of [organizationSubscription, organizationCancellation]) {
  if (!source.includes('if (!input.cancelAtPeriodEnd)') || !source.includes("terms_reconsent_required") || !source.includes('{ status: 428 }')) fail('turning organization renewal back on must require current Terms while cancellation remains available');
}

console.log('Terms acceptance contract OK');
