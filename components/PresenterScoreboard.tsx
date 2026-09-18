'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/PresenterScoreboard.module.css';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
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

function scoreProgress(score: number, maxPoints: number) {
  return maxPoints > 0 ? clamp(score / maxPoints, 0, 1) : 0;
}

function racePosition(score: number, maxPoints: number) {
  return 12 + scoreProgress(score, maxPoints) * 74;
}

function rocketStyle(row: PresenterRow, maxPoints: number, index: number, isFinal: boolean): CSSProperties {
  const progress = scoreProgress(row.score, maxPoints);
  const position = `${racePosition(row.score, maxPoints)}%`;
  const style = {
    '--rocket-position': position,
    '--rocket-target': position,
    '--rocket-hue': String((246 + index * 47) % 360),
  } as CSSProperties & Record<string, string>;

  if (isFinal) {
    style['--flight-delay'] = `${Math.min(index, 9) * 0.08}s`;
    style['--flight-duration'] = `${2.55 + progress * 0.65}s`;
    const podiumDelay = index === 2 ? 0.12 : index === 1 ? 0.48 : index === 0 ? 0.84 : 0;
    style['--celebration-delay'] = `${podiumDelay}s`;
  }

  return style;
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
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [data, setData] = useState<PresenterData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/presenter`, { cache: 'no-store' });
      const body = await response.json() as PresenterData & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Prezentační režim se nepodařilo načíst.', 'Presenter mode could not be loaded.'));
      setData(body);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Prezentační režim se nepodařilo načíst.', 'Presenter mode could not be loaded.'));
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

  const phaseLabel = data?.status === 'ended' ? ui('Mise dokončena', 'Lesson completed') : data?.status === 'live' ? ui('Mise probíhá', 'Lesson in progress') : ui('Startovní zóna', 'Starting area');
  const boardTitle = data?.status === 'ended' ? ui('Konečné pořadí', 'Final ranking') : ui('Závod k Měsíci', 'Race to the Moon');
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
                <span>{english ? (participantCount === 1 ? 'crew' : 'crews') : participantCount === 1 ? 'posádka' : participantCount >= 2 && participantCount <= 4 ? 'posádky' : 'posádek'}</span>
                <i />
                <strong>{data.maxPoints}</strong>
                <span>{ui('bodů maximum', 'maximum points')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button className={styles.retry} type="button" onClick={() => void load()}>{ui('Zkusit znovu', 'Try again')}</button>
          </div>
        ) : null}

        {!data && !error ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>{ui('Připravuji projekci…', 'Preparing projection…')}</h2>
            </div>
          </div>
        ) : null}

        {data && !error && !data.hasScoring ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>{ui('Tahle mise nemá bodované aktivity', 'This lesson has no scored activities')}</h2>
              <p>{ui('Prezentační pořadí se zobrazí jen u lekcí, ve kterých lze získávat body.', 'The presenter ranking appears only in lessons where students can earn points.')}</p>
            </div>
          </div>
        ) : null}

        {data && !error && data.hasScoring && !data.scoreboardRevealed ? (
          <div className={styles.waiting}>
            <div className={styles.waitingInner}>
              <div className={styles.waitingOrb} />
              <h2>{ui('Pořadí je zatím skryté', 'The ranking is hidden')}</h2>
              <p>{ui('Až učitel zveřejní pořadí v Řídicím centru, tato obrazovka se aktualizuje automaticky.', 'This screen updates automatically when the teacher reveals the ranking in the Control Centre.')}</p>
            </div>
          </div>
        ) : null}

        {data && !error && data.hasScoring && data.scoreboardRevealed ? (
          <div className={styles.board}>
            <div className={styles.boardHead}>
              <div>
                <p className={styles.kicker}>{isFinal ? ui('Cíl mise', 'Mission finish') : ui('Aktuální pozice', 'Current positions')}</p>
                <h2>{boardTitle}</h2>
              </div>
              {isFinal ? <span className={styles.finalSequence}>{ui('Finální let · zrychlení → brzdění → přistání', 'Final flight · acceleration → braking → landing')}</span> : null}
            </div>

            {data.rows.length ? (
              <div className={`${styles.raceLayout} ${participantCount >= 25 ? styles.raceLayoutLarge : ''}`}>
                <section className={styles.racePanel} aria-label={isFinal ? ui('Konečný závod k Měsíci', 'Final race to the Moon') : ui('Průběžný závod k Měsíci', 'Live race to the Moon')}>
                  <div className={`${styles.raceCourse} ${raceRows.length >= 9 ? styles.raceCourseDense : ''}`}>
                    <div className={styles.spaceDust} aria-hidden="true" />
                    <div className={styles.earth} aria-hidden="true"><span>{ui('Země', 'Earth')}</span></div>
                    <div className={styles.moon} aria-hidden="true"><span>{ui('Měsíc', 'Moon')}</span></div>
                    <div className={styles.routeLine} aria-hidden="true" />

                    <div className={styles.lanes}>
                      {raceRows.map((row, index) => {
                        const podium = isFinal && index < 3;
                        return (
                          <div className={styles.lane} key={`${row.displayName}-${index}`}>
                            <div className={styles.laneLine} aria-hidden="true" />
                            <div
                              className={`${styles.rocket} ${isFinal ? styles.finalFlight : ''} ${podium ? styles.podium : ''}`}
                              style={rocketStyle(row, data.maxPoints, index, isFinal)}
                            >
                              <span className={styles.rocketTag}>
                                <strong>{row.rank}. {row.displayName}</strong>
                                <small>{row.score} / {data.maxPoints}</small>
                              </span>
                              <span className={styles.rocketGlyph}><RocketGlyph /></span>
                              {isFinal ? <span className={styles.engineFade} aria-hidden="true" /> : null}
                              {podium ? <span className={styles.landingBurst} aria-hidden="true" /> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={styles.raceLegend}>
                    <span>{ui('Start', 'Start')}</span>
                    <span>{ui('Poloha rakety = získané body / aktuálně dostupné maximum', 'Rocket position = points earned / currently available maximum')}</span>
                    <span>{ui('Cíl', 'Finish')}</span>
                  </div>
                </section>

                {participantCount >= 25 ? (
                  <aside className={styles.leaderboard}>
                    <div className={styles.leaderboardHead}>
                      <div>
                        <p className={styles.kicker}>{ui('Přehled', 'Overview')}</p>
                        <h3>Top 10</h3>
                      </div>
                      {largeOverflow ? <span>+ {largeOverflow} {ui('dalších', 'more')}</span> : null}
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
                  <h2>{ui('Zatím bez výsledků', 'No results yet')}</h2>
                  <p>{ui('Pořadí se doplní, jakmile budou k dispozici účastníci a body.', 'The ranking will appear once participants and points are available.')}</p>
                </div>
              </div>
            )}

            {remainingRows.length ? (
              <section className={styles.remaining}>
                <div className={styles.remainingHead}>
                  <strong>{ui('Další posádky', 'More crews')}</strong>
                  <span>{remainingRows.length} {ui('mimo hlavní letovou dráhu', 'outside the main flight path')}</span>
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
