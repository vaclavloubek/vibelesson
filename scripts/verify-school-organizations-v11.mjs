import fs from 'node:fs';

const requiredFiles = [
  'supabase/migrations/20260919180000_add_school_library_and_owner_transfer.sql',
  'supabase/migrations/20260919181500_add_internal_test_school.sql',
  'supabase/migrations/20260919184500_add_school_library_subject.sql',
  'app/api/organizations/library/route.ts',
  'app/api/organizations/library/[id]/import/route.ts',
  'app/api/organizations/library/[id]/route.ts',
  'app/api/organizations/invitations/bulk/route.ts',
  'app/api/organizations/owner/route.ts',
  'app/api/organizations/quote/route.ts',
  'lib/organization-quote-pdf.ts',
];

for (const path of requiredFiles) {
  if (!fs.existsSync(path)) {
    throw new Error('School V1.1 contract missing: ' + path);
  }
}

const migration = fs.readFileSync(
  'supabase/migrations/20260919180000_add_school_library_and_owner_transfer.sql',
  'utf8',
);

for (const needle of [
  'organization_library_enabled',
  'create table public.organization_lesson_library',
  'Organization library snapshots are immutable.',
  'source_organization_library_id',
  'lesson_clients_cannot_forge_organization_library_provenance',
  'public.transfer_organization_ownership',
  "set role = 'admin'",
  "set role = 'owner'",
]) {
  if (!migration.includes(needle)) {
    throw new Error('School V1.1 database contract missing: ' + needle);
  }
}

if (
  /grant\s+(select|insert|update|delete)[\s\S]{0,80}on\s+table\s+public\.organization_lesson_library[\s\S]{0,80}authenticated/i
    .test(migration)
) {
  throw new Error('School lesson library must remain server-only.');
}

const catalog = fs.readFileSync('lib/organization-billing-catalog.ts', 'utf8');
if (!/team:[\s\S]*?libraryEnabled:\s*false/.test(catalog)) {
  throw new Error('Team must not receive the school lesson library.');
}
if (!/school:[\s\S]*?libraryEnabled:\s*true/.test(catalog)) {
  throw new Error('School must receive the school lesson library.');
}
if (!/campus:[\s\S]*?libraryEnabled:\s*true/.test(catalog)) {
  throw new Error('Campus must receive the school lesson library.');
}

const publishRoute = fs.readFileSync('app/api/organizations/library/route.ts', 'utf8');
for (const needle of [
  "organization.status !== 'active'",
  "eq('owner_id', userId)",
  'LessonSchema.parse',
  "from('organization_lesson_library')",
]) {
  if (!publishRoute.includes(needle)) {
    throw new Error('School library publish contract missing: ' + needle);
  }
}

const importRoute = fs.readFileSync(
  'app/api/organizations/library/[id]/import/route.ts',
  'utf8',
);
for (const needle of [
  'source_organization_library_id',
  "eq('owner_id', userId)",
  "organization.status !== 'active'",
  "source_prompt: 'Imported from school library.'",
]) {
  if (!importRoute.includes(needle)) {
    throw new Error('School library import contract missing: ' + needle);
  }
}

const bulkRoute = fs.readFileSync(
  'app/api/organizations/invitations/bulk/route.ts',
  'utf8',
);
for (const needle of [
  '.max(100)',
  'create_organization_invitation',
  'sendOrganizationInvitationEmail',
  "from('organization_invitations')",
  ".delete()",
]) {
  if (!bulkRoute.includes(needle)) {
    throw new Error('School bulk invitation contract missing: ' + needle);
  }
}

const currentRoute = fs.readFileSync('app/api/organizations/current/route.ts', 'utf8');
for (const needle of [
  'usageByMember',
  "select('user_id, action, status')",
  'libraryEnabled',
  'ownLessons',
]) {
  if (!currentRoute.includes(needle)) {
    throw new Error('School V1.1 summary contract missing: ' + needle);
  }
}
if (/usageByMember[\s\S]{0,1000}(prompt|lesson_snapshot|source_prompt)/i.test(currentRoute)) {
  throw new Error('Per-user school usage must not expose prompt or lesson content.');
}

const ownerRoute = fs.readFileSync('app/api/organizations/owner/route.ts', 'utf8');
if (!ownerRoute.includes("organization.role !== 'owner'")) {
  throw new Error('Only the current Owner may transfer school ownership.');
}
if (!ownerRoute.includes('transfer_organization_ownership')) {
  throw new Error('School ownership transfer must use the atomic database RPC.');
}

const cron = fs.readFileSync('app/api/cron/organization-billing/route.ts', 'utf8');
for (const needle of [
  'sendOrganizationRenewalReminderEmail',
  'mark_organization_notification_sent',
  "const days = daysRemaining <= 7 ? 7 : daysRemaining <= 30 ? 30 : 60",
  "from('organization_billing_notifications')",
  ".delete()",
]) {
  if (!cron.includes(needle)) {
    throw new Error('School renewal reminder contract missing: ' + needle);
  }
}

const email = fs.readFileSync('lib/organization-email.ts', 'utf8');
if (!email.includes('syllonaut:organization-renewal:')) {
  throw new Error('School renewal reminder email must have a stable idempotency key.');
}

const quote = fs.readFileSync('lib/organization-quote-pdf.ts', 'utf8');
for (const needle of [
  "text: 'Syllonaut'",
  '30 * 24 * 60 * 60 * 1000',
  'not a tax invoice',
  'nikoli daňový doklad',
]) {
  if (!quote.includes(needle)) {
    throw new Error('School quote PDF contract missing: ' + needle);
  }
}

const quoteRoute = fs.readFileSync('app/api/organizations/quote/route.ts', 'utf8');
for (const needle of [
  'organizationMinorUnitPrice',
  'billingRouteForCountry',
  "'Content-Type': 'application/pdf'",
  "'Cache-Control': 'private, no-store'",
]) {
  if (!quoteRoute.includes(needle)) {
    throw new Error('School quote endpoint contract missing: ' + needle);
  }
}

console.log('School organization V1.1 source contracts: OK');


const internalTestMigration = fs.readFileSync(
  'supabase/migrations/20260919181500_add_internal_test_school.sql',
  'utf8',
);

for (const needle of [
  'is_internal_test boolean not null default false',
  'organizations_one_internal_test_per_owner_idx',
  "where p.role = 'admin'",
  'internal_test_school_requires_exactly_one_app_admin',
  "'Testovací škola'",
  "'campus'",
  "'active'",
  'current_period_end',
  'internal_test_organization_not_billable',
  'internal_test_owner_is_locked',
]) {
  if (!internalTestMigration.includes(needle)) {
    throw new Error('Internal test school contract missing: ' + needle);
  }
}

if (
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    .test(internalTestMigration)
) {
  throw new Error('Internal test school migration must not hard-code a user UUID.');
}

const organizationsHelper = fs.readFileSync('lib/organizations.ts', 'utf8');
for (const needle of [
  'isInternalTest: boolean',
  'is_internal_test',
  'isInternalTest: Boolean(organization.is_internal_test)',
]) {
  if (!organizationsHelper.includes(needle)) {
    throw new Error('Internal test organization helper contract missing: ' + needle);
  }
}

const renewal = fs.readFileSync('app/api/organizations/renewal/route.ts', 'utf8');
if (!renewal.includes('organization.isInternalTest')) {
  throw new Error('Internal test organization must be blocked from renewal billing.');
}

const ownerTransfer = fs.readFileSync('app/api/organizations/owner/route.ts', 'utf8');
if (!ownerTransfer.includes('organization.isInternalTest')) {
  throw new Error('Internal test organization ownership must remain locked.');
}

const schoolAdmin = fs.readFileSync('components/SchoolAdmin.tsx', 'utf8');
for (const needle of [
  'isInternalTest: boolean',
  "ui('INTERNÍ TEST · ', 'INTERNAL TEST · ')",
  '!summary.isInternalTest',
  'Tvůj interní admin účet zůstává neomezený',
]) {
  if (!schoolAdmin.includes(needle)) {
    throw new Error('Internal test school UI contract missing: ' + needle);
  }
}


const subjectMigration = fs.readFileSync(
  'supabase/migrations/20260919184500_add_school_library_subject.sql',
  'utf8',
);
for (const needle of [
  'add column if not exists subject text',
  'organization_lesson_library_org_subject_idx',
  "snapshot->>'subject'",
  'new.subject is distinct from old.subject',
]) {
  if (!subjectMigration.includes(needle)) {
    throw new Error('School library subject migration contract missing: ' + needle);
  }
}

const lessonSchema = fs.readFileSync('lib/schema.ts', 'utf8');
if (!lessonSchema.includes("subject: z.string().trim().min(1).max(80).optional()")) {
  throw new Error('Lesson schema must keep subject optional for backward compatibility.');
}

const ai = fs.readFileSync('lib/ai.ts', 'utf8');
for (const needle of [
  'subject: z.string().trim().min(1).max(80)',
  'Pole subject vždy vyplň jako stručný název ŠIROKÉHO školního předmětu',
  'subject: output.subject',
]) {
  if (!ai.includes(needle)) {
    throw new Error('AI subject classification contract missing: ' + needle);
  }
}

const schoolAdminSubjectUi = fs.readFileSync('components/SchoolAdmin.tsx', 'utf8');
for (const needle of [
  'librarySubjectFilter',
  'Všechny předměty',
  'Nezařazeno',
  'filteredLibrary.length >= 10',
  'styles.libraryScrollable',
]) {
  if (!schoolAdminSubjectUi.includes(needle)) {
    throw new Error('School library subject filter contract missing: ' + needle);
  }
}


const schoolInviteClient = fs.readFileSync('components/SchoolInviteClient.tsx', 'utf8');
for (const needle of [
  "initialUser && token && state === 'idle'",
  "setState('accepting')",
  "router.replace('/school')",
  "className={styles.topActions}",
  "Přihlášení najdete vpravo nahoře",
]) {
  if (!schoolInviteClient.includes(needle)) {
    throw new Error('School invitation UX regression: ' + needle);
  }
}


const schoolAdminAuthBoundary = fs.readFileSync('components/SchoolAdmin.tsx', 'utf8');
for (const needle of [
  'authBoundaryTriggeredRef',
  "schoolFetch('/api/auth/identity'",
  "window.addEventListener('focus'",
  "window.addEventListener('pageshow'",
  "document.addEventListener('visibilitychange'",
  'window.setInterval',
  'setSummary(null)',
  'window.location.reload()',
]) {
  if (!schoolAdminAuthBoundary.includes(needle)) {
    throw new Error('School admin auth-boundary regression: ' + needle);
  }
}

const authIdentityRoute = fs.readFileSync('app/api/auth/identity/route.ts', 'utf8');
for (const needle of [
  'supabase.auth.getUser()',
  "'Cache-Control': 'private, no-store, max-age=0'",
  "{ userId: data.user?.id ?? null }",
  "error.name !== 'AuthSessionMissingError'",
  'error.status !== 401',
]) {
  if (!authIdentityRoute.includes(needle)) {
    throw new Error('Server-authoritative auth identity contract missing: ' + needle);
  }
}


const organizationPayment = fs.readFileSync('lib/organization-payment.ts', 'utf8');
for (const needle of [
  "from('billing_prices')",
  ".eq('plan_code', input.organization.planCode)",
  ".eq('billing_period', input.order.billingPeriod)",
  ".eq('currency', input.order.currency)",
  'organization_price_not_configured',
  'priceId: catalogPrice.external_price_id',
]) {
  if (!organizationPayment.includes(needle)) {
    throw new Error('School Stripe catalog price contract missing: ' + needle);
  }
}

const organizationStripe = fs.readFileSync('lib/organization-stripe.ts', 'utf8');
for (const needle of [
  "params.set('line_items[0][price]', input.priceId)",
  "params.set('line_items[0][quantity]', '1')",
  'stripe_price_id_invalid',
  "'syllonaut_org_checkout_v2_' + input.orderId",
]) {
  if (!organizationStripe.includes(needle)) {
    throw new Error('School Stripe checkout catalog contract missing: ' + needle);
  }
}
if (organizationStripe.includes("line_items[0][price_data]")) {
  throw new Error('School Stripe Checkout must not create inline products or prices.');
}

if (organizationStripe.includes("'syllonaut_org_checkout_' + input.orderId")) {
  throw new Error('School Stripe Checkout must not reuse the legacy v1 idempotency scope.');
}


const schoolBillingLaunch = fs.readFileSync('lib/school-billing-launch.ts', 'utf8');
for (const needle of [
  'STRIPE_LIVE_SCHOOL_BILLING_EMERGENCY_DISABLED',
  "return emergencyDisabled !== 'true'",
]) {
  if (!schoolBillingLaunch.includes(needle)) {
    throw new Error('Public school billing launch gate missing: ' + needle);
  }
}

const schoolPage = fs.readFileSync('app/school/page.tsx', 'utf8');
for (const needle of [
  "import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';",
  "billingEnvironment === 'live'",
  'isPublicSchoolBillingEnabled()',
  ": appRole === 'admin'",
]) {
  if (!schoolPage.includes(needle)) {
    throw new Error('School page launch-gate contract missing: ' + needle);
  }
}
if (schoolPage.includes("process.env.STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED")) {
  throw new Error('School page must not bypass the shared launch-gate helper.');
}

if (schoolBillingLaunch.includes('STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED')) {
  throw new Error('Legacy public-enabled env gate must not be able to keep launched school billing closed.');
}

if (!quoteRoute.includes("if (!isPublicSchoolBillingEnabled() && role !== 'admin') {")) {
  throw new Error('School quote must use the shared launch-gate helper.');
}
if (quoteRoute.includes('STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED')) {
  throw new Error('School quote must not keep launched school billing closed through the legacy env gate.');
}


const pricingRoute = fs.readFileSync('app/pricing/page.tsx', 'utf8');
for (const needle of [
  "import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';",
  'const publicSchoolBillingEnabled = isPublicSchoolBillingEnabled() && liveSecretConfigured;',
  'publicSchoolBillingEnabled={publicSchoolBillingEnabled}',
]) {
  if (!pricingRoute.includes(needle)) {
    throw new Error('Pricing school launch route contract missing: ' + needle);
  }
}

const pricingPage = fs.readFileSync('components/PricingPage.tsx', 'utf8');
for (const needle of [
  'schoolCheckoutHref: string | null',
  "source: 'pricing_school_live'",
  '`/school?plan=${plan.id}&billing=${billing}`',
  'Individuální i školní tarify jsou aktivní.',
  'Individual and school plans are live.',
  'Školní správa je součástí licence.',
  'School administration is included.',
]) {
  if (!pricingPage.includes(needle)) {
    throw new Error('Pricing school launch UI contract missing: ' + needle);
  }
}
for (const legacy of [
  'Připravujeme',
  'Coming soon',
  'Školní tarify zatím zůstávají ve fázi přípravy.',
  'School plans are still being prepared.',
  'Školní správa se ještě připravuje.',
  'School administration is still being prepared.',
]) {
  if (pricingPage.includes(legacy)) {
    throw new Error('Legacy pre-launch school pricing copy must not return: ' + legacy);
  }
}
