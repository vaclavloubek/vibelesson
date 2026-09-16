'use client';

import { useEffect } from 'react';

const WAKE_INTERVAL_MS = 8000;

export default function EvaluationBackgroundPump({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    let cancelled = false;

    const wake = async () => {
      if (cancelled) return;
      try {
        await fetch(`/api/sessions/${sessionId}/evaluations/process`, {
          method: 'POST',
          cache: 'no-store',
        });
      } catch {
        // Best effort: the next wake retries pending grading work.
      }
    };

    void wake();
    const interval = window.setInterval(() => void wake(), WAKE_INTERVAL_MS);
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
