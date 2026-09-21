import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  INDIVIDUAL_PLAN_ALLOWANCES,
  individualDisplayPrice,
  individualMinorUnitPrice,
  pricingPagePrice,
} from '../lib/individual-billing-catalog.ts';
import {
  ORGANIZATION_PLANS,
  organizationMinorUnitPrice,
  organizationPricingPagePrice,
} from '../lib/organization-billing-catalog.ts';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

for (const planCode of ['teacher', 'teacher_pro']) {
  const publicPrice = pricingPagePrice(planCode);
  for (const [period, prefix] of [['monthly', 'monthly'], ['annual', 'annual']]) {
    for (const [currency, suffix] of [['czk', 'Czk'], ['eur', 'Eur'], ['usd', 'Usd']]) {
      const display = individualDisplayPrice(planCode, period, currency);
      assert.equal(publicPrice[`${prefix}${suffix}`], display);
      assert.equal(individualMinorUnitPrice(planCode, period, currency), Math.round(display * 100));
    }
  }
}

for (const planCode of ['team', 'school', 'campus']) {
  const publicPrice = organizationPricingPagePrice(planCode);
  const plan = ORGANIZATION_PLANS[planCode];
  for (const [period, prefix] of [['monthly', 'monthly'], ['annual', 'annual']]) {
    for (const [currency, suffix] of [['czk', 'Czk'], ['eur', 'Eur'], ['usd', 'Usd']]) {
      const display = plan.prices[period][currency];
      assert.equal(publicPrice[`${prefix}${suffix}`], display);
      assert.equal(organizationMinorUnitPrice(planCode, period, currency), Math.round(display * 100));
    }
  }
}

const [
  pricingSource,
  individualCheckoutSource,
  organizationOrderSource,
  snapshotSource,
  billingEmailSource,
  termsSource,
  termsContentSource,
] = await Promise.all([
  source('components/PricingPage.tsx'),
  source('app/api/billing/stripe/checkout/route.ts'),
  source('app/api/organizations/route.ts'),
  source('lib/individual-contract-snapshot.ts'),
  source('lib/billing-email.ts'),
  source('app/terms/page.tsx'),
  source('lib/terms-content.ts'),
]);

assert(pricingSource.includes("pricingPagePrice('teacher')"));
assert(pricingSource.includes("pricingPagePrice('teacher_pro')"));
for (const plan of ['team', 'school', 'campus']) {
  assert(pricingSource.includes(`organizationPricingPagePrice('${plan}')`));
  assert(pricingSource.includes(`ORGANIZATION_PLANS.${plan}.seatLimit`));
  assert(pricingSource.includes(`ORGANIZATION_PLANS.${plan}.monthlyLessonLimit`));
  assert(pricingSource.includes(`ORGANIZATION_PLANS.${plan}.monthlyRevisionLimit`));
}
assert(!pricingSource.includes('monthlyCzk: 890'));
assert(!pricingSource.includes('monthlyCzk: 2390'));
assert(!pricingSource.includes('monthlyCzk: 5990'));

assert(individualCheckoutSource.includes('individualMinorUnitPrice(planCode, input.billing, route.currency)'));
assert(individualCheckoutSource.includes('amountMinor,'));
assert(individualCheckoutSource.includes("eq('plan_code', planCode)"));
assert(individualCheckoutSource.includes("eq('billing_period', input.billing)"));
assert(individualCheckoutSource.includes("eq('currency', route.currency)"));

assert(organizationOrderSource.includes('organizationMinorUnitPrice('));
assert(organizationOrderSource.includes('p_amount_minor: amountMinor'));
assert(organizationOrderSource.includes('p_billing_period: input.billingPeriod'));
assert(organizationOrderSource.includes('p_payment_method: input.paymentMethod'));

assert(snapshotSource.includes('formatMoney(input.amountMinor, input.currency, locale)'));
assert(snapshotSource.includes("input.billingPeriod === 'annual'"));
assert(snapshotSource.includes('Automatické obnovení'));
assert(snapshotSource.includes('Automatic renewal'));
assert(snapshotSource.includes('TERMS_PLAN_PRICING_CLAUSE'));

assert(billingEmailSource.includes('contractSnapshot.amount_minor'));
assert(billingEmailSource.includes('contractSnapshot.billing_period'));
assert(billingEmailSource.includes('automatic renewal'));
assert(billingEmailSource.includes('INDIVIDUAL_PLAN_ALLOWANCES'));

assert(termsSource.includes('TERMS_PLAN_PRICING_CLAUSE'));
assert(termsContentSource.includes('následný platební doklad již sjednané podmínky jednostranně nemění'));
assert(termsContentSource.includes('later payment document does not unilaterally change the terms already agreed'));

for (const planCode of ['teacher', 'teacher_pro']) {
  assert(INDIVIDUAL_PLAN_ALLOWANCES[planCode].lessonGenerations > 0);
  assert(INDIVIDUAL_PLAN_ALLOWANCES[planCode].aiEdits > 0);
}

console.log('Offer → checkout → contract snapshot → email consistency: OK');
