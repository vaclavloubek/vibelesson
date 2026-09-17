'use client';

import { useCallback, useEffect, useState } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/PresenterScoreboard.module.css';
import { createClient } from '@/lib/supabase/client';

type PresenterRow = {
  rank: number;
  displayName: string;
  score: number;
};

type PresenterData = {
  status: 'lobby' | 'live' | 'ended';
  title: string;
  realtimeKey: string;
  hasScoring: boolean;
  scoreboardRevealed: boolean;
  maxPoints: number;
  rows: PresenterRow[];
};

export default function PresenterScoreboard({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<PresenterData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/presenter`, { cache: 'no-store' });
      const body = await response.json() as PresenterData & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Prezentační režim se nepodařilo načíst.');
      setData(body);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prezentační režim se nepodařilo načíst.');
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${data.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [data?.realtimeKey, load]);

  const phaseLabel = data?.status === 'ended' ? 'Mise dokončena' : data?.status === 'live' ? 'Mise probíhá' : 'Startovní zóna';
  const boardTitle = data?.status === 'ended' ? 'Konečné pořadí' : 'Průběžné pořadí';

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div>
          <div className={styles.brand}>
            <span className={styles.mark}><SyllonautMark /></span>
            <span>Syllonaut</span>
          </div>
        </div>
        <div className={styles.meta}>
          <span className={styles.status}>{phaseLabel}</span>
          <span className={styles.status}>Presenter</span>
        </div>
      </header>

      <section className={styles.content}>
        {data ? (
          <div>
            <p className={styles.kicker}>{phaseLabel}</p>
            <h1 className={styles.title}>{data.title}</h1>
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button className={styles.retry} type="button" onClick={() => void load()}>Zkusit znovu</button>
          </div>
        ) : null}

        {!data && !error ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>Připravuji projekci…</h2>
            </div>
          </div>
        ) : null}

        {data && !error && !data.hasScoring ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>Tahle mise nemá bodované aktivity</h2>
              <p>Prezentační pořadí se zobrazí jen u lekcí, ve kterých lze získávat body.</p>
            </div>
          </div>
        ) : null}

        {data && !error && data.hasScoring && !data.scoreboardRevealed ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>Pořadí je zatím skryté</h2>
              <p>Až učitel zveřejní pořadí v Řídicím centru, tato obrazovka se aktualizuje automaticky.</p>
            </div>
          </div>
        ) : null}

        {data && !error && data.hasScoring && data.scoreboardRevealed ? (
          <div style={{ marginTop: 'clamp(28px, 5vh, 58px)' }}>
            <div className={styles.boardHead}>
              <h2>{boardTitle}</h2>
              <span className={styles.maxPoints}>Maximum {data.maxPoints} bodů</span>
            </div>

            {data.rows.length ? (
              <div className={`${styles.rows} ${data.rows.length > 8 ? styles.rowsMany : ''}`}>
                {data.rows.map((row, index) => (
                  <div className={styles.row} key={`${row.rank}-${row.displayName}-${index}`}>
                    <strong className={styles.rank}>{row.rank}.</strong>
                    <strong className={styles.name}>{row.displayName}</strong>
                    <strong className={styles.score}>{row.score} <span>/ {data.maxPoints}</span></strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.waiting}>
                <div className={styles.waitingInner}>
                  <h2>Zatím bez výsledků</h2>
                  <p>Pořadí se doplní, jakmile budou k dispozici účastníci a body.</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
