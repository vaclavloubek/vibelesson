'use client';

import { useEffect, useMemo, useState } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import VisuallyHidden from '@/components/VisuallyHidden';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './GenerationProgress.module.css';

export type GenerationStage = 'requesting' | 'generating' | 'validating' | 'saving';

const copy = {
  cs: {
    steps: [
      ['requesting', 'Zadání přijato', 'Ověřuji požadavek a připravuji AI generování.'],
      ['generating', 'Navrhuji lekci', 'AI skládá strukturu, aktivity, zadání a časování celé hodiny.'],
      ['validating', 'Kontroluji strukturu', 'Ověřuji, že bloky odpovídají pravidlům Syllonautu a dají se bezpečně zobrazit.'],
      ['saving', 'Ukládám lekci', 'Hotovou lekci ukládám do tvé knihovny a připravuji její stabilní odkaz.'],
    ],
    stage: {
      requesting: ['Připravuji generování', 'Zadání je na cestě. Jakmile server zahájí AI návrh, uvidíš to tady.'],
      generating: ['Syllonaut navrhuje lekci', 'Právě vzniká konkrétní pořadí aktivit, jejich obsah i rozložení času.'],
      validating: ['Návrh je hotový', 'Teď kontroluji datovou strukturu a pravidla jednotlivých aktivit.'],
      saving: ['Ještě chvíli', 'Lekce prošla kontrolou. Ukládám ji, aby se po dokončení neztratila.'],
    },
    eyebrow: 'Generuji lekci',
    meta: 'Parametry generované lekce',
    done: 'Hotovo',
    active: 'Probíhá',
    waiting: 'Čeká',
    elapsed: 'Uplynulo',
    long: 'U delší lekce může AI návrh zabrat několik minut.',
    short: 'Okno můžeš nechat otevřené, lekce se po dokončení uloží automaticky.',
  },
  en: {
    steps: [
      ['requesting', 'Brief received', 'Checking the request and preparing AI generation.'],
      ['generating', 'Designing the lesson', 'AI is building the structure, activities, instructions and timing.'],
      ['validating', 'Checking the structure', 'Verifying that every block follows Syllonaut rules and can be rendered safely.'],
      ['saving', 'Saving the lesson', 'Saving the completed lesson to your library and preparing its stable link.'],
    ],
    stage: {
      requesting: ['Preparing generation', 'Your brief is on its way. You will see the next stage as soon as AI generation starts.'],
      generating: ['Syllonaut is designing the lesson', 'The activity sequence, content and timing are being created now.'],
      validating: ['The draft is ready', 'Now checking the data structure and rules for each activity.'],
      saving: ['Almost there', 'The lesson passed validation. It is being saved so the completed work is not lost.'],
    },
    eyebrow: 'Generating lesson',
    meta: 'Generated lesson parameters',
    done: 'Done',
    active: 'In progress',
    waiting: 'Waiting',
    elapsed: 'Elapsed',
    long: 'Longer lessons can take several minutes to generate.',
    short: 'You can keep this window open; the lesson will be saved automatically when complete.',
  },
} as const;

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export default function GenerationProgress({
  stage,
  startedAt,
  duration,
  audience,
  groupSize,
}: {
  stage: GenerationStage;
  startedAt: number;
  duration: number;
  audience: string;
  groupSize: string;
}) {
  const locale = useUiLocale();
  const t = copy[locale];
  const steps = t.steps;
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

  useEffect(() => {
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const currentIndex = useMemo(() => steps.findIndex((step) => step[0] === stage), [stage, steps]);
  const stageText = t.stage[stage];

  return (
    <div className={styles.root} aria-busy="true">
      <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{stageText[0]}. {stageText[1]}</span></VisuallyHidden>
      <div className={styles.orbit}><SyllonautMark /></div>

      <div className={styles.copy}>
        <span className={styles.eyebrow}>{t.eyebrow}</span>
        <h2>{stageText[0]}</h2>
        <p>{stageText[1]}</p>
      </div>

      <div className={styles.meta} aria-label={t.meta}>
        <span>{duration} min</span>
        <span>{audience}</span>
        <span>{groupSize}</span>
      </div>

      <div className={styles.steps}>
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const className = `${styles.step} ${active ? styles.stepActive : ''} ${done ? styles.stepDone : ''}`.trim();
          return (
            <div className={className} key={step[0]}>
              <span className={styles.indicator}>{done ? '✓' : index + 1}</span>
              <div>
                <strong>{step[1]}</strong>
                <small>{step[2]}</small>
              </div>
              <span className={styles.state}>{done ? t.done : active ? t.active : t.waiting}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.timer}>{t.elapsed} {formatElapsed(elapsed)}</span>
        <span>{elapsed >= 60 ? t.long : t.short}</span>
      </div>
    </div>
  );
}
