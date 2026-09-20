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
  generateRoute,
  importRoute,
  sessionRoute,
  billingWebhook,
] = await Promise.all([
  source('lib/marketing-lifecycle.ts'),
  source('app/api/marketing-email-preferences/sync/route.ts'),
  source('components/MarketingEmailPreferences.tsx'),
  source('app/auth/confirm/verify/route.ts'),
  source('app/api/generate/route.ts'),
  source('app/api/lesson-shares/[token]/import/route.ts'),
  source('app/api/sessions/[id]/route.ts'),
  source('app/api/billing/stripe/webhook/route.ts'),
]);

for (const eventName of [
  'syllonaut.onboarding.started',
  'syllonaut.first_lesson.created',
  'syllonaut.first_live.started',
  'syllonaut.subscription.upgraded',
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
requirePattern(generateRoute, /emitFirstLessonCreatedIfNeeded\(userId\)/, 'successful AI generation must signal first lesson creation.');
requirePattern(generateRoute, /emitFreeLessonQuotaLifecycle\(userId, quotaUsed, quotaLimit\)/, 'successful Free generation must signal near/reached quota transitions.');
requirePattern(importRoute, /emitFirstLessonCreatedIfNeeded\(userId\)/, 'shared lesson import must satisfy the first-lesson outcome.');
requirePattern(sessionRoute, /emitFirstLiveStartedIfNeeded\(userId\)/, 'server-confirmed first live start must satisfy the classroom outcome.');
requirePattern(billingWebhook, /emitSubscriptionUpgraded\(sync\.userId\)/, 'confirmed subscription activation must exit Free conversion.');
requirePattern(billingWebhook, /syncMarketingPlan\(sync\.userId\)/, 'other live subscription updates must refresh contact plan state.');

console.log('Marketing lifecycle checks passed.');
