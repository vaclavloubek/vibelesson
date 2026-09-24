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
const terms13Migration = read('supabase/migrations/20260921100214_update_terms_1_3_legal_010.sql');
const terms14Migration = read('supabase/migrations/20260921114500_update_terms_1_4_legal_011.sql');
const terms15Migration = read('supabase/migrations/20260921133000_add_online_withdrawal_legal_012.sql');
const batchTermsMigration = read('supabase/migrations/20260921131556_batch_terms_acceptance_lookup.sql');
const termsRolloutGuardMigration = read('supabase/migrations/20260921072059_restore_terms_1_0_rollout_guard.sql');
const versionedTermsMigration = read('supabase/migrations/20260921072159_add_versioned_terms_acceptance_rpcs.sql');
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
const sharedImportApi = read('app/api/lesson-shares/[token]/import/route.ts');
const individualSubscriptionChange = read('app/api/billing/stripe/subscription/change/route.ts');
const subscriptionManagement = read('components/SubscriptionManagement.tsx');

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
if (!legal.includes("TERMS_VERSION = '1.11'") || !legal.includes("TERMS_ACCEPTANCE_KEY = '2026-09-24-v12'")) fail('shared Terms version/key is missing');
if (!legal.includes('TERMS_PRODUCT_ACCESS_KEYS') || !legal.includes("'2026-09-23-v11'") || !legal.includes("'2026-09-23-v10'") || !legal.includes("'2026-09-23-v9'") || !legal.includes("'2026-09-23-v8'") || !legal.includes("'2026-09-23-v7'") || !legal.includes("'2026-09-21-v6'") || !legal.includes("'2026-09-21-v5'") || !legal.includes("'2026-09-21-v4'")) fail('Terms 1.10 to 1.3 must remain sufficient for ordinary product access');
if (!auth.includes('TERMS_ACCEPTANCE_KEY') || !pricing.includes('TERMS_ACCEPTANCE_KEY') || !school.includes('TERMS_ACCEPTANCE_KEY')) fail('client flows must use the shared Terms acceptance key');
if (!individualApi.includes('TERMS_ACCEPTANCE_KEY') || !schoolApi.includes('TERMS_ACCEPTANCE_KEY')) fail('server flows must use the shared Terms acceptance key');
if (!schoolApi.includes('acceptedByUserId: userId')) fail('school Terms acceptance must record the accepting account');
if (!terms.includes('PROVIDER_CONTACT') || !terms.includes('phoneHref') || !terms.includes('14') || !terms.includes('coi.gov.cz')) fail('Terms page is missing provider or consumer-rights essentials');
const auditTableDefinition = termsAuditMigration.match(/create table private\.terms_acceptance_events \(([\s\S]*?)\n\);/)?.[1] ?? '';
if (!auditTableDefinition || auditTableDefinition.includes('references auth.users')) fail('Terms audit must survive account deletion and must not cascade through auth.users');
if (!termsAuditMigration.includes('alter table private.terms_acceptance_events enable row level security')) fail('Terms audit table must have RLS enabled');
if (!termsAuditMigration.includes('revoke all on table private.terms_acceptance_events from public, anon, authenticated')) fail('Terms audit table must not be client-accessible');
if (!termsAuditMigration.includes('terms_acceptance_events_append_only') || !termsAuditMigration.includes("raise exception 'terms acceptance audit is append-only'")) fail('Terms audit must be append-only');
if (!termsAuditMigration.includes("current_terms_version constant text := '1.0'") || !termsAuditMigration.includes("current_terms_acceptance_key constant text := '2026-09-21-v1'")) fail('historical signup audit migration must remain immutable');
if (!terms11Migration.includes("current_terms_version constant text := '1.1'") || !terms11Migration.includes("current_terms_acceptance_key constant text := '2026-09-21-v2'")) fail('historical initial Terms 1.1 migration must be retained');
if (!termsRolloutGuardMigration.includes("current_terms_version constant text := '1.0'") || !termsRolloutGuardMigration.includes("current_terms_acceptance_key constant text := '2026-09-21-v1'")) fail('rollout guard must preserve the still-running Terms 1.0 build');
if (!versionedTermsMigration.includes("when '2026-09-21-v1' then '1.0'") || !versionedTermsMigration.includes("when '2026-09-21-v2' then '1.1'")) fail('versioned signup audit must map exact acceptance keys to exact Terms versions');
if (!termsAuditMigration.includes('requested_terms_acceptance and requested_terms_acceptance_key = current_terms_acceptance_key')) fail('signup audit must only mirror explicit acceptance of the active Terms key');
if (!contractSnapshot.includes("TERMS_VERSION !== '1.11'") || !contractSnapshot.includes("TERMS_ACCEPTANCE_KEY !== '2026-09-24-v12'")) fail('immutable contract builder must hard-pin the supported Terms version');
// LEGAL-022: minimum teacher-account age and DPA for individual accounts in teaching, in the Terms and the contract snapshot.
for (const clause of ['TERMS_ACCOUNT_ELIGIBILITY_CLAUSE', 'TERMS_DPA_SCOPE_CLAUSE']) {
  if (!terms.includes(clause) || !contractSnapshot.includes(clause)) fail('public Terms and immutable contract snapshot must share ' + clause);
}
if (!termsContent.includes('alespoň 18 let') || !termsContent.includes('aged 18 or over')) fail('Terms must set the minimum teacher-account age of 18');
if (!termsContent.includes('individuálním účtem (Free, Teacher nebo Teacher Pro)') || !termsContent.includes('individual account (Free, Teacher or Teacher Pro)')) fail('Terms must extend the DPA to individual accounts used in teaching');
if (!terms.includes('učitele s individuálním účtem při výuce (čl. 2)') || !contractSnapshot.includes('učitele s individuálním účtem při výuce (čl. 2)')) fail('Terms article 14 must incorporate the DPA for individual accounts');
// LEGAL-018: technical requirements are part of the Terms and of the contract snapshot.
if (!terms.includes('TERMS_TECHNICAL_REQUIREMENTS_CLAUSE') || !contractSnapshot.includes('TERMS_TECHNICAL_REQUIREMENTS_CLAUSE') || !contractSnapshot.includes("technicalRequirementsHtml('cs')") || !contractSnapshot.includes("technicalRequirementsHtml('en')")) fail('Terms and contract snapshot must carry the technical requirements');
// LEGAL-017: evidenced complaint process with written receipt, 30-day resolution and written resolution.
if (!terms.includes('TERMS_COMPLAINT_CLAUSE') || !contractSnapshot.includes('TERMS_COMPLAINT_CLAUSE')) fail('public Terms and immutable contract snapshot must share the complaint clause');
if (!termsContent.includes('nejpozději do 30 dnů od jejího uplatnění') || !termsContent.includes('syllonaut.com/cs/complaint') || !termsContent.includes('zamítnutí písemně odůvodní')) fail('complaint clause must promise written receipt, 30-day resolution and justified rejection');
// LEGAL-016: account deletion ends automatic renewal; one shared clause for the public Terms and the contract snapshot.
if (!terms.includes('TERMS_ACCOUNT_DELETION_CLAUSE') || !contractSnapshot.includes('TERMS_ACCOUNT_DELETION_CLAUSE')) fail('public Terms and immutable contract snapshot must share the account deletion clause');
if (!termsContent.includes('Syllonaut před zrušením účtu automatické obnovení sám ukončí') || !termsContent.includes('Syllonaut itself ends automatic renewal before deleting the account')) fail('account deletion clause must commit Syllonaut to ending automatic renewal');
if (terms.includes('nejprve je proto třeba ukončit automatické obnovení') || contractSnapshot.includes('nejprve je proto třeba ukončit automatické obnovení')) fail('Terms must not shift renewal cancellation to the user before account deletion');
if (!termsAcceptance.includes('insert into private.terms_acceptance_events (user_id, terms_version, acceptance_key, source)') || !termsAcceptance.includes('${TERMS_VERSION}::text, ${TERMS_ACCEPTANCE_KEY}::text, ${TERMS_RECONSENT_SOURCE}::text')) fail('Neon re-consent must record the exact active Terms version and key without a DB key mapping');
if (!terms.includes('TERMS_PLAN_PRICING_CLAUSE') || !contractSnapshot.includes('TERMS_PLAN_PRICING_CLAUSE')) fail('public Terms and immutable contract snapshot must share the plan/pricing conflict clause');
if (!terms.includes('TERMS_SERVICE_CHANGE_CLAUSE') || !contractSnapshot.includes('TERMS_SERVICE_CHANGE_CLAUSE')) fail('public Terms and immutable contract snapshot must share the service-change clause');
if (!termsContent.includes('následný platební doklad již sjednané podmínky jednostranně nemění') || !termsContent.includes('later payment document does not unilaterally change the terms already agreed')) fail('LEGAL-007 protective clause is missing');
if (/rozhodují údaje výslovně zobrazené[\s\S]*platebním dokladu/.test(terms) || /resulting payment document govern that order/.test(terms)) fail('LEGAL-007 priority clause must not return');
if (!contractSnapshot.includes('PROVIDER_CONTACT') || !contractSnapshot.includes('phoneDisplay') || !contractSnapshot.includes('buildStatutoryWithdrawalFormHtml') || !contractSnapshot.includes('WITHDRAWAL_FORM_COPY')) fail('immutable contract documents must include provider and shared statutory withdrawal essentials');
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
if (!versionedTermsMigration.includes("p_acceptance_key in ('2026-09-21-v1', '2026-09-21-v2')")) fail('versioned Terms lookup must support the explicit known acceptance keys');
if (!terms13Migration.includes("when '2026-09-21-v4' then '1.3'") || !terms13Migration.includes("p_acceptance_key in ('2026-09-21-v1', '2026-09-21-v2', '2026-09-21-v3', '2026-09-21-v4')")) fail('Terms 1.3 migration must map and allow the LEGAL-010 acceptance key');
if (!terms14Migration.includes("when '2026-09-21-v5' then '1.4'") || !terms14Migration.includes("p_acceptance_key in ('2026-09-21-v1', '2026-09-21-v2', '2026-09-21-v3', '2026-09-21-v4', '2026-09-21-v5')")) fail('Terms 1.4 migration must map the new key without dropping historical keys');
if (!terms15Migration.includes("when '2026-09-21-v6' then '1.5'") || !terms15Migration.includes("'2026-09-21-v5','2026-09-21-v6'")) fail('Terms 1.5 migration must map the new key without dropping historical keys');
for (const [functionName, signature] of [
  ['has_terms_acceptance_for_service', 'uuid, text'],
  ['record_terms_reconsent_for_service', 'uuid, text'],
]) {
  if (!terms14Migration.includes(`revoke execute on function public.${functionName}(${signature}) from public, anon, authenticated`)) fail('Terms 1.4 RPC must revoke client execution: ' + functionName);
  if (!terms14Migration.includes(`grant execute on function public.${functionName}(${signature}) to service_role`)) fail('Terms 1.4 RPC must remain service-role only: ' + functionName);
}
for (const [functionName, signature] of [
  ['has_terms_acceptance_for_service', 'uuid,text'],
  ['record_terms_reconsent_for_service', 'uuid,text'],
]) {
  if (!terms15Migration.includes(`public.${functionName}(${signature})`)) fail('Terms 1.5 RPC permission list is missing: ' + functionName);
}
if (!terms15Migration.includes('from public,anon,authenticated') || !terms15Migration.includes('to service_role')) fail('Terms 1.5 RPCs must be service-role only');
for (const [functionName, signature] of [
  ['has_terms_acceptance_for_service', 'uuid, text'],
  ['record_terms_reconsent_for_service', 'uuid, text'],
]) {
  if (!versionedTermsMigration.includes(`function public.${functionName}`)) fail('versioned Terms RPC missing: ' + functionName);
  if (!versionedTermsMigration.includes(`revoke execute on function public.${functionName}(${signature}) from public, anon, authenticated`)) fail('versioned Terms RPC must revoke client execution: ' + functionName);
  if (!versionedTermsMigration.includes(`grant execute on function public.${functionName}(${signature}) to service_role`)) fail('versioned Terms RPC must be service-role only: ' + functionName);
}
if (!reconsentMigration.includes("and tae.source = 'reconsent'")) fail('historical re-consent API must return the re-consent event timestamp');
if (!termsAcceptance.includes("admin.rpc('has_any_terms_acceptance_for_service'") || !termsAcceptance.includes("admin.rpc('has_terms_acceptance_for_service'") || !termsAcceptance.includes("admin.rpc('record_terms_reconsent_for_service'")) fail('server Terms helper must use batch and backward-compatible versioned service-only RPCs');
if (!termsAcceptance.includes('p_acceptance_key: TERMS_ACCEPTANCE_KEY')) fail('server Terms helper must pass the exact active acceptance key');
if (!termsAcceptance.includes('p_acceptance_keys: [...TERMS_PRODUCT_ACCESS_KEYS]') || !termsAcceptance.includes('TERMS_PRODUCT_ACCESS_KEYS.map((acceptanceKey)')) fail('ordinary product access must check every approved non-adverse Terms compatibility key');
if (!batchTermsMigration.includes('function public.has_any_terms_acceptance_for_service') || !batchTermsMigration.includes('tae.acceptance_key = any (p_acceptance_keys)')) fail('batch Terms migration must test the supplied compatibility keys in one query');
if (!batchTermsMigration.includes('from public, anon, authenticated') || !batchTermsMigration.includes('to service_role')) fail('batch Terms RPC must be service-role only');
if (!reconsentApi.includes('termsAccepted: z.literal(true)') || !reconsentApi.includes('termsVersion: z.literal(TERMS_ACCEPTANCE_KEY)')) fail('re-consent API must fail closed on explicit current Terms acceptance');
if (!reconsentApi.includes('recordCurrentTermsReconsent(userId)')) fail('re-consent API must persist server audit');
if (!reconsentForm.includes('useState(false)') || !reconsentForm.includes('TERMS_ACCEPTANCE_KEY') || !reconsentForm.includes('/api/legal/terms/reconsent')) fail('re-consent form must be explicit, versioned and server-recorded');
if (!reconsentPage.includes('if (alreadyAccepted) redirect(returnTo)')) fail('already accepted users must leave the re-consent page without re-accepting');
if (!termsPageGate.includes('hasCurrentTermsAcceptance') || !termsPageGate.includes('termsReconsentPath(returnTo)')) fail('server pages must fail closed to the re-consent route');

if (!proxy.includes('forwardedHeaders.delete(CURRENT_TERMS_REQUIRED_HEADER)') || !proxy.includes('requestRequiresCurrentTerms(pathname, request.method)')) fail('proxy must overwrite the internal Terms gate marker from trusted path/method data');
if (!termsGate.includes("pathname === '/api/billing/stripe/checkout'")) fail('new individual checkout must require current Terms audit');
if (!termsGate.includes("normalizedMethod === 'GET'") || !termsGate.includes('/live-control$')) fail('live-control capability issuance must require current Terms even though it is a GET');
if (termsGate.includes("pathname === '/api/billing/stripe/subscription/change'")) fail('subscription change endpoint must not be generically gated because cancellation of a scheduled change must remain available');
if (!serverAuth.includes("requestHeaders.get(CURRENT_TERMS_REQUIRED_HEADER) === '1'") || !serverAuth.includes('termsAcceptanceRequired = !(await hasCurrentTermsAcceptance(authenticatedUserId))')) fail('shared server auth must enforce the proxy-marked Terms gate');
if (!serverAuth.includes('userId: termsAcceptanceRequired ? null : authenticatedUserId')) fail('protected product mutations must fail closed when current Terms are missing');
if (!individualApi.includes('termsAcceptanceRequired && authenticatedUserId') || !individualApi.includes("jsonError(428, 'terms_reconsent_required')")) fail('individual checkout must distinguish authenticated re-consent from ordinary authentication failure');
if (!pricing.includes("response.status === 428") || !pricing.includes('termsReconsentPath')) fail('Pricing checkout must route legacy accounts to Terms re-consent');
if (!sharedImportApi.includes('hasCurrentTermsAcceptance(userId)') || !sharedImportApi.includes("terms_reconsent_required") || !sharedImportApi.includes('{ status: 428 }')) fail('Bearer share import must independently enforce current Terms');
if (!sharedImportButton.includes('response.status === 428') || !sharedImportButton.includes('termsReconsentPath')) fail('share import UI must route 428 to Terms re-consent');
if (!individualSubscriptionChange.includes("input.action === 'change'") || !individualSubscriptionChange.includes('hasCurrentTermsAcceptance(userId)') || !individualSubscriptionChange.includes("jsonError(428, 'terms_reconsent_required')")) fail('new individual plan changes must require current Terms');
if (!individualSubscriptionChange.includes("action: z.literal('cancel_scheduled_change')")) fail('scheduled individual plan change cancellation must remain available');
if (!subscriptionManagement.includes('response.status === 428') || !subscriptionManagement.includes("termsReconsentPath('/subscription')")) fail('subscription management must route a new plan change to re-consent when required');

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
for (const source of [organizationSubscription, organizationCancellation]) {
  if (!source.includes('if (!input.cancelAtPeriodEnd)') || !source.includes("terms_reconsent_required") || !source.includes('{ status: 428 }')) fail('turning organization renewal back on must require current Terms while cancellation remains available');
}

console.log('Terms acceptance contract OK');
