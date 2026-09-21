import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Terms regression: ${message}`);
}

const [terms, termsAlias, footer, auth, pricing, checkoutRoute, stripeCheckout, school, organizationRoute] = await Promise.all([
  source('app/terms/page.tsx'),
  source('app/[locale]/terms/page.tsx'),
  source('components/SiteFooter.tsx'),
  source('components/AuthControls.tsx'),
  source('components/PricingPage.tsx'),
  source('app/api/billing/stripe/checkout/route.ts'),
  source('lib/stripe-checkout.ts'),
  source('components/SchoolAdmin.tsx'),
  source('app/api/organizations/route.ts'),
]);

requirePattern(terms, /Obchodní podmínky/, 'Czech Terms page is missing.');
requirePattern(terms, /Terms and Conditions/, 'English Terms content is missing.');
requirePattern(terms, /88878431/, 'provider Business ID is missing.');
requirePattern(terms, /14 dnů/, 'consumer withdrawal information is missing.');
requirePattern(terms, /Českou obchodní inspekci/, 'ADR information is missing.');
requirePattern(termsAlias, /app\/terms\/page/, 'locale Terms route alias is missing.');
requirePattern(footer, /\$\{locale\}\/terms/, 'Terms are missing from the shared footer.');

requirePattern(auth, /checked=\{termsAccepted\}/, 'signup Terms checkbox is missing.');
requirePattern(auth, /terms_version:\s*TERMS_VERSION/, 'signup Terms version is not recorded.');
requirePattern(auth, /privacy_notice_acknowledged_at/, 'signup privacy acknowledgement is not recorded.');
requirePattern(auth, /disabled=\{busy \|\| !captchaToken \|\| !termsAccepted\}/, 'signup submit is not gated by Terms acceptance.');

requirePattern(pricing, /checked=\{checkoutTermsAccepted\}/, 'individual checkout Terms checkbox is missing.');
requirePattern(pricing, /checked=\{earlyPerformanceRequested\}/, 'individual checkout immediate-performance request is missing.');
requirePattern(pricing, /termsVersion:\s*TERMS_VERSION/, 'individual checkout does not send Terms version.');
requirePattern(checkoutRoute, /termsAccepted:\s*z\.literal\(true\)/, 'individual checkout server does not enforce Terms acceptance.');
requirePattern(checkoutRoute, /earlyPerformanceRequested:\s*z\.literal\(true\)/, 'individual checkout server does not enforce immediate-performance request.');
requirePattern(stripeCheckout, /syllonaut_terms_version/, 'Stripe metadata does not record Terms version.');
requirePattern(stripeCheckout, /syllonaut_early_performance_requested/, 'Stripe metadata does not record immediate-performance request.');

requirePattern(school, /checked=\{termsAccepted\}/, 'school-order Terms checkbox is missing.');
requirePattern(school, /termsVersion:\s*TERMS_VERSION/, 'school order does not send Terms version.');
requirePattern(organizationRoute, /termsAccepted:\s*z\.literal\(true\)/, 'school-order server does not enforce Terms acceptance.');
requirePattern(organizationRoute, /termsAcceptedAt:\s*acceptedAt/, 'school-order acceptance timestamp is not persisted.');

console.log('Terms source checks passed.');
