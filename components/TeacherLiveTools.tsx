'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import EvaluationReviewQueue from '@/components/EvaluationReviewQueue';
import TeacherScoreboard from '@/components/TeacherScoreboard';
import styles from '@/components/TeacherLiveTools.module.css';

export default function TeacherLiveTools({ sessionId }: { sessionId: string }) {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const locate = () => {
      const nextTarget = document.querySelector('.live-control-bar');
      setTarget((current) => current === nextTarget ? current : nextTarget);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;

  return createPortal(
    <div className={styles.tools} aria-label="Nástroje učitele">
      <TeacherScoreboard sessionId={sessionId} />
      <EvaluationReviewQueue sessionId={sessionId} />
    </div>,
    target,
  );
}
