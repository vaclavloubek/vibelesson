'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '@/components/TeacherScoreboard.module.css';

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

function sourceLabel(source: ScoreSource) {
  switch (source) {
    case 'quiz': return 'Quiz';
    case 'teacher': return 'Potvrzeno učitelem';
    case 'ai': return 'AI návrh';
    case 'pending': return 'Čeká na AI';
    case 'failed': return 'AI chyba';
    case 'missing': return 'Bez odpovědi';
  }
}

export default function TeacherScoreboard({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState('');
  const [revealBusy, setRevealBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/scoreboard`, { cache: 'no-store' });
      const body = await response.json() as ScoreboardData & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Skóre se nepodařilo načíst.');
      setData(body);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skóre se nepodařilo načíst.');
    }
  }, [sessionId]);

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
      if (!response.ok) throw new Error(body.error || 'Viditelnost pořadí se nepodařilo změnit.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Viditelnost pořadí se nepodařilo změnit.');
    } finally {
      setRevealBusy(false);
    }
  };

  if (!data || data.status !== 'live' || !data.hasScoring) return null;

  const leader = data.rows[0];
  const summary = leader
    ? `Skóre · ${leader.displayName} ${leader.score}/${leader.maxPoints}`
    : 'Skóre · bez studentů';
  const hasRevealWarning = !data.scoreboardRevealed && Boolean(
    data.pendingEvaluations || data.needsReviewEvaluations || data.unconfirmedEvaluations,
  );
  const canReveal = data.availableMaxPoints > 0;

  return (
    <aside className={styles.wrap}>
      <div className={`panel ${styles.revealPanel}`}>
        <div className={styles.revealHead}>
          <div>
            <strong>{data.scoreboardRevealed ? 'Pořadí je zveřejněné' : 'Pořadí je skryté'}</strong>
            <span>
              {data.scoreboardRevealed
                ? 'Studenti vidí jen své vlastní skóre a pořadí.'
                : canReveal
                  ? 'Studenti zatím své skóre ani pořadí nevidí.'
                  : 'Zatím není k dispozici žádný bodovaný blok.'}
            </span>
          </div>
          <button
            className={data.scoreboardRevealed ? 'secondary' : undefined}
            type="button"
            disabled={revealBusy || (!data.scoreboardRevealed && !canReveal)}
            onClick={() => void setScoreboardVisibility(!data.scoreboardRevealed)}
          >
            {revealBusy
              ? 'Ukládám…'
              : data.scoreboardRevealed
                ? 'Skrýt pořadí'
                : 'Zveřejnit pořadí'}
          </button>
        </div>

        {hasRevealWarning ? (
          <div className={styles.warning} role="status">
            <strong>Před zveřejněním zkontroluj hodnocení:</strong>
            <ul>
              {data.pendingEvaluations ? <li>{data.pendingEvaluations} AI hodnocení ještě čeká.</li> : null}
              {data.needsReviewEvaluations ? <li>{data.needsReviewEvaluations} AI hodnocení je označeno k ruční kontrole.</li> : null}
              {data.unconfirmedEvaluations ? <li>{data.unconfirmedEvaluations} AI návrhů zatím není potvrzeno učitelem.</li> : null}
            </ul>
            <span>Pořadí můžeš zveřejnit i přesto.</span>
          </div>
        ) : null}

        {error ? <p className={styles.controlError}>{error}</p> : null}
      </div>

      <details className={`panel ${styles.panel}`}>
        <summary className={styles.summary}>{summary}</summary>
        <div className={styles.content}>
          <div className={styles.meta}>
            <span>{data.scoredBlockCount} bodovaných bloků</span>
            {data.unconfirmedEvaluations ? <span>{data.unconfirmedEvaluations} AI návrhů</span> : null}
            {data.pendingEvaluations ? <span>{data.pendingEvaluations} čeká</span> : null}
            {data.failedEvaluations ? <span>{data.failedEvaluations} chyb</span> : null}
          </div>
          <p className="muted-copy" style={{ margin: '0 0 10px' }}>
            {data.scoreboardRevealed
              ? 'Studenti vidí pouze své vlastní skóre a pořadí. Kompletní tabulka, zdroje bodů a stav AI hodnocení zůstávají pouze učiteli.'
              : 'Průběžné pořadí vidí pouze učitel. AI skóre se započítává dočasně; potvrzené nebo upravené skóre učitele má přednost.'}
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
                      {row.provisionalCount ? <span>{row.provisionalCount}× AI návrh</span> : null}
                      {row.pendingCount ? <span>{row.pendingCount}× čeká</span> : null}
                      {row.failedCount ? <span>{row.failedCount}× chyba</span> : null}
                    </div>
                  ) : null}

                  <details className={styles.breakdown}>
                    <summary>Rozpad bodů</summary>
                    <div className={styles.breakdownList}>
                      {row.breakdown.map((item) => (
                        <div className={styles.breakdownItem} key={item.blockId}>
                          <div>
                            <strong>{item.blockTitle}</strong>
                            <span>{sourceLabel(item.source)}</span>
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

          {!error && !data.rows.length ? <p className="muted-copy" style={{ margin: 0 }}>Zatím nejsou připojení studenti.</p> : null}
        </div>
      </details>
    </aside>
  );
}
