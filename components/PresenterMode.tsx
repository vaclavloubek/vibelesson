'use client';

import QRCode from 'react-qr-code';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PresenterScoreboard from '@/components/PresenterScoreboard';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/PresenterSession.module.css';
import { createClient } from '@/lib/supabase/client';

type PresenterBlock = {
  id: string;
  type: 'intro' | 'team_task' | 'poll' | 'quiz' | 'open_text' | 'ranking' | 'reveal' | 'timer' | 'exit_ticket';
  title: string;
  durationMinutes: number;
  instructions: string;
  options: string[] | null;
  items: string[] | null;
  dataTable: { caption?: string; columns: string[]; rows: string[][] } | null;
  revealText: string | null;
};

type PresenterTimer = {
  status: 'idle' | 'running' | 'paused';
  remainingSeconds: number;
  syncedAt: string;
};

type PresenterData = {
  status: 'lobby' | 'live' | 'ended';
  title: string;
  realtimeKey: string;
  joinCode: string;
  participantCount: number;
  activeBlockIndex: number;
  blockCount: number;
  activeBlock: PresenterBlock | null;
  submission: { submitted: number; total: number; unit: 'student' | 'team' } | null;
  timer: PresenterTimer | null;
};

const blockLabels: Record<PresenterBlock['type'], string> = {
  intro: 'Úvod',
  team_task: 'Týmový úkol',
  poll: 'Hlasování',
  quiz: 'Kvíz',
  open_text: 'Otevřená odpověď',
  ranking: 'Seřazení',
  reveal: 'Odhalení',
  timer: 'Časový blok',
  exit_ticket: 'Exit ticket',
};

function activityMode(type: PresenterBlock['type']) {
  if (type === 'team_task') return 'Týmová aktivita';
  if (type === 'intro' || type === 'reveal' || type === 'timer') return 'Společná aktivita';
  return 'Individuální aktivita';
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function currentTimerSeconds(timer: PresenterTimer | null, nowMs: number) {
  if (!timer) return null;
  if (timer.status !== 'running') return timer.remainingSeconds;
  const elapsed = Math.max(0, Math.floor((nowMs - Date.parse(timer.syncedAt)) / 1000));
  return Math.max(0, timer.remainingSeconds - elapsed);
}

export default function PresenterMode({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<PresenterData | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    setOrigin(window.location.origin);
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
    if (!data?.realtimeKey || data.status === 'ended') return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${data.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [data?.realtimeKey, data?.status, load]);

  useEffect(() => {
    if (data?.timer?.status !== 'running') return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [data?.timer?.status, data?.timer?.syncedAt]);

  const joinUrl = data?.joinCode && origin ? `${origin}/join/${data.joinCode}` : '';
  const shortJoinUrl = useMemo(() => {
    if (!origin) return 'syllonaut.com/join';
    try {
      const url = new URL(origin);
      return `${url.host}/join`;
    } catch {
      return 'syllonaut.com/join';
    }
  }, [origin]);

  if (data?.status === 'ended') return <PresenterScoreboard sessionId={sessionId} />;

  const block = data?.activeBlock ?? null;
  const timerSeconds = currentTimerSeconds(data?.timer ?? null, nowMs);
  const displayItems = block?.type === 'ranking' ? block.items : block?.options;

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark}><SyllonautMark /></span>
          <span>Syllonaut</span>
        </div>
        <div className={styles.meta}>
          <span>{data?.status === 'live' ? 'Mise probíhá' : 'Startovní zóna'}</span>
          <span>Presenter</span>
        </div>
      </header>

      {error ? (
        <section className={styles.centerState} role="alert">
          <h1>Projekci se nepodařilo načíst</h1>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>Zkusit znovu</button>
        </section>
      ) : null}

      {!data && !error ? (
        <section className={styles.centerState}>
          <h1>Připravuji projekci…</h1>
        </section>
      ) : null}

      {data?.status === 'lobby' && !error ? (
        <section className={styles.lobby}>
          <div className={styles.lobbyIntro}>
            <p className={styles.kicker}>Připojte se k hodině</p>
            <h1>{data.title}</h1>
            <p>Naskenujte QR kód, nebo otevřete adresu a zadejte kód hodiny.</p>
          </div>
          <div className={styles.joinPanel}>
            <div className={styles.qrWrap}>
              {joinUrl ? <QRCode value={joinUrl} size={272} level="M" title="QR kód pro připojení k hodině" /> : null}
            </div>
            <div className={styles.joinDetails}>
              <span className={styles.detailLabel}>Adresa</span>
              <strong className={styles.joinLink}>{shortJoinUrl}</strong>
              <span className={styles.detailLabel}>Kód hodiny</span>
              <strong className={styles.joinCode}>{data.joinCode}</strong>
              <div className={styles.joinCount}><strong>{data.participantCount}</strong><span>připojeno</span></div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.status === 'live' && !error ? (
        <section className={styles.liveStage}>
          <div className={styles.lessonTopline}>
            <div>
              <p className={styles.kicker}>{block ? blockLabels[block.type] : 'Aktuální aktivita'}</p>
              <p className={styles.progress}>Blok {data.activeBlockIndex + 1} z {data.blockCount}</p>
            </div>
            <div className={styles.liveMeta}>
              {data.submission ? (
                <span><strong>{data.submission.submitted}</strong> / {data.submission.total} {data.submission.unit === 'team' ? 'týmů odevzdalo' : 'odevzdalo'}</span>
              ) : null}
              {block ? <span>{block.durationMinutes} min</span> : null}
            </div>
          </div>

          {block ? (
            <article className={styles.activityCard}>
              <span style={{ alignSelf: 'flex-start', marginBottom: 12, padding: '7px 11px', border: '1px solid rgba(255,255,255,.16)', borderRadius: 999, background: 'rgba(255,255,255,.07)', color: 'rgba(247,248,255,.82)', fontSize: 'clamp(12px,1vw,16px)', fontWeight: 760 }}>
                {activityMode(block.type)}
              </span>
              <h1>{block.title}</h1>
              <p className={styles.instructions}>{block.instructions}</p>

              {block.dataTable ? (
                <div style={{ overflowX: 'auto', marginTop: 28, width: '100%' }}>
                  <table style={{ width: '100%', minWidth: Math.max(560, block.dataTable.columns.length * 150), borderCollapse: 'collapse', fontSize: 'clamp(15px,1.25vw,21px)' }}>
                    {block.dataTable.caption ? <caption style={{ textAlign: 'left', captionSide: 'top', paddingBottom: 10, color: 'rgba(247,248,255,.78)', fontWeight: 750 }}>{block.dataTable.caption}</caption> : null}
                    <thead>
                      <tr>{block.dataTable.columns.map((column) => <th key={column} style={{ padding: '12px 14px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.09)', textAlign: 'left' }}>{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {block.dataTable.rows.map((row, rowIndex) => (
                        <tr key={`${rowIndex}-${row.join('\u0000')}`}>
                          {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: '12px 14px', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(247,248,255,.88)' }}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {displayItems?.length ? (
                <div className={styles.optionGrid}>
                  {displayItems.map((item, index) => (
                    <div className={styles.option} key={`${item}-${index}`}>
                      <span>{String.fromCharCode(65 + index)}</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              ) : null}

              {block.type === 'reveal' && block.revealText ? (
                <div className={styles.revealBox}>{block.revealText}</div>
              ) : null}

              {block.type === 'timer' && timerSeconds !== null ? (
                <div className={styles.timerValue}>{formatTime(timerSeconds)}</div>
              ) : null}

              {['quiz', 'poll', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(block.type) ? (
                <p className={styles.deviceHint}>Odpovězte ve svém telefonu.</p>
              ) : null}
            </article>
          ) : (
            <section className={styles.centerState}><h1>Čekám na další aktivitu…</h1></section>
          )}
        </section>
      ) : null}

      {data?.status === 'live' && !error ? (
        <footer className={styles.joinDock}>
          <span>Připojit se: <strong>{shortJoinUrl}</strong></span>
          <span>Kód <strong>{data.joinCode}</strong></span>
          <span>{data.participantCount} připojeno</span>
        </footer>
      ) : null}
    </main>
  );
}
