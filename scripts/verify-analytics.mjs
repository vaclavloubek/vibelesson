import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Analytics regression: ${message}`);
}

function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(`Analytics regression: ${message}`);
}

async function collectSourceFiles(relativeDirectory) {
  const basePath = path.join(new URL(root).pathname, relativeDirectory);
  const entries = await readdir(basePath, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const analytics = await source('lib/analytics.ts');
const cookieConsent = await source('components/CookieConsent.tsx');
const pricingPage = await source('components/PricingPage.tsx');
const pricingRoute = await source('app/pricing/page.tsx');
const ga4Setup = await source('scripts/setup-ga4.mjs');

requirePattern(analytics, /export function trackEvent</, 'central trackEvent helper is missing.');
requirePattern(analytics, /analyticsConsentGranted\(\)/, 'custom events are not gated by explicit analytics consent.');
requirePattern(analytics, /if \(!GA_MEASUREMENT_ID/, 'analytics helper must be a no-op without a Measurement ID.');
requirePattern(analytics, /EVENT_PARAMETER_KEYS/, 'runtime event parameter allowlist is missing.');
requirePattern(analytics, /window\.gtag\('event', name/, 'custom events must be emitted only through the central helper.');
requirePattern(analytics, /ui_locale:\s*uiLocale/, 'all custom events must include the active UI locale.');
requirePattern(analytics, /lesson_generation_completed:[\s\S]*lesson_language:\s*string;/, 'completed lesson generation must expose lesson language as an analytics dimension.');
requirePattern(analytics, /lesson_generation_completed:\s*\[[^\]]*'lesson_language'/, 'lesson language must remain in the generation-completed parameter allowlist.');
requirePattern(analytics, /subscription_activated:[\s\S]*plan:\s*'teacher' \| 'teacher-pro';[\s\S]*source:\s*'stripe_live';/, 'verified paid subscription activation event is missing.');
requirePattern(analytics, /subscription_activated:\s*\['plan', 'source'\]/, 'subscription activation parameters must remain explicitly allowlisted.');
requirePattern(pricingRoute, /select\('role, active_plan_code'\)/, 'checkout return must read the server-authoritative active plan.');
requirePattern(pricingPage, /checkoutResult !== 'success'[\s\S]*!liveCheckout[\s\S]*!checkoutSessionId/, 'subscription activation tracking must require a successful LIVE Checkout return, including public billing.');
requirePattern(pricingPage, /trackEvent\('subscription_activated',[\s\S]*plan:\s*activePlanCode[\s\S]*source:\s*'stripe_live'/, 'subscription activation must be emitted only after the paid plan is active.');
requirePattern(ga4Setup, /'subscription_activated'/, 'GA4 setup must mark subscription activation as a Key Event.');
requirePattern(ga4Setup, /\['Plan', 'plan'/, 'GA4 setup must register the paid plan dimension.');
requirePattern(analytics, /catch \{[\s\S]*Analytics is observational only/, 'analytics failures must never break product flows.');

const allowlistMatch = analytics.match(/const EVENT_PARAMETER_KEYS[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!allowlistMatch) throw new Error('Analytics regression: parameter allowlist cannot be inspected.');
const allowlist = allowlistMatch[1];

const forbiddenKeys = [
  'email',
  'name',
  'display_name',
  'lesson_title',
  'lesson_id',
  'session_id',
  'participant_id',
  'user_id',
  'filename',
  'url',
  'token',
  'auth_token',
  'participant_token',
  'prompt',
  'answer',
  'response',
  'rationale',
  'error_message',
  'error_text',
];

for (const key of forbiddenKeys) {
  if (new RegExp(`['"]${key}['"]`).test(allowlist)) {
    throw new Error(`Analytics regression: forbidden/high-risk parameter "${key}" entered the analytics allowlist.`);
  }
}

requirePattern(cookieConsent, /!consent\?\.analytics/, 'GA loader must remain consent-gated.');
requirePattern(cookieConsent, /ad_storage:\s*'denied'/, 'ad_storage must remain denied.');
requirePattern(cookieConsent, /ad_user_data:\s*'denied'/, 'ad_user_data must remain denied.');
requirePattern(cookieConsent, /ad_personalization:\s*'denied'/, 'ad_personalization must remain denied.');
requirePattern(cookieConsent, /allow_google_signals:\s*false/, 'Google Signals must remain disabled.');
requirePattern(cookieConsent, /allow_ad_personalization_signals:\s*false/, 'ad personalization signals must remain disabled.');
requirePattern(cookieConsent, /dataLayer\?\.push\(arguments\)/, 'gtag must queue canonical arguments objects so gtag.js processes commands.');
forbidPattern(cookieConsent, /dataLayer\?\.push\(args\)/, 'gtag must not queue rest-parameter arrays; gtag.js expects the canonical arguments object.');
forbidPattern(cookieConsent, /gtag\?\.\('event',\s*'page_view'/, 'CookieConsent must not manually track SPA route changes when Enhanced Measurement is authoritative.');
forbidPattern(cookieConsent, /page_path:\s*pathname/, 'manual route page_view tracking can duplicate Enhanced Measurement.');

const files = [
  ...(await collectSourceFiles('app')),
  ...(await collectSourceFiles('components')),
  ...(await collectSourceFiles('lib')),
];

for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  const isAnalyticsHelper = normalized.endsWith('/lib/analytics.ts');
  const isConsentLoader = normalized.endsWith('/components/CookieConsent.tsx');

  if (!isAnalyticsHelper && /gtag\?\.\(['"]event['"]|gtag\(['"]event['"]/.test(text)) {
    throw new Error(`Analytics regression: direct gtag event call found outside lib/analytics.ts: ${normalized}`);
  }

  if (!isAnalyticsHelper && !isConsentLoader && /window\.gtag/.test(text)) {
    throw new Error(`Analytics regression: direct window.gtag usage found outside the analytics boundary: ${normalized}`);
  }
}

console.log('Analytics source checks passed.');
