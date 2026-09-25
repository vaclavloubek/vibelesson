import type { IndividualBillingCurrency } from '@/lib/individual-billing-catalog';

// One-time AI grading suggestion packs for individual Teacher Pro (phase 2).
// Syllonaut is not a VAT payer; CZK prices are final. EUR/USD go through Stripe
// Managed Payments with the same tax behaviour as the Teacher Pro subscription.
export type AiGradingTopupPackCode = 'grading_60' | 'grading_100' | 'grading_200';

export const AI_GRADING_TOPUP_PACK_CODES = ['grading_60', 'grading_100', 'grading_200'] as const satisfies readonly AiGradingTopupPackCode[];

export const AI_GRADING_TOPUP_VALIDITY_MONTHS = 12;

export const AI_GRADING_TOPUP_PACKS: Record<
  AiGradingTopupPackCode,
  { quantity: number; prices: Record<IndividualBillingCurrency, number> }
> = {
  grading_60: { quantity: 60, prices: { czk: 99, eur: 3.99, usd: 4.49 } },
  grading_100: { quantity: 100, prices: { czk: 149, eur: 5.99, usd: 6.49 } },
  grading_200: { quantity: 200, prices: { czk: 279, eur: 11.49, usd: 12.49 } },
};

export function isAiGradingTopupPackCode(value: unknown): value is AiGradingTopupPackCode {
  return typeof value === 'string' && (AI_GRADING_TOPUP_PACK_CODES as readonly string[]).includes(value);
}

export function aiGradingTopupQuantity(packCode: AiGradingTopupPackCode) {
  return AI_GRADING_TOPUP_PACKS[packCode].quantity;
}

export function aiGradingTopupDisplayPrice(packCode: AiGradingTopupPackCode, currency: IndividualBillingCurrency) {
  return AI_GRADING_TOPUP_PACKS[packCode].prices[currency];
}

export function aiGradingTopupMinorUnitPrice(packCode: AiGradingTopupPackCode, currency: IndividualBillingCurrency) {
  return Math.round(aiGradingTopupDisplayPrice(packCode, currency) * 100);
}

// Price per suggestion, for display only.
export function aiGradingTopupUnitPrice(packCode: AiGradingTopupPackCode, currency: IndividualBillingCurrency) {
  return aiGradingTopupDisplayPrice(packCode, currency) / aiGradingTopupQuantity(packCode);
}

export function formatAiGradingTopupMoney(amount: number, currency: IndividualBillingCurrency, english: boolean, fractionDigits?: number) {
  const digits = fractionDigits ?? (currency === 'czk' && Number.isInteger(amount) ? 0 : 2);
  return new Intl.NumberFormat(english ? 'en-US' : 'cs-CZ', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
