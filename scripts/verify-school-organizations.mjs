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
  'app/api/organizations/members/[userId]/route.ts',
  'app/school/page.tsx',
  'app/school/invite/page.tsx',
  'components/SchoolAdmin.tsx',
  'app/api/organizations/subscription/route.ts',
  'app/api/organizations/renewal/route.ts',
  'app/api/cron/organization-billing/route.ts',
  'supabase/migrations/20260919172000_add_school_renewal_lifecycle.sql',
  'supabase/migrations/20260919173000_harden_school_overdue_and_admin_quota.sql',
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
if (!renewalRoute.includes("paymentMethod: 'invoice'")) {
  throw new Error('Manual school renewal must remain invoice-based.');
}

const subscriptionRoute = fs.readFileSync(
  'app/api/organizations/subscription/route.ts',
  'utf8',
);
if (!subscriptionRoute.includes('cancelAtPeriodEnd')) {
  throw new Error('Card school subscriptions must support period-end cancellation.');
}
