'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type ScoreboardControlState = {
  status: 'lobby' | 'live' | 'ended';
  scoreboardRevealed: boolean;
  hasScoring: boolean;
  availableMaxPoints: number;
  pendingEvaluations: number;
  needsReviewEvaluations: number;
  unconfirmedEvaluations: number;
};

export default function TeacherScoreboardQuickAction({ sessionId }: { sessionId: string }) {
  const [target, setTarget] = useState<Element | null>(null);
  const [data, setData] = useState<ScoreboardControlState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/scoreboard`, { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json() as ScoreboardControlState;
      setData(body);
    } catch {
      // Hlavní teacher UI zůstává funkční i při dočasném výpadku tohoto pomocného ovládání.
    }
  }, [sessionId]);

  useEffect(() => {
    const locate = () => {
      const selector = data?.status === 'ended'
        ? 'main.teacher-live-shell .actions'
        : '.live-control-actions';
      const nextTarget = document.querySelector(selector);
      setTarget((current) => current === nextTarget ? current : nextTarget);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [data?.status]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const changeVisibility = async () => {
    if (!data || busy) return;

    const revealing = !data.scoreboardRevealed;
    if (revealing) {
      const warnings: string[] = [];
      if (data.pendingEvaluations) warnings.push(`${data.pendingEvaluations} AI hodnocení ještě čeká.`);
      if (data.needsReviewEvaluations) warnings.push(`${data.needsReviewEvaluations} AI hodnocení je označeno k ruční kontrole.`);
      if (data.unconfirmedEvaluations) warnings.push(`${data.unconfirmedEvaluations} AI návrhů zatím není potvrzeno učitelem.`);

      if (warnings.length && !window.confirm(`Před zveřejněním zkontroluj hodnocení:\n\n${warnings.join('\n')}\n\nZveřejnit pořadí i přesto?`)) {
        return;
      }
    }

    setBusy(true);
    setFeedback('');
    setActionError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: revealing ? 'reveal_scoreboard' : 'hide_scoreboard' }),
      });
      const body = await response.json() as { error?: string; scoreboardRevealed?: boolean };
      if (!response.ok) throw new Error(body.error || 'Viditelnost pořadí se nepodařilo změnit.');

      const nextRevealed = typeof body.scoreboardRevealed === 'boolean'
        ? body.scoreboardRevealed
        : revealing;
      setData((current) => current ? { ...current, scoreboardRevealed: nextRevealed } : current);
      setFeedback(nextRevealed ? 'Pořadí je zveřejněné studentům.' : 'Pořadí je skryté.');
      void load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Viditelnost pořadí se nepodařilo změnit.');
    } finally {
      setBusy(false);
    }
  };

  if (!target || !data || (data.status !== 'live' && data.status !== 'ended')) return null;

  const canReveal = data.hasScoring && data.availableMaxPoints > 0;
  const disabled = busy || (!data.scoreboardRevealed && !canReveal);
  const label = busy
    ? 'Ukládám…'
    : data.scoreboardRevealed
      ? 'Skrýt pořadí'
      : canReveal
        ? 'Zveřejnit pořadí'
        : 'Pořadí zatím nelze zveřejnit';

  return createPortal(
    <>
      <button
        className={data.status === 'ended' && !data.scoreboardRevealed ? 'primary' : 'secondary'}
        type="button"
        disabled={disabled}
        onClick={() => void changeVisibility()}
        title={!canReveal && !data.scoreboardRevealed ? 'Zatím není k dispozici žádný bodovaný blok.' : undefined}
      >
        {label}
      </button>
      {data.status === 'ended' && (feedback || actionError || data.scoreboardRevealed) ? (
        <span
          role={actionError ? 'alert' : 'status'}
          className={actionError ? 'error' : 'muted-copy'}
          style={{ alignSelf: 'center', margin: 0 }}
        >
          {actionError || feedback || 'Pořadí je zveřejněné studentům.'}
        </span>
      ) : null}
    </>,
    target,
  );
}
