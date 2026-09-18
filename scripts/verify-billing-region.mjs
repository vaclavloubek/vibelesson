const {
  billingRouteForCountry,
  pricingCurrencyForCountry,
  resolvePricingCurrency,
} = await import('../lib/billing-region.ts');

function expect(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Billing-region regression: ${label}: expected ${expected}, got ${actual}`);
  }
}

expect(pricingCurrencyForCountry('CZ'), 'czk', 'Czechia uses CZK');
expect(pricingCurrencyForCountry('DE'), 'eur', 'Germany uses EUR');
expect(pricingCurrencyForCountry('BG'), 'eur', 'Bulgaria uses EUR');
expect(pricingCurrencyForCountry('US'), 'usd', 'United States uses USD');
expect(resolvePricingCurrency(null, 'cs-CZ,cs;q=0.9,en;q=0.8'), 'czk', 'Czech locale fallback uses CZK');
expect(resolvePricingCurrency(null, 'de-DE,de;q=0.9,en;q=0.8'), 'eur', 'German locale fallback uses EUR');
expect(resolvePricingCurrency(null, 'en-US,en;q=0.9'), 'usd', 'US locale fallback uses USD');

const czRoute = billingRouteForCountry('CZ');
expect(czRoute.currency, 'czk', 'CZ checkout currency');
expect(czRoute.managedPayments, false, 'CZ uses standard Stripe');

const deRoute = billingRouteForCountry('DE');
expect(deRoute.currency, 'eur', 'DE checkout currency');
expect(deRoute.managedPayments, true, 'DE uses Managed Payments');

const usRoute = billingRouteForCountry('US');
expect(usRoute.currency, 'usd', 'US checkout currency');
expect(usRoute.managedPayments, true, 'US uses Managed Payments');

console.log('Billing-region routing checks passed.');
