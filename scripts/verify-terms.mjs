import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const auth = read('components/AuthControls.tsx');
const pricing = read('components/PricingPage.tsx');
const school = read('components/SchoolAdmin.tsx');
const individualApi = read('app/api/billing/stripe/checkout/route.ts');
const schoolApi = read('app/api/organizations/route.ts');
const footer = read('components/SiteFooter.tsx');
const proxy = read('proxy.ts');
const terms = read('app/terms/page.tsx');

const fail = (message) => { throw new Error('[terms] ' + message); };

if (!footer.includes('/terms')) fail('footer must link to Terms');
if (!proxy.includes("pathname === '/terms'")) fail('/terms must use locale gateway');
if (!auth.includes('termsAccepted') || !auth.includes('terms_acceptance_version')) fail('registration must require and record Terms acceptance');
if (!pricing.includes('termsAccepted') || !pricing.includes('immediatePerformanceRequested')) fail('individual paid checkout must require Terms and immediate-service request');
if (!individualApi.includes('termsAccepted: z.literal(true)') || !individualApi.includes('immediatePerformanceRequested: z.literal(true)')) fail('individual checkout server must fail closed without acceptance');
if (!school.includes('termsAccepted') || !schoolApi.includes('termsAccepted: z.literal(true)')) fail('school ordering must require Terms on client and server');
if (!terms.includes('88878431') || !terms.includes('14') || !terms.includes('coi.gov.cz')) fail('Terms page is missing provider or consumer-rights essentials');
console.log('Terms acceptance contract OK');
