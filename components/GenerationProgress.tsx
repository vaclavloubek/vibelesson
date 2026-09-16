'use client';

import { useEffect, useMemo, useState } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import styles from './GenerationProgress.module.css';

export type GenerationStage = 'requesting' | 'generating' | 'validating' | 'saving';

const steps: Array<{
  stage: GenerationStage;
  title: string;
  detail: string;
}> = [
  {
    stage: 'requesting',
    title: 'Zadání přijato',
    detail: 'Ověřuji požadavek a připravuji AI generování.',
  },
  {
    stage: 'generating',
    title: 'Navrhuji lekci',
    detail: 'AI skládá strukturu, aktivity, zadání a časování celé hodiny.',
  },
  {
    stage: 'validating',
    title: 'Kontroluji strukturu',
    detail: 'Ověřuji, že bloky odpovídají pravidlům Syllonautu a dají se bezpečně zobrazit.',
  },
  {
    stage: 'saving',
    title: 'Ukládám lekci',
    detail: 'Hotovou lekci ukládám do tvé knihovny a připravuji její stabilní odkaz.',
  },
];

const stageCopy: Record<GenerationStage, { title: string; body: string }> = {
  requesting: {
    title: 'Připravuji generování',
    body: 'Zadání je na cestě. Jakmile server zahájí AI návrh, uvidíš to tady.',
  },
  generating: {
    title: 'Syllonaut navrhuje lekci',
    body: 'Právě vzniká konkrétní pořadí aktivit, jejich obsah i rozložení času.',
  },
  validating: {
    title: 'Návrh je hotový',
    body: 'Teď kontroluji datovou strukturu a pravidla jednotlivých aktivit.',
  },
  saving: {
    title: 'Ještě chvíli',
    body: 'Lekce prošla kontrolou. Ukládám ji, aby se po dokončení neztratila.',
  },
};

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
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

  useEffect(() => {
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const currentIndex = useMemo(() => steps.findIndex((step) => step.stage === stage), [stage]);
  const copy = stageCopy[stage];

  return (
    <div className={styles.root} aria-live="polite" aria-busy="true">
      <div className={styles.orbit}><SyllonautMark /></div>

      <div className={styles.copy}>
        <span className={styles.eyebrow}>Generuji lekci</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>

      <div className={styles.meta} aria-label="Parametry generované lekce">
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
            <div className={className} key={step.stage}>
              <span className={styles.indicator}>{done ? '✓' : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
              <span className={styles.state}>{done ? 'Hotovo' : active ? 'Probíhá' : 'Čeká'}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.timer}>Uplynulo {formatElapsed(elapsed)}</span>
        <span>{elapsed >= 60 ? 'U delší lekce může AI návrh zabrat několik minut.' : 'Okno můžeš nechat otevřené, lekce se po dokončení uloží automaticky.'}</span>
      </div>
    </div>
  );
}
