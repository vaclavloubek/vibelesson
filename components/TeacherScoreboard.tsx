'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '@/components/TeacherScoreboard.module.css';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

type ScoreSource = 'quiz' | 'ai' | 'teacher' | 'pending' | 'failed' | 'missing';

type BreakdownItem = {
  blockId: string;
  blockTitle: string;
  blockType: string;
  points: number | null;
  maxPoints: number;
  source: ScoreSource;
};

type ScoreboardRow = {
  participantId: string;
  displayName: string;
  rank: number;
  score: number;
  maxPoints: number;
  provisionalCount: number;
  pendingCount: number;
  failedCount: number;
  breakdown: BreakdownItem[];
};

type ScoreboardData = {
  status: 'lobby' | 'live' | 'ended';
  scoreboardRevealed: boolean;
  hasScoring: boolean;
  availableMaxPoints: number;
  scoredBlockCount: number;
  pendingEvaluations: number;
  needsReviewEvaluations: number;
  unconfirmedEvaluations: number;
  failedEvaluations: number;
  rows: ScoreboardRow[];
};

function sourceLabel(source: ScoreSource, english: boolean) {
  switch (source) {
    case 'quiz': return 'Quiz';
    case 'teacher': return english ? 'Confirmed by teacher' : 'Potvrzeno učitelem';
    case 'ai': return english ? 'AI suggestion' : 'AI návrh';
    case 'pending': return english ? 'Waiting for AI' : 'Čeká na AI';
    case 'failed': return english ? 'AI error' : 'AI chyba';
    case 'missing': return english ? 'No response' : 'Bez odpovědi';
  }
}

export default function TeacherScoreboard({ sessionId }: { sessionId: string }) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState('');
  const [revealBusy, setRevealBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/scoreboard`, { cache: 'no-store' });
      const body = await response.json() as ScoreboardData & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Skóre se nepodařilo načíst.', 'Scores could not be loaded.'));
      setData(body);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Skóre se nepodařilo načíst.', 'Scores could not be loaded.'));
    }
  }, [english, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      await load();
    };

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const setScoreboardVisibility = async (revealed: boolean) => {
    setRevealBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: revealed ? 'reveal_scoreboard' : 'hide_scoreboard' }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Viditelnost pořadí se nepodařilo změnit.', 'Scoreboard visibility could not be changed.'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Viditelnost pořadí se nepodařilo změnit.', 'Scoreboard visibility could not be changed.'));
    } finally {
      setRevealBusy(false);
    }
  };

  // LEGAL-021: AI points are proposals; the teacher confirms them before they count.
  const confirmAiProposals = async () => {
    if (!window.confirm(ui(
      'Potvrdit všechny dosavadní návrhy AI jako tvoje hodnocení? Body se pak započítají do skóre a pořadí. Jednotlivé body můžeš i nadále upravit.',
      'Confirm all current AI suggestions as your grading? The points will then count toward scores and ranking. You can still adjust individual points.',
    ))) return;
    setConfirmBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/confirm-ai`, { method: 'POST' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Návrhy AI se nepodařilo potvrdit.', 'AI suggestions could not be confirmed.'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Návrhy AI se nepodařilo potvrdit.', 'AI suggestions could not be confirmed.'));
    } finally {
      setConfirmBusy(false);
    }
  };

  if (!data || data.status !== 'live' || !data.hasScoring) return null;

  const leader = data.rows[0];
  const summary = leader
    ? `${ui('Skóre', 'Scores')} · ${leader.displayName} ${leader.score}/${leader.maxPoints}`
    : ui('Skóre · bez studentů', 'Scores · no students');
  const hasRevealWarning = !data.scoreboardRevealed && Boolean(
    data.pendingEvaluations || data.needsReviewEvaluations || data.unconfirmedEvaluations,
  );
  const canReveal = data.availableMaxPoints > 0;

  return (
    <aside className={styles.wrap}>
      <div className={`panel ${styles.revealPanel}`}>
        <div className={styles.revealHead}>
          <div>
            <strong>{data.scoreboardRevealed ? ui('Pořadí je zveřejněné', 'The scoreboard is visible') : ui('Pořadí je skryté', 'The scoreboard is hidden')}</strong>
            <span>
              {data.scoreboardRevealed
                ? ui('Studenti vidí jen své vlastní skóre a pořadí.', 'Students can see only their own score and rank.')
                : canReveal
                  ? ui('Studenti zatím své skóre ani pořadí nevidí.', 'Students cannot see their score or rank yet.')
                  : ui('Zatím není k dispozici žádný bodovaný blok.', 'No scored block is available yet.')}
            </span>
          </div>
          <button
            className={data.scoreboardRevealed ? 'secondary' : undefined}
            type="button"
            disabled={revealBusy || (!data.scoreboardRevealed && !canReveal)}
            onClick={() => void setScoreboardVisibility(!data.scoreboardRevealed)}
          >
            {revealBusy
              ? ui('Ukládám…', 'Saving…')
              : data.scoreboardRevealed
                ? ui('Skrýt pořadí', 'Hide scoreboard')
                : ui('Zveřejnit pořadí', 'Reveal scoreboard')}
          </button>
        </div>

        {hasRevealWarning ? (
          <div className={styles.warning} role="status">
            <strong>{ui('Před zveřejněním zkontroluj hodnocení:', 'Review grading before revealing:')}</strong>
            <ul>
              {data.pendingEvaluations ? <li>{data.pendingEvaluations} {ui('AI hodnocení ještě čeká.', 'AI grading items are still pending.')}</li> : null}
              {data.needsReviewEvaluations ? <li>{data.needsReviewEvaluations} {ui('AI hodnocení je označeno k ruční kontrole.', 'AI grading items need manual review.')}</li> : null}
              {data.unconfirmedEvaluations ? <li>{data.unconfirmedEvaluations} {ui('AI návrhů zatím není potvrzeno učitelem.', 'AI suggestions are not yet confirmed by the teacher.')}</li> : null}
            </ul>
            <span>{ui('Pořadí můžeš zveřejnit i přesto.', 'You can reveal the scoreboard anyway.')}</span>
          </div>
        ) : null}

        {data.unconfirmedEvaluations ? (
          <div className={styles.warning} role="status">
            <strong>{ui(
              `${data.unconfirmedEvaluations} návrhů AI čeká na tvoje potvrzení.`,
              `${data.unconfirmedEvaluations} AI suggestions are waiting for your confirmation.`,
            )}</strong>
            <span>{ui(
              'Body od AI jsou jen návrh a do skóre ani pořadí se nezapočítají, dokud je nepotvrdíš.',
              'AI points are only a suggestion and do not count toward scores or ranking until you confirm them.',
            )}</span>
            <button type="button" disabled={confirmBusy} onClick={() => void confirmAiProposals()}>
              {confirmBusy ? ui('Potvrzuji…', 'Confirming…') : ui('Potvrdit všechny návrhy AI', 'Confirm all AI suggestions')}
            </button>
          </div>
        ) : null}

        {error ? <p className={styles.controlError}>{error}</p> : null}
      </div>

      <details className={`panel ${styles.panel}`}>
        <summary className={styles.summary}>{summary}</summary>
        <div className={styles.content}>
          <div className={styles.meta}>
            <span>{data.scoredBlockCount} {english ? 'scored blocks' : 'bodovaných bloků'}</span>
            {data.unconfirmedEvaluations ? <span>{data.unconfirmedEvaluations} {english ? 'AI suggestions' : 'AI návrhů'}</span> : null}
            {data.pendingEvaluations ? <span>{data.pendingEvaluations} {english ? 'pending' : 'čeká'}</span> : null}
            {data.failedEvaluations ? <span>{data.failedEvaluations} {english ? 'errors' : 'chyb'}</span> : null}
          </div>
          <p className="muted-copy" style={{ margin: '0 0 10px' }}>
            {data.scoreboardRevealed
              ? ui('Studenti vidí pouze své vlastní skóre a pořadí. Kompletní tabulka, zdroje bodů a stav AI hodnocení zůstávají pouze učiteli.', 'Students see only their own score and rank. The full table, score sources and AI grading state remain visible only to the teacher.')
              : ui('Průběžné pořadí vidí pouze učitel. Body od AI jsou návrh; do skóre se započítají až po tvém potvrzení.', 'Only the teacher sees the live ranking. AI points are a suggestion and count only after you confirm them.')}
          </p>

          {!error && data.rows.length ? (
            <div className={styles.rows}>
              {data.rows.map((row) => (
                <div className={`item ${styles.row}`} key={row.participantId}>
                  <div className={styles.rowHead}>
                    <div className={styles.identity}>
                      <strong className={styles.rank}>{row.rank}.</strong>
                      <strong>{row.displayName}</strong>
                    </div>
                    <strong>{row.score} / {row.maxPoints}</strong>
                  </div>

                  {(row.provisionalCount || row.pendingCount || row.failedCount) ? (
                    <div className={styles.badges}>
                      {row.provisionalCount ? <span>{row.provisionalCount}× {ui('AI návrh', 'AI suggestion')}</span> : null}
                      {row.pendingCount ? <span>{row.pendingCount}× {ui('čeká', 'pending')}</span> : null}
                      {row.failedCount ? <span>{row.failedCount}× {ui('chyba', 'error')}</span> : null}
                    </div>
                  ) : null}

                  <details className={styles.breakdown}>
                    <summary>{ui('Rozpad bodů', 'Score breakdown')}</summary>
                    <div className={styles.breakdownList}>
                      {row.breakdown.map((item) => (
                        <div className={styles.breakdownItem} key={item.blockId}>
                          <div>
                            <strong>{item.blockTitle}</strong>
                            <span>{sourceLabel(item.source, english)}</span>
                          </div>
                          <strong>{item.points === null ? '—' : item.points} / {item.maxPoints}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : null}

          {!error && !data.rows.length ? <p className="muted-copy" style={{ margin: 0 }}>{ui('Zatím nejsou připojení studenti.', 'No students are connected yet.')}</p> : null}
        </div>
      </details>
    </aside>
  );
}
