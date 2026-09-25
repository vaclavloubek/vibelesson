'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { TERMS_ACCEPTANCE_KEY } from '@/lib/legal';
import { termsReconsentPath } from '@/lib/terms-gate';
import { AI_GRADING_TOPUP_CONSENT } from '@/lib/terms-content';
import {
  AI_GRADING_TOPUP_VALIDITY_MONTHS,
  formatAiGradingTopupMoney,
  type AiGradingTopupPackCode,
} from '@/lib/ai-grading-topup-catalog';
import { AI_GRADING_TOPUP_ANCHOR, formatQuotaResetDate } from '@/lib/ai-grading-quota-communication';
import type { AiGradingTopupOffer } from '@/lib/ai-grading-topups';
import styles from './AiGradingTopupSection.module.css';

const ERROR_TEXT: Record<string, { cs: string; en: string }> = {
  topup_not_eligible: {
    cs: 'Balíček teď nejde koupit. Je potřeba aktivní předplatné Teacher Pro bez nevyřešené platby.',
    en: 'A pack cannot be bought right now. It requires an active Teacher Pro subscription without an unresolved payment.',
  },
  topup_terms_not_active: {
    cs: 'Nákup balíčků ještě není spuštěný.',
    en: 'Pack purchases are not available yet.',
  },
  terms_version_outdated: {
    cs: 'Obchodní podmínky se mezitím změnily. Obnov stránku a potvrď je znovu.',
    en: 'The Terms have changed in the meantime. Reload the page and accept them again.',
  },
  trusted_device_required: {
    cs: 'Nákup je možný jen z důvěryhodného zařízení. Spravuj zařízení výše na této stránce.',
    en: 'Purchases are possible only from a trusted device. Manage your devices above on this page.',
  },
  billing_price_not_configured: {
    cs: 'Cena balíčku zatím není nastavená. Zkus to prosím později.',
    en: 'The pack price is not configured yet. Please try again later.',
  },
};

export default function AiGradingTopupSection({
  offer,
  creditRemaining,
  creditNextExpiry,
}: {
  offer: AiGradingTopupOffer;
  creditRemaining: number;
  creditNextExpiry: string | null;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [immediateDelivery, setImmediateDelivery] = useState(false);
  const [withdrawalLoss, setWithdrawalLoss] = useState(false);
  const [busyPack, setBusyPack] = useState<AiGradingTopupPackCode | null>(null);
  const [error, setError] = useState('');
  const [returnState, setReturnState] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('topup');
    if (state === 'success' || state === 'cancelled') setReturnState(state);
  }, []);

  const consentsGiven = termsAccepted && immediateDelivery && withdrawalLoss;
  const expiry = formatQuotaResetDate(creditNextExpiry, english);
  const managedCurrency = offer.currency !== 'czk';

  async function buy(pack: AiGradingTopupPackCode) {
    if (busyPack || !consentsGiven) return;
    setBusyPack(pack);
    setError('');
    try {
      const response = await fetch('/api/billing/stripe/topup/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          pack,
          environment: 'live',
          termsAccepted: true,
          immediateDeliveryRequested: true,
          withdrawalLossAcknowledged: true,
          termsVersion: TERMS_ACCEPTANCE_KEY,
          locale,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string; message?: string };
      if (response.status === 428 || payload.error === 'terms_reconsent_required') {
        window.location.assign(termsReconsentPath(`/${locale}/subscription#${AI_GRADING_TOPUP_ANCHOR}`));
        return;
      }
      if (!response.ok || !payload.url) {
        const known = payload.error ? ERROR_TEXT[payload.error] : undefined;
        throw new Error(known ? ui(known.cs, known.en) : ui('Platbu se nepodařilo připravit. Zkus to prosím znovu.', 'The payment could not be prepared. Please try again.'));
      }
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui('Platbu se nepodařilo připravit.', 'The payment could not be prepared.'));
      setBusyPack(null);
    }
  }

  return (
    <section className={styles.card} id={AI_GRADING_TOPUP_ANCHOR} aria-labelledby="ai-grading-topup-heading">
      <div className={styles.heading}>
        <span className={styles.kicker}>{ui('Návrhy hodnocení od AI', 'AI grading suggestions')}</span>
        <h2 id="ai-grading-topup-heading">{ui('Dokoupit návrhy hodnocení od AI', 'Buy more AI grading suggestions')}</h2>
        <p>{ui(
          `Když ti dojde limit návrhů v tarifu, můžeš si dokoupit balíček. Nejdřív se čerpá limit tarifu Teacher Pro, potom dokoupené návrhy, a to nejdřív z balíčku, který dřív vyprší. Balíček platí ${AI_GRADING_TOPUP_VALIDITY_MONTHS} měsíců od zaplacení a čerpat ho lze jen s aktivním Teacher Pro.`,
          `If you run out of the suggestions in your plan, you can buy a pack. The Teacher Pro allowance is used first, then purchased suggestions, starting with the pack that expires first. A pack is valid for ${AI_GRADING_TOPUP_VALIDITY_MONTHS} months from payment and can be used only with an active Teacher Pro plan.`,
        )}</p>
        {creditRemaining > 0 ? (
          <p className={styles.balance}>
            {ui(`Dokoupené návrhy: ${creditRemaining}`, `Purchased suggestions: ${creditRemaining}`)}
            {expiry ? ui(` · nejbližší platnost do ${expiry}`, ` · earliest valid until ${expiry}`) : ''}
          </p>
        ) : null}
      </div>

      {returnState === 'success' ? (
        <div className={styles.success} role="status">
          {ui('Platba proběhla. Návrhy připíšeme hned, jak Stripe platbu potvrdí; obvykle do minuty.', 'Payment completed. The suggestions are added as soon as Stripe confirms the payment, usually within a minute.')}
        </div>
      ) : returnState === 'cancelled' ? (
        <div className={styles.notice} role="status">{ui('Platba byla zrušena, nic se neúčtovalo.', 'The payment was cancelled; nothing was charged.')}</div>
      ) : null}

      <div className={styles.consents}>
        <label className={styles.consent}>
          <input type="checkbox" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setError(''); }} disabled={busyPack !== null} />
          <span>
            {ui('Souhlasím s ', 'I agree to the ')}
            <Link href={`/${locale}/terms#ai-grading-packs`} target="_blank">{ui('obchodními podmínkami', 'Terms of Service')}</Link>
            {ui(' včetně článku o balíčcích návrhů.', ' including the article on suggestion packs.')}
          </span>
        </label>
        <label className={styles.consent}>
          <input type="checkbox" checked={immediateDelivery} onChange={(event) => { setImmediateDelivery(event.target.checked); setError(''); }} disabled={busyPack !== null} />
          <span>{ui(AI_GRADING_TOPUP_CONSENT.immediateDelivery.cs, AI_GRADING_TOPUP_CONSENT.immediateDelivery.en)}</span>
        </label>
        <label className={styles.consent}>
          <input type="checkbox" checked={withdrawalLoss} onChange={(event) => { setWithdrawalLoss(event.target.checked); setError(''); }} disabled={busyPack !== null} />
          <span>{ui(AI_GRADING_TOPUP_CONSENT.withdrawalLoss.cs, AI_GRADING_TOPUP_CONSENT.withdrawalLoss.en)}</span>
        </label>
      </div>

      <ul className={styles.packs}>
        {offer.packs.map((pack) => {
          const priceText = formatAiGradingTopupMoney(pack.price, offer.currency, english);
          const unitText = formatAiGradingTopupMoney(pack.price / pack.quantity, offer.currency, english, 2);
          return (
            <li key={pack.packCode} className={styles.pack}>
              <strong className={styles.quantity}>{ui(`${pack.quantity} návrhů`, `${pack.quantity} suggestions`)}</strong>
              <span className={styles.price}>{priceText}</span>
              <span className={styles.meta}>{ui(`${unitText} za návrh`, `${unitText} per suggestion`)}</span>
              <span className={styles.meta}>{ui(`Platnost ${AI_GRADING_TOPUP_VALIDITY_MONTHS} měsíců`, `Valid for ${AI_GRADING_TOPUP_VALIDITY_MONTHS} months`)}</span>
              <button
                type="button"
                className={styles.buy}
                onClick={() => { void buy(pack.packCode); }}
                disabled={!consentsGiven || busyPack !== null}
              >
                {busyPack === pack.packCode ? ui('Otevírám Stripe…', 'Opening Stripe…') : ui(`Koupit za ${priceText}`, `Buy for ${priceText}`)}
              </button>
            </li>
          );
        })}
      </ul>

      {managedCurrency ? (
        <p className={styles.note}>{ui(
          'Platbu v EUR a USD zpracovává Stripe, který může připočíst daň podle tvé země. Konečnou částku uvidíš před zaplacením.',
          'Payments in EUR and USD are processed by Stripe, which may add tax for your country. You will see the final amount before paying.',
        )}</p>
      ) : (
        <p className={styles.note}>{ui('Cena je konečná, nejsme plátci DPH. Doklad o platbě ti přijde e-mailem.', 'The price is final; we are not a VAT payer. You will receive the payment receipt by email.')}</p>
      )}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </section>
  );
}
