'use client';

import { useEffect, useState } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from '@/components/PresenterSession.module.css';
import {
  readSyllonautGuideState,
  subscribeSyllonautGuideState,
  syllonautGuideStepKey,
  type SyllonautGuideState,
  writeSyllonautGuideState,
} from '@/lib/onboarding-guide';

export default function PresenterGuideHandoff({ userId }: { userId: string | null }) {
  const english = useUiLocale() === 'en';
  const [state, setState] = useState<SyllonautGuideState | null>(null);

  useEffect(() => {
    if (!userId) {
      setState(null);
      return;
    }

    setState(readSyllonautGuideState(userId));
    return subscribeSyllonautGuideState(userId, setState);
  }, [userId]);

  if (!userId || !state?.running || state.chapter !== 'live' || state.step !== 1) return null;

  const finishHandoff = () => {
    const stepKey = syllonautGuideStepKey('live', 1);
    const satisfiedSteps = state.satisfiedSteps.includes(stepKey)
      ? state.satisfiedSteps
      : [...state.satisfiedSteps, stepKey];

    writeSyllonautGuideState(userId, {
      ...state,
      step: 2,
      satisfiedSteps,
    });
  };

  const dismiss = () => {
    writeSyllonautGuideState(userId, {
      ...state,
      running: false,
      dismissed: true,
    });
  };

  return (
    <div className={styles.guideHandoffShade}>
      <section
        className={styles.guideHandoffCard}
        role="dialog"
        aria-live="polite"
        aria-label={english ? 'Presenter setup guide' : 'Průvodce nastavením projekce'}
      >
        <div className={styles.guideHandoffHead}>
          <div className={styles.guideHandoffBrand}>
            <SyllonautMark />
            <span>{english ? 'FIRST FLIGHT' : 'PRVNÍ LET'}</span>
          </div>
          <span>{english ? 'Chapter 2 of 3 · 2 / 7' : 'Kapitola 2 ze 3 · 2 / 7'}</span>
        </div>

        <h1>{english ? 'This is the student screen' : 'Toto je studentská obrazovka'}</h1>
        <p>
          {english
            ? 'Move this window to the projector or second display and preferably make it full screen. Keep controlling the lesson in the original teacher window.'
            : 'Přetáhněte toto okno na projektor nebo druhý displej a ideálně ho zobrazte přes celou obrazovku. Hodinu dál řídíte v původním učitelském okně.'}
        </p>

        <div className={styles.guideHandoffActions}>
          <button type="button" className={styles.guideHandoffLater} onClick={dismiss}>
            {english ? 'Finish later' : 'Dokončit později'}
          </button>
          <button type="button" className={styles.guideHandoffPrimary} onClick={finishHandoff}>
            {english ? 'Done — continue' : 'Hotovo – pokračovat'}
          </button>
        </div>
      </section>
    </div>
  );
}
