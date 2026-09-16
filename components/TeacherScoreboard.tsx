'use client';

import { useEffect, useState } from 'react';
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
  hasScoring: boolean;
  availableMaxPoints: number;
  scoredBlockCount: number;
  pendingEvaluations: number;
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/scoreboard`, { cache: 'no-store' });
        const body = await response.json() as ScoreboardData & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Skóre se nepodařilo načíst.');
        if (cancelled) return;
        setData(body);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Skóre se nepodařilo načíst.');
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionId]);

  if (!data || data.status !== 'live' || !data.hasScoring) return null;

  const leader = data.rows[0];
  const summary = leader
    ? `Skóre · ${leader.displayName} ${leader.score}/${leader.maxPoints}`
    : 'Skóre · bez studentů';

  return (
    <aside className={styles.wrap}>
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
            Průběžné pořadí vidí pouze učitel. AI skóre se započítává dočasně; potvrzené nebo upravené skóre učitele má přednost.
          </p>

          {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}

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
