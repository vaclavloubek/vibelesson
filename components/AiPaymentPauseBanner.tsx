'use client';

import Link from 'next/link';
import { useUiLocale } from '@/components/LocaleProvider';
import type { AiBillingPauseReason } from '@/lib/individual-ai-billing';
import styles from './AiPaymentPauseBanner.module.css';

export default function AiPaymentPauseBanner({
  reason = 'past_due',
  scope = 'individual',
  manager = false,
}: {
  reason?: AiBillingPauseReason | null;
  scope?: 'individual' | 'organization' | null;
  manager?: boolean;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const disputed = reason === 'dispute';
  const refunded = reason === 'refund';
  const organization = scope === 'organization';

  if (organization) {
    return (
      <section className={styles.banner} role="status" aria-live="polite">
        <div>
          <strong>{disputed
            ? (english ? 'School AI is temporarily paused because of a payment dispute' : 'AI školy je dočasně pozastavená kvůli reklamaci platby')
            : refunded
              ? (english ? 'School AI is temporarily paused because a payment was refunded' : 'AI školy je dočasně pozastavená kvůli vrácené platbě')
              : (english ? 'School AI is temporarily paused' : 'AI školy je dočasně pozastavená')}</strong>
          <p>{disputed
            ? (english
                ? manager
                  ? 'A school subscription payment is under dispute. Saved lessons, school administration and live teaching still work, and responses can be graded manually. Resolve the billing state in School.'
                  : 'A school subscription payment is under dispute. Saved lessons and live teaching still work, and responses can be graded manually. A school administrator needs to resolve the billing state.'
                : manager
                  ? 'Platba školního předplatného je reklamovaná. Uložené lekce, správa školy a živá výuka dál fungují a odpovědi lze hodnotit ručně. Stav platby vyřešte ve správě školy.'
                  : 'Platba školního předplatného je reklamovaná. Uložené lekce a živá výuka dál fungují a odpovědi lze hodnotit ručně. Stav platby musí vyřešit správce školy.')
            : refunded
              ? (english
                  ? manager
                    ? 'A school subscription payment was fully refunded. Saved lessons, school administration and live teaching still work. AI unlocks after the refunded amount is recovered through confirmed school subscription payments.'
                    : 'A school subscription payment was fully refunded. Saved lessons and live teaching still work. A school administrator needs to resolve the billing state.'
                  : manager
                    ? 'Platba školního předplatného byla plně vrácena. Uložené lekce, správa školy a živá výuka dál fungují. AI se odemkne, až potvrzené platby školy pokryjí vrácenou částku.'
                    : 'Platba školního předplatného byla plně vrácena. Uložené lekce a živá výuka dál fungují. Stav fakturace musí vyřešit správce školy.')
              : (english
                  ? manager
                    ? 'The school subscription payment needs attention. Saved lessons, school administration and live teaching still work. AI unlocks automatically after the payment is resolved.'
                    : 'The school subscription payment needs attention. Saved lessons and live teaching still work. A school administrator needs to resolve the payment.'
                  : manager
                    ? 'Platba školního předplatného vyžaduje pozornost. Uložené lekce, správa školy a živá výuka dál fungují. AI se automaticky odemkne po vyřešení platby.'
                    : 'Platba školního předplatného vyžaduje pozornost. Uložené lekce a živá výuka dál fungují. Platbu musí vyřešit správce školy.')}</p>
        </div>
        <Link href="/school" className={styles.action}>
          {manager
            ? (english ? 'School billing' : 'Fakturace školy')
            : (english ? 'School status' : 'Stav školy')}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.banner} role="status" aria-live="polite">
      <div>
        <strong>{disputed
          ? (english ? 'AI features are temporarily paused because of a payment dispute' : 'AI funkce jsou dočasně pozastavené kvůli reklamaci platby')
          : refunded
            ? (english ? 'AI features are temporarily paused because the payment was refunded' : 'AI funkce jsou dočasně pozastavené, protože platba byla vrácena')
            : (english ? 'AI features are temporarily paused' : 'AI funkce jsou dočasně pozastavené')}</strong>
        <p>{disputed
          ? (english
              ? 'A subscription payment is being disputed through the bank or card network. Saved lessons and live teaching still work, and open responses can be graded manually. AI unlocks automatically if Stripe confirms the funds were returned to Syllonaut; after a lost dispute it unlocks once later confirmed subscription payments cover the lost amount.'
              : 'Platba předplatného je reklamovaná u banky nebo platební sítě. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI se automaticky odemkne, pokud Stripe potvrdí vrácení prostředků Syllonautu; po prohraném sporu se odemkne, až pozdější potvrzené platby předplatného pokryjí ztracenou částku.')
          : refunded
            ? (english
                ? 'The current subscription payment was fully refunded. Saved lessons and live teaching still work, and open responses can be graded manually. AI generation, AI edits and AI grading unlock automatically once later confirmed subscription payments cover the refunded amount.'
                : 'Platba za aktuální předplatné byla plně vrácena. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, až pozdější potvrzené platby předplatného pokryjí vrácenou částku.')
            : (english
                ? 'The subscription payment needs attention. Saved lessons and live teaching still work, and open responses can be graded manually. AI generation, AI edits and AI grading unlock automatically as soon as Stripe confirms the payment.'
                : 'Platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, jakmile Stripe platbu potvrdí.')}</p>
      </div>
      <Link href={`/${locale}/subscription`} className={styles.action}>
        {disputed || refunded
          ? (english ? 'Payment details' : 'Podrobnosti platby')
          : (english ? 'Resolve payment' : 'Vyřešit platbu')}
      </Link>
    </section>
  );
}
