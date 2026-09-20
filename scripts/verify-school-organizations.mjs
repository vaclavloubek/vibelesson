import fs from 'node:fs';

const requiredFiles = [
  'supabase/migrations/20260919161000_add_school_organizations_v1.sql',
  'supabase/migrations/20260919164000_add_school_billing_events.sql',
  'supabase/migrations/20260919165500_add_school_checkout_resume_url.sql',
  'lib/organization-billing-catalog.ts',
  'lib/organizations.ts',
  'lib/organization-payment.ts',
  'lib/organization-stripe.ts',
  'app/api/organizations/route.ts',
  'app/api/organizations/current/route.ts',
  'app/api/organizations/payment/route.ts',
  'app/api/organizations/invitations/route.ts',
  'app/api/organizations/invitations/accept/route.ts',
  'app/api/organizations/invitations/[invitationId]/route.ts',
  'app/api/organizations/members/[userId]/route.ts',
  'app/school/page.tsx',
  'app/school/invite/page.tsx',
  'components/SchoolAdmin.tsx',
  'app/api/organizations/subscription/route.ts',
  'app/api/organizations/renewal/route.ts',
  'app/api/cron/organization-billing/route.ts',
  'supabase/migrations/20260919172000_add_school_renewal_lifecycle.sql',
  'supabase/migrations/20260919173000_harden_school_overdue_and_admin_quota.sql',
  'supabase/migrations/20260920064000_protect_school_owner_invites.sql',
  'supabase/migrations/20260920074000_add_organization_bank_invoices.sql',
  'lib/organization-bank-invoice.ts',
  'lib/organization-bank-match.ts',
  'lib/organization-invoice-pdf.ts',
  'app/school/invoices/[orderId]/page.tsx',
  'app/api/organizations/invoices/[orderId]/pdf/route.ts',
  'app/admin/school-invoices/page.tsx',
  'app/api/admin/school-invoices/[orderId]/mark-paid/route.ts',
];

for (const path of requiredFiles) {
  if (!fs.existsSync(path)) {
    throw new Error('School organization contract missing: ' + path);
  }
}

const migration = fs.readFileSync(
  'supabase/migrations/20260919161000_add_school_organizations_v1.sql',
  'utf8',
);

for (const needle of [
  "('team', 'organization'",
  "('school', 'organization'",
  "('campus', 'organization'",
  "o.status = 'active'",
  'organization_memberships_one_active_org_per_user_idx',
  'organization_id uuid',
  'public.reserve_lesson_generation()',
  'public.reserve_revision_operation(p_action text)',
  'public.get_ai_quota()',
  "'awaiting_payment'",
]) {
  if (!migration.includes(needle)) {
    throw new Error('School organization migration contract missing: ' + needle);
  }
}

if (
  /grant\s+(select|insert|update|delete)[\s\S]{0,80}on\s+table\s+public\.(organizations|organization_memberships|organization_orders)[\s\S]{0,80}authenticated/i
    .test(migration)
) {
  throw new Error('Organization tables must remain server-only in V1.');
}

const billingMigration = fs.readFileSync(
  'supabase/migrations/20260919164000_add_school_billing_events.sql',
  'utf8',
);
for (const needle of [
  'sync_organization_invoice_event',
  "p_event_type = 'invoice.payment_failed'",
  "set status = 'past_due'",
  "set status = 'active'",
  'organization_billing_events',
]) {
  if (!billingMigration.includes(needle)) {
    throw new Error('School billing lifecycle contract missing: ' + needle);
  }
}

const stripe = fs.readFileSync('lib/organization-stripe.ts', 'utf8');
for (const needle of [
  "mode', 'subscription'",
  'subscription_data[metadata][syllonaut_organization_id]',
  "collection_method', 'send_invoice'",
  'payment_settings[payment_method_types][]',
]) {
  if (!stripe.includes(needle)) {
    throw new Error('School Stripe contract missing: ' + needle);
  }
}

const webhook = fs.readFileSync('app/api/billing/stripe/webhook/route.ts', 'utf8');
for (const needle of [
  'normalizeStripeOrganizationInvoiceEvent',
  'sync_organization_invoice_event',
  'organization_billing_route_mismatch',
  'normalizeStripeOrganizationSubscriptionEvent',
]) {
  if (!webhook.includes(needle)) {
    throw new Error('School webhook contract missing: ' + needle);
  }
}

const invite = fs.readFileSync('app/api/organizations/invitations/route.ts', 'utf8');
if (!invite.includes("randomBytes(32).toString('base64url')")) {
  throw new Error('School invitations must use cryptographically random tokens.');
}
if (!invite.includes("createHash('sha256')")) {
  throw new Error('School invitation tokens must be stored as hashes.');
}

const revokeInvite = fs.readFileSync(
  'app/api/organizations/invitations/[invitationId]/route.ts',
  'utf8',
);
for (const needle of [
  'canManageOrganization',
  ".eq('organization_id', organization.id)",
  ".eq('status', 'pending')",
  "status: 'revoked'",
]) {
  if (!revokeInvite.includes(needle)) {
    throw new Error('School pending invitation revoke contract missing: ' + needle);
  }
}

const schoolAdmin = fs.readFileSync('components/SchoolAdmin.tsx', 'utf8');
for (const needle of [
  'updateBulkInviteEntry',
  'removeBulkInviteEntry',
  'bulkInviteHasInvalidEmail',
  'bulkInviteHasDuplicateEmail',
  'Zrušit pozvánku',
]) {
  if (!schoolAdmin.includes(needle)) {
    throw new Error('School invitation admin UX contract missing: ' + needle);
  }
}

const ownerGuardMigration = fs.readFileSync(
  'supabase/migrations/20260920064000_protect_school_owner_invites.sql',
  'utf8',
);
for (const needle of [
  'organization_member_already_active',
  'organization_memberships_protect_designated_owner',
  'owner_role_locked',
  'owner_cannot_be_removed',
  'for update',
  'owner_user_id = p_new_owner',
  'from public, anon, authenticated',
]) {
  if (!ownerGuardMigration.includes(needle)) {
    throw new Error('School owner integrity contract missing: ' + needle);
  }
}

const acceptInviteRoute = fs.readFileSync(
  'app/api/organizations/invitations/accept/route.ts',
  'utf8',
);
if (!acceptInviteRoute.includes('organization_member_already_active')) {
  throw new Error('School invite acceptance must expose active-member conflicts.');
}

const bulkInviteRoute = fs.readFileSync(
  'app/api/organizations/invitations/bulk/route.ts',
  'utf8',
);
if (!bulkInviteRoute.includes('member_already_active')) {
  throw new Error('Bulk school invitations must skip active members explicitly.');
}

if (!schoolAdmin.includes('organization_member_already_active')) {
  throw new Error('School admin must explain active-member invitation conflicts.');
}

const schoolPage = fs.readFileSync('app/school/page.tsx', 'utf8');
for (const needle of [
  "checkoutValue === 'success'",
  "checkoutValue === 'cancelled'",
  'session_id is intentionally ignored',
]) {
  if (!schoolPage.includes(needle)) {
    throw new Error('School checkout return contract missing: ' + needle);
  }
}
const sessionIdRuntimeReads = schoolPage.match(/params\.session_id/g) ?? [];
if (
  sessionIdRuntimeReads.length !== 1
  || !schoolPage.includes('void params.session_id;')
) {
  throw new Error('School checkout return must ignore session_id as an activation authority.');
}

const schoolAdminCheckout = fs.readFileSync('components/SchoolAdmin.tsx', 'utf8');
for (const needle of [
  'initialCheckoutResult',
  'checkoutPollingStartedRef',
  "fetch('/api/organizations/current'",
  "payload.organization?.status === 'active'",
  'Stripe has not confirmed the payment yet',
]) {
  if (!schoolAdminCheckout.includes(needle)) {
    throw new Error('School checkout polling contract missing: ' + needle);
  }
}

const organizationOrderRoute = fs.readFileSync(
  'app/api/organizations/route.ts',
  'utf8',
);
for (const needle of [
  "legalName: z.string().trim().min(2).max(200)",
  "line1: z.string().trim().min(2).max(160)",
  "city: z.string().trim().min(2).max(120)",
  "postalCode: z.string().trim().min(2).max(32)",
]) {
  if (!organizationOrderRoute.includes(needle)) {
    throw new Error('School billing required-field contract missing: ' + needle);
  }
}

for (const needle of [
  'legalNameTouched',
  "Oficiální název *",
  "Fakturační e-mail *",
  "Fakturační země *",
  "Ulice a číslo *",
  "Město *",
  "PSČ *",
  "IČO / registrační číslo (volitelné)",
  "DIČ / VAT ID (volitelné)",
]) {
  if (!schoolAdmin.includes(needle)) {
    throw new Error('School billing form required-field UX missing: ' + needle);
  }
}

for (const needle of [
  'OrganizationStripeError',
  "input.environment === 'sandbox' && profile?.role === 'admin'",
  'stripeType',
  'stripeCode',
  'diagnostic',
]) {
  if (!organizationOrderRoute.includes(needle)) {
    throw new Error('School sandbox order diagnostics contract missing: ' + needle);
  }
}

const organizationPaymentRoute = fs.readFileSync(
  'app/api/organizations/payment/route.ts',
  'utf8',
);
for (const needle of [
  'OrganizationStripeError',
  "!livemode && profile?.role === 'admin'",
  'stripeType',
  'stripeCode',
  'diagnostic',
]) {
  if (!organizationPaymentRoute.includes(needle)) {
    throw new Error('School sandbox payment retry diagnostics contract missing: ' + needle);
  }
}

for (const needle of [
  'SandboxPaymentDiagnostic',
  'sandboxPaymentDiagnosticSuffix',
  'Sandbox diagnostika:',
]) {
  if (!schoolAdmin.includes(needle)) {
    throw new Error('School sandbox payment diagnostics UX missing: ' + needle);
  }
}

const bankInvoiceMigration = fs.readFileSync(
  'supabase/migrations/20260920074000_add_organization_bank_invoices.sql',
  'utf8',
);
for (const needle of [
  'payment_variable_symbol',
  'organizations_payment_variable_symbol_uidx',
  'issue_organization_bank_invoice',
  'confirm_organization_bank_payment_manual',
  'match_organization_bank_payment',
  "'5bbed66a-c125-4740-947c-946a364c6d3f'::uuid",
  "'superadmin_manual'",
  "'bank_match'",
  'organization_bank_payment_confirmations',
  'oo.livemode = true',
  'from public, anon, authenticated',
  'to service_role',
]) {
  if (!bankInvoiceMigration.includes(needle)) {
    throw new Error('Organization bank invoice DB contract missing: ' + needle);
  }
}

const organizationPayment = fs.readFileSync('lib/organization-payment.ts', 'utf8');
if (!organizationPayment.includes('organization_bank_invoice_required')) {
  throw new Error('Stripe organization payment must reject invoice payment methods.');
}
if (organizationPayment.includes('createOrganizationInvoice')) {
  throw new Error('Bank invoices must never be created through Stripe.');
}

for (const needle of [
  'issueOrganizationBankInvoice',
  "paymentKind: 'bank_invoice'",
]) {
  if (!organizationOrderRoute.includes(needle)) {
    throw new Error('Initial bank invoice route contract missing: ' + needle);
  }
}

const bankInvoice = fs.readFileSync('lib/organization-bank-invoice.ts', 'utf8');
for (const needle of [
  'SYLLONAUT_INVOICE_BANK_IBAN',
  'SYLLONAUT_INVOICE_BANK_ACCOUNT',
  "SPD*1.0",
  "'X-VS:'",
  'invoice_snapshot',
]) {
  if (!bankInvoice.includes(needle)) {
    throw new Error('Bank invoice snapshot/QR contract missing: ' + needle);
  }
}

const invoicePdf = fs.readFileSync('lib/organization-invoice-pdf.ts', 'utf8');
for (const needle of [
  'qr: invoice.spayd',
  "eccLevel: 'M'",
  'TESTOVACÍ DOKLAD',
]) {
  if (!invoicePdf.includes(needle)) {
    throw new Error('Bank invoice PDF QR contract missing: ' + needle);
  }
}

const superadminInvoiceRoute = fs.readFileSync(
  'app/api/admin/school-invoices/[orderId]/mark-paid/route.ts',
  'utf8',
);
for (const needle of [
  'isSuperadminUserId',
  'confirm_organization_bank_payment_manual',
  'superadmin_required',
]) {
  if (!superadminInvoiceRoute.includes(needle)) {
    throw new Error('Superadmin invoice confirmation contract missing: ' + needle);
  }
}

const bankMatch = fs.readFileSync('lib/organization-bank-match.ts', 'utf8');
if (!bankMatch.includes("rpc('match_organization_bank_payment'")) {
  throw new Error('Bank transaction adapter must use the bank-match RPC.');
}

const currentRoute = fs.readFileSync('app/api/organizations/current/route.ts', 'utf8');
if (!currentRoute.includes('canManageOrganization')) {
  throw new Error('School summary must enforce manager scope.');
}
if (!currentRoute.includes("from('generation_requests')")) {
  throw new Error('School summary must expose shared quota usage.');
}

console.log('School organization V1 source contracts: OK');


const lifecycleMigration = fs.readFileSync(
  'supabase/migrations/20260919173000_harden_school_overdue_and_admin_quota.sql',
  'utf8',
);
for (const needle of [
  "p.role <> 'admin'",
  "status = 'past_due'",
  "status = 'suspended'",
  'suspend_overdue_organizations',
  'p_grace_days: 14',
]) {
  if (!lifecycleMigration.includes(needle) && needle !== 'p_grace_days: 14') {
    throw new Error('School overdue lifecycle contract missing: ' + needle);
  }
}

const cron = fs.readFileSync('app/api/cron/organization-billing/route.ts', 'utf8');
for (const needle of [
  "authorization !== 'Bearer ' + secret",
  "rpc('expire_organization_licenses')",
  "rpc('suspend_overdue_organizations', { p_grace_days: 14 })",
]) {
  if (!cron.includes(needle)) {
    throw new Error('School billing cron contract missing: ' + needle);
  }
}

const renewalRoute = fs.readFileSync('app/api/organizations/renewal/route.ts', 'utf8');
if (!renewalRoute.includes('issueOrganizationBankInvoice')) {
  throw new Error('Manual school renewal must issue a bank invoice.');
}

const subscriptionRoute = fs.readFileSync(
  'app/api/organizations/subscription/route.ts',
  'utf8',
);
if (!subscriptionRoute.includes('cancelAtPeriodEnd')) {
  throw new Error('Card school subscriptions must support period-end cancellation.');
}
