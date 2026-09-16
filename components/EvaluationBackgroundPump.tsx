'use client';

import { useEffect } from 'react';

const WAKE_INTERVAL_MS = 8000;

type QueueResponse = { evaluationIds?: string[] };

export default function EvaluationBackgroundPump({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    let cancelled = false;
    let running = false;

    const wake = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const queueResponse = await fetch(`/api/sessions/${sessionId}/evaluations/process`, {
          method: 'POST',
          cache: 'no-store',
        });
        if (!queueResponse.ok) return;

        const queue = await queueResponse.json() as QueueResponse;
        const evaluationIds = Array.isArray(queue.evaluationIds) ? queue.evaluationIds : [];
        if (!evaluationIds.length || cancelled) return;

        await Promise.allSettled(evaluationIds.map((evaluationId) => fetch(
          `/api/sessions/${sessionId}/evaluations/${evaluationId}/grade`,
          { method: 'POST', cache: 'no-store' },
        )));
      } catch {
        // Best effort: the next wake retries pending grading work.
      } finally {
        running = false;
      }
    };

    void wake();
    const interval = window.setInterval(() => { void wake(); }, WAKE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void wake();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionId]);

  return null;
}
