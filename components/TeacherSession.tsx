'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { activityMode, bucketBlockCount, bucketDuration, bucketParticipantCount, trackEvent } from '@/lib/analytics';
import {
  fetchLiveControlState,
  postLiveControlEvent,
  saveLiveControlAccess,
  type LiveControlAccess,
} from '@/lib/live-control-client';
import JoinQrCode from '@/components/JoinQrCode';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';
import LiveBlock from '@/components/LiveBlock';
import LiveTimer from '@/components/LiveTimer';
import SyllonautMark from '@/components/SyllonautMark';
import TeacherResponses from '@/components/TeacherResponses';
import type { LiveTimerState, SessionAction, SessionStatus, StudentAnswer } from '@/lib/live';
import type { Lesson } from '@/lib/schema';
import { createClient } from '@/lib/supabase/client';

type Participant = { id: string; displayName: string; joinedAt: string; teamId: string | null };
type Team = { id: string; name: string; sortOrder: number };
type LiveResponse = { participantId: string; displayName: string; answer: StudentAnswer; updatedAt: string; submitted: boolean };
type TeamResponse = { teamId: string; text: string; updatedByParticipantId: string | null; updatedByDisplayName: string | null; updatedAt: string; submitted: boolean };
type TeacherConnectionMode = 'primary' | 'fallback' | 'syncing';
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
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [session, setSession] = useState<TeacherSessionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamCount, setTeamCount] = useState(4);
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [connectionMode, setConnectionMode] = useState<TeacherConnectionMode>('primary');
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
        if (!response.ok || !data.session) throw new Error(data.error || ui('Hodinu se nepodařilo načíst.', 'The lesson could not be loaded.'));
        hasSessionRef.current = true;
        sessionRef.current = data.session;
        setSession(data.session);
        setConnectionMode('primary');
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
                submitted: Boolean(response.submitted),
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
                submitted: Boolean(response.submitted),
              })),
          };

          hasSessionRef.current = true;
          sessionRef.current = recovered;
          setSession(recovered);
          setConnectionMode('fallback');
          setError('');
        } else if (!hasSessionRef.current) {
          setError(err instanceof Error ? err.message : ui('Hodinu se nepodařilo načíst.', 'The lesson could not be loaded.'));
        }
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled || reconciliationRef.current) return;
      const operation = reconcileLiveControl(sessionId)
        .then((reconciled) => {
          if (!cancelled && reconciled > 0) {
            setConnectionMode('syncing');
            void refresh();
          }
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
        const data = await response.json() as { liveControl?: LiveControlAccess | null; degraded?: boolean };
        if (!cancelled && data.liveControl) {
          saveLiveControlAccess(sessionId, 'teacher', data.liveControl);
          if (data.degraded) setConnectionMode('fallback');
        }
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

  function trackSuccessfulSessionAction(action: SessionAction['action']) {
    const current = sessionRef.current;
    if (!current) return;

    const index = current.activeBlockId
      ? current.lessonSnapshot.blocks.findIndex((block) => block.id === current.activeBlockId)
      : -1;

    if (action === 'start') {
      trackEvent('live_session_started', {
        block_count_bucket: bucketBlockCount(current.lessonSnapshot.blocks.length),
        planned_duration_bucket: bucketDuration(current.lessonSnapshot.totalMinutes),
      });
      return;
    }

    if (action === 'next' && index >= 0) {
      const nextBlock = current.lessonSnapshot.blocks[index + 1];
      if (nextBlock) {
        trackEvent('activity_advanced', {
          activity_type: nextBlock.type,
          activity_mode: activityMode(nextBlock.type),
        });
      }
      return;
    }

    if (action === 'end') {
      trackEvent('live_session_ended', {
        participant_count_bucket: bucketParticipantCount(current.participants.length),
        completed_activity_count_bucket: bucketBlockCount(Math.max(0, index + 1)),
      });
    }
  }

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
    if (action === 'end' && !window.confirm(ui('Opravdu ukončit hodinu? Studenti už se znovu nepřipojí.', 'End the lesson? Students will not be able to reconnect.'))) return;
    if (action === 'reveal_results' && !window.confirm(ui('Zveřejnit výsledky studentům? Po zveřejnění už svou odpověď u tohoto bloku nebudou moci změnit.', 'Reveal results to students? After revealing them, students will no longer be able to change their answer for this block.'))) return;

    const operationId = crypto.randomUUID();
    const expectedActiveBlockId = (action === 'next' || action === 'previous')
      ? session?.activeBlockId ?? null
      : null;
    const commandPayload = {
      action,
      ...(expectedActiveBlockId ? { expectedActiveBlockId } : {}),
    };

    setBusy(true);
    setError('');

    const primary = (async () => {
      const response = await fetchWithTimeout(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commandPayload, operationId }),
      }, 4_500);

      let data: { error?: string } = {};
      try {
        data = await response.json() as { error?: string };
      } catch {
        // A malformed transient response is handled like any other failed primary request.
      }

      if (!response.ok) {
        throw new Error(
          response.status < 500 && response.status !== 408 && response.status !== 429
            ? data.error || ui('Stav hodiny se nepodařilo změnit.', 'The lesson state could not be changed.')
            : ui('Primární live služba je dočasně nedostupná.', 'The primary live service is temporarily unavailable.'),
        );
      }
      return { source: 'primary' as const };
    })();

    const fallback = (async () => {
      if (expectedActiveBlockId) {
        const current = await fetchLiveControlState(sessionId, 'teacher');
        if (current && current.snapshot.activeBlockId !== expectedActiveBlockId) {
          return { source: 'fallback-stale' as const };
        }
      }

      const ok = await postLiveControlEvent(
        sessionId,
        'teacher',
        'teacher.command',
        { ...commandPayload, source: 'fallback' },
        operationId,
      );
      if (!ok) throw new Error(ui('Záložní live služba je dočasně nedostupná.', 'The backup live service is temporarily unavailable.'));
      return { source: 'fallback' as const };
    })();

    try {
      const winner = await Promise.any([primary, fallback]);

      if (winner.source === 'fallback-stale') {
        setConnectionMode('fallback');
        await refresh();
      } else if (winner.source === 'fallback') {
        trackSuccessfulSessionAction(action);
        applyFallbackAction(action);
        setConnectionMode('fallback');

        // If the primary write completes shortly afterwards, converge back
        // automatically without asking the teacher to repeat the command.
        void primary
          .then(async () => {
            setConnectionMode('syncing');
            await refresh();
          })
          .catch(() => undefined);
      } else {
        trackSuccessfulSessionAction(action);
        setConnectionMode('primary');
        await refresh();
      }
    } catch {
      setError(ui('Spojení s primární i záložní live službou se přerušilo. Stav hodiny zůstal zachovaný; zkus akci za chvíli znovu.', 'The connection to both the primary and backup live services was interrupted. The lesson state is preserved; try the action again shortly.'));
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
      if (!response.ok) throw new Error(data.error || ui('Týmy se nepodařilo vytvořit.', 'Teams could not be created.'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Týmy se nepodařilo vytvořit.', 'Teams could not be created.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetTeams() {
    if (busy || !window.confirm(ui('Resetovat týmy? Dosavadní volby studentů v lobby se zruší.', 'Reset teams? Students’ current team choices in the lobby will be cleared.'))) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/teams`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || ui('Týmy se nepodařilo resetovat.', 'Teams could not be reset.'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Týmy se nepodařilo resetovat.', 'Teams could not be reset.'));
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
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">LIVE</span></div>
        <nav className="main-nav"><Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link></nav>
        <div className="brand-side"><LocaleSwitcher /><p className="brand-tagline" role="status">{ui('Řídicí centrum', 'Control centre')} · {connectionMode === 'primary' ? ui('Primární spojení', 'Primary connection') : connectionMode === 'syncing' ? ui('Synchronizuji', 'Synchronizing') : ui('Záložní spojení', 'Backup connection')}</p></div>
      </header>

      {error ? <div className="error" role="alert" style={{ marginBottom: 14 }}>{error}</div> : null}
      {!session ? <div className="panel" role="status"><p className="muted-copy">{ui('Načítám řídicí centrum…', 'Loading control centre…')}</p></div> : null}

      {session?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <span className="eyebrow">{ui('Startovní zóna', 'Starting area')}</span>
            <h1 style={{ marginBottom: 8 }} lang={session.lessonSnapshot.language} dir={session.lessonSnapshot.language ? 'auto' : undefined}>{session.lessonSnapshot.title}</h1>
            <p className="muted-copy">{ui('Studenti se mohou připojit i po startu hodiny. Kód přestane fungovat až po jejím ukončení.', 'Students can join even after the lesson starts. The code stops working only when the lesson ends.')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <span className="eyebrow">{ui('Kód pro studenty', 'Student code')}</span>
                <div className="live-code">{session.joinCode}</div>
                <p className="muted-copy" style={{ wordBreak: 'break-all', marginBottom: 0 }}>{joinUrl || `/join/${session.joinCode}`}</p>
              </div>
              {joinUrl ? <JoinQrCode value={joinUrl} /> : null}
            </div>
            {hasTeamTasks && !session.teams.length ? <p className="muted-copy" style={{ marginTop: 12 }}>{ui('Tato lekce obsahuje týmový úkol. Před startem vytvoř alespoň 2 týmy.', 'This lesson contains a team task. Create at least 2 teams before starting.')}</p> : null}
            <div className="actions">
              <button className="primary" disabled={busy || (hasTeamTasks && session.teams.length < 2)} onClick={() => void act('start')}>{busy ? ui('Připravuji start…', 'Preparing start…') : ui('Odstartovat hodinu', 'Start lesson')}</button>
            </div>
          </section>

          {hasTeamTasks ? (
            <section className="panel">
              <span className="eyebrow">{ui('Týmy', 'Teams')}</span>
              {!session.teams.length ? (
                <>
                  <h2>{ui('Vytvořit týmy', 'Create teams')}</h2>
                  <p className="muted-copy">{ui('Studenti si ve startovní zóně sami vyberou tým. Po odstartování se jejich volba zamkne.', 'Students choose their own team in the lobby. Their choice is locked when the lesson starts.')}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 14, flexWrap: 'wrap' }}>
                    <label style={{ maxWidth: 160 }}>
                      {ui('Počet týmů', 'Number of teams')}
                      <input type="number" min={2} max={12} value={teamCount} onChange={(event) => setTeamCount(Math.max(2, Math.min(12, Number(event.target.value) || 2)))} />
                    </label>
                    <button className="primary" disabled={busy} onClick={() => void createTeams()}>{ui('Vytvořit týmy', 'Create teams')}</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ marginBottom: 0 }}>{session.teams.length} {english ? 'teams' : 'týmů'}</h2>
                    <button className="secondary" disabled={busy} onClick={() => void resetTeams()}>{ui('Resetovat týmy', 'Reset teams')}</button>
                  </div>
                  <div className="items" style={{ marginTop: 14 }}>
                    {session.teams.map((team) => {
                      const members = teamMembers(team.id);
                      return <div className="item" key={team.id}><strong>{team.name}</strong><p className="muted-copy" style={{ marginTop: 5 }}>{members.map((member) => member.displayName).join(', ') || ui('Zatím bez členů', 'No members yet')}</p></div>;
                    })}
                  </div>
                  {unassigned.length ? <p className="muted-copy" style={{ marginTop: 12 }}>{ui('Bez týmu', 'Unassigned')}: {unassigned.map((participant) => participant.displayName).join(', ')}</p> : null}
                </>
              )}
            </section>
          ) : null}

          <section className="panel">
            <span className="eyebrow">{ui('Připojení studenti', 'Connected students')}</span>
            <h2>{session.participants.length}</h2>
            {session.participants.length ? <div className="items">{session.participants.map((participant) => <div className="item" key={participant.id}>{participant.displayName}</div>)}</div> : <p className="muted-copy">{ui('Zatím nikdo.', 'No one yet.')}</p>}
          </section>
        </div>
      ) : null}

      {session?.status === 'live' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel live-control-bar">
            <div className="live-control-layout">
              <div>
                <span className="eyebrow"><span className="live-status-dot" aria-hidden="true" />{ui('Mise probíhá', 'Lesson in progress')}</span>
                <h1 style={{ marginBottom: 8 }} lang={session.lessonSnapshot.language} dir={session.lessonSnapshot.language ? 'auto' : undefined}>{session.lessonSnapshot.title}</h1>
                <p className="muted-copy">{ui('Blok', 'Block')} {activeIndex + 1} {ui('z', 'of')} {session.lessonSnapshot.blocks.length} · {session.participants.length} {english ? 'students' : 'studentů'}</p>
              </div>
              <div className="live-control-actions">
                <button className="secondary" disabled={busy || activeIndex <= 0} onClick={() => void act('previous')}>← {ui('Předchozí', 'Previous')}</button>
                <button className="primary" disabled={busy || activeIndex >= session.lessonSnapshot.blocks.length - 1} onClick={() => void act('next')}>{ui('Další', 'Next')} →</button>
                <button className="secondary live-end" disabled={busy} onClick={() => void act('end')}>{ui('Ukončit hodinu', 'End lesson')}</button>
              </div>
            </div>
            <div
              className="live-session-progress"
              role="progressbar"
              aria-label={ui('Průběh hodiny', 'Lesson progress')}
              aria-valuemin={1}
              aria-valuemax={session.lessonSnapshot.blocks.length}
              aria-valuenow={activeIndex + 1}
              aria-valuetext={english ? `Block ${activeIndex + 1} of ${session.lessonSnapshot.blocks.length}` : `Blok ${activeIndex + 1} z ${session.lessonSnapshot.blocks.length}`}
            >
              <div className="live-session-progress-fill" style={{ width: `${liveProgress}%` }} />
            </div>
          </section>

          <details className="panel">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Připojit další studenty', 'Connect more students')} · {ui('kód', 'code')} {session.joinCode}</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <p className="muted-copy">{ui('Pozdní příchod je povolený i během probíhající hodiny. Student může zadat kód nebo naskenovat QR.', 'Students can join late while the lesson is running. They can enter the code or scan the QR code.')}</p>
                <p className="muted-copy" style={{ wordBreak: 'break-all', marginBottom: 0 }}>{joinUrl || `/join/${session.joinCode}`}</p>
              </div>
              {joinUrl ? <JoinQrCode value={joinUrl} /> : null}
            </div>
          </details>

          <div className={hasResponsePanel ? 'live-main-grid' : 'live-main-grid live-main-grid-single'}>
            <div className="live-current-column">
              {activeBlock ? <LiveBlock block={activeBlock} teacherMode hideItems={activeBlock.type === 'ranking'} contentLanguage={session.lessonSnapshot.language} /> : <div className="error" role="alert">{ui('Aktuální blok se nepodařilo najít ve snapshotu.', 'The current block could not be found in the lesson snapshot.')}</div>}

              {activeBlock?.type === 'timer' && session.timer ? (
                <>
                  <LiveTimer timer={session.timer} label={ui('Synchronizovaný timer', 'Synchronized timer')} />
                  <section className="panel">
                    <span className="eyebrow">{ui('Ovládání timeru', 'Timer controls')}</span>
                    <div className="actions" style={{ marginTop: 12 }}>
                      {session.timer.status === 'running' && session.timer.remainingSeconds > 0 ? (
                        <button className="primary" disabled={busy} onClick={() => void act('timer_pause')}>{ui('Pozastavit', 'Pause')}</button>
                      ) : session.timer.remainingSeconds > 0 ? (
                        <button className="primary" disabled={busy} onClick={() => void act('timer_start')}>{session.timer.status === 'paused' ? ui('Pokračovat', 'Resume') : ui('Spustit odpočet', 'Start countdown')}</button>
                      ) : null}
                      <button className="secondary" disabled={busy} onClick={() => void act('timer_reset')}>{ui('Resetovat', 'Reset')}</button>
                    </div>
                    <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Studenti vidí stejný čas. Start, pauza i reset se synchronizují přes session stav.', 'Students see the same time. Start, pause and reset are synchronized through the session state.')}</p>
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
              <span className="eyebrow">{ui('Výsledky pro studenty', 'Results for students')}</span>
              {session.resultsRevealed ? (
                <p className="muted-copy" role="status" style={{ marginBottom: 0 }}>{ui('Výsledky jsou zveřejněné. Studentské odpovědi na tento blok jsou uzamčené.', 'Results are visible. Student answers for this block are locked.')}</p>
              ) : (
                <div className="live-results-action-row">
                  <p className="muted-copy">{ui('Učitel vidí průběžné výsledky už teď. Studentům je zveřejni až ve chvíli, kdy už nemají měnit odpověď.', 'You can already see live results. Reveal them to students only when they should no longer change their answer.')}</p>
                  <button className="primary" disabled={busy} onClick={() => void act('reveal_results')}>{ui('Zveřejnit výsledky', 'Reveal results')}</button>
                </div>
              )}
            </section>
          ) : null}

          {session.teams.length ? (
            <section className="panel">
              <span className="eyebrow">{ui('Týmy', 'Teams')}</span>
              <div className="items" style={{ marginTop: 12 }}>
                {session.teams.map((team) => {
                  const members = teamMembers(team.id);
                  return <div className="item" key={team.id}><strong>{team.name}</strong><p className="muted-copy" style={{ marginTop: 5 }}>{members.map((member) => member.displayName).join(', ') || ui('Bez členů', 'No members')}</p></div>;
                })}
              </div>
              {unassigned.length ? <p className="muted-copy" style={{ marginTop: 12 }}>{ui('Bez týmu', 'Unassigned')}: {unassigned.map((participant) => participant.displayName).join(', ')}</p> : null}
            </section>
          ) : (
            <section className="panel"><span className="eyebrow">{ui('Připojení studenti', 'Connected students')}</span><p className="muted-copy">{session.participants.map((participant) => participant.displayName).join(', ') || ui('Zatím nikdo.', 'No one yet.')}</p></section>
          )}
        </div>
      ) : null}

      {session?.status === 'ended' ? (
        <section className="panel">
          <span className="eyebrow">{ui('Mise dokončena', 'Lesson completed')}</span>
          <h1>{session.lessonSnapshot.title}</h1>
          <p className="muted-copy">{ui('Hodina je uzavřená. Připojilo se', 'The lesson is closed.')} {session.participants.length} {english ? 'students joined.' : 'studentů.'}</p>
          <div className="actions">{session.lessonId ? <Link href={`/lessons/${session.lessonId}`} className="primary button-link">{ui('Zpět k lekci', 'Back to lesson')}</Link> : null}<Link href="/lessons" className="secondary button-link">{ui('Moje lekce', 'My lessons')}</Link></div>
        </section>
      ) : null}
    </main>
  );
}
