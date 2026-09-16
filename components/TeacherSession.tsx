'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LiveBlock from '@/components/LiveBlock';
import LiveTimer from '@/components/LiveTimer';
import SyllonautMark from '@/components/SyllonautMark';
import TeacherResponses from '@/components/TeacherResponses';
import type { LiveTimerState, SessionAction, SessionStatus, StudentAnswer } from '@/lib/live';
import type { Lesson } from '@/lib/schema';
import { createClient } from '@/lib/supabase/client';

type Participant = { id: string; displayName: string; joinedAt: string; teamId: string | null };
type Team = { id: string; name: string; sortOrder: number };
type LiveResponse = { participantId: string; displayName: string; answer: StudentAnswer; updatedAt: string };
type TeamResponse = { teamId: string; text: string; updatedByParticipantId: string | null; updatedByDisplayName: string | null; updatedAt: string };
type TeacherSessionData = {
  id: string;
  lessonId: string | null;
  joinCode: string;
  status: SessionStatus;
  activeBlockId: string | null;
  lessonSnapshot: Lesson;
  realtimeKey: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  resultsRevealed: boolean;
  timer: LiveTimerState | null;
  participants: Participant[];
  teams: Team[];
  responses: LiveResponse[];
  teamResponses: TeamResponse[];
};

export default function TeacherSession({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<TeacherSessionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamCount, setTeamCount] = useState(4);
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await response.json() as { session?: TeacherSessionData; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');
      setSession(data.session);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session?.joinCode) return;
    setJoinUrl(`${window.location.origin}/join/${session.joinCode}`);
  }, [session?.joinCode]);

  useEffect(() => {
    if (!session?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${session.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.realtimeKey, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function act(action: SessionAction['action']) {
    if (busy) return;
    if (action === 'end' && !window.confirm('Opravdu ukončit hodinu? Studenti už se znovu nepřipojí.')) return;
    if (action === 'reveal_results' && !window.confirm('Zveřejnit výsledky studentům? Po zveřejnění už svou odpověď u tohoto bloku nebudou moci změnit.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Stav hodiny se nepodařilo změnit.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stav hodiny se nepodařilo změnit.');
    } finally {
      setBusy(false);
    }
  }

  async function createTeams() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: teamCount }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Týmy se nepodařilo vytvořit.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Týmy se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  }

  async function resetTeams() {
    if (busy || !window.confirm('Resetovat týmy? Dosavadní volby studentů v lobby se zruší.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/teams`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Týmy se nepodařilo resetovat.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Týmy se nepodařilo resetovat.');
    } finally {
      setBusy(false);
    }
  }

  const activeIndex = useMemo(() => {
    if (!session?.activeBlockId) return -1;
    return session.lessonSnapshot.blocks.findIndex((block) => block.id === session.activeBlockId);
  }, [session]);
  const activeBlock = activeIndex >= 0 && session ? session.lessonSnapshot.blocks[activeIndex] : null;
  const hasTeamTasks = session?.lessonSnapshot.blocks.some((block) => block.type === 'team_task') ?? false;

  function teamMembers(teamId: string) {
    return session?.participants.filter((participant) => participant.teamId === teamId) ?? [];
  }

  const unassigned = session?.participants.filter((participant) => !participant.teamId) ?? [];
  const canRevealResults = activeBlock?.type === 'poll' || activeBlock?.type === 'quiz';
  const hasResponsePanel = Boolean(activeBlock && ['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(activeBlock.type));
  const liveProgress = session?.lessonSnapshot.blocks.length
    ? Math.max(0, Math.min(100, ((activeIndex + 1) / session.lessonSnapshot.blocks.length) * 100))
    : 0;

  return (
    <main className="shell teacher-live-shell">
      <header className="brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">LIVE</span></div>
        <nav className="main-nav"><Link href="/lessons">Moje lekce</Link></nav>
        <p className="brand-tagline">Řídicí centrum</p>
      </header>

      {error ? <div className="error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {!session ? <div className="panel"><p className="muted-copy">Načítám řídicí centrum…</p></div> : null}

      {session?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <span className="eyebrow">Startovní zóna</span>
            <h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1>
            <p className="muted-copy">Studenti se mohou připojit i po startu hodiny. Kód přestane fungovat až po jejím ukončení.</p>
            <div className="live-code">{session.joinCode}</div>
            <p className="muted-copy" style={{ wordBreak: 'break-all' }}>{joinUrl || `/join/${session.joinCode}`}</p>
            {hasTeamTasks && !session.teams.length ? <p className="muted-copy" style={{ marginTop: 12 }}>Tato lekce obsahuje týmový úkol. Před startem vytvoř alespoň 2 týmy.</p> : null}
            <div className="actions">
              <button className="primary" disabled={busy || (hasTeamTasks && session.teams.length < 2)} onClick={() => void act('start')}>{busy ? 'Připravuji start…' : 'Odstartovat hodinu'}</button>
            </div>
          </section>

          {hasTeamTasks ? (
            <section className="panel">
              <span className="eyebrow">Týmy</span>
              {!session.teams.length ? (
                <>
                  <h2>Vytvořit týmy</h2>
                  <p className="muted-copy">Studenti si ve startovní zóně sami vyberou tým. Po odstartování se jejich volba zamkne.</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 14, flexWrap: 'wrap' }}>
                    <label style={{ maxWidth: 160 }}>
                      Počet týmů
                      <input type="number" min={2} max={12} value={teamCount} onChange={(event) => setTeamCount(Math.max(2, Math.min(12, Number(event.target.value) || 2)))} />
                    </label>
                    <button className="primary" disabled={busy} onClick={() => void createTeams()}>Vytvořit týmy</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ marginBottom: 0 }}>{session.teams.length} týmů</h2>
                    <button className="secondary" disabled={busy} onClick={() => void resetTeams()}>Resetovat týmy</button>
                  </div>
                  <div className="items" style={{ marginTop: 14 }}>
                    {session.teams.map((team) => {
                      const members = teamMembers(team.id);
                      return <div className="item" key={team.id}><strong>{team.name}</strong><p className="muted-copy" style={{ marginTop: 5 }}>{members.map((member) => member.displayName).join(', ') || 'Zatím bez členů'}</p></div>;
                    })}
                  </div>
                  {unassigned.length ? <p className="muted-copy" style={{ marginTop: 12 }}>Bez týmu: {unassigned.map((participant) => participant.displayName).join(', ')}</p> : null}
                </>
              )}
            </section>
          ) : null}

          <section className="panel">
            <span className="eyebrow">Připojení studenti</span>
            <h2>{session.participants.length}</h2>
            {session.participants.length ? <div className="items">{session.participants.map((participant) => <div className="item" key={participant.id}>{participant.displayName}</div>)}</div> : <p className="muted-copy">Zatím nikdo.</p>}
          </section>
        </div>
      ) : null}

      {session?.status === 'live' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel live-control-bar">
            <div className="live-control-layout">
              <div>
                <span className="eyebrow"><span className="live-status-dot" />Mise probíhá</span>
                <h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1>
                <p className="muted-copy">Blok {activeIndex + 1} z {session.lessonSnapshot.blocks.length} · {session.participants.length} studentů</p>
              </div>
              <div className="live-control-actions">
                <button className="secondary" disabled={busy || activeIndex <= 0} onClick={() => void act('previous')}>← Předchozí</button>
                <button className="primary" disabled={busy || activeIndex >= session.lessonSnapshot.blocks.length - 1} onClick={() => void act('next')}>Další →</button>
                <button className="secondary live-end" disabled={busy} onClick={() => void act('end')}>Ukončit hodinu</button>
              </div>
            </div>
            <div className="live-session-progress" aria-label={`Průběh hodiny: blok ${activeIndex + 1} z ${session.lessonSnapshot.blocks.length}`}>
              <div className="live-session-progress-fill" style={{ width: `${liveProgress}%` }} />
            </div>
          </section>

          <div className={hasResponsePanel ? 'live-main-grid' : 'live-main-grid live-main-grid-single'}>
            <div className="live-current-column">
              {activeBlock ? <LiveBlock block={activeBlock} teacherMode hideItems={activeBlock.type === 'ranking'} /> : <div className="error">Aktuální blok se nepodařilo najít ve snapshotu.</div>}

              {activeBlock?.type === 'timer' && session.timer ? (
                <>
                  <LiveTimer timer={session.timer} label="Synchronizovaný timer" />
                  <section className="panel">
                    <span className="eyebrow">Ovládání timeru</span>
                    <div className="actions" style={{ marginTop: 12 }}>
                      {session.timer.status === 'running' && session.timer.remainingSeconds > 0 ? (
                        <button className="primary" disabled={busy} onClick={() => void act('timer_pause')}>Pozastavit</button>
                      ) : session.timer.remainingSeconds > 0 ? (
                        <button className="primary" disabled={busy} onClick={() => void act('timer_start')}>{session.timer.status === 'paused' ? 'Pokračovat' : 'Spustit odpočet'}</button>
                      ) : null}
                      <button className="secondary" disabled={busy} onClick={() => void act('timer_reset')}>Resetovat</button>
                    </div>
                    <p className="muted-copy" style={{ marginBottom: 0 }}>Studenti vidí stejný čas. Start, pauza i reset se synchronizují přes session stav.</p>
                  </section>
                </>
              ) : null}
            </div>

            {hasResponsePanel && activeBlock ? (
              <div className="live-response-column">
                <TeacherResponses block={activeBlock} responses={session.responses ?? []} participantCount={session.participants.length} teams={session.teams ?? []} teamResponses={session.teamResponses ?? []} />
              </div>
            ) : null}
          </div>

          {canRevealResults ? (
            <section className="panel live-results-action">
              <span className="eyebrow">Výsledky pro studenty</span>
              {session.resultsRevealed ? (
                <p className="muted-copy" style={{ marginBottom: 0 }}>Výsledky jsou zveřejněné. Studentské odpovědi na tento blok jsou uzamčené.</p>
              ) : (
                <div className="live-results-action-row">
                  <p className="muted-copy">Učitel vidí průběžné výsledky už teď. Studentům je zveřejni až ve chvíli, kdy už nemají měnit odpověď.</p>
                  <button className="primary" disabled={busy} onClick={() => void act('reveal_results')}>Zveřejnit výsledky</button>
                </div>
              )}
            </section>
          ) : null}

          {session.teams.length ? (
            <section className="panel">
              <span className="eyebrow">Týmy</span>
              <div className="items" style={{ marginTop: 12 }}>
                {session.teams.map((team) => {
                  const members = teamMembers(team.id);
                  return <div className="item" key={team.id}><strong>{team.name}</strong><p className="muted-copy" style={{ marginTop: 5 }}>{members.map((member) => member.displayName).join(', ') || 'Bez členů'}</p></div>;
                })}
              </div>
              {unassigned.length ? <p className="muted-copy" style={{ marginTop: 12 }}>Bez týmu: {unassigned.map((participant) => participant.displayName).join(', ')}</p> : null}
            </section>
          ) : (
            <section className="panel"><span className="eyebrow">Připojení studenti</span><p className="muted-copy">{session.participants.map((participant) => participant.displayName).join(', ') || 'Zatím nikdo.'}</p></section>
          )}
        </div>
      ) : null}

      {session?.status === 'ended' ? (
        <section className="panel">
          <span className="eyebrow">Mise dokončena</span>
          <h1>{session.lessonSnapshot.title}</h1>
          <p className="muted-copy">Hodina je uzavřená. Připojilo se {session.participants.length} studentů.</p>
          <div className="actions">{session.lessonId ? <Link href={`/lessons/${session.lessonId}`} className="primary button-link">Zpět k lekci</Link> : null}<Link href="/lessons" className="secondary button-link">Moje lekce</Link></div>
        </section>
      ) : null}
    </main>
  );
}
