'use client';

import type { CSSProperties } from 'react';
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function racePosition(score: number, maxPoints: number) {
  const progress = maxPoints > 0 ? clamp(score / maxPoints, 0, 1) : 0;
  return 12 + progress * 74;
}

function rocketStyle(row: PresenterRow, maxPoints: number, index: number): CSSProperties {
  const position = `${racePosition(row.score, maxPoints)}%`;
  return {
    '--rocket-position': position,
    '--rocket-start': position,
    '--rocket-hue': String((246 + index * 47) % 360),
  } as CSSProperties;
}

function RocketGlyph() {
  return (
    <svg viewBox="0 0 72 44" aria-hidden="true">
      <path className={styles.rocketFlame} d="M15 22 3 14l4 8-4 8 12-8Z" />
      <path className={styles.rocketFin} d="M26 10 19 2l2 13M26 34l-7 8 2-13" />
      <path className={styles.rocketBody} d="M12 22C21 8 35 5 49 8c8 2 15 8 20 14-5 6-12 12-20 14-14 3-28 0-37-14Z" />
      <circle className={styles.rocketWindow} cx="46" cy="22" r="5" />
    </svg>
  );
}

function CompactRow({ row, maxPoints }: { row: PresenterRow; maxPoints: number }) {
  return (
    <div className={styles.compactRow}>
      <strong>{row.rank}.</strong>
      <span>{row.displayName}</span>
      <strong>{row.score}/{maxPoints}</strong>
    </div>
  );
}

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
  const boardTitle = data?.status === 'ended' ? 'Konečné pořadí' : 'Závod k Měsíci';
  const participantCount = data?.rows.length ?? 0;
  const raceLimit = participantCount <= 12 ? participantCount : participantCount <= 24 ? 10 : 5;
  const raceRows = data?.rows.slice(0, raceLimit) ?? [];
  const remainingRows = participantCount > 12 && participantCount <= 24 ? data?.rows.slice(10) ?? [] : [];
  const largeLeaderboard = participantCount >= 25 ? data?.rows.slice(0, 10) ?? [] : [];
  const largeOverflow = participantCount >= 25 ? Math.max(0, participantCount - 10) : 0;
  const isFinal = data?.status === 'ended';

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark}><SyllonautMark /></span>
          <span>Syllonaut</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.status}>{phaseLabel}</span>
          <span className={styles.status}>Presenter</span>
        </div>
      </header>

      <section className={styles.content}>
        {data ? (
          <div className={styles.missionHead}>
            <div>
              <p className={styles.kicker}>{phaseLabel}</p>
              <h1 className={styles.title}>{data.title}</h1>
            </div>
            {data.scoreboardRevealed && data.hasScoring ? (
              <div className={styles.scoreMeta}>
                <strong>{participantCount}</strong>
                <span>{participantCount === 1 ? 'posádka' : participantCount >= 2 && participantCount <= 4 ? 'posádky' : 'posádek'}</span>
                <i />
                <strong>{data.maxPoints}</strong>
                <span>bodů maximum</span>
              </div>
            ) : null}
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
          <div className={styles.board}>
            <div className={styles.boardHead}>
              <div>
                <p className={styles.kicker}>{isFinal ? 'Cíl mise' : 'Aktuální pozice'}</p>
                <h2>{boardTitle}</h2>
              </div>
              {isFinal ? <span className={styles.finalSequence}>Konečná poloha odpovídá získaným bodům</span> : null}
            </div>

            {data.rows.length ? (
              <div className={`${styles.raceLayout} ${participantCount >= 25 ? styles.raceLayoutLarge : ''}`}>
                <section className={styles.racePanel} aria-label={isFinal ? 'Konečný závod k Měsíci' : 'Průběžný závod k Měsíci'}>
                  <div className={`${styles.raceCourse} ${raceRows.length >= 9 ? styles.raceCourseDense : ''}`}>
                    <div className={styles.spaceDust} aria-hidden="true" />
                    <div className={styles.earth} aria-hidden="true"><span>Země</span></div>
                    <div className={styles.moon} aria-hidden="true"><span>Měsíc</span></div>
                    <div className={styles.routeLine} aria-hidden="true" />

                    <div className={styles.lanes}>
                      {raceRows.map((row, index) => (
                        <div className={styles.lane} key={`${row.displayName}-${index}`}>
                          <div className={styles.laneLine} aria-hidden="true" />
                          <div
                            className={`${styles.rocket} ${isFinal ? styles.rocketEnded : ''}`}
                            style={rocketStyle(row, data.maxPoints, index)}
                          >
                            <span className={styles.rocketTag}>
                              <strong>{row.rank}. {row.displayName}</strong>
                              <small>{row.score} / {data.maxPoints}</small>
                            </span>
                            <span className={styles.rocketGlyph}><RocketGlyph /></span>
                            {isFinal ? <span className={styles.engineFade} aria-hidden="true" /> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.raceLegend}>
                    <span>Start</span>
                    <span>Poloha rakety = získané body / aktuálně dostupné maximum</span>
                    <span>Cíl</span>
                  </div>
                </section>

                {participantCount >= 25 ? (
                  <aside className={styles.leaderboard}>
                    <div className={styles.leaderboardHead}>
                      <div>
                        <p className={styles.kicker}>Přehled</p>
                        <h3>Top 10</h3>
                      </div>
                      {largeOverflow ? <span>+ {largeOverflow} dalších</span> : null}
                    </div>
                    <div className={styles.compactRows}>
                      {largeLeaderboard.map((row, index) => <CompactRow key={`${row.displayName}-${index}`} row={row} maxPoints={data.maxPoints} />)}
                    </div>
                  </aside>
                ) : null}
              </div>
            ) : (
              <div className={styles.waiting}>
                <div className={styles.waitingInner}>
                  <h2>Zatím bez výsledků</h2>
                  <p>Pořadí se doplní, jakmile budou k dispozici účastníci a body.</p>
                </div>
              </div>
            )}

            {remainingRows.length ? (
              <section className={styles.remaining}>
                <div className={styles.remainingHead}>
                  <strong>Další posádky</strong>
                  <span>{remainingRows.length} mimo hlavní letovou dráhu</span>
                </div>
                <div className={styles.remainingGrid}>
                  {remainingRows.map((row, index) => <CompactRow key={`${row.displayName}-${index}`} row={row} maxPoints={data.maxPoints} />)}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
