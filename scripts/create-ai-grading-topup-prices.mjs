#!/usr/bin/env node
// Creates the Stripe products and one-time prices for AI grading suggestion
// packs (3 packs x CZK/EUR/USD) and records them in private.billing_topup_prices.
// Idempotent: products have fixed ids, prices have fixed lookup keys; an
// existing active price with the right amount is reused.
//
// Tax code and tax behaviour are copied from the Teacher Pro monthly price in
// the same currency and mode (public.billing_prices), so packs follow exactly
// the subscription setup (CZK final price, EUR/USD via Managed Payments).
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgresql://... \
//     node scripts/create-ai-grading-topup-prices.mjs --mode sandbox [--dry-run]
//   LIVE (Václav only, after the legal review):
//   STRIPE_SECRET_KEY=sk_live_... DATABASE_URL=<production Neon URL> \
//     node scripts/create-ai-grading-topup-prices.mjs --mode live --confirm-live
//
// The key needs Products (write), Prices (write) and Products/Prices (read).

import { neon } from '@neondatabase/serverless';
import {
  AI_GRADING_TOPUP_PACK_CODES,
  aiGradingTopupMinorUnitPrice,
  aiGradingTopupQuantity,
} from '../lib/ai-grading-topup-catalog.ts';

const args = new Set(process.argv.slice(2));
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex > 0 ? process.argv[modeIndex + 1] : 'sandbox';
const dryRun = args.has('--dry-run');
if (mode !== 'sandbox' && mode !== 'live') throw new Error('--mode must be sandbox or live');
if (mode === 'live' && !args.has('--confirm-live')) throw new Error('LIVE requires --confirm-live');

const livemode = mode === 'live';
const secretKey = process.env.STRIPE_SECRET_KEY ?? '';
if (livemode ? !/^(?:sk|rk)_live_/.test(secretKey) : !/^(?:sk|rk)_test_/.test(secretKey)) {
  throw new Error(`STRIPE_SECRET_KEY does not match --mode ${mode}`);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = neon(process.env.DATABASE_URL);

const STRIPE_VERSION = '2026-07-29.dahlia';
const CURRENCIES = ['czk', 'eur', 'usd'];

async function stripe(method, path, params) {
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && params ? `?${params}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      'stripe-version': STRIPE_VERSION,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? params : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`stripe ${method} ${path}: ${payload.error?.code ?? response.status} ${payload.error?.message ?? ''}`.trim());
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function referenceTax(currency) {
  const rows = await sql`
    select external_price_id from public.billing_prices
    where provider = 'stripe' and livemode = ${livemode} and plan_code = 'teacher_pro'
      and billing_period = 'monthly' and currency = ${currency} and active = true
    limit 1
  `;
  if (!rows[0]) throw new Error(`no active Teacher Pro monthly ${currency} price for ${mode}`);
  const price = await stripe('GET', `prices/${rows[0].external_price_id}`, new URLSearchParams({ 'expand[]': 'product' }));
  return { taxBehavior: price.tax_behavior ?? 'unspecified', taxCode: price.product?.tax_code?.id ?? price.product?.tax_code ?? null };
}

async function ensureProduct(packCode, taxCode) {
  const id = `syllonaut_ai_${packCode}`;
  try {
    const existing = await stripe('GET', `products/${id}`);
    if (taxCode && (existing.tax_code?.id ?? existing.tax_code) !== taxCode && !dryRun) {
      await stripe('POST', `products/${id}`, new URLSearchParams({ tax_code: taxCode }));
    }
    return id;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const quantity = aiGradingTopupQuantity(packCode);
  const params = new URLSearchParams({
    id,
    name: `Syllonaut – ${quantity} AI grading suggestions`,
    description: `One-time pack of ${quantity} AI grading suggestions for Teacher Pro, valid 12 months.`,
    'metadata[syllonaut_pack_code]': packCode,
    'metadata[syllonaut_purchase_kind]': 'ai_grading_topup',
  });
  if (taxCode) params.set('tax_code', taxCode);
  if (dryRun) { console.log('[dry-run] create product', id); return id; }
  await stripe('POST', 'products', params);
  return id;
}

async function ensurePrice(packCode, currency, productId, taxBehavior) {
  const lookupKey = `syllonaut_ai_${packCode}_${currency}`;
  const unitAmount = aiGradingTopupMinorUnitPrice(packCode, currency);
  const found = await stripe('GET', 'prices', new URLSearchParams({ 'lookup_keys[]': lookupKey, active: 'true', limit: '1' }));
  const existing = found.data?.[0];
  if (existing && existing.unit_amount === unitAmount && existing.currency === currency && existing.type === 'one_time') {
    return existing.id;
  }
  const params = new URLSearchParams({
    product: productId,
    currency,
    unit_amount: String(unitAmount),
    lookup_key: lookupKey,
    transfer_lookup_key: 'true',
    'metadata[syllonaut_pack_code]': packCode,
  });
  if (taxBehavior && taxBehavior !== 'unspecified') params.set('tax_behavior', taxBehavior);
  if (dryRun) { console.log('[dry-run] create price', lookupKey, unitAmount); return existing?.id ?? null; }
  const created = await stripe('POST', 'prices', params);
  return created.id;
}

const results = [];
for (const currency of CURRENCIES) {
  const { taxBehavior, taxCode } = await referenceTax(currency);
  for (const packCode of AI_GRADING_TOPUP_PACK_CODES) {
    const productId = await ensureProduct(packCode, taxCode);
    const priceId = await ensurePrice(packCode, currency, productId, taxBehavior);
    results.push({ packCode, currency, priceId, taxBehavior, taxCode });
    if (!dryRun && priceId) {
      await sql.transaction([
        sql`update private.billing_topup_prices set active = false, updated_at = now()
            where pack_code = ${packCode} and currency = ${currency} and livemode = ${livemode}
              and active and external_price_id <> ${priceId}`,
        sql`insert into private.billing_topup_prices (pack_code, currency, livemode, external_price_id, active)
            values (${packCode}, ${currency}, ${livemode}, ${priceId}, true)
            on conflict (external_price_id) do update set active = true, updated_at = now()`,
      ]);
    }
  }
}
console.table(results);
