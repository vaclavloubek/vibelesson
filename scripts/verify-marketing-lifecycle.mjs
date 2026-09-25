import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Marketing lifecycle regression: ${message}`);
}

function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(`Marketing lifecycle regression: ${message}`);
}

const [
  lifecycle,
  consentSyncRoute,
  preferences,
  confirmRoute,
  neonAuthActions,
  generateRoute,
  importRoute,
  sessionRoute,
  billingWebhook,
  bankInvoiceMarkPaidRoute,
  bankMatchRoute,
  internalActivateRoute,
  invitationAcceptRoute,
] = await Promise.all([
  source('lib/marketing-lifecycle.ts'),
  source('app/api/marketing-email-preferences/sync/route.ts'),
  source('components/MarketingEmailPreferences.tsx'),
  source('app/auth/confirm/verify/route.ts'),
  source('app/auth/neon/actions.ts'),
  source('app/api/generate/route.ts'),
  source('app/api/lesson-shares/[token]/import/route.ts'),
  source('app/api/sessions/[id]/route.ts'),
  source('app/api/billing/stripe/webhook/route.ts'),
  source('app/api/admin/school-invoices/[orderId]/mark-paid/route.ts'),
  source('app/api/billing/bank/resend/route.ts'),
  source('app/api/internal/organizations/[id]/activate/route.ts'),
  source('app/api/organizations/invitations/accept/route.ts'),
]);

for (const eventName of [
  'syllonaut.onboarding.started',
  'syllonaut.first_lesson.created',
  'syllonaut.first_live.started',
  'syllonaut.subscription.upgraded',
  'syllonaut.subscription.ended',
  'syllonaut.subscription.renewing_soon',
  'syllonaut.organization_owner.activated',
  'syllonaut.organization_member.joined',
  'syllonaut.quota.near_limit',
  'syllonaut.quota.reached',
]) {
  requirePattern(lifecycle, new RegExp(eventName.replaceAll('.', '\\.')), `missing event ${eventName}`);
}

requirePattern(lifecycle, /marketing_email_consent/, 'Supabase consent must remain the source of truth for app-side eligibility.');
requirePattern(lifecycle, /existing\?\.unsubscribed && !explicitConsent/, 'product events must respect a Resend unsubscribe.');
requirePattern(lifecycle, /marketing_status:\s*'opt_out'/, 'opt-out must be mirrored into Resend contact properties.');
requirePattern(lifecycle, /unsubscribed:\s*true/, 'explicit opt-out must globally unsubscribe the Resend contact.');
requirePattern(lifecycle, /explicitConsent \? \{ unsubscribed: false \}/, 'only explicit consent may re-subscribe an existing contact.');
requirePattern(lifecycle, /organization_\$\{organization\.planCode\}/, 'organization members must not be classified as individual Free contacts.');
requirePattern(lifecycle, /active_plan_code/, 'individual plan state must come from the authoritative profile.');
requirePattern(lifecycle, /\/events\/send/, 'product state changes must use Resend custom events.');
requirePattern(lifecycle, /\/contacts\//, 'contact state must be synchronized through the Resend Contacts API.');
requirePattern(lifecycle, /User-Agent': 'Syllonaut\/marketing-lifecycle'/, 'Resend requests must identify the server integration.');
forbidPattern(lifecycle, /NEXT_PUBLIC_RESEND/, 'Resend credentials must never be exposed to the browser.');

requirePattern(consentSyncRoute, /syncMarketingPreference\(userId\)/, 'authenticated consent changes must synchronize the Resend contact.');
requirePattern(preferences, /\/api\/marketing-email-preferences\/sync/, 'privacy settings must call the server-side delivery sync.');
requirePattern(confirmRoute, /startMarketingOnboarding\(userId\)/, 'confirmed signup must start the consented welcome flow.');
requirePattern(confirmRoute, /after\(async \(\) =>/, 'signup redirect must not wait for marketing delivery orchestration.');
requirePattern(neonAuthActions, /startMarketingOnboarding\(pendingUserId\)/, 'Neon email verification must start the consented welcome flow.');
requirePattern(neonAuthActions, /"emailVerified" = false/, 'only the first Neon email verification may start the welcome flow.');
requirePattern(neonAuthActions, /after\(async \(\) =>/, 'Neon email verification must not wait for marketing delivery orchestration.');
requirePattern(generateRoute, /emitFirstLessonCreatedIfNeeded\(userId\)/, 'successful AI generation must signal first lesson creation.');
requirePattern(generateRoute, /emitFreeLessonQuotaLifecycle\(userId, quotaUsed, quotaLimit\)/, 'successful Free generation must signal near/reached quota transitions.');
requirePattern(importRoute, /emitFirstLessonCreatedIfNeeded\(userId\)/, 'shared lesson import must satisfy the first-lesson outcome.');
requirePattern(sessionRoute, /emitFirstLiveStartedIfNeeded\(userId\)/, 'server-confirmed first live start must satisfy the classroom outcome.');
requirePattern(billingWebhook, /emitSubscriptionUpgraded\(sync\.userId\)/, 'confirmed subscription activation must exit Free conversion.');
requirePattern(billingWebhook, /lifecycleNotification === 'subscription_ended'\) \{\s*await emitSubscriptionEnded\(sync\.userId, sync\.subscriptionId\)/, 'a confirmed subscription end must start the win-back flow.');
requirePattern(lifecycle, /'syllonaut\.subscription\.ended', \{ plan_code: planCode \}/, 'win-back must receive the ended plan explicitly, not the already-downgraded profile plan.');
requirePattern(lifecycle, /from public\.billing_subscriptions[\s\S]*?user_id = \$\{userId\}::uuid/, 'ended plan lookup must be bound to the subscription owner.');
requirePattern(billingWebhook, /if \(upcomingInvoice\.livemode\) \{[\s\S]*?await emitSubscriptionRenewingSoon\(subscriptionId\)/, 'only a LIVE invoice.upcoming may start the renewal reminder.');
requirePattern(lifecycle, /'syllonaut\.subscription\.renewing_soon', \{ plan_code: subscription\.planCode \}/, 'renewal reminder must receive the renewing plan explicitly.');
requirePattern(lifecycle, /external_subscription_id = \$\{subscriptionId\}\s+and status = 'active' and cancel_at_period_end = false/, 'renewal reminder must skip subscriptions that will not renew.');
requirePattern(lifecycle, /'syllonaut\.organization_owner\.activated', \{ plan_code: payload\.plan_code \}/, 'organization owner onboarding must receive the organization plan explicitly.');
requirePattern(lifecycle, /row\.activated_at !== null \|\| row\.is_internal_test !== false \|\| row\.livemode !== true/, 'owner onboarding must fire only on the first LIVE activation of a non-test organization.');
requirePattern(lifecycle, /row\.plan_code !== 'school' && row\.plan_code !== 'campus'/, 'owner onboarding payload must be limited to school and campus plans.');
for (const [name, route, lookup] of [
  ['Stripe organization invoice', billingWebhook, /loadOrganizationFirstActivation\(\{ orderId: organizationInvoiceSync\.orderId \}\)/],
  ['superadmin bank invoice confirmation', bankInvoiceMarkPaidRoute, /loadOrganizationFirstActivation\(\{ orderId \}\)/],
  ['automatic bank payment match', bankMatchRoute, /loadOrganizationFirstActivation\(\{\s*variableSymbol: transaction\.variableSymbol,?\s*\}\)/],
  ['internal organization activation', internalActivateRoute, /loadOrganizationFirstActivation\(\{ orderId: order\.id \}\)/],
]) {
  requirePattern(route, lookup, `${name} must read the pre-activation state before activating.`);
  requirePattern(route, /scheduleOrganizationOwnerActivated\(firstActivation\)/, `${name} must start owner onboarding after the first activation.`);
}
requirePattern(invitationAcceptRoute, /after\(async \(\) => \{\s*try \{\s*await emitOrganizationMemberJoined\(userId\)/, 'accepted organization invitations must start member onboarding without blocking the response.');
requirePattern(lifecycle, /organization\.isInternalTest\) return null;[\s\S]*?'syllonaut\.organization_member\.joined'/, 'internal test organization members must not start member onboarding.');
requirePattern(lifecycle, /export async function emitOrganizationMemberJoined[\s\S]*?organization\.planCode !== 'school' && organization\.planCode !== 'campus'\) return null;[\s\S]*?'syllonaut\.organization_member\.joined'/, 'member onboarding must skip organizations outside School and Campus before sending the event.');
requirePattern(billingWebhook, /syncMarketingPlan\(sync\.userId\)/, 'other live subscription updates must refresh contact plan state.');

// Audit B6: every Resend failure is counted and mailed to the operator daily.
const [failures, failureCron, failureMigration, vercelConfig] = await Promise.all([
  source('lib/marketing-failures.ts'),
  source('app/api/cron/marketing-failures/route.ts'),
  source('neon/migrations/0021_marketing_lifecycle_failures.sql'),
  source('vercel.json'),
]);
requirePattern(lifecycle, /async function recordedResendFailure\(operation: string, code: string\) \{\s*await recordMarketingLifecycleFailure\(operation, code\);/, 'Resend failures must be recorded before throwing.');
requirePattern(lifecycle, /const fail = \(code: string\) => recordedResendFailure\(operation, code\);/, 'resendRequest must record each failure.');
forbidPattern(lifecycle, /throw new MarketingLifecycleError\(['`]resend_/, 'every Resend failure must go through the recording fail() helper.');
requirePattern(failures, /replace\(\/\^\\\/contacts\\\/\[\^\/\]\+\/, '\/contacts\/:email'\)/, 'failure records must never keep the contact email from the path.');
requirePattern(failures, /catch \(error\) \{\s*console\.error\('marketing lifecycle failure could not be recorded'/, 'recording a failure must never throw.');
requirePattern(failures, /where failure_count > reported_count/, 'the digest must report only failures not reported yet.');
requirePattern(failures, /set reported_count = greatest\(reported_count, /, 'the digest must mark exactly the reported counts.');
requirePattern(failures, /to: PROVIDER_CONTACT\.email/, 'the digest goes to the operator.');
requirePattern(failureCron, /if \(!isAuthorizedCronRequest\(request\)\)/, 'the digest cron must be protected.');
requirePattern(vercelConfig, /"path": "\/api\/cron\/marketing-failures"/, 'the digest cron must be scheduled.');
requirePattern(failureMigration, /enable row level security/, 'the failure table must have RLS enabled.');
requirePattern(failureMigration, /revoke all on table private\.marketing_lifecycle_failures from anon, anonymous, authenticated, authenticator;/, 'API roles must not read the failure table.');
forbidPattern(failureMigration, /^\s+\w*(email|user_id)\w*\s+(text|citext|uuid|varchar)/im, 'the failure table must not store email addresses or user ids.');

console.log('Marketing lifecycle checks passed.');
