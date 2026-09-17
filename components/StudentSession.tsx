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
  const hasLoadedRef = useRef(false);
  const disconnectedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await response.json() as StudentState & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');

      const recovered = disconnectedRef.current;
      disconnectedRef.current = false;
      hasLoadedRef.current = true;
      setState(data);
      setError('');
      setConnectionStatus(recovered ? 'restored' : 'connected');
    } catch (err) {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
      if (!hasLoadedRef.current) {
        setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
      }
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
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const handleOffline = () => {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
    };
    const handleOnline = () => { void refresh(); };
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

      {error ? <div className="error"><p style={{ marginTop: 0 }}>{error}</p><button className="secondary" type="button" onClick={() => void refresh()}>Zkusit znovu</button></div> : null}
      {!state && !error ? <div className="panel"><p className="muted-copy">Navazuji spojení s hodinou…</p></div> : null}

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
            <div className="student-progress-track" aria-label={`Průběh hodiny: blok ${currentBlockNumber} z ${state.totalBlocks}`}>
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
            <div className="panel" style={{ padding: 12 }}>
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
                    response={state.myTeamResponse}
                    onSaved={() => void refresh()}
                  />
                ) : (
                  <div className="error">Pro týmový úkol si nejdřív vyber tým.</div>
                )
              ) : choiceResultsLocked ? (
                state.revealedResults ? <StudentRevealedResults results={state.revealedResults} /> : <div className="panel"><p className="muted-copy">Výsledky byly zveřejněné. Načítám je…</p></div>
              ) : (
                <StudentResponseInput
                  key={state.activeBlock.id}
                  sessionId={sessionId}
                  block={state.activeBlock}
                  response={state.myResponse}
                  onSaved={(answer) => setState((current) => current ? { ...current, myResponse: answer } : current)}
                />
              )}
            </>
          ) : <div className="error">Čekám na aktivní blok…</div>}
        </div>
      ) : null}

      {state?.status === 'ended' ? (
        <section className="panel" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Mise dokončena</span>
          <h1>Hodina skončila</h1>
          <p className="muted-copy">Díky za účast, {state.participantDisplayName}.</p>
        </section>
      ) : null}
    </main>
  );
}
