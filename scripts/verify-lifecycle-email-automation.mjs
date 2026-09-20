import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Lifecycle email regression: ${message}`);
}

const [
  lifecycle,
  signupVerify,
  generation,
  sessionRoute,
  billingWebhook,
  marketingRoute,
  marketingPreferences,
] = await Promise.all([
  source('lib/lifecycle-email.ts'),
  source('app/auth/confirm/verify/route.ts'),
  source('app/api/generate/route.ts'),
  source('app/api/sessions/[id]/route.ts'),
  source('app/api/billing/stripe/webhook/route.ts'),
  source('app/api/marketing-email-preference/route.ts'),
  source('components/MarketingEmailPreferences.tsx'),
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

requirePattern(lifecycle, /marketing_email_consent/, 'marketing consent gate is missing.');
requirePattern(lifecycle, /marketing_status:\s*context\.marketingConsent \? 'opt_in' : 'opt_out'/, 'Resend contact consent property is not synchronized.');
requirePattern(lifecycle, /getCurrentOrganizationForUser/, 'organization membership must influence effective plan.');
requirePattern(lifecycle, /!\['expired', 'cancelled'\]\.includes\(organization\.status\)/, 'active organization membership classification is missing.');
requirePattern(lifecycle, /\/events\/send/, 'Resend custom event API call is missing.');
requirePattern(lifecycle, /MARKETING_TOPIC_ID/, 'marketing topic synchronization is missing.');
requirePattern(lifecycle, /if \(!context\.marketingConsent\)/, 'event sending must fail closed without consent.');
requirePattern(lifecycle, /row\.lesson_limit !== 3/, 'Free lesson quota trigger must remain scoped to the current Free lesson allowance.');
requirePattern(lifecycle, /row\.lesson_remaining === 1/, 'near-limit trigger boundary changed unexpectedly.');
requirePattern(lifecycle, /row\.lesson_remaining === 0/, 'quota-reached trigger boundary changed unexpectedly.');
requirePattern(lifecycle, /process\.env\.RESEND_API_KEY/, 'Resend key must remain server-side.');
if (/NEXT_PUBLIC_RESEND/.test(lifecycle)) throw new Error('Lifecycle email regression: Resend key must never be public.');

requirePattern(signupVerify, /syllonaut\.onboarding\.started/, 'signup confirmation no longer triggers onboarding.');
requirePattern(generation, /sendFirstLessonLifecycleEvent/, 'first lesson event is not emitted after generation.');
requirePattern(generation, /sendLessonQuotaLifecycleEvent/, 'Free lesson quota lifecycle event is not emitted after generation.');
requirePattern(sessionRoute, /sendFirstLiveLifecycleEvent/, 'first live event is not emitted after live start.');
requirePattern(billingWebhook, /syllonaut\.subscription\.upgraded/, 'paid upgrade no longer exits the Free nurture flow.');
requirePattern(billingWebhook, /syncLifecycleContact/, 'subscription end no longer refreshes lifecycle plan state.');
requirePattern(marketingRoute, /set_marketing_email_consent/, 'marketing preference API no longer persists consent.');
requirePattern(marketingRoute, /syncLifecycleContact/, 'marketing preference API no longer syncs Resend state.');
requirePattern(marketingPreferences, /\/api\/marketing-email-preference/, 'marketing preference UI bypasses the synchronized server route.');

console.log('Lifecycle email automation checks passed.');
