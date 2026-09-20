'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import GuideHelpButton from '@/components/GuideHelpButton';

type ScoreboardControlState = {
  status: 'lobby' | 'live' | 'ended';
  scoreboardRevealed: boolean;
  hasScoring: boolean;
  availableMaxPoints: number;
  pendingEvaluations: number;
  needsReviewEvaluations: number;
  unconfirmedEvaluations: number;
};

export default function TeacherScoreboardQuickAction({ sessionId, userId }: { sessionId: string; userId: string | null }) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
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
        : data?.status === 'lobby'
          ? 'main.teacher-live-shell .panel .actions'
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
    if (!data || busy || data.status === 'lobby') return;

    const revealing = !data.scoreboardRevealed;
    if (revealing) {
      const warnings: string[] = [];
      if (data.pendingEvaluations) warnings.push(english ? `${data.pendingEvaluations} AI grading items are still pending.` : `${data.pendingEvaluations} AI hodnocení ještě čeká.`);
      if (data.needsReviewEvaluations) warnings.push(english ? `${data.needsReviewEvaluations} AI grading items need manual review.` : `${data.needsReviewEvaluations} AI hodnocení je označeno k ruční kontrole.`);
      if (data.unconfirmedEvaluations) warnings.push(english ? `${data.unconfirmedEvaluations} AI suggestions are not yet confirmed by the teacher.` : `${data.unconfirmedEvaluations} AI návrhů zatím není potvrzeno učitelem.`);

      if (warnings.length && !window.confirm(english ? `Review grading before revealing:\n\n${warnings.join('\n')}\n\nReveal the scoreboard anyway?` : `Před zveřejněním zkontroluj hodnocení:\n\n${warnings.join('\n')}\n\nZveřejnit pořadí i přesto?`)) {
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
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Viditelnost pořadí se nepodařilo změnit.', 'Scoreboard visibility could not be changed.'));

      const nextRevealed = typeof body.scoreboardRevealed === 'boolean'
        ? body.scoreboardRevealed
        : revealing;
      setData((current) => current ? { ...current, scoreboardRevealed: nextRevealed } : current);
      setFeedback(nextRevealed ? ui('Pořadí je zveřejněné studentům.', 'The scoreboard is visible to students.') : ui('Pořadí je skryté.', 'The scoreboard is hidden.'));
      void load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ui('Viditelnost pořadí se nepodařilo změnit.', 'Scoreboard visibility could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!target || !data) return null;

  const canReveal = data.hasScoring && data.availableMaxPoints > 0;
  const disabled = busy || (!data.scoreboardRevealed && !canReveal);
  const label = busy
    ? ui('Ukládám…', 'Saving…')
    : data.scoreboardRevealed
      ? ui('Skrýt pořadí', 'Hide scoreboard')
      : canReveal
        ? ui('Zveřejnit pořadí', 'Reveal scoreboard')
        : ui('Pořadí zatím nelze zveřejnit', 'Scoreboard cannot be revealed yet');

  return createPortal(
    <>
      <GuideHelpButton userId={userId} chapter="live" step={0} labelCs="Jak promítat studentům" labelEn="How to present to students" className="phone-hide-presenter" />
      <a
        className="secondary button-link phone-hide-presenter"
        data-tour="live-presenter"
        href={`/sessions/${sessionId}/presenter`}
        target="_blank"
        rel="noreferrer"
      >
        {ui('Prezentační režim', 'Presenter mode')}
      </a>
      {data.status !== 'lobby' ? (
        <button
          className={data.status === 'ended' && !data.scoreboardRevealed ? 'primary' : 'secondary'}
          type="button"
          disabled={disabled}
          onClick={() => void changeVisibility()}
          title={!canReveal && !data.scoreboardRevealed ? ui('Zatím není k dispozici žádný bodovaný blok.', 'No scored block is available yet.') : undefined}
        >
          {label}
        </button>
      ) : null}
      {data.status === 'ended' && (feedback || actionError || data.scoreboardRevealed) ? (
        <span
          role={actionError ? 'alert' : 'status'}
          className={actionError ? 'error' : 'muted-copy'}
          style={{ alignSelf: 'center', margin: 0 }}
        >
          {actionError || feedback || ui('Pořadí je zveřejněné studentům.', 'The scoreboard is visible to students.')}
        </span>
      ) : null}
    </>,
    target,
  );
}
