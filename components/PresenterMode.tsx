'use client';

import QRCode from 'react-qr-code';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

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
  lessonLanguage: string | null;
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

const blockLabels = {
  cs: {
    intro: 'Úvod', team_task: 'Týmový úkol', poll: 'Hlasování', quiz: 'Kvíz',
    open_text: 'Otevřená odpověď', ranking: 'Seřazení', reveal: 'Odhalení',
    timer: 'Časový blok', exit_ticket: 'Exit ticket',
  },
  en: {
    intro: 'Introduction', team_task: 'Team task', poll: 'Poll', quiz: 'Quiz',
    open_text: 'Open response', ranking: 'Ranking', reveal: 'Reveal',
    timer: 'Timed block', exit_ticket: 'Exit ticket',
  },
} satisfies Record<'cs' | 'en', Record<PresenterBlock['type'], string>>;

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

function parsePresenterBlock(raw: Record<string, unknown> | null, english: boolean): PresenterBlock | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.type !== 'string' || !presenterBlockTypes.has(raw.type as PresenterBlock['type'])) {
    return null;
  }

  return {
    id: raw.id,
    type: raw.type as PresenterBlock['type'],
    title: typeof raw.title === 'string' ? raw.title : (english ? 'Activity' : 'Aktivita'),
    durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : 0,
    instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
    options: Array.isArray(raw.options) ? raw.options.filter((item): item is string => typeof item === 'string') : null,
    items: Array.isArray(raw.items) ? raw.items.filter((item): item is string => typeof item === 'string') : null,
    revealText: typeof raw.revealText === 'string' ? raw.revealText : null,
  };
}

function presenterFromLiveControl(live: LiveControlState, english: boolean): PresenterData {
  const snapshot = live.snapshot;
  const rawLesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
    ? snapshot.lessonSnapshot as { title?: unknown; language?: unknown; blocks?: Array<Record<string, unknown>> }
    : {};
  const blocks = Array.isArray(rawLesson.blocks) ? rawLesson.blocks : [];
  const activeBlockIndex = snapshot.activeBlockId
    ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
    : -1;
  const activeBlock = parsePresenterBlock(activeBlockIndex >= 0 ? blocks[activeBlockIndex] : null, english);

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
    title: typeof rawLesson.title === 'string' ? rawLesson.title : (english ? 'Lesson' : 'Hodina'),
    lessonLanguage: typeof rawLesson.language === 'string' ? rawLesson.language : null,
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
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [data, setData] = useState<PresenterData | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [connectionMode, setConnectionMode] = useState<PresenterConnectionMode>('primary');
  const [capabilityVersion, setCapabilityVersion] = useState(0);
  const presenterOpenedTrackedRef = useRef(false);

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

    const recoveredData = presenterFromLiveControl(live, english);
    if (!presenterOpenedTrackedRef.current) {
      presenterOpenedTrackedRef.current = true;
      trackEvent('presenter_opened', { session_state: recoveredData.status });
    }
    setData(recoveredData);
    setConnectionMode('fallback');
    setError('');
    return true;
  }, [english, ensureLiveAccess, sessionId]);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        `/api/sessions/${sessionId}/presenter`,
        { cache: 'no-store' },
        5_000,
      );
      const body = await response.json() as PresenterData & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(body.error, english ? 'en' : 'cs', 'Prezentační režim se nepodařilo načíst.', 'Presenter mode could not be loaded.'));
      if (!presenterOpenedTrackedRef.current) {
        presenterOpenedTrackedRef.current = true;
        trackEvent('presenter_opened', { session_state: body.status });
      }
      setData(body);
      setConnectionMode('primary');
      setError('');
    } catch {
      const recovered = await loadFallback();
      if (!recovered) {
        setError(ui('Projekci se nepodařilo spojit s primární ani záložní live službou. Syllonaut to zkusí znovu automaticky.', 'The projection could not connect to either the primary or backup live service. Syllonaut will retry automatically.'));
      }
    }
  }, [loadFallback, sessionId, ui]);

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
          <span>{data?.status === 'live' ? ui('Mise probíhá', 'Lesson in progress') : data?.status === 'ended' ? ui('Mise dokončena', 'Lesson completed') : ui('Startovní zóna', 'Starting area')}</span>
          <span>{connectionMode === 'fallback' ? ui('Záložní spojení', 'Backup connection') : 'Presenter'}</span>
        </div>
      </header>

      {error ? (
        <section className={styles.centerState} role="alert">
          <h1>{ui('Projekci se nepodařilo načíst', 'Projection could not be loaded')}</h1>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>{ui('Zkusit znovu', 'Try again')}</button>
        </section>
      ) : null}

      {!data && !error ? (
        <section className={styles.centerState}>
          <h1>{ui('Připravuji projekci…', 'Preparing projection…')}</h1>
        </section>
      ) : null}

      {data?.status === 'ended' && connectionMode === 'fallback' && !error ? (
        <section className={styles.centerState} role="status">
          <h1>{ui('Hodina skončila', 'The lesson has ended')}</h1>
          <p>{ui('Konečné pořadí se zobrazí automaticky po obnovení primárního spojení.', 'The final ranking will appear automatically when the primary connection is restored.')}</p>
        </section>
      ) : null}

      {data?.status === 'lobby' && !error ? (
        <section className={styles.lobby}>
          <div className={styles.lobbyIntro}>
            <p className={styles.kicker}>{ui('Připojte se k hodině', 'Join the lesson')}</p>
            <h1 lang={data.lessonLanguage ?? undefined} dir={data.lessonLanguage ? 'auto' : undefined}>{data.title}</h1>
            <p>{ui('Naskenujte QR kód, nebo otevřete adresu a zadejte kód hodiny.', 'Scan the QR code, or open the address and enter the lesson code.')}</p>
          </div>
          <div className={styles.joinPanel}>
            <div className={styles.qrWrap}>
              {joinUrl ? <QRCode value={joinUrl} size={272} level="M" title={ui('QR kód pro připojení k hodině', 'QR code to join the lesson')} /> : null}
            </div>
            <div className={styles.joinDetails}>
              <span className={styles.detailLabel}>{ui('Adresa', 'Address')}</span>
              <strong className={styles.joinLink}>{shortJoinUrl}</strong>
              <span className={styles.detailLabel}>{ui('Kód hodiny', 'Lesson code')}</span>
              <strong className={styles.joinCode}>{data.joinCode}</strong>
              <div className={styles.joinCount}><strong>{data.participantCount}</strong><span>{ui('připojeno', 'connected')}</span></div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.status === 'live' && !error ? (
        <section className={styles.liveStage}>
          <div className={styles.lessonTopline}>
            <div>
              <p className={styles.kicker}>{block ? blockLabels[locale][block.type] : ui('Aktuální aktivita', 'Current activity')}</p>
              <p className={styles.progress}>{ui('Blok', 'Block')} {data.activeBlockIndex + 1} {ui('z', 'of')} {data.blockCount}</p>
            </div>
            <div className={styles.liveMeta}>
              {data.submission ? (
                <span><strong>{data.submission.submitted}</strong> / {data.submission.total} {data.submission.unit === 'team' ? ui('týmů odevzdalo', 'teams submitted') : ui('odevzdalo', 'submitted')}</span>
              ) : null}
              {block ? <span>{block.durationMinutes} min</span> : null}
            </div>
          </div>

          {block ? (
            <article className={styles.activityCard}>
              <h1 lang={data.lessonLanguage ?? undefined} dir={data.lessonLanguage ? 'auto' : undefined}>{block.title}</h1>
              <FormattedInstructions text={block.instructions} className={styles.instructions} lang={data.lessonLanguage} />

              {displayItems?.length ? (
                <div className={styles.optionGrid}>
                  {displayItems.map((item, index) => (
                    <div className={styles.option} key={`${item}-${index}`}>
                      <span>{String.fromCharCode(65 + index)}</span>
                      <strong lang={data.lessonLanguage ?? undefined} dir={data.lessonLanguage ? 'auto' : undefined}>{item}</strong>
                    </div>
                  ))}
                </div>
              ) : null}

              {block.type === 'reveal' && block.revealText ? (
                <FormattedInstructions text={block.revealText} className={styles.revealBox} lang={data.lessonLanguage} />
              ) : null}

              {block.type === 'timer' && timerSeconds !== null ? (
                <div className={styles.timerValue}>{formatTime(timerSeconds)}</div>
              ) : null}

              {['quiz', 'poll', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(block.type) ? (
                <p className={styles.deviceHint}>{ui('Odpovězte ve svém telefonu.', 'Answer on your phone.')}</p>
              ) : null}
            </article>
          ) : (
            <section className={styles.centerState}><h1>{ui('Čekám na další aktivitu…', 'Waiting for the next activity…')}</h1></section>
          )}
        </section>
      ) : null}

      {data?.status === 'live' && !error ? (
        <footer className={styles.joinDock}>
          <span>{ui('Připojit se', 'Join')}: <strong>{shortJoinUrl}</strong></span>
          <span>{ui('Kód', 'Code')} <strong>{data.joinCode}</strong></span>
          <span>{data.participantCount} {ui('připojeno', 'connected')}</span>
        </footer>
      ) : null}
    </main>
  );
}
