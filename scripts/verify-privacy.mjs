import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Privacy regression: ${message}`);
}

const [layout, cookieConsent, analytics, footer, gdpr, dpa, proxy, auth, nextConfig, marketingPreferences] = await Promise.all([
  source('app/layout.tsx'),
  source('components/CookieConsent.tsx'),
  source('lib/analytics.ts'),
  source('components/SiteFooter.tsx'),
  source('app/gdpr/page.tsx'),
  source('lib/dpa-document.ts'),
  source('proxy.ts'),
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
requirePattern(footer, /\/dpa/, 'DPA link is missing from the shared footer.');
requirePattern(proxy, /pathname === '\/dpa'/, 'Unprefixed DPA route must use the locale gateway.');
requirePattern(gdpr, /Team \/ School \/ Campus[\s\S]*zpracovatelem/, 'Privacy Notice must describe the current organisation controller/processor role.');
requirePattern(gdpr, /Přijetí DPA organizací:/, 'Privacy Notice must disclose organisation DPA acceptance evidence.');
if (/budoucích školních účtů|future school accounts/.test(gdpr)) throw new Error('Privacy regression: school processing must not be described as future.');
requirePattern(dpa, /čl\. 28 GDPR|Article 28 GDPR/, 'DPA must expressly implement Article 28 GDPR.');
requirePattern(dpa, /Supabase[\s\S]*Vercel[\s\S]*Cloudflare[\s\S]*Resend[\s\S]*OpenAI[\s\S]*Amazon Web Services[\s\S]*Microsoft/, 'DPA sub-processor list is incomplete.');
requirePattern(dpa, /15 dnů|15 days/, 'DPA must define advance notice for planned sub-processor changes.');
requirePattern(dpa, /Supabase, Inc\.[\s\S]*privacy@supabase\.io[\s\S]*Vercel Inc\.[\s\S]*privacy@vercel\.com[\s\S]*Cloudflare, Inc\.[\s\S]*privacyquestions@cloudflare\.com[\s\S]*Plus Five Five, Inc\.[\s\S]*privacy@resend\.com/, 'DPA must keep key sub-processor identities and privacy contacts readily available.');
requirePattern(dpa, /OpenAI Ireland Limited[\s\S]*Amazon Web Services EMEA SARL[\s\S]*Microsoft Ireland Operations Limited/, 'DPA must identify the current AI processing chain entities.');
requirePattern(footer, /COOKIE_SETTINGS_EVENT/, 'cookie settings action is missing from the shared footer.');
requirePattern(gdpr, /Ochrana osobních údajů \(GDPR\)/, 'GDPR page content is missing.');
requirePattern(gdpr, /Google Analytics 4 se načte pouze po aktivním/, 'GA4 opt-in explanation is missing.');
requirePattern(auth, /marketing_email_consent:\s*marketingConsent/, 'signup marketing opt-in is not persisted into signup metadata.');
requirePattern(auth, /type="checkbox"[\s\S]*checked=\{marketingConsent\}/, 'marketing opt-in checkbox is missing or not explicit.');
requirePattern(marketingPreferences, /set_marketing_email_consent/, 'marketing-email consent must have a self-service withdrawal path.');
requirePattern(gdpr, /_ga_\*/, 'GDPR page must describe GA4 cookies and retention.');
requirePattern(nextConfig, /https:\/\/www\.googletagmanager\.com/, 'CSP does not allow the consent-gated GA4 script.');
requirePattern(nextConfig, /https:\/\/\*\.google-analytics\.com/, 'CSP does not allow consent-gated GA4 collection.');

console.log('Privacy source checks passed.');
