'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { classifySubscriptionChange, type BillingPeriod } from '@/lib/subscription-change-policy';
import type { LiveSubscriptionManagementState } from '@/lib/billing-subscription-state';
import styles from './SubscriptionManagement.module.css';

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

export default function SubscriptionManagement({ state }: { state: LiveSubscriptionManagementState }) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const active = state.kind === 'active' ? state : null;
  const [targetPlan, setTargetPlan] = useState<'teacher' | 'teacher-pro'>(active?.scheduledChange?.planId ?? active?.planId ?? 'teacher');
  const [targetBilling, setTargetBilling] = useState<BillingPeriod>(active?.scheduledChange?.billingPeriod ?? active?.billingPeriod ?? 'monthly');

  const targetPrice = useMemo(() => {
    if (!active) return null;
    return active.prices.find((price) => price.planId === targetPlan && price.billingPeriod === targetBilling) ?? null;
  }, [active, targetBilling, targetPlan]);

  if (state.kind === 'admin') {
    return (
      <section className={styles.emptyCard}>
        <span className={styles.kicker}>{ui('Předplatné', 'Subscription')}</span>
        <h1>{ui('Administrátorský účet', 'Administrator account')}</h1>
        <p>{ui(
          'Máš plný přístup ke všem funkcím Syllonautu. Administrátorský přístup není placené předplatné a nespravuje se přes Stripe.',
          'You have full access to all Syllonaut features. Administrator access is not a paid subscription and is not managed through Stripe.',
        )}</p>
      </section>
    );
  }

  if (!active) {
    return (
      <section className={styles.emptyCard}>
        <span className={styles.kicker}>{ui('Předplatné', 'Subscription')}</span>
        <h1>{ui('Používáš tarif Free', 'You are on the Free plan')}</h1>
        <p>{ui('Nemáš aktivní placené předplatné. Teacher nebo Teacher Pro můžeš vybrat v Ceníku.', 'You do not have an active paid subscription. You can choose Teacher or Teacher Pro on the Pricing page.')}</p>
        <Link href={`/${locale}/pricing`} className={styles.primary}>{ui('Zobrazit tarify', 'View plans')}</Link>
      </section>
    );
  }

  const changeKind = classifySubscriptionChange(
    active.planCode,
    active.billingPeriod,
    targetPlan === 'teacher-pro' ? 'teacher_pro' : 'teacher',
    targetBilling,
  );
  const blocked = active.cancelAtPeriodEnd || active.paymentIssue || active.pendingUpdate;
  const renewalDate = formatDate(active.currentPeriodEnd, english);
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

      if (!response.ok) {
        const known = payload.error;
        if (known === 'subscription_cancellation_scheduled') {
          throw new Error(ui('Před změnou tarifu nejdřív v Stripe Portalu zruš naplánované ukončení předplatného.', 'Before changing plans, first undo the scheduled cancellation in the Stripe Portal.'));
        }
        if (known === 'subscription_payment_issue' || known === 'subscription_pending_update_exists') {
          throw new Error(ui('Nejdřív je potřeba dořešit rozpracovanou nebo neúspěšnou platbu ve Stripe.', 'First resolve the pending or failed payment in Stripe.'));
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
          <div><dt>{ui('Fakturační země', 'Billing country')}</dt><dd>{active.billingCountry ?? '—'}</dd></div>
          <div><dt>{ui('Stav', 'Status')}</dt><dd>{active.paymentIssue ? ui('Platba vyžaduje pozornost', 'Payment needs attention') : active.cancelAtPeriodEnd ? ui('Ukončení naplánováno', 'Cancellation scheduled') : ui('Aktivní', 'Active')}</dd></div>
        </dl>

        <button type="button" className={styles.secondary} onClick={openPortal} disabled={portalBusy}>
          {portalBusy ? ui('Otevírám Stripe…', 'Opening Stripe…') : ui('Platba, faktury a zrušení', 'Payment, invoices & cancellation')}
        </button>
      </section>

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

      {active.paymentIssue || active.pendingUpdate ? (
        <div className={styles.warning}>
          {ui('Nejdřív dořeš platbu ve Stripe. Do té doby změnu tarifu neprovedeme.', 'Resolve the payment in Stripe first. Plan changes are paused until then.')}
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
