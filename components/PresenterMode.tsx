'use client';

import QRCode from 'react-qr-code';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PresenterScoreboard from '@/components/PresenterScoreboard';
import FormattedInstructions from '@/components/FormattedInstructions';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/PresenterSession.module.css';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  connectLiveControl,
  fetchLiveControlState,
  getLiveControlAccess,
  saveLiveControlAccess,
  type LiveControlAccess,
  type LiveControlState,
} from '@/lib/live-control-client';
import { createClient } from '@/lib/supabase/client';

type PresenterBlock = {
  id: string;
  type: 'intro' | 'team_task' | 'poll' | 'quiz' | 'open_text' | 'ranking' | 'reveal' | 'timer' | 'exit_ticket';
  title: string;
  durationMinutes: number;
  instructions: string;
  options: string[] | null;
  items: string[] | null;
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

type PresenterConnectionMode = 'primary' | 'fallback';

const presenterBlockTypes = new Set<PresenterBlock['type']>([
  'intro',
  'team_task',
  'poll',
  'quiz',
  'open_text',
  'ranking',
  'reveal',
  'timer',
  'exit_ticket',
]);

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

function parsePresenterBlock(raw: Record<string, unknown> | null): PresenterBlock | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.type !== 'string' || !presenterBlockTypes.has(raw.type as PresenterBlock['type'])) {
    return null;
  }

  return {
    id: raw.id,
    type: raw.type as PresenterBlock['type'],
    title: typeof raw.title === 'string' ? raw.title : 'Aktivita',
    durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : 0,
    instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
    options: Array.isArray(raw.options) ? raw.options.filter((item): item is string => typeof item === 'string') : null,
    items: Array.isArray(raw.items) ? raw.items.filter((item): item is string => typeof item === 'string') : null,
    revealText: typeof raw.revealText === 'string' ? raw.revealText : null,
  };
}

function presenterFromLiveControl(live: LiveControlState): PresenterData {
  const snapshot = live.snapshot;
  const rawLesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
    ? snapshot.lessonSnapshot as { title?: unknown; blocks?: Array<Record<string, unknown>> }
    : {};
  const blocks = Array.isArray(rawLesson.blocks) ? rawLesson.blocks : [];
  const activeBlockIndex = snapshot.activeBlockId
    ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
    : -1;
  const activeBlock = parsePresenterBlock(activeBlockIndex >= 0 ? blocks[activeBlockIndex] : null);

  let submission: PresenterData['submission'] = null;
  if (activeBlock && ['quiz', 'poll', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(activeBlock.type)) {
    if (activeBlock.type === 'team_task') {
      const submittedTeams = new Set(
        (snapshot.teamResponses ?? [])
          .filter((row) => row.blockId === activeBlock.id && row.submitted)
          .map((row) => row.teamId),
      );
      submission = { submitted: submittedTeams.size, total: snapshot.teams.length, unit: 'team' };
    } else {
      const submittedParticipants = new Set(
        snapshot.responses
          .filter((row) => {
            if (row.blockId !== activeBlock.id) return false;
            if (activeBlock.type === 'open_text' || activeBlock.type === 'exit_ticket') return Boolean(row.submitted);
            return row.answer !== null && row.answer !== undefined;
          })
          .map((row) => row.participantId),
      );
      submission = { submitted: submittedParticipants.size, total: snapshot.participants.length, unit: 'student' };
    }
  }

  const rawTimer = snapshot.timer && typeof snapshot.timer === 'object'
    ? snapshot.timer as { status?: unknown; startedAt?: unknown; remainingSeconds?: unknown }
    : null;
  let timer: PresenterTimer | null = null;
  if (rawTimer && (rawTimer.status === 'idle' || rawTimer.status === 'running' || rawTimer.status === 'paused')) {
    let remainingSeconds = typeof rawTimer.remainingSeconds === 'number' ? Math.max(0, rawTimer.remainingSeconds) : 0;
    if (rawTimer.status === 'running' && typeof rawTimer.startedAt === 'string') {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(rawTimer.startedAt)) / 1000));
      remainingSeconds = Math.max(0, remainingSeconds - elapsed);
    }
    timer = {
      status: rawTimer.status,
      remainingSeconds,
      syncedAt: new Date().toISOString(),
    };
  }

  return {
    status: snapshot.status,
    title: typeof rawLesson.title === 'string' ? rawLesson.title : 'Hodina',
    realtimeKey: '',
    joinCode: snapshot.joinCode ?? '',
    participantCount: snapshot.participants.length,
    activeBlockIndex: Math.max(0, activeBlockIndex),
    blockCount: blocks.length,
    activeBlock,
    submission,
    timer,
  };
}

export default function PresenterMode({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<PresenterData | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [connectionMode, setConnectionMode] = useState<PresenterConnectionMode>('primary');
  const [capabilityVersion, setCapabilityVersion] = useState(0);

  const ensureLiveAccess = useCallback(async () => {
    if (getLiveControlAccess(sessionId, 'teacher')) return true;

    try {
      const response = await fetchWithTimeout(
        `/api/sessions/${sessionId}/live-control`,
        { cache: 'no-store' },
        4_500,
      );
      if (!response.ok) return false;
      const body = await response.json() as {
        liveControl?: LiveControlAccess | null;
        degraded?: boolean;
      };
      if (!body.liveControl) return false;
      saveLiveControlAccess(sessionId, 'teacher', body.liveControl);
      setCapabilityVersion((current) => current + 1);
      if (body.degraded) setConnectionMode('fallback');
      return true;
    } catch {
      return Boolean(getLiveControlAccess(sessionId, 'teacher'));
    }
  }, [sessionId]);

  const loadFallback = useCallback(async () => {
    const accessReady = getLiveControlAccess(sessionId, 'teacher') || await ensureLiveAccess();
    if (!accessReady) return false;

    const live = await fetchLiveControlState(sessionId, 'teacher');
    if (!live) return false;

    setData(presenterFromLiveControl(live));
    setConnectionMode('fallback');
    setError('');
    return true;
  }, [ensureLiveAccess, sessionId]);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        `/api/sessions/${sessionId}/presenter`,
        { cache: 'no-store' },
        5_000,
      );
      const body = await response.json() as PresenterData & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Prezentační režim se nepodařilo načíst.');
      setData(body);
      setConnectionMode('primary');
      setError('');
    } catch {
      const recovered = await loadFallback();
      if (!recovered) {
        setError('Projekci se nepodařilo spojit s primární ani záložní live službou. Syllonaut to zkusí znovu automaticky.');
      }
    }
  }, [loadFallback, sessionId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void ensureLiveAccess().finally(() => { void load(); });
    const timer = window.setInterval(() => { void load(); }, 15000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ensureLiveAccess, load]);

  useEffect(() => {
    const socket = connectLiveControl(sessionId, 'teacher', () => {
      void loadFallback();
    });
    if (!socket) return;
    return () => socket.close(1000, 'Presenter page closed');
  }, [capabilityVersion, loadFallback, sessionId]);

  useEffect(() => {
    if (connectionMode !== 'fallback') return;
    const timer = window.setInterval(() => { void loadFallback(); }, 4000);
    return () => window.clearInterval(timer);
  }, [connectionMode, loadFallback]);

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

  if (data?.status === 'ended' && connectionMode === 'primary') {
    return <PresenterScoreboard sessionId={sessionId} />;
  }

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
          <span>{data?.status === 'live' ? 'Mise probíhá' : data?.status === 'ended' ? 'Mise dokončena' : 'Startovní zóna'}</span>
          <span>{connectionMode === 'fallback' ? 'Záložní spojení' : 'Presenter'}</span>
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

      {data?.status === 'ended' && connectionMode === 'fallback' && !error ? (
        <section className={styles.centerState} role="status">
          <h1>Hodina skončila</h1>
          <p>Konečné pořadí se zobrazí automaticky po obnovení primárního spojení.</p>
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
              <h1>{block.title}</h1>
              <FormattedInstructions text={block.instructions} className={styles.instructions} />

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
                <FormattedInstructions text={block.revealText} className={styles.revealBox} />
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
