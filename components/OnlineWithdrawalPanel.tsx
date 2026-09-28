'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { OnlineWithdrawalOpportunity } from '@/lib/online-withdrawal';
import styles from './SubscriptionManagement.module.css';

function formatDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

// Withdrawal from contract (LEGAL-012), the last block of the Subscription page.
export default function OnlineWithdrawalPanel({
  withdrawalOpportunity,
  accountEmail,
}: {
  withdrawalOpportunity: OnlineWithdrawalOpportunity | null;
  accountEmail: string;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const [consumerName, setConsumerName] = useState('');
  const [electronicContact, setElectronicContact] = useState(accountEmail);
  const [consumerConfirmed, setConsumerConfirmed] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState('');
  const [withdrawalError, setWithdrawalError] = useState('');
  const [submittedReceipt, setSubmittedReceipt] = useState<string | null>(withdrawalOpportunity?.receiptId ?? null);
  const [confirmationSent, setConfirmationSent] = useState(withdrawalOpportunity?.confirmationStatus === 'sent');

  const publicForm = `/${locale}/withdrawal`;
  const alreadySubmitted = submittedReceipt || withdrawalOpportunity?.receiptId;
  return (
    <section className={styles.withdrawalCard} id="withdrawal">
      <div className={styles.changeHeading}>
        <span className={styles.kicker}>{ui('Právo spotřebitele', 'Consumer right')}</span>
        <h2>{ui('Odstoupení od smlouvy', 'Withdrawal from contract')}</h2>
        <p>{ui(
          'Zákonný vzorový formulář zůstává dostupný každému. Online odstoupení se zpřístupní u konkrétní individuální placené smlouvy během její 14denní lhůty.',
          'The statutory model form remains available to everyone. Online withdrawal is enabled for a specific individual paid contract during its 14-day period.',
        )}</p>
      </div>

      {alreadySubmitted ? (
        <div className={styles.success} role="status">
          <strong>{ui('Odstoupení jsme přijali.', 'We received your withdrawal.')}</strong>
          <span>{ui(' Číslo potvrzení: ', ' Receipt ID: ')}{alreadySubmitted}.</span>
          {confirmationSent
            ? <span> {ui('Potvrzení jsme odeslali e-mailem.', 'We sent the confirmation by email.')}</span>
            : <span> {withdrawalOpportunity?.confirmationStatus === 'pending'
              ? ui(' Doručení e-mailového potvrzení ještě čeká; podání je už zaznamenané.', ' Email confirmation is still pending; the submission is already recorded.')
              : ui(' Záznam podání je uložený.', ' The submission record is stored.')}</span>}
          {!confirmationSent && withdrawalOpportunity?.confirmationStatus === 'pending' ? (
            <button type="button" className={styles.retryButton} disabled={withdrawalBusy} onClick={async () => {
              if (!alreadySubmitted) return;
              setWithdrawalBusy(true); setWithdrawalError('');
              try {
                const response = await fetch('/api/legal/withdrawal', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ action: 'retry_confirmation', receiptId: alreadySubmitted }) });
                const payload = await response.json() as { confirmationSent?: boolean };
                if (!response.ok || !payload.confirmationSent) throw new Error();
                setConfirmationSent(true);
              } catch {
                setWithdrawalError(ui('Potvrzení se zatím nepodařilo odeslat. Podání zůstává platně zaznamenané.', 'The confirmation could not be sent yet. The submission remains validly recorded.'));
              } finally { setWithdrawalBusy(false); }
            }}>{withdrawalBusy ? ui('Odesílám…', 'Sending…') : ui('Odeslat potvrzení znovu', 'Send confirmation again')}</button>
          ) : null}
        </div>
      ) : withdrawalOpportunity?.eligible ? (
        <>
          <div className={styles.withdrawalSummary}>
            <span>{withdrawalOpportunity.planCode === 'teacher_pro' ? 'Teacher Pro' : 'Teacher'}</span>
            <span>{withdrawalOpportunity.billingPeriod === 'annual' ? ui('roční období', 'annual period') : ui('měsíční období', 'monthly period')}</span>
            <span>{ui('Lhůta končí', 'Deadline')} {formatDate(withdrawalOpportunity.deadline, english)}</span>
          </div>
          {!withdrawalOpen ? (
            <button type="button" className={styles.dangerButton} onClick={() => setWithdrawalOpen(true)}>
              {ui('Odstoupit od smlouvy', 'Withdraw from contract')}
            </button>
          ) : (
            <form className={styles.withdrawalForm} onSubmit={async (event) => {
              event.preventDefault();
              if (withdrawalBusy || !consumerConfirmed) return;
              setWithdrawalBusy(true);
              setWithdrawalError('');
              setWithdrawalMessage('');
              try {
                const response = await fetch('/api/legal/withdrawal', {
                  method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
                  body: JSON.stringify({ action: 'withdraw', snapshotId: withdrawalOpportunity.snapshotId,
                    consumerName, electronicContact, locale, consumerConfirmed }),
                });
                const payload = await response.json() as { accepted?: boolean; receiptId?: string; confirmationSent?: boolean; error?: string };
                if (!response.ok && !payload.accepted) throw new Error(payload.error ?? 'online_withdrawal_failed');
                if (!payload.receiptId) throw new Error('online_withdrawal_failed');
                setSubmittedReceipt(payload.receiptId);
                setConfirmationSent(payload.confirmationSent === true);
                setWithdrawalMessage(payload.confirmationSent
                  ? ui('Potvrzení jsme odeslali e-mailem.', 'We sent the confirmation by email.')
                  : ui('Podání je přijato. Potvrzení můžeš z této stránky odeslat znovu.', 'The submission is accepted. You can resend the confirmation from this page.'));
                router.refresh();
              } catch {
                setWithdrawalError(ui('Online podání se nepodařilo dokončit. Použij zákonný formulář nebo napiš na vaclav@syllonaut.com.', 'The online submission could not be completed. Use the statutory form or email vaclav@syllonaut.com.'));
              } finally {
                setWithdrawalBusy(false);
              }
            }}>
              <p>{ui(
                'Odesláním jednoznačně odstupujete od uvedené smlouvy. Po přijetí zrušíme předplatné a vratnou část ceny vrátíme původní platební metodou podle VOP.',
                'By submitting, you unequivocally withdraw from the contract shown above. After receipt, we cancel the subscription and return the refundable balance through the original payment method under the Terms.',
              )}</p>
              <label>{ui('Jméno a příjmení', 'Full name')}<input value={consumerName} onChange={(event) => setConsumerName(event.target.value)} required minLength={2} maxLength={160} autoComplete="name" /></label>
              <label>{ui('E-mail pro potvrzení', 'Email for confirmation')}<input type="email" value={electronicContact} onChange={(event) => setElectronicContact(event.target.value)} required maxLength={254} autoComplete="email" /></label>
              <label className={styles.checkRow}><input type="checkbox" checked={consumerConfirmed} onChange={(event) => setConsumerConfirmed(event.target.checked)} required /><span>{ui('Potvrzuji, že u této smlouvy jednám jako spotřebitel.', 'I confirm that I act as a consumer for this contract.')}</span></label>
              <div className={styles.formActions}>
                <button type="submit" className={styles.dangerButton} disabled={withdrawalBusy || !consumerConfirmed}>
                  {withdrawalBusy ? ui('Odesílám…', 'Submitting…') : ui('Potvrdit odstoupení od smlouvy', 'Confirm withdrawal from contract')}
                </button>
                <button type="button" className={styles.ghost} onClick={() => setWithdrawalOpen(false)} disabled={withdrawalBusy}>{ui('Zpět', 'Back')}</button>
              </div>
            </form>
          )}
        </>
      ) : null}

      {withdrawalMessage && !alreadySubmitted ? <div className={styles.success} role="status">{withdrawalMessage}</div> : null}
      {withdrawalError ? <div className={styles.error} role="alert">{withdrawalError}</div> : null}
      <p className={styles.withdrawalAlternative}>{ui('Můžeš také použít', 'You can also use the')} <Link href={publicForm}>{ui('zákonný vzorový formulář', 'statutory model form')}</Link> {ui('a odeslat jej e-mailem nebo poštou.', 'and send it by email or post.')}</p>
    </section>
  );
}
