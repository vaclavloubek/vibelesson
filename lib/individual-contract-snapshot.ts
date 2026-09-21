import { createHash } from 'node:crypto';
import { individualMinorUnitPrice, type IndividualBillingCurrency } from '@/lib/individual-billing-catalog';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';
import { renderTermsDocumentAttachmentHtml, renderWithdrawalFormHtml, type LegalLocale } from '@/lib/terms-document';
import type { BillingPeriod, IndividualPlanCode } from '@/lib/subscription-change-policy';

export type IndividualContractSnapshotInput = {
  snapshotId: string;
  locale: LegalLocale;
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
  currency: IndividualBillingCurrency;
  immediatePerformanceRequested: true;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

export function formatContractMoney(amountMinor: number, currency: IndividualBillingCurrency, locale: LegalLocale) {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: currency === 'czk' ? 0 : 2,
    maximumFractionDigits: currency === 'czk' ? 0 : 2,
  }).format(amountMinor / 100);
}

export type IndividualContractSnapshotHashInput = {
  snapshotId: string;
  locale: LegalLocale;
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
  currency: IndividualBillingCurrency;
  amountMinor: number;
  termsVersion: string;
  termsAcceptanceKey: string;
  immediatePerformanceRequested: boolean;
  contractHtml: string;
  withdrawalHtml: string;
};

export function hashIndividualContractSnapshot(input: IndividualContractSnapshotHashInput) {
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

export function buildIndividualContractSnapshot(input: IndividualContractSnapshotInput) {
  const amountMinor = individualMinorUnitPrice(input.planCode, input.billingPeriod, input.currency);
  const planName = input.planCode === 'teacher_pro' ? 'Teacher Pro' : 'Teacher';
  const price = formatContractMoney(amountMinor, input.currency, input.locale);
  const billingLabel = input.locale === 'cs'
    ? (input.billingPeriod === 'annual' ? 'roční' : 'měsíční')
    : (input.billingPeriod === 'annual' ? 'annual' : 'monthly');
  const renewal = input.locale === 'cs'
    ? `Předplatné se automaticky obnovuje po každém ${billingLabel}m fakturačním období, dokud automatické obnovení nezrušíte.`
    : `The subscription renews automatically after each ${billingLabel} billing period until you cancel automatic renewal.`;
  const immediate = input.locale === 'cs'
    ? 'Výslovná žádost o zahájení poskytování služby před uplynutím 14denní lhůty: ANO.'
    : 'Express request to begin providing the service before the 14-day withdrawal period expires: YES.';
  const consumerNote = input.locale === 'cs'
    ? 'Jste-li spotřebitel, zpravidla můžete od smlouvy odstoupit do 14 dnů od jejího uzavření. Pokud jste požádali o okamžité zahájení služby a poté odstoupíte, může být účtována poměrná část ceny za skutečně poskytnuté plnění.'
    : 'If you are a consumer, you generally have 14 days from conclusion of the contract to withdraw. If you requested immediate performance and later withdraw, a proportionate amount may be charged for the service actually supplied.';
  const termsHtml = renderTermsDocumentAttachmentHtml(input.locale);
  const withdrawalHtml = renderWithdrawalFormHtml(input.locale);
  const contractHtml = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><title>Syllonaut — ${escapeHtml(planName)}</title>
<style>body{font-family:Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 24px;color:#171821;line-height:1.55}h1{font-size:28px}h2{font-size:20px;margin-top:28px}.box{border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0}.meta{color:#666;font-size:13px}table{border-collapse:collapse;width:100%}td{padding:8px;border-bottom:1px solid #eee;vertical-align:top}td:first-child{font-weight:700;width:34%}</style></head><body>
<h1>${input.locale === 'cs' ? 'Potvrzení smlouvy Syllonaut' : 'Syllonaut contract confirmation'}</h1>
<p class="meta">${input.locale === 'cs' ? 'Neměnný identifikátor snapshotu' : 'Immutable snapshot identifier'}: ${escapeHtml(input.snapshotId)}</p>
<div class="box"><table>
<tr><td>${input.locale === 'cs' ? 'Poskytovatel' : 'Provider'}</td><td>Václav Loubek, IČO 88878431, Slepá 868, 289 24 Milovice – Mladá, Czech Republic</td></tr>
<tr><td>${input.locale === 'cs' ? 'Tarif' : 'Plan'}</td><td>${escapeHtml(planName)}</td></tr>
<tr><td>${input.locale === 'cs' ? 'Cena' : 'Price'}</td><td>${escapeHtml(price)}</td></tr>
<tr><td>${input.locale === 'cs' ? 'Fakturační období' : 'Billing period'}</td><td>${escapeHtml(billingLabel)}</td></tr>
<tr><td>${input.locale === 'cs' ? 'Automatické obnovení' : 'Automatic renewal'}</td><td>${escapeHtml(renewal)}</td></tr>
<tr><td>${input.locale === 'cs' ? 'Obchodní podmínky' : 'Terms'}</td><td>${TERMS_VERSION} / ${TERMS_ACCEPTANCE_KEY}</td></tr>
<tr><td>${input.locale === 'cs' ? 'Okamžité zahájení služby' : 'Immediate performance'}</td><td>${escapeHtml(immediate)}</td></tr>
</table></div>
<p>${escapeHtml(consumerNote)}</p>
<h2>${input.locale === 'cs' ? 'Znění přijatých obchodních podmínek' : 'Accepted Terms of Service'}</h2>
${termsHtml.replace(/^<!doctype html>[\s\S]*?<body>/i, '').replace(/<\/body><\/html>\s*$/i, '')}
</body></html>`;

  const contentSha256 = hashIndividualContractSnapshot({
    snapshotId: input.snapshotId,
    locale: input.locale,
    planCode: input.planCode,
    billingPeriod: input.billingPeriod,
    currency: input.currency,
    amountMinor,
    termsVersion: TERMS_VERSION,
    termsAcceptanceKey: TERMS_ACCEPTANCE_KEY,
    immediatePerformanceRequested: input.immediatePerformanceRequested,
    contractHtml,
    withdrawalHtml,
  });

  return {
    amountMinor,
    termsVersion: TERMS_VERSION,
    termsAcceptanceKey: TERMS_ACCEPTANCE_KEY,
    contractHtml,
    withdrawalHtml,
    contentSha256,
  };
}
