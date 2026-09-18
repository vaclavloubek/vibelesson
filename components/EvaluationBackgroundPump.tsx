'use client';

import { useEffect } from 'react';
import { trackEvent, type ActivityType } from '@/lib/analytics';

const WAKE_INTERVAL_MS = 8000;

type QueueResponse = { evaluationIds?: string[] };
type GradeResponse = {
  activityType?: Extract<ActivityType, 'open_text' | 'exit_ticket' | 'team_task'>;
  status?: 'graded' | 'needs_review';
};

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

        const results = await Promise.allSettled(evaluationIds.map(async (evaluationId) => {
          const response = await fetch(
            `/api/sessions/${sessionId}/evaluations/${evaluationId}/grade`,
            { method: 'POST', cache: 'no-store' },
          );
          if (!response.ok) return;
          const data = await response.json() as GradeResponse;
          if (
            (data.activityType === 'open_text' || data.activityType === 'exit_ticket' || data.activityType === 'team_task')
            && (data.status === 'graded' || data.status === 'needs_review')
          ) {
            trackEvent('ai_grading_completed', {
              activity_type: data.activityType,
              result_state: data.status,
            });
          }
        }));
        void results;
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
