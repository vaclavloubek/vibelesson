'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  fetchLiveControlState,
  postLiveControlEvent,
  saveLiveControlAccess,
  type LiveControlAccess,
} from '@/lib/live-control-client';
import JoinQrCode from '@/components/JoinQrCode';
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
async function reconcileLiveControl(sessionId: string) {
  try {
    const response = await fetchWithTimeout(
      `/api/sessions/${sessionId}/live-control/reconcile`,
      { method: 'POST', cache: 'no-store' },
      7_000,
    );
    if (!response.ok) return 0;
    const data = await response.json() as { reconciled?: number };
    return Number.isFinite(data.reconciled) ? Number(data.reconciled) : 0;
  } catch {
    return 0;
  }
}

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
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const hasSessionRef = useRef(false);
  const sessionRef = useRef<TeacherSessionData | null>(null);
  const reconciliationRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const operation = (async () => {
      try {
        const response = await fetchWithTimeout(`/api/sessions/${sessionId}`, { cache: 'no-store' }, 6_000);
        const data = await response.json() as { session?: TeacherSessionData; error?: string };
        if (!response.ok || !data.session) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');
        hasSessionRef.current = true;
        sessionRef.current = data.session;
        setSession(data.session);
        setError('');
      } catch (err) {
        const live = await fetchLiveControlState(sessionId, 'teacher');
        if (live) {
          const snapshot = live.snapshot;
          const current = sessionRef.current;
          const lesson = snapshot.lessonSnapshot as unknown as Lesson;
          const activeBlockId = snapshot.activeBlockId;
          const participantNames = new Map(snapshot.participants.map((participant) => [participant.id, participant.displayName]));
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

          const recovered: TeacherSessionData = {
            id: sessionId,
            lessonId: current?.lessonId ?? null,
            joinCode: snapshot.joinCode ?? current?.joinCode ?? '',
            status: snapshot.status,
            activeBlockId,
            lessonSnapshot: lesson,
            realtimeKey: current?.realtimeKey ?? '',
            createdAt: current?.createdAt ?? snapshot.updatedAt,
            startedAt: current?.startedAt ?? (snapshot.status === 'lobby' ? null : snapshot.updatedAt),
            endedAt: snapshot.status === 'ended' ? snapshot.updatedAt : current?.endedAt ?? null,
            resultsRevealed: Boolean(activeBlockId && snapshot.revealedBlockIds.includes(activeBlockId)),
            timer,
            participants: snapshot.participants.map((participant) => ({
              id: participant.id,
              displayName: participant.displayName,
              joinedAt: current?.participants.find((row) => row.id === participant.id)?.joinedAt ?? snapshot.updatedAt,
              teamId: participant.teamId,
            })),
            teams: snapshot.teams.map((team, index) => ({
              id: team.id,
              name: team.name,
              sortOrder: team.sortOrder ?? index,
            })),
            responses: snapshot.responses
              .filter((response) => response.blockId === activeBlockId)
              .map((response) => ({
                participantId: response.participantId,
                displayName: participantNames.get(response.participantId) ?? 'Student',
                answer: response.answer as StudentAnswer,
                updatedAt: snapshot.updatedAt,
              })),
            teamResponses: (snapshot.teamResponses ?? [])
              .filter((response) => response.blockId === activeBlockId)
              .map((response) => ({
                teamId: response.teamId,
                text: response.text,
                updatedByParticipantId: response.updatedByParticipantId ?? null,
                updatedByDisplayName: response.updatedByParticipantId
                  ? participantNames.get(response.updatedByParticipantId) ?? 'Student'
                  : null,
                updatedAt: snapshot.updatedAt,
              })),
          };

          hasSessionRef.current = true;
          sessionRef.current = recovered;
          setSession(recovered);
          setError('Primární spojení je dočasně nedostupné. Hodina pokračuje přes záložní live vrstvu.');
        } else if (!hasSessionRef.current) {
          setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
        }
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled || reconciliationRef.current) return;
      const operation = reconcileLiveControl(sessionId)
        .then((reconciled) => {
          if (!cancelled && reconciled > 0) void refresh();
        })
        .finally(() => {
          if (reconciliationRef.current === operation) reconciliationRef.current = null;
        });
      reconciliationRef.current = operation;
    };

    void run();
    const timer = window.setInterval(run, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh, sessionId]);
  useEffect(() => {
    if (!session?.joinCode) return;
    setJoinUrl(`${window.location.origin}/join/${session.joinCode}`);
  }, [session?.joinCode]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sessions/${sessionId}/live-control`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { liveControl?: LiveControlAccess | null };
        if (!cancelled && data.liveControl) saveLiveControlAccess(sessionId, 'teacher', data.liveControl);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionId]);

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

  function applyFallbackAction(action: SessionAction['action']) {
    setSession((current) => {
      if (!current) return current;
      const index = current.activeBlockId
        ? current.lessonSnapshot.blocks.findIndex((block) => block.id === current.activeBlockId)
        : -1;

      if (action === 'start' && current.lessonSnapshot.blocks[0]) {
        return { ...current, status: 'live', activeBlockId: current.lessonSnapshot.blocks[0].id };
      }
      if (action === 'next' && index >= 0 && current.lessonSnapshot.blocks[index + 1]) {
        return { ...current, activeBlockId: current.lessonSnapshot.blocks[index + 1].id, resultsRevealed: false, timer: null };
      }
      if (action === 'previous' && index > 0 && current.lessonSnapshot.blocks[index - 1]) {
        return { ...current, activeBlockId: current.lessonSnapshot.blocks[index - 1].id, resultsRevealed: false, timer: null };
      }
      if (action === 'end') return { ...current, status: 'ended' };
      if (action === 'reveal_results') return { ...current, resultsRevealed: true };
      if (action === 'timer_reset' && index >= 0) {
        const block = current.lessonSnapshot.blocks[index];
        return block.type === 'timer'
          ? { ...current, timer: { status: 'idle', remainingSeconds: block.durationMinutes * 60, syncedAt: new Date().toISOString() } }
          : current;
      }
      if (action === 'timer_start' && current.timer) {
        return { ...current, timer: { ...current.timer, status: 'running', syncedAt: new Date().toISOString() } };
      }
      if (action === 'timer_pause' && current.timer) {
        return { ...current, timer: { ...current.timer, status: 'paused', syncedAt: new Date().toISOString() } };
      }
      return current;
    });
  }

  async function act(action: SessionAction['action']) {
    if (busy) return;
    if (action === 'end' && !window.confirm('Opravdu ukončit hodinu? Studenti už se znovu nepřipojí.')) return;
    if (action === 'reveal_results' && !window.confirm('Zveřejnit výsledky studentům? Po zveřejnění už svou odpověď u tohoto bloku nebudou moci změnit.')) return;
    const operationId = crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const response = await fetchWithTimeout(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          operationId,
          ...((action === 'next' || action === 'previous') && session?.activeBlockId
            ? { expectedActiveBlockId: session.activeBlockId }
            : {}),
        }),
      }, 8_000);
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw new Error(data.error || 'Stav hodiny se nepodařilo změnit.');
        }
        throw new TypeError(data.error || 'Primární live služba je dočasně nedostupná.');
      }
      await refresh();
    } catch (err) {
      const fallbackOk = await postLiveControlEvent(
        sessionId,
        'teacher',
        'teacher.command',
        {
          action,
          source: 'fallback',
          ...((action === 'next' || action === 'previous') && session?.activeBlockId
            ? { expectedActiveBlockId: session.activeBlockId }
            : {}),
        },
        operationId,
      );
      if (fallbackOk) {
        applyFallbackAction(action);
        setError('Primární spojení je dočasně nedostupné. Hodina pokračuje přes záložní live vrstvu a po obnovení se dosynchronizuje.');
      } else {
        setError(err instanceof Error ? err.message : 'Stav hodiny se nepodařilo změnit.');
      }
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
    <main className="shell teacher-live-shell" aria-busy={busy}>
      <header className="brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">LIVE</span></div>
        <nav className="main-nav"><Link href="/lessons">Moje lekce</Link></nav>
        <p className="brand-tagline">Řídicí centrum</p>
      </header>

      {error ? <div className="error" role="alert" style={{ marginBottom: 14 }}>{error}</div> : null}
      {!session ? <div className="panel" role="status"><p className="muted-copy">Načítám řídicí centrum…</p></div> : null}

      {session?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <span className="eyebrow">Startovní zóna</span>
            <h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1>
            <p className="muted-copy">Studenti se mohou připojit i po startu hodiny. Kód přestane fungovat až po jejím ukončení.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <span className="eyebrow">Kód pro studenty</span>
                <div className="live-code">{session.joinCode}</div>
                <p className="muted-copy" style={{ wordBreak: 'break-all', marginBottom: 0 }}>{joinUrl || `/join/${session.joinCode}`}</p>
              </div>
              {joinUrl ? <JoinQrCode value={joinUrl} /> : null}
            </div>
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
                <span className="eyebrow"><span className="live-status-dot" aria-hidden="true" />Mise probíhá</span>
                <h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1>
                <p className="muted-copy">Blok {activeIndex + 1} z {session.lessonSnapshot.blocks.length} · {session.participants.length} studentů</p>
              </div>
              <div className="live-control-actions">
                <button className="secondary" disabled={busy || activeIndex <= 0} onClick={() => void act('previous')}>← Předchozí</button>
                <button className="primary" disabled={busy || activeIndex >= session.lessonSnapshot.blocks.length - 1} onClick={() => void act('next')}>Další →</button>
                <button className="secondary live-end" disabled={busy} onClick={() => void act('end')}>Ukončit hodinu</button>
              </div>
            </div>
            <div
              className="live-session-progress"
              role="progressbar"
              aria-label="Průběh hodiny"
              aria-valuemin={1}
              aria-valuemax={session.lessonSnapshot.blocks.length}
              aria-valuenow={activeIndex + 1}
              aria-valuetext={`Blok ${activeIndex + 1} z ${session.lessonSnapshot.blocks.length}`}
            >
              <div className="live-session-progress-fill" style={{ width: `${liveProgress}%` }} />
            </div>
          </section>

          <details className="panel">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Připojit další studenty · kód {session.joinCode}</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <p className="muted-copy">Pozdní příchod je povolený i během probíhající hodiny. Student může zadat kód nebo naskenovat QR.</p>
                <p className="muted-copy" style={{ wordBreak: 'break-all', marginBottom: 0 }}>{joinUrl || `/join/${session.joinCode}`}</p>
              </div>
              {joinUrl ? <JoinQrCode value={joinUrl} /> : null}
            </div>
          </details>

          <div className={hasResponsePanel ? 'live-main-grid' : 'live-main-grid live-main-grid-single'}>
            <div className="live-current-column">
              {activeBlock ? <LiveBlock block={activeBlock} teacherMode hideItems={activeBlock.type === 'ranking'} /> : <div className="error" role="alert">Aktuální blok se nepodařilo najít ve snapshotu.</div>}

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
                <p className="muted-copy" role="status" style={{ marginBottom: 0 }}>Výsledky jsou zveřejněné. Studentské odpovědi na tento blok jsou uzamčené.</p>
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
