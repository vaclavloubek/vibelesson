'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { cacheLiveState, flushLiveOutbox, getCachedLiveState } from '@/lib/live-offline';
import {
  connectLiveControl,
  fetchLiveControlState,
  getLiveControlAccess,
} from '@/lib/live-control-client';
import ConnectionStatusBadge, { type StudentConnectionStatus } from '@/components/ConnectionStatusBadge';
import LiveBlock from '@/components/LiveBlock';
import LiveTimer from '@/components/LiveTimer';
import StudentResponseInput from '@/components/StudentResponseInput';
import StudentRevealedResults from '@/components/StudentRevealedResults';
import SyllonautMark from '@/components/SyllonautMark';
import TeamPicker from '@/components/TeamPicker';
import TeamTaskResponseInput from '@/components/TeamTaskResponseInput';
import VisuallyHidden from '@/components/VisuallyHidden';
import type { LiveTimerState, PublicLessonBlock, PublicScoreboardState, RevealedChoiceResults, SessionStatus, StudentAnswer } from '@/lib/live';
import { createClient } from '@/lib/supabase/client';

type Team = { id: string; name: string; memberCount: number };
type StudentState = {
  sessionId: string;
  status: SessionStatus;
  title: string;
  participantDisplayName: string;
  activeBlock: PublicLessonBlock | null;
  activeBlockIndex: number | null;
  totalBlocks: number;
  realtimeKey: string;
  myResponse: StudentAnswer | null;
  myResponseSubmitted: boolean;
  resultsRevealed: boolean;
  revealedResults: RevealedChoiceResults | null;
  timer: LiveTimerState | null;
  teams: Team[];
  myTeam: Team | null;
  myTeamResponse: { text: string; updatedByParticipantId: string | null } | null;
  scoreboard: PublicScoreboardState | null;
};

export default function StudentSession({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<StudentState | null>(null);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<StudentConnectionStatus>('connecting');
  const [activeBlockAnnouncement, setActiveBlockAnnouncement] = useState('');
  const hasLoadedRef = useRef(false);
  const disconnectedRef = useRef(false);
  const previousBlockIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refreshFromLiveControl = useCallback(async () => {
    const access = getLiveControlAccess(sessionId, 'student');
    if (!access?.subject) return false;
    const live = await fetchLiveControlState(sessionId, 'student');
    if (!live) return false;

    const snapshot = live.snapshot;
    const blocks = Array.isArray(snapshot.lessonSnapshot?.blocks) ? snapshot.lessonSnapshot.blocks : [];
    const rawActive = snapshot.activeBlockId
      ? blocks.find((block) => block.id === snapshot.activeBlockId) ?? null
      : null;
    const activeBlock = rawActive as PublicLessonBlock | null;
    const participant = snapshot.participants.find((row) => row.id === access.subject);
    const counts = new Map<string, number>();
    for (const row of snapshot.participants) {
      if (row.teamId) counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1);
    }
    const teams = snapshot.teams.map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: counts.get(team.id) ?? 0,
    }));
    const myTeam = participant?.teamId ? teams.find((team) => team.id === participant.teamId) ?? null : null;
    const response = snapshot.responses.find((row) => row.participantId === access.subject && row.blockId === snapshot.activeBlockId);
    const teamResponse = myTeam && snapshot.activeBlockId
      ? snapshot.teamResponses?.find((row) => row.teamId === myTeam.id && row.blockId === snapshot.activeBlockId)
      : null;
    const activeBlockIndex = snapshot.activeBlockId
      ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
      : -1;
    const rawTimer = snapshot.timer && typeof snapshot.timer === 'object'
      ? snapshot.timer as { status?: unknown; startedAt?: unknown; remainingSeconds?: unknown }
      : null;
    let timer: LiveTimerState | null = null;
    if (rawTimer && (rawTimer.status === 'idle' || rawTimer.status === 'running' || rawTimer.status === 'paused')) {
      let remainingSeconds = typeof rawTimer.remainingSeconds === 'number' ? Math.max(0, rawTimer.remainingSeconds) : 0;
      if (rawTimer.status === 'running' && typeof rawTimer.startedAt === 'string') {
        remainingSeconds = Math.max(0, remainingSeconds - Math.max(0, Math.floor((Date.now() - Date.parse(rawTimer.startedAt)) / 1000)));
      }
      timer = { status: rawTimer.status, remainingSeconds, syncedAt: new Date().toISOString() };
    }

    setState((current) => ({
      sessionId,
      status: snapshot.status,
      title: typeof snapshot.lessonSnapshot?.title === 'string'
        ? snapshot.lessonSnapshot.title
        : current?.title ?? 'Hodina',
      participantDisplayName: participant?.displayName ?? current?.participantDisplayName ?? 'Student',
      activeBlock,
      activeBlockIndex: activeBlockIndex >= 0 ? activeBlockIndex : null,
      totalBlocks: blocks.length || current?.totalBlocks || 0,
      realtimeKey: current?.realtimeKey ?? '',
      myResponse: (response?.answer as StudentAnswer | undefined) ?? current?.myResponse ?? null,
      myResponseSubmitted: response?.submitted ?? current?.myResponseSubmitted ?? false,
      resultsRevealed: Boolean(snapshot.activeBlockId && snapshot.revealedBlockIds.includes(snapshot.activeBlockId)),
      revealedResults: current?.revealedResults ?? null,
      timer,
      teams,
      myTeam,
      myTeamResponse: teamResponse
        ? { text: teamResponse.text, updatedByParticipantId: null }
        : current?.myTeamResponse ?? null,
      scoreboard: current?.scoreboard ?? null,
    }));
    hasLoadedRef.current = true;
    disconnectedRef.current = true;
    setError('');
    setConnectionStatus('reconnecting');
    return true;
  }, [sessionId]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const operation = (async () => {
      try {
        const response = await fetchWithTimeout(`/api/student/sessions/${sessionId}`, { cache: 'no-store' }, 6_000);
        const data = await response.json() as StudentState & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');

        const recovered = disconnectedRef.current;
        disconnectedRef.current = false;
        hasLoadedRef.current = true;
        setState(data);
        setError('');
        setConnectionStatus(recovered ? 'restored' : 'connected');
        void cacheLiveState(sessionId, data);
        void flushLiveOutbox(sessionId);
      } catch (err) {
        disconnectedRef.current = true;
        setConnectionStatus('reconnecting');
        const liveRecovered = await refreshFromLiveControl();
        if (!liveRecovered && !hasLoadedRef.current) {
          const cached = await getCachedLiveState<StudentState>(sessionId);
          if (cached) {
            hasLoadedRef.current = true;
            setState(cached);
            setError('');
          } else {
            setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
          }
        }
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [refreshFromLiveControl, sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const socket = connectLiveControl(sessionId, 'student', () => {
      void refreshFromLiveControl();
    });
    if (!socket) return;
    return () => socket.close(1000, 'Student page closed');
  }, [refreshFromLiveControl, sessionId]);

  useEffect(() => {
    if (connectionStatus !== 'restored') return;
    const timer = window.setTimeout(() => setConnectionStatus('connected'), 2500);
    return () => window.clearTimeout(timer);
  }, [connectionStatus]);

  useEffect(() => {
    if (!state?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${state.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void refresh(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (disconnectedRef.current) void refresh();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          disconnectedRef.current = true;
          setConnectionStatus('reconnecting');
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [state?.realtimeKey, refresh]);

  useEffect(() => {
    const intervalMs = connectionStatus === 'reconnecting' ? 4_000 : 20_000;
    const timer = window.setInterval(() => { void refresh(); }, intervalMs);
    return () => window.clearInterval(timer);
  }, [connectionStatus, refresh]);

  useEffect(() => {
    const handleOffline = () => {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
    };
    const handleOnline = () => {
      void flushLiveOutbox(sessionId).finally(() => { void refresh(); });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (state?.status !== 'live' || !state.activeBlock) {
      previousBlockIdRef.current = null;
      return;
    }
    const activeBlock = state.activeBlock;
    if (previousBlockIdRef.current !== activeBlock.id) {
      const blockNumber = (state.activeBlockIndex ?? 0) + 1;
      setActiveBlockAnnouncement(`Aktuální úkol ${blockNumber} z ${state.totalBlocks}: ${activeBlock.title}.`);
      previousBlockIdRef.current = activeBlock.id;
    }
  }, [state?.activeBlock, state?.activeBlockIndex, state?.status, state?.totalBlocks]);

  const currentBlockNumber = (state?.activeBlockIndex ?? 0) + 1;
  const progress = state?.status === 'live' && state.totalBlocks > 0
    ? Math.min(100, Math.max(0, (currentBlockNumber / state.totalBlocks) * 100))
    : 0;
  const choiceResultsLocked = Boolean(
    state?.resultsRevealed && state.activeBlock && (state.activeBlock.type === 'poll' || state.activeBlock.type === 'quiz'),
  );

  return (
    <main className="shell student-shell">
      <header className="brand student-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div>
        <ConnectionStatusBadge status={connectionStatus} />
      </header>
      <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{activeBlockAnnouncement}</span></VisuallyHidden>

      {error ? <div className="error" role="alert"><p style={{ marginTop: 0 }}>{error}</p><button className="secondary" type="button" onClick={() => void refresh()}>Zkusit znovu</button></div> : null}
      {!state && !error ? <div className="panel" role="status"><p className="muted-copy">Navazuji spojení s hodinou…</p></div> : null}

      {state?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel" style={{ textAlign: 'center' }}>
            <span className="eyebrow">Startovní zóna</span>
            <h1>{state.title}</h1>
            <p className="muted-copy">Jsi připojen jako <strong>{state.participantDisplayName}</strong>. Čekáme, až učitel hodinu odstartuje.</p>
          </section>
          <TeamPicker
            sessionId={sessionId}
            teams={state.teams ?? []}
            selectedTeamId={state.myTeam?.id ?? null}
            locked={false}
            onChanged={() => void refresh()}
          />
        </div>
      ) : null}

      {state?.status === 'live' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel student-session-head">
            <div className="student-session-kicker">
              <span>{state.participantDisplayName}{state.myTeam ? ` · ${state.myTeam.name}` : ''}</span>
              <strong>{currentBlockNumber} / {state.totalBlocks}</strong>
            </div>
            <h1 className="student-session-title">{state.title}</h1>
            <div
              className="student-progress-track"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={state.totalBlocks}
              aria-valuenow={currentBlockNumber}
              aria-valuetext={`Blok ${currentBlockNumber} z ${state.totalBlocks}`}
              aria-label="Průběh hodiny"
            >
              <div className="student-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </section>

          {state.scoreboard ? (
            <section className="panel" aria-label="Moje průběžné skóre">
              <span className="eyebrow">Průběžné pořadí</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginTop: 8 }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 28, lineHeight: 1.1 }}>{state.scoreboard.score} / {state.scoreboard.maxPoints}</strong>
                  <span className="muted-copy">Tvoje skóre</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block', fontSize: 24, lineHeight: 1.1 }}>{state.scoreboard.rank}. místo</strong>
                  <span className="muted-copy">Aktuální pořadí</span>
                </div>
              </div>
            </section>
          ) : null}

          {connectionStatus === 'reconnecting' ? (
            <div className="panel" role="status" style={{ padding: 12 }}>
              <p className="muted-copy" style={{ margin: 0 }}>Spojení se přerušilo. Poslední známý stav zůstává na obrazovce a Syllonaut se pokusí hodinu automaticky dosynchronizovat.</p>
            </div>
          ) : null}

          {!state.myTeam && (state.teams?.length ?? 0) > 0 ? (
            <TeamPicker
              sessionId={sessionId}
              teams={state.teams}
              selectedTeamId={null}
              locked={false}
              onChanged={() => void refresh()}
            />
          ) : null}

          {state.activeBlock ? (
            <>
              <LiveBlock
                block={state.activeBlock}
                hideOptions={state.activeBlock.type === 'poll' || state.activeBlock.type === 'quiz'}
                hideItems={state.activeBlock.type === 'ranking'}
              />

              {state.activeBlock.type === 'timer' && state.timer ? <LiveTimer timer={state.timer} label="Společný čas" /> : null}

              {state.activeBlock.type === 'team_task' ? (
                state.myTeam ? (
                  <TeamTaskResponseInput
                    key={`${state.activeBlock.id}-${state.myTeam.id}`}
                    sessionId={sessionId}
                    block={state.activeBlock}
                    teamName={state.myTeam.name}
                    teamId={state.myTeam.id}
                    response={state.myTeamResponse}
                    onSaved={() => void refresh()}
                  />
                ) : (
                  <div className="error" role="alert">Pro týmový úkol si nejdřív vyber tým.</div>
                )
              ) : choiceResultsLocked ? (
                state.revealedResults ? <StudentRevealedResults results={state.revealedResults} /> : <div className="panel" role="status"><p className="muted-copy">Výsledky byly zveřejněné. Načítám je…</p></div>
              ) : (
                <StudentResponseInput
                  key={state.activeBlock.id}
                  sessionId={sessionId}
                  block={state.activeBlock}
                  response={state.myResponse}
                  responseSubmitted={state.myResponseSubmitted ?? false}
                  onSaved={(answer, submittedCurrent) => setState((current) => current ? {
                    ...current,
                    myResponse: answer,
                    myResponseSubmitted: submittedCurrent ?? current.myResponseSubmitted,
                  } : current)}
                />
              )}
            </>
          ) : <div className="error" role="status">Čekám na aktivní blok…</div>}
        </div>
      ) : null}

      {state?.status === 'ended' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel" style={{ textAlign: 'center' }}>
            <span className="eyebrow">Mise dokončena</span>
            <h1>Hodina skončila</h1>
            <p className="muted-copy">Díky za účast, {state.participantDisplayName}.</p>
          </section>

          {state.scoreboard ? (
            <section className="panel" aria-label="Moje konečné skóre">
              <span className="eyebrow">Konečné pořadí</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginTop: 8 }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 28, lineHeight: 1.1 }}>{state.scoreboard.score} / {state.scoreboard.maxPoints}</strong>
                  <span className="muted-copy">Tvoje skóre</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block', fontSize: 24, lineHeight: 1.1 }}>{state.scoreboard.rank}. místo</strong>
                  <span className="muted-copy">Konečné pořadí</span>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
