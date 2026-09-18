import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Privacy regression: ${message}`);
}

const [layout, cookieConsent, footer, gdpr, auth, nextConfig, marketingPreferences] = await Promise.all([
  source('app/layout.tsx'),
  source('components/CookieConsent.tsx'),
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
requirePattern(footer, /href=\{\`\/\$\{locale\}\/gdpr\`\}/, 'Locale-aware GDPR link is missing from the shared footer.');
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
