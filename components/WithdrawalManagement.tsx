'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './SubscriptionManagement.module.css';

type Quote = {
  kind: 'eligible' | 'manual_review' | 'unavailable' | 'in_progress' | 'completed';
  reason?: string;
  currency?: 'czk' | 'eur' | 'usd';
  withdrawalDeadline?: string;
  calculation?: {
    retainedAmountMinor: number;
    targetTotalRefundMinor: number;
    refundNowMinor: number;
    withdrawalDeadline: string;
    priorRefundedMinor: number;
  };
  retainedAmountMinor?: number;
  targetTotalRefundMinor?: number;
  refundAmountMinor?: number;
  status?: string;
  failureStage?: string | null;
  failureCode?: string | null;
};

function formatMoney(amount: number, currency: 'czk' | 'eur' | 'usd', english: boolean) {
  return new Intl.NumberFormat(english ? 'en-US' : 'cs-CZ', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: currency === 'czk' ? 0 : 2,
    maximumFractionDigits: currency === 'czk' ? 0 : 2,
  }).format(amount / 100);
}

function formatDateTime(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export default function WithdrawalManagement() {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadQuote() {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setConfirmed(false);
    try {
      const response = await fetch('/api/billing/stripe/withdrawal', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json() as Quote & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'withdrawal_quote_failed');
      setQuote(payload);
    } catch {
      setError(ui(
        'Výpočet odstoupení se nepodařilo načíst. Zkus to znovu nebo napiš na vaclav@syllonaut.com.',
        'The withdrawal calculation could not be loaded. Try again or email vaclav@syllonaut.com.',
      ));
    } finally {
      setBusy(false);
    }
  }

  async function confirmWithdrawal() {
    if (busy || !confirmed) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/billing/stripe/withdrawal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ confirm: true }),
      });
      const payload = await response.json() as {
        completed?: boolean;
        retainedAmountMinor?: number;
        targetTotalRefundMinor?: number;
        refundAmountMinor?: number;
        currency?: 'czk' | 'eur' | 'usd';
        error?: string;
        reason?: string;
      };
      if (!response.ok || !payload.completed) {
        if (response.status === 409) {
          setQuote({ kind: 'manual_review', reason: payload.reason ?? 'manual_review' });
          return;
        }
        throw new Error(payload.error ?? 'withdrawal_failed');
      }

      const currency = payload.currency ?? quote?.currency ?? 'czk';
      const refunded = payload.refundAmountMinor ?? 0;
      const retained = payload.retainedAmountMinor ?? 0;
      setSuccess(ui(
        `Odstoupení bylo přijato. Předplatné bylo ukončeno. Vracíme ${formatMoney(refunded, currency, false)}; za již poskytnutou službu zůstává poměrná úhrada ${formatMoney(retained, currency, false)}.`,
        `Your withdrawal was accepted and the subscription was ended. We are refunding ${formatMoney(refunded, currency, true)}; the pro-rata charge for service already supplied is ${formatMoney(retained, currency, true)}.`,
      ));
      setQuote({ kind: 'completed', currency });
      window.setTimeout(() => router.refresh(), 900);
    } catch {
      setError(ui(
        'Odstoupení se nepodařilo dokončit automaticky. Záznam požadavku je zachovaný; napiš na vaclav@syllonaut.com a nic neopakuj přes Stripe Portal.',
        'The withdrawal could not be completed automatically. Your request record has been preserved; email vaclav@syllonaut.com and do not repeat the refund in the Stripe Portal.',
      ));
    } finally {
      setBusy(false);
    }
  }

  const manual = quote?.kind === 'manual_review';
  const expired = quote?.kind === 'unavailable' && quote.reason === 'withdrawal_window_expired';
  const eligible = quote?.kind === 'eligible' && quote.calculation && quote.currency;
  const resumable = quote?.kind === 'in_progress' && quote.currency;

  return (
    <section className={styles.withdrawalCard}>
      <div className={styles.changeHeading}>
        <span className={styles.kicker}>{ui('Spotřebitelské právo', 'Consumer right')}</span>
        <h2>{ui('Odstoupení do 14 dnů', '14-day withdrawal')}</h2>
        <p>{ui(
          'U prvního nákupu může spotřebitel během zákonné lhůty odstoupit přímo tady. Pokud služba začala na tvou výslovnou žádost ihned, Syllonaut ponechá jen časově poměrnou část ceny; využití AI kvóty samo o sobě částku nezvyšuje.',
          'For an initial purchase, a consumer can withdraw here during the statutory period. If service started immediately at your express request, Syllonaut keeps only the time-based pro-rata amount; AI allowance usage does not increase that amount by itself.',
        )}</p>
      </div>

      {!quote ? (
        <button type="button" className={styles.secondary} onClick={loadQuote} disabled={busy}>
          {busy ? ui('Počítám…', 'Calculating…') : ui('Zjistit možnost odstoupení', 'Check withdrawal option')}
        </button>
      ) : null}

      {eligible ? (
        <div className={styles.withdrawalQuote}>
          <div>
            <span>{ui('Poměrná úhrada za dosavadní službu', 'Pro-rata charge for service supplied')}</span>
            <strong>{formatMoney(quote.calculation!.retainedAmountMinor, quote.currency!, english)}</strong>
          </div>
          <div>
            <span>{ui('Celkem má být vráceno', 'Total amount to be refunded')}</span>
            <strong>{formatMoney(quote.calculation!.targetTotalRefundMinor, quote.currency!, english)}</strong>
          </div>
          {quote.calculation!.priorRefundedMinor > 0 ? (
            <div>
              <span>{ui('Z toho již vráceno', 'Already refunded')}</span>
              <strong>{formatMoney(quote.calculation!.priorRefundedMinor, quote.currency!, english)}</strong>
            </div>
          ) : null}
          <p>{ui(
            `Lhůta podle tohoto záznamu končí ${formatDateTime(quote.calculation!.withdrawalDeadline, false)}. Konečný výpočet se provede serverovým časem při potvrzení.`,
            `The recorded deadline is ${formatDateTime(quote.calculation!.withdrawalDeadline, true)}. The final calculation uses server time when you confirm.`,
          )}</p>
          <label className={styles.withdrawalConfirm}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />
            <span>{ui(
              'Výslovně odstupuji od smlouvy a žádám o okamžité ukončení placené služby a vrácení vypočtené částky.',
              'I expressly withdraw from the contract and request immediate termination of the paid service and refund of the calculated amount.',
            )}</span>
          </label>
          <button type="button" className={styles.danger} onClick={confirmWithdrawal} disabled={busy || !confirmed}>
            {busy ? ui('Zpracovávám odstoupení…', 'Processing withdrawal…') : ui('Odstoupit a ukončit předplatné', 'Withdraw and end subscription')}
          </button>
        </div>
      ) : null}

      {resumable ? (
        <div className={styles.warning} role="status">
          <strong>{ui('Odstoupení už bylo zaznamenáno, ale technické dokončení vyžaduje pokračovat.', 'Your withdrawal is recorded, but technical completion still needs to continue.')}</strong>
          <p>{ui(
            'Stejný požadavek lze bezpečně zopakovat — refund i zrušení Stripe jsou idempotentní a nevytvoří se druhé odstoupení.',
            'The same request can be safely retried — both the refund and Stripe cancellation are idempotent and no second withdrawal is created.',
          )}</p>
          <label className={styles.withdrawalConfirm}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />
            <span>{ui('Pokračovat v dokončení zaznamenaného odstoupení.', 'Continue completing the recorded withdrawal.')}</span>
          </label>
          <button type="button" className={styles.danger} onClick={confirmWithdrawal} disabled={busy || !confirmed}>
            {ui('Dokončit odstoupení', 'Complete withdrawal')}
          </button>
        </div>
      ) : null}

      {manual ? (
        <div className={styles.notice}>
          {ui(
            'Tento případ nelze bezpečně spočítat automaticky (např. starší nákup bez neměnného snapshotu, změna tarifu nebo platební spor). Právo odstoupit tím není odmítnuto — napiš na vaclav@syllonaut.com a případ vyřešíme ručně.',
            'This case cannot be calculated safely automatically (for example, an older purchase without an immutable snapshot, a plan change or a payment dispute). This does not reject your withdrawal right — email vaclav@syllonaut.com for manual processing.',
          )}
        </div>
      ) : null}

      {expired ? (
        <div className={styles.notice}>
          {ui(
            'Automatický 14denní withdrawal flow už podle evidovaného data není dostupný. Pokud máš za to, že lhůta stále běží nebo nastala chyba, napiš na vaclav@syllonaut.com.',
            'The automated 14-day withdrawal flow is no longer available according to the recorded date. If you believe the period is still open or the record is wrong, email vaclav@syllonaut.com.',
          )}
        </div>
      ) : null}

      {quote?.kind === 'unavailable' && !expired ? (
        <div className={styles.notice}>
          {ui('Pro toto předplatné teď není automatické odstoupení k dispozici.', 'Automated withdrawal is not available for this subscription now.')}
        </div>
      ) : null}

      {quote?.kind === 'completed' || success ? (
        <div className={styles.success} role="status">
          {success || ui('Odstoupení je dokončené.', 'Withdrawal is complete.')}
        </div>
      ) : null}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </section>
  );
}
