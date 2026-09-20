'use client';

import Link from 'next/link';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './AiPaymentPauseBanner.module.css';

export default function AiPaymentPauseBanner() {
  const locale = useUiLocale();
  const english = locale === 'en';

  return (
    <section className={styles.banner} role="status" aria-live="polite">
      <div>
        <strong>{english ? 'AI features are temporarily paused' : 'AI funkce jsou dočasně pozastavené'}</strong>
        <p>{english
          ? 'The subscription payment needs attention. Saved lessons and live teaching still work, and open responses can be graded manually. AI generation, AI edits and AI grading unlock automatically as soon as Stripe confirms the payment.'
          : 'Platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka dál fungují a otevřené odpovědi lze hodnotit ručně. AI generování, AI úpravy a AI hodnocení se automaticky odemknou, jakmile Stripe platbu potvrdí.'}</p>
      </div>
      <Link href={`/${locale}/subscription`} className={styles.action}>
        {english ? 'Resolve payment' : 'Vyřešit platbu'}
      </Link>
    </section>
  );
}
