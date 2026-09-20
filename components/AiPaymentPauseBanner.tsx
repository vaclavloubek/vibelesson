'use client';

import Link from 'next/link';
import { useUiLocale } from '@/components/LocaleProvider';
import type { AiBillingPauseReason } from '@/lib/individual-ai-billing';
import styles from './AiPaymentPauseBanner.module.css';

export default function AiPaymentPauseBanner({
  reason = 'past_due',
}: {
  reason?: AiBillingPauseReason | null;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const disputed = reason === 'dispute';

  return (
    <section className={styles.banner} role="status" aria-live="polite">
      <div>
        <strong>{disputed
          ? (english ? 'AI features are temporarily paused because of a payment dispute' : 'AI funkce jsou dočasně pozastavené kvůli reklamaci platby')
          : (english ? 'AI features are temporarily paused' : 'AI funkce jsou dočasně pozastavené')}</strong>
        <p>{disputed
          ? (english
              ? 'A subscription payment is being disputed through the bank or card network. Saved lessons and live teaching still work, and open responses can be graded manually. AI unlocks automatically if Stripe confirms the funds were returned to Syllonaut; after a lost dispute it unlocks after the next confirmed payment.'
              : 'Platba předplatného je reklamovaná u banky nebo platební sítě. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI se automaticky odemkne, pokud Stripe potvrdí vrácení prostředků Syllonautu; po prohraném sporu se odemkne po další potvrzené platbě.')
          : (english
              ? 'The subscription payment needs attention. Saved lessons and live teaching still work, and open responses can be graded manually. AI generation, AI edits and AI grading unlock automatically as soon as Stripe confirms the payment.'
              : 'Platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, jakmile Stripe platbu potvrdí.')}</p>
      </div>
      <Link href={`/${locale}/subscription`} className={styles.action}>
        {disputed
          ? (english ? 'Payment details' : 'Podrobnosti platby')
          : (english ? 'Resolve payment' : 'Vyřešit platbu')}
      </Link>
    </section>
  );
}
