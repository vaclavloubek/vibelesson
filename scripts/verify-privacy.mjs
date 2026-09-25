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
// LEGAL-022: Privacy Notice 1.7 matches the production infrastructure.
requirePattern(gdpr, /Verze 1\.9/, 'Privacy Notice version 1.9 is missing.');
requirePattern(gdpr, /Nápověda Syllonautu:/, 'Privacy Notice must describe Syllonaut Help processing.');
requirePattern(gdpr, /Text konverzace neukládáme/, 'Privacy Notice must state that Help conversations are not stored.');
requirePattern(gdpr, /Záznamy o použití Nápovědy Syllonautu \(bez textu konverzace\)/, 'Privacy Notice must state the Help usage-record retention.');
requirePattern(gdpr, /__Secure-neon-auth\.session_token/, 'the Neon Auth session cookie must be listed.');
if (/sb-…-auth-token|Supabase \{ui\('autentizační cookies'/.test(gdpr)) throw new Error('Privacy regression: the retired Supabase auth cookie must not be listed.');
for (const needle of ['syllonaut_locale', 'syllonaut_device_v1', 'ep_participant_', 'IndexedDB', 'sessionStorage']) {
  if (!gdpr.includes(needle)) throw new Error(`Privacy regression: cookie/storage table is missing ${needle}.`);
}
requirePattern(gdpr, /čl\. 13 odst\. 2 písm\. f\) GDPR/, 'automated decision-making notice (Art. 13(2)(f)) is missing.');
requirePattern(gdpr, /<section id="studenti">/, 'student section anchor #studenti is missing.');
requirePattern(gdpr, /první lekce, spuštění první živé hodiny a čerpání AI kvóty/, 'behaviour-triggered marketing email notice is missing.');
requirePattern(gdpr, /<strong>Neon<\/strong>/, 'Neon must be listed as a service provider.');
requirePattern(gdpr, /<strong>Stripe<\/strong>/, 'Stripe must be listed as a service provider.');
requirePattern(gdpr, /jen u formulářů přihlášení a registrace/, 'Turnstile scope must be limited to sign-in and registration forms.');
if (layout.includes('challenges.cloudflare.com')) throw new Error('Privacy regression: Turnstile must not load on every page from the root layout.');
requirePattern(auth, /\{open \? <Script id="syllonaut-turnstile"/, 'Turnstile must load only while the sign-in/registration popover is open.');
// Student pages: no cookie banner and GA blocked, like worksheets.
requirePattern(cookieConsent, /const STUDENT_PATH = /, 'student route exclusion is missing from CookieConsent.');
requirePattern(cookieConsent, /consentExemptRoute = WORKSHEET_PATH\.test\(pathname\) \|\| STUDENT_PATH\.test\(pathname\)/, 'CookieConsent must exempt worksheet and student routes.');
requirePattern(cookieConsent, /analyticsBlocked = consentExemptRoute/, 'GA must be blocked on student routes.');
requirePattern(cookieConsent, /if \(!ready \|\| consentExemptRoute\) return null;/, 'the cookie banner must not render on student routes.');
{
  const studentPath = new RegExp(cookieConsent.match(/const STUDENT_PATH = \/(.+)\/;/)[1]);
  for (const path of ['/join', '/join/ABC7K3M', '/student/123', '/sessions/123/presenter']) {
    if (!studentPath.test(path)) throw new Error(`Privacy regression: CookieConsent does not exempt student route ${path}.`);
  }
  for (const path of ['/', '/cs', '/lessons', '/sessions/123', '/joinery', '/cs/gdpr']) {
    if (studentPath.test(path)) throw new Error(`Privacy regression: CookieConsent wrongly exempts ${path}.`);
  }
}
for (const form of ['components/StudentJoinForm.tsx', 'components/JoinCodeForm.tsx']) {
  const text = await source(form);
  if (!text.includes('/gdpr#studenti') || !text.includes('AI může navrhnout body, ale rozhoduje učitel.')) throw new Error(`Privacy regression: ${form} is missing the student privacy note.`);
}
requirePattern(nextConfig, /https:\/\/www\.googletagmanager\.com/, 'CSP does not allow the consent-gated GA4 script.');
requirePattern(nextConfig, /https:\/\/\*\.google-analytics\.com/, 'CSP does not allow consent-gated GA4 collection.');

console.log('Privacy source checks passed.');
