'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import LiveBlock from '@/components/LiveBlock';
import StudentResponseInput from '@/components/StudentResponseInput';
import SyllonautMark from '@/components/SyllonautMark';
import TeamPicker from '@/components/TeamPicker';
import TeamTaskResponseInput from '@/components/TeamTaskResponseInput';
import type { PublicLessonBlock, SessionStatus, StudentAnswer } from '@/lib/live';
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
  teams: Team[];
  myTeam: Team | null;
  myTeamResponse: { text: string; updatedByParticipantId: string | null } | null;
};

export default function StudentSession({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<StudentState | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await response.json() as StudentState & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');
      setState(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!state?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${state.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [state?.realtimeKey, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const currentBlockNumber = (state?.activeBlockIndex ?? 0) + 1;
  const progress = state?.status === 'live' && state.totalBlocks > 0
    ? Math.min(100, Math.max(0, (currentBlockNumber / state.totalBlocks) * 100))
    : 0;

  return (
    <main className="shell student-shell">
      <header className="brand student-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div>
      </header>

      {error ? <div className="error"><p style={{ marginTop: 0 }}>{error}</p><Link href="/join" className="secondary button-link">Připojit se znovu</Link></div> : null}
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
