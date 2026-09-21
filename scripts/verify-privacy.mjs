import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Privacy regression: ${message}`);
}

const [layout, cookieConsent, analytics, footer, gdpr, auth, nextConfig, marketingPreferences] = await Promise.all([
  source('app/layout.tsx'),
  source('components/CookieConsent.tsx'),
  source('lib/analytics.ts'),
  source('components/SiteFooter.tsx'),
  source('app/gdpr/page.tsx'),
  source('components/AuthControls.tsx'),
  source('next.config.ts'),
  source('components/MarketingEmailPreferences.tsx'),
]);

requirePattern(layout, /<CookieConsent\s*\/>/, 'global cookie consent surface is missing.');
requirePattern(cookieConsent, /!consent\?\.analytics/, 'analytics must remain disabled without explicit consent.');
requirePattern(cookieConsent, /Povolit analytické/, 'accept action is missing.');
requirePattern(cookieConsent, /Jen nezbytné/, 'reject action is missing.');
requirePattern(cookieConsent, /role="dialog"/, 'cookie settings must keep dialog semantics.');
requirePattern(cookieConsent, /COOKIE_MAX_AGE_SECONDS = 60 \* 60 \* 24 \* 180/, 'consent retention must stay bounded to 180 days.');
requirePattern(cookieConsent, /allow_google_signals:\s*false/, 'GA4 must not enable advertising signals under analytics-only consent.');
requirePattern(cookieConsent, /ad_personalization:\s*'denied'/, 'Google ad personalization must stay denied.');
requirePattern(cookieConsent, /clearGaCookies\(\)/, 'withdrawing analytics consent must clear GA cookies.');
requirePattern(cookieConsent, /send_page_view:\s*false/, 'automatic GA pageviews must remain disabled.');
requirePattern(cookieConsent, /trackPageView\(\)/, 'sanitized manual pageview tracking is missing.');
requirePattern(analytics, /sanitizeAnalyticsPathname/, 'analytics pathname sanitization is missing.');
requirePattern(analytics, /page_location:\s*analyticsPageLocation\(\)/, 'custom analytics events must override the raw page URL.');
requirePattern(analytics, /CAMPAIGN_QUERY_KEYS[\s\S]*'utm_source'[\s\S]*'utm_medium'[\s\S]*'utm_campaign'[\s\S]*'utm_content'/, 'safe campaign attribution allowlist is incomplete.');
requirePattern(footer, /href=\{\`\/\$\{locale\}\/gdpr\`\}/, 'Locale-aware GDPR link is missing from the shared footer.');
requirePattern(footer, /COOKIE_SETTINGS_EVENT/, 'cookie settings action is missing from the shared footer.');
requirePattern(gdpr, /Ochrana osobních údajů \(GDPR\)/, 'GDPR page content is missing.');
requirePattern(gdpr, /Google Analytics 4 se načte pouze po aktivním/, 'GA4 opt-in explanation is missing.');
requirePattern(auth, /marketing_email_consent:\s*marketingConsent/, 'signup marketing opt-in is not persisted into signup metadata.');
requirePattern(auth, /type="checkbox"[\s\S]*checked=\{marketingConsent\}/, 'marketing opt-in checkbox is missing or not explicit.');
requirePattern(marketingPreferences, /set_marketing_email_consent/, 'marketing-email consent must have a self-service withdrawal path.');
requirePattern(gdpr, /_ga_\*/, 'GDPR page must describe GA4 cookies and retention.');
requirePattern(gdpr, /Verze 1\.3/, 'Privacy Notice version must cover immutable paid-contract evidence.');
requirePattern(gdpr, /Potvrzení placené smlouvy:/, 'Privacy Notice must disclose paid-contract snapshots.');
requirePattern(gdpr, /kontrolní SHA-256 hash/, 'Privacy Notice must disclose contract snapshot integrity hash.');
requirePattern(gdpr, /Do tohoto smluvního snapshotu nekopírujeme e-mail zákazníka/, 'Privacy Notice must state that contract snapshots do not duplicate customer email.');
requirePattern(gdpr, /Neměnný snapshot individuální placené smlouvy/, 'Privacy Notice must disclose contract-evidence retention.');
requirePattern(nextConfig, /https:\/\/www\.googletagmanager\.com/, 'CSP does not allow the consent-gated GA4 script.');
requirePattern(nextConfig, /https:\/\/\*\.google-analytics\.com/, 'CSP does not allow consent-gated GA4 collection.');

console.log('Privacy source checks passed.');
