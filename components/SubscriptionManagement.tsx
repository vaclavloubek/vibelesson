'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { termsReconsentPath } from '@/lib/terms-gate';
import { classifySubscriptionChange, type BillingPeriod } from '@/lib/subscription-change-policy';
import type { LiveSubscriptionManagementState } from '@/lib/billing-subscription-state';
import { quotaSourceLabel } from '@/lib/ai-quota';
import styles from './SubscriptionManagement.module.css';
import TrustedDevicesPanel from './TrustedDevicesPanel';
import ServiceChangeNotices from './ServiceChangeNotices';
import type { ServiceChangeNotice } from '@/lib/service-change-state';
import type { OnlineWithdrawalOpportunity } from '@/lib/online-withdrawal';

type ActiveState = Extract<LiveSubscriptionManagementState, { kind: 'active' }>;

function formatDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: 'czk' | 'eur' | 'usd', english: boolean) {
  const value = amount / 100;
  if (currency === 'czk') return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat(english ? 'en-US' : 'cs-CZ', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
}

export default function SubscriptionManagement({
  state,
  quotaWindow,
  serviceChangeNotices = [],
  withdrawalOpportunity,
  accountEmail,
}: {
  state: LiveSubscriptionManagementState;
  quotaWindow?: { end: string; source: string | null; gradingUsed: number; gradingLimit: number | null; gradingRemaining: number | null; gradingEnabled: boolean } | null;
  serviceChangeNotices?: ServiceChangeNotice[];
  withdrawalOpportunity: OnlineWithdrawalOpportunity | null;
  accountEmail: string;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const [consumerName, setConsumerName] = useState('');
  const [electronicContact, setElectronicContact] = useState(accountEmail);
  const [consumerConfirmed, setConsumerConfirmed] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState('');
  const [withdrawalError, setWithdrawalError] = useState('');
  const [submittedReceipt, setSubmittedReceipt] = useState<string | null>(withdrawalOpportunity?.receiptId ?? null);
  const [confirmationSent, setConfirmationSent] = useState(withdrawalOpportunity?.confirmationStatus === 'sent');

  const active = state.kind === 'active' ? state : null;
  const [targetPlan, setTargetPlan] = useState<'teacher' | 'teacher-pro'>(active?.scheduledChange?.planId ?? active?.planId ?? 'teacher');
  const [targetBilling, setTargetBilling] = useState<BillingPeriod>(active?.scheduledChange?.billingPeriod ?? active?.billingPeriod ?? 'monthly');

  const targetPrice = useMemo(() => {
    if (!active) return null;
    return active.prices.find((price) => price.planId === targetPlan && price.billingPeriod === targetBilling) ?? null;
  }, [active, targetBilling, targetPlan]);

  function withdrawalPanel() {
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

  if (state.kind === 'admin') {
    return (
      <div className={styles.layout}>
      <section className={styles.emptyCard}>
        <span className={styles.kicker}>{ui('Předplatné', 'Subscription')}</span>
        <h1>{ui('Administrátorský účet', 'Administrator account')}</h1>
        <p>{ui(
          'Máš plný přístup ke všem funkcím Syllonautu. Administrátorský přístup není placené předplatné a nespravuje se přes Stripe.',
          'You have full access to all Syllonaut features. Administrator access is not a paid subscription and is not managed through Stripe.',
        )}</p>
      </section>{withdrawalPanel()}</div>
    );
  }

  if (!active) {
    return (
      <div className={styles.layout}>
      <section className={styles.emptyCard}>
        <span className={styles.kicker}>{ui('Předplatné', 'Subscription')}</span>
        <h1>{ui('Používáš tarif Free', 'You are on the Free plan')}</h1>
        <p>{ui('Nemáš aktivní placené předplatné. Teacher nebo Teacher Pro můžeš vybrat v Ceníku.', 'You do not have an active paid subscription. You can choose Teacher or Teacher Pro on the Pricing page.')}</p>
        <Link href={`/${locale}/pricing`} className={styles.primary}>{ui('Zobrazit tarify', 'View plans')}</Link>
      </section>{withdrawalPanel()}</div>
    );
  }

  const changeKind = classifySubscriptionChange(
    active.planCode,
    active.billingPeriod,
    targetPlan === 'teacher-pro' ? 'teacher_pro' : 'teacher',
    targetBilling,
  );
  const disputedPayment = active.aiBillingPauseReason === 'dispute';
  const refundedPayment = active.aiBillingPauseReason === 'refund';
  const blocked = active.cancelAtPeriodEnd || active.paymentIssue || disputedPayment || refundedPayment || active.pendingUpdate;
  const renewalDate = formatDate(active.currentPeriodEnd, english);
  const quotaResetDate = quotaWindow?.end ? formatDate(quotaWindow.end, english) : null;
  const quotaResetSource = quotaSourceLabel(quotaWindow?.source, english);
  const targetPlanName = targetPlan === 'teacher-pro' ? 'Teacher Pro' : 'Teacher';

  async function openPortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    setError('');
    try {
      const response = await fetch('/api/billing/stripe/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ environment: 'live', locale, returnPath: 'subscription' }),
      });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? 'portal_creation_failed');
      window.location.assign(payload.url);
    } catch (cause) {
      console.error('subscription portal failed', cause);
      setError(ui('Stripe portál se nepodařilo otevřít. Zkus to prosím znovu.', 'The Stripe portal could not be opened. Please try again.'));
      setPortalBusy(false);
    }
  }

  async function submitChange() {
    if (busy || blocked || changeKind === 'none') return;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/billing/stripe/subscription/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'change', planId: targetPlan, billing: targetBilling }),
      });
      const payload = await response.json() as {
        outcome?: string;
        effectiveAt?: string;
        paymentUrl?: string | null;
        error?: string;
      };

      if (response.status === 428 || payload.error === 'terms_reconsent_required') {
        window.location.assign(termsReconsentPath('/subscription'));
        return;
      }

      if (!response.ok) {
        const known = payload.error;
        if (known === 'subscription_cancellation_scheduled') {
          throw new Error(ui('Před změnou tarifu nejdřív v Stripe Portalu zruš naplánované ukončení předplatného.', 'Before changing plans, first undo the scheduled cancellation in the Stripe Portal.'));
        }
        if (known === 'subscription_payment_issue' || known === 'subscription_pending_update_exists') {
          throw new Error(ui('Nejdřív je potřeba dořešit rozpracovanou nebo neúspěšnou platbu ve Stripe.', 'First resolve the pending or failed payment in Stripe.'));
        }
        if (known === 'billing_recovery_required_before_plan_change') {
          throw new Error(ui(
            'Tarif teď nelze změnit, protože účet má neuhrazený refund nebo chargeback. Nejdřív musí potvrzené platby pokrýt vrácenou nebo ztracenou částku.',
            'You cannot change plans while the account has an unrecovered refund or chargeback. Confirmed payments must first cover the refunded or lost amount.',
          ));
        }
        if (known === 'subscription_schedule_conflict') {
          throw new Error(ui('Předplatné má naplánovanou změnu, kterou nelze bezpečně upravit samoobslužně. Kontaktuj podporu.', 'The subscription has a scheduled change that cannot be safely modified here. Contact support.'));
        }
        throw new Error(ui('Změnu tarifu se nepodařilo uložit.', 'The plan change could not be saved.'));
      }

      if (payload.outcome === 'payment_required') {
        if (payload.paymentUrl) {
          window.location.assign(payload.paymentUrl);
          return;
        }
        setMessage(ui('Doplatek čeká na dokončení ve Stripe. Otevři správu platby.', 'The upgrade payment still needs to be completed in Stripe. Open payment management.'));
      } else if (payload.outcome === 'effective_now') {
        setMessage(ui('Upgrade proběhl. Nový tarif se právě aktivuje.', 'The upgrade is complete. Your new plan is being activated.'));
      } else if (payload.outcome === 'scheduled' || payload.outcome === 'already_scheduled') {
        const when = payload.effectiveAt ? formatDate(payload.effectiveAt, english) : renewalDate;
        setMessage(ui(`Změna je naplánovaná na ${when}.`, `The change is scheduled for ${when}.`));
      } else {
        setMessage(ui('Tarif už odpovídá zvolené variantě.', 'Your subscription already matches this option.'));
      }

      window.setTimeout(() => router.refresh(), 800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui('Změnu tarifu se nepodařilo uložit.', 'The plan change could not be saved.'));
      setBusy(false);
    }
  }

  async function cancelScheduledChange() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/billing/stripe/subscription/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'cancel_scheduled_change' }),
      });
      const payload = await response.json() as { outcome?: string };
      if (!response.ok || payload.outcome !== 'scheduled_change_cancelled') throw new Error();
      setMessage(ui('Naplánovaná změna byla zrušena. Současný tarif bude pokračovat.', 'The scheduled change was cancelled. Your current plan will continue.'));
      window.setTimeout(() => router.refresh(), 600);
    } catch {
      setError(ui('Naplánovanou změnu se nepodařilo zrušit.', 'The scheduled change could not be cancelled.'));
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.summaryCard}>
        <div>
          <span className={styles.kicker}>{ui('Aktuální předplatné', 'Current subscription')}</span>
          <h1>{active.planId === 'teacher-pro' ? 'Teacher Pro' : 'Teacher'}</h1>
          <p>{active.billingPeriod === 'annual' ? ui('Roční fakturace', 'Annual billing') : ui('Měsíční fakturace', 'Monthly billing')} · {active.currency.toUpperCase()}</p>
        </div>

        <dl className={styles.details}>
          <div><dt>{active.cancelAtPeriodEnd ? ui('Přístup do', 'Access until') : ui('Další obnovení', 'Next renewal')}</dt><dd>{renewalDate}</dd></div>
          {quotaWindow?.gradingEnabled && quotaWindow.gradingLimit !== null ? (
            <div>
              <dt>{ui('AI hodnocení', 'AI grading')}</dt>
              <dd>{ui(
                `${quotaWindow.gradingRemaining ?? 0} z ${quotaWindow.gradingLimit} zbývá`,
                `${quotaWindow.gradingRemaining ?? 0} of ${quotaWindow.gradingLimit} remaining`,
              )}</dd>
            </div>
          ) : null}
          {quotaResetDate ? (
            <div>
              <dt>{ui('Obnovení AI limitu', 'AI allowance reset')}</dt>
              <dd>{quotaResetDate}{quotaResetSource ? ` · ${quotaResetSource}` : ''}</dd>
            </div>
          ) : null}
          <div><dt>{ui('Fakturační země', 'Billing country')}</dt><dd>{active.billingCountry ?? '—'}</dd></div>
          <div><dt>{ui('Stav', 'Status')}</dt><dd>{disputedPayment ? ui('Platba reklamována', 'Payment disputed') : refundedPayment ? ui('Platba vrácena', 'Payment refunded') : active.paymentIssue ? ui('Platba vyžaduje pozornost', 'Payment needs attention') : active.cancelAtPeriodEnd ? ui('Ukončení naplánováno', 'Cancellation scheduled') : ui('Aktivní', 'Active')}</dd></div>
        </dl>

        <button type="button" className={styles.secondary} onClick={openPortal} disabled={portalBusy}>
          {portalBusy ? ui('Otevírám Stripe…', 'Opening Stripe…') : ui('Platba, faktury a zrušení', 'Payment, invoices & cancellation')}
        </button>
      </section>

      <TrustedDevicesPanel />

      <ServiceChangeNotices notices={serviceChangeNotices} />

      {withdrawalPanel()}

      {active.scheduledChange ? (
        <section className={styles.scheduledCard}>
          <div>
            <span className={styles.kicker}>{ui('Naplánovaná změna', 'Scheduled change')}</span>
            <strong>{active.scheduledChange.planId === 'teacher-pro' ? 'Teacher Pro' : 'Teacher'} · {active.scheduledChange.billingPeriod === 'annual' ? ui('ročně', 'annual') : ui('měsíčně', 'monthly')}</strong>
            <p>{ui('Začne', 'Starts')} {formatDate(active.scheduledChange.effectiveAt, english)}.</p>
          </div>
          <button type="button" className={styles.ghost} onClick={cancelScheduledChange} disabled={busy}>
            {ui('Zrušit změnu', 'Cancel change')}
          </button>
        </section>
      ) : null}

      {active.cancelAtPeriodEnd ? (
        <div className={styles.notice}>
          {ui('Předplatné je naplánované k ukončení. Pokud chceš tarif změnit, nejdřív v Stripe Portalu obnov automatické pokračování.', 'Your subscription is scheduled to end. To change plans, first restore automatic renewal in the Stripe Portal.')}
        </div>
      ) : null}

      {active.aiBillingPauseReason === 'dispute' ? (
        <div className={styles.warning} role="status">
          <strong>{ui('AI funkce jsou dočasně pozastavené kvůli reklamaci platby.', 'AI features are temporarily paused because of a payment dispute.')}</strong>
          <p>{ui(
            'Platba za předplatné je reklamovaná u banky nebo platební sítě. Uložené lekce a živá výuka dál fungují. Pokud Stripe potvrdí vrácení prostředků Syllonautu, AI se automaticky odemkne; pokud spor skončí vrácením platby držiteli karty, AI se odemkne až tehdy, když pozdější potvrzené platby předplatného pokryjí ztracenou částku. Stripe Portal výše můžeš dál použít pro kartu, faktury a správu předplatného, samotný spor se ale řeší přes banku nebo karetní síť.',
            'A subscription payment is being disputed through the bank or card network. Saved lessons and live teaching still work. If Stripe confirms the funds were returned to Syllonaut, AI unlocks automatically; if the dispute returns the payment to the cardholder, AI unlocks once later confirmed subscription payments cover the lost amount. You can still use the Stripe Portal above for your card, invoices and subscription management, but the dispute itself is handled through the bank or card network.',
          )}</p>
        </div>
      ) : active.aiBillingPauseReason === 'refund' ? (
        <div className={styles.warning} role="status">
          <strong>{ui('AI funkce jsou dočasně pozastavené, protože platba byla vrácena.', 'AI features are temporarily paused because the payment was refunded.')}</strong>
          <p>{ui(
            'Platba za aktuální předplatné byla plně vrácena. Uložené lekce a živá výuka dál fungují. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, až pozdější potvrzené platby předplatného pokryjí vrácenou částku.',
            'The current subscription payment was fully refunded. Saved lessons and live teaching still work. AI generation, AI edits and AI grading unlock automatically once later confirmed subscription payments cover the refunded amount.',
          )}</p>
        </div>
      ) : active.paymentIssue ? (
        <div className={styles.warning} role="status">
          <strong>{ui('AI funkce jsou dočasně pozastavené.', 'AI features are temporarily paused.')}</strong>
          <p>{ui(
            'Platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka dál fungují. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, jakmile Stripe platbu potvrdí. Platbu můžeš napravit přes „Platba, faktury a zrušení“ výše.',
            'The subscription payment needs attention. Saved lessons and live teaching still work. AI generation, AI edits and AI grading unlock automatically as soon as Stripe confirms the payment. You can resolve the payment using “Payment, invoices & cancellation” above.',
          )}</p>
        </div>
      ) : active.pendingUpdate ? (
        <div className={styles.warning}>
          {ui('Nejdřív dořeš rozpracovanou platbu ve Stripe. Do té doby změnu tarifu neprovedeme.', 'Resolve the pending payment in Stripe first. Plan changes are paused until then.')}
        </div>
      ) : null}

      <section className={styles.changeCard}>
        <div className={styles.changeHeading}>
          <span className={styles.kicker}>{ui('Změnit tarif', 'Change plan')}</span>
          <h2>{ui('Vyber další variantu', 'Choose your next option')}</h2>
          <p>{ui('Měna i fakturační země zůstávají beze změny. Změna regionu vyžaduje podporu.', 'Currency and billing country stay unchanged. Changing billing region requires support.')}</p>
        </div>

        <div className={styles.selectorGroup}>
          <span>{ui('Tarif', 'Plan')}</span>
          <div className={styles.segmented}>
            {(['teacher', 'teacher-pro'] as const).map((plan) => (
              <button key={plan} type="button" className={targetPlan === plan ? styles.selected : ''} aria-pressed={targetPlan === plan} onClick={() => setTargetPlan(plan)} disabled={busy}>
                {plan === 'teacher-pro' ? 'Teacher Pro' : 'Teacher'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.selectorGroup}>
          <span>{ui('Fakturace', 'Billing')}</span>
          <div className={styles.segmented}>
            {(['monthly', 'annual'] as const).map((period) => (
              <button key={period} type="button" className={targetBilling === period ? styles.selected : ''} aria-pressed={targetBilling === period} onClick={() => setTargetBilling(period)} disabled={busy}>
                {period === 'annual' ? ui('Ročně', 'Annual') : ui('Měsíčně', 'Monthly')}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.targetSummary}>
          <div>
            <span>{targetPlanName}</span>
            <strong>{targetPrice ? formatMoney(targetPrice.amount, targetPrice.currency, english) : '—'} <small>{targetBilling === 'annual' ? ui('/ rok', '/ year') : ui('/ měsíc', '/ month')}</small></strong>
          </div>
          <p>
            {changeKind === 'none'
              ? ui('Tohle je tvoje současná varianta.', 'This is your current option.')
              : changeKind === 'immediate_upgrade'
                ? ui('Upgrade se provede ihned. Stripe dopočítá poměrný doplatek a nový tarif aktivujeme až po úspěšné platbě.', 'The upgrade takes effect immediately. Stripe calculates the prorated charge and the new plan activates only after successful payment.')
                : ui(`Změna proběhne při dalším obnovení ${renewalDate}. Do té doby zůstává současný tarif beze změny.`, `The change takes effect at the next renewal on ${renewalDate}. Your current plan remains unchanged until then.`)}
          </p>
        </div>

        <button type="button" className={styles.primary} onClick={submitChange} disabled={busy || blocked || changeKind === 'none' || !targetPrice}>
          {busy ? ui('Ukládám změnu…', 'Saving change…') : changeKind === 'immediate_upgrade' ? ui('Upgradovat tarif', 'Upgrade plan') : ui('Naplánovat změnu', 'Schedule change')}
        </button>

        {message ? <div className={styles.success} role="status">{message}</div> : null}
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </section>
    </div>
  );
}
