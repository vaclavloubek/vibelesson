'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { cacheLiveSnapshot, flushLiveOutbox, loadLiveSnapshot } from '@/lib/live-offline';

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
  const refreshInFlightRef = useRef(false);
  const previousBlockIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json() as StudentState & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');

      const recovered = disconnectedRef.current;
      disconnectedRef.current = false;
      hasLoadedRef.current = true;
      setState(data);
      void cacheLiveSnapshot(`student:${sessionId}`, data).catch(() => undefined);
      setError('');
      setConnectionStatus(recovered ? 'restored' : 'connected');
    } catch (err) {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
      if (!hasLoadedRef.current) {
        try {
          const cached = await loadLiveSnapshot<StudentState>(`student:${sessionId}`);
          if (cached) {
            hasLoadedRef.current = true;
            setState(cached);
            setError('');
            setConnectionStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline-safe' : 'reconnecting');
          } else {
            setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
          }
        } catch {
          setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
        }
      }
    } finally {
      window.clearTimeout(timer);
      refreshInFlightRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

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
    const intervalMs = connectionStatus === 'connected' || connectionStatus === 'restored' ? 20_000 : 5_000;
    const timer = window.setInterval(() => {
      if (!navigator.onLine) {
        if (hasLoadedRef.current) setConnectionStatus('offline-safe');
        return;
      }
      void flushLiveOutbox(sessionId)
        .catch(() => undefined)
        .finally(() => { void refresh(); });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [connectionStatus, refresh, sessionId]);

  useEffect(() => {
    const handleOffline = () => {
      disconnectedRef.current = true;
      setConnectionStatus(hasLoadedRef.current ? 'offline-safe' : 'reconnecting');
    };
    const handleOnline = () => {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
      void flushLiveOutbox(sessionId)
        .catch(() => undefined)
        .finally(() => { void refresh(); });
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
  }, [refresh, sessionId]);

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

          {connectionStatus === 'reconnecting' || connectionStatus === 'offline-safe' ? (
            <div className="panel" role="status" style={{ padding: 12 }}>
              <p className="muted-copy" style={{ margin: 0 }}>
                {connectionStatus === 'offline-safe'
                  ? 'Internet je nedostupný. Poslední známý stav hodiny zůstává k dispozici a nové odpovědi se bezpečně uloží v tomto zařízení pro pozdější synchronizaci.'
                  : 'Spojení se přerušilo. Poslední známý stav zůstává na obrazovce a Syllonaut se pokusí hodinu automaticky dosynchronizovat.'}
              </p>
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
