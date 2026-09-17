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

    if (!data.scoreboardRevealed) {
      const warnings: string[] = [];
      if (data.pendingEvaluations) warnings.push(`${data.pendingEvaluations} AI hodnocení ještě čeká.`);
      if (data.needsReviewEvaluations) warnings.push(`${data.needsReviewEvaluations} AI hodnocení je označeno k ruční kontrole.`);
      if (data.unconfirmedEvaluations) warnings.push(`${data.unconfirmedEvaluations} AI návrhů zatím není potvrzeno učitelem.`);

      if (warnings.length && !window.confirm(`Před zveřejněním zkontroluj hodnocení:\n\n${warnings.join('\n')}\n\nZveřejnit pořadí i přesto?`)) {
        return;
      }
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: data.scoreboardRevealed ? 'hide_scoreboard' : 'reveal_scoreboard' }),
      });
      if (!response.ok) return;
      await load();
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
    <button
      className={data.status === 'ended' && !data.scoreboardRevealed ? 'primary' : 'secondary'}
      type="button"
      disabled={disabled}
      onClick={() => void changeVisibility()}
      title={!canReveal && !data.scoreboardRevealed ? 'Zatím není k dispozici žádný bodovaný blok.' : undefined}
    >
      {label}
    </button>,
    target,
  );
}
