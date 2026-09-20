import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Terms regression: ${message}`);
}

const [terms, footer, proxy, auth, pricing, pricingApi, stripe, school, schoolApi, legal] = await Promise.all([
  source('app/terms/page.tsx'),
  source('components/SiteFooter.tsx'),
  source('proxy.ts'),
  source('components/AuthControls.tsx'),
  source('components/PricingPage.tsx'),
  source('app/api/billing/stripe/checkout/route.ts'),
  source('lib/stripe-checkout.ts'),
  source('components/SchoolAdmin.tsx'),
  source('app/api/organizations/route.ts'),
  source('lib/legal.ts'),
]);

requirePattern(legal, /TERMS_VERSION\s*=\s*'1\.0'/, 'canonical terms version is missing.');
requirePattern(terms, /IČO: 88878431/, 'provider identification is incomplete.');
requirePattern(terms, /289 24 Milovice/, 'provider registered address is incomplete.');
requirePattern(terms, /14denní lhůtě/, 'consumer withdrawal information is missing.');
requirePattern(terms, /Vzor oznámení o odstoupení/, 'model withdrawal notice is missing.');
requirePattern(terms, /Česká obchodní inspekce/, 'consumer ADR information is missing.');
requirePattern(terms, /obnovuje automaticky/, 'automatic-renewal terms are missing.');
requirePattern(footer, /href=\{\`\/\$\{locale\}\/terms\`\}/, 'locale-aware Terms link is missing from the shared footer.');
requirePattern(proxy, /pathname === '\/terms'/, 'direct Terms route is not localized.');
requirePattern(auth, /terms_accepted:\s*true/, 'registration acceptance is not persisted in signup metadata.');
requirePattern(auth, /terms_version:\s*TERMS_VERSION/, 'registration terms version is not persisted.');
requirePattern(auth, /checked=\{termsAccepted\}[\s\S]*required/, 'registration Terms checkbox is not required.');
requirePattern(pricing, /checkoutTermsAccepted/, 'individual checkout Terms acceptance is missing.');
requirePattern(pricing, /checkoutImmediateAccess/, 'individual checkout immediate-access request is missing.');
requirePattern(pricingApi, /legal_acceptance_required/, 'live individual checkout does not fail closed without legal acceptance.');
requirePattern(pricingApi, /input\.termsVersion !== TERMS_VERSION/, 'live individual checkout does not enforce the current Terms version.');
requirePattern(stripe, /syllonaut_terms_version/, 'Stripe checkout metadata does not record the Terms version.');
requirePattern(stripe, /syllonaut_terms_accepted_at/, 'Stripe checkout metadata does not record server acceptance time.');
requirePattern(stripe, /syllonaut_immediate_access_requested/, 'Stripe checkout metadata does not record the immediate-access request.');
requirePattern(school, /authorityConfirmed/, 'school order authority confirmation is missing.');
requirePattern(school, /Objednávka zavazující k platbě/, 'school card order button does not clearly communicate payment obligation.');
requirePattern(schoolApi, /legal_acceptance_required/, 'live school ordering does not fail closed without legal acceptance.');
requirePattern(schoolApi, /legalAcceptance/, 'school order billing snapshot does not preserve legal acceptance evidence.');
requirePattern(schoolApi, /acceptedByUserId:\s*userId/, 'school order acceptance does not preserve the acting user.');

console.log('Terms and legal acceptance source checks passed.');
