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
import { useUiLocale } from '@/components/LocaleProvider';
import LiveBlock from '@/components/LiveBlock';
import LiveTimer from '@/components/LiveTimer';
import StudentResponseInput from '@/components/StudentResponseInput';
import StudentEvaluationCard from '@/components/StudentEvaluationCard';
import StudentPreviousActivities from '@/components/StudentPreviousActivities';
import StudentRevealedResults from '@/components/StudentRevealedResults';
import SyllonautMark from '@/components/SyllonautMark';
import TeamPicker from '@/components/TeamPicker';
import TeamTaskResponseInput from '@/components/TeamTaskResponseInput';
import VisuallyHidden from '@/components/VisuallyHidden';
import type { LiveTimerState, PublicLessonBlock, PublicScoreboardState, RevealedChoiceResults, SessionStatus, StudentAnswer, StudentEvaluation, StudentPreviousActivity } from '@/lib/live';
import { localizedApiError } from '@/lib/i18n';
import { studentSolutionsFilename } from '@/lib/student-solutions-pdf';

type Team = { id: string; name: string; memberCount: number };

const PUSH_PRIMARY_REFRESH_DELAY_MS = 3_000;

type StudentState = {
  sessionId: string;
  status: SessionStatus;
  title: string;
  lessonLanguage: string | null;
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
  myTeamResponse: { text: string; updatedByParticipantId: string | null; submitted?: boolean; submittedText?: string | null; submittedAt?: string | null } | null;
  scoreboard: PublicScoreboardState | null;
  myEvaluation?: StudentEvaluation | null;
  myEvaluations?: StudentEvaluation[];
  previousBlocks?: StudentPreviousActivity[];
};

export default function StudentSession({ sessionId }: { sessionId: string }) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [state, setState] = useState<StudentState | null>(null);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<StudentConnectionStatus>('connecting');
  const [activeBlockAnnouncement, setActiveBlockAnnouncement] = useState('');
  const hasLoadedRef = useRef(false);
  const disconnectedRef = useRef(false);
  const previousBlockIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const pushRefreshTimerRef = useRef<number | null>(null);

  // `fallback`: the primary API failed, so the snapshot replaces it and the UI
  // says the connection is being restored. `push`: a Live Control WebSocket
  // wake-up (any participant's save broadcasts one) while the primary API may be
  // perfectly healthy — apply the snapshot silently, without the reconnecting
  // banner that shifted the page while students were typing.
  const refreshFromLiveControl = useCallback(async (source: 'fallback' | 'push' = 'fallback') => {
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
    // Worker 0.8.17+ sends the student only their own participant row and a
    // server-side memberCount; older Workers send every participant.
    const counts = new Map<string, number>();
    for (const row of snapshot.participants) {
      if (row.teamId) counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1);
    }
    const teams = snapshot.teams.map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: typeof team.memberCount === 'number' ? team.memberCount : counts.get(team.id) ?? 0,
    }));
    const myTeam = participant?.teamId ? teams.find((team) => team.id === participant.teamId) ?? null : null;
    const response = snapshot.responses.find((row) => row.participantId === access.subject && row.blockId === snapshot.activeBlockId);
    const teamResponse = myTeam && snapshot.activeBlockId
      ? snapshot.teamResponses?.find((row) => row.teamId === myTeam.id && row.blockId === snapshot.activeBlockId)
      : null;
    const activeBlockIndex = snapshot.activeBlockId
      ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
      : -1;
    const previousBlocks: StudentPreviousActivity[] = snapshot.status === 'live' && activeBlockIndex > 0
      ? blocks.slice(0, activeBlockIndex).map((block, index) => {
          const own = snapshot.responses.find((row) => row.participantId === access.subject && row.blockId === block.id);
          const team = myTeam ? snapshot.teamResponses?.find((row) => row.teamId === myTeam.id && row.blockId === block.id) : null;
          return {
            index,
            block: block as PublicLessonBlock,
            myAnswer: block.type === 'team_task' ? null : ((own?.submittedAnswer ?? own?.answer ?? null) as StudentAnswer | null),
            myTeamAnswer: block.type === 'team_task' ? team?.submittedText ?? team?.text ?? null : null,
          };
        })
      : [];
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
        : current?.title ?? ui('Hodina', 'Lesson'),
      lessonLanguage: typeof snapshot.lessonSnapshot?.language === 'string'
        ? snapshot.lessonSnapshot.language
        : current?.lessonLanguage ?? null,
      participantDisplayName: participant?.displayName ?? current?.participantDisplayName ?? 'Student',
      activeBlock,
      activeBlockIndex: activeBlockIndex >= 0 ? activeBlockIndex : null,
      totalBlocks: (typeof snapshot.lessonSnapshot?.totalBlocks === 'number' ? snapshot.lessonSnapshot.totalBlocks : blocks.length) || current?.totalBlocks || 0,
      realtimeKey: current?.realtimeKey ?? '',
      myResponse: (response?.answer as StudentAnswer | undefined) ?? current?.myResponse ?? null,
      myResponseSubmitted: response?.submitted ?? current?.myResponseSubmitted ?? false,
      resultsRevealed: Boolean(snapshot.activeBlockId && snapshot.revealedBlockIds.includes(snapshot.activeBlockId)),
      revealedResults: current?.revealedResults ?? null,
      timer,
      teams,
      myTeam,
      myTeamResponse: teamResponse
        ? { text: teamResponse.text, updatedByParticipantId: null, submittedText: teamResponse.submittedText ?? null, submittedAt: teamResponse.submittedAt ?? null }
        : current?.myTeamResponse ?? null,
      scoreboard: current?.scoreboard ?? null,
      myEvaluation: current?.myEvaluation ?? null,
      myEvaluations: current?.myEvaluations ?? [],
      previousBlocks,
    }));
    hasLoadedRef.current = true;
    setError('');
    if (source === 'fallback') {
      disconnectedRef.current = true;
      setConnectionStatus('reconnecting');
    }
    return true;
  }, [english, sessionId]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const operation = (async () => {
      try {
        const response = await fetchWithTimeout(`/api/student/sessions/${sessionId}`, { cache: 'no-store' }, 6_000);
        const data = await response.json() as StudentState & { error?: string };
        if (!response.ok) throw new Error(localizedApiError(data.error, locale, 'Hodinu se nepodařilo načíst.', 'The lesson could not be loaded.'));

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
            setError(err instanceof Error ? err.message : ui('Hodinu se nepodařilo načíst.', 'The lesson could not be loaded.'));
          }
        }
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [english, refreshFromLiveControl, sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const clearPushRefresh = () => {
      if (pushRefreshTimerRef.current !== null) {
        window.clearTimeout(pushRefreshTimerRef.current);
        pushRefreshTimerRef.current = null;
      }
    };
    const socket = connectLiveControl(sessionId, 'student', () => {
      void refreshFromLiveControl('push');
      // Fields the snapshot does not carry (revealed results, scoreboard,
      // evaluations) come from the primary API; one coalesced refresh per burst
      // of wake-ups keeps them as fresh as before without a request per push.
      if (pushRefreshTimerRef.current === null) {
        pushRefreshTimerRef.current = window.setTimeout(() => {
          pushRefreshTimerRef.current = null;
          void refresh();
        }, PUSH_PRIMARY_REFRESH_DELAY_MS);
      }
    });
    if (!socket) return clearPushRefresh;
    return () => {
      clearPushRefresh();
      socket.close(1000, 'Student page closed');
    };
  }, [refresh, refreshFromLiveControl, sessionId]);

  useEffect(() => {
    if (connectionStatus !== 'restored') return;
    const timer = window.setTimeout(() => setConnectionStatus('connected'), 2500);
    return () => window.clearTimeout(timer);
  }, [connectionStatus]);

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
      setActiveBlockAnnouncement(english
        ? `Current task ${blockNumber} of ${state.totalBlocks}: ${activeBlock.title}.`
        : `Aktuální úkol ${blockNumber} z ${state.totalBlocks}: ${activeBlock.title}.`);
      previousBlockIdRef.current = activeBlock.id;
    }
  }, [english, state?.activeBlock, state?.activeBlockIndex, state?.status, state?.totalBlocks]);

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
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div>
        <ConnectionStatusBadge status={connectionStatus} />
      </header>
      <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{activeBlockAnnouncement}</span></VisuallyHidden>

      {error ? <div className="error" role="alert"><p style={{ marginTop: 0 }}>{error}</p><button className="secondary" type="button" onClick={() => void refresh()}>{ui('Zkusit znovu', 'Try again')}</button></div> : null}
      {!state && !error ? <div className="panel" role="status"><p className="muted-copy">{ui('Navazuji spojení s hodinou…', 'Connecting to the lesson…')}</p></div> : null}

      {state?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel" style={{ textAlign: 'center' }}>
            <span className="eyebrow">{ui('Startovní zóna', 'Starting area')}</span>
            <h1 lang={state.lessonLanguage ?? undefined} dir={state.lessonLanguage ? 'auto' : undefined}>{state.title}</h1>
            <p className="muted-copy">{ui('Jsi připojen jako', 'You are connected as')} <strong>{state.participantDisplayName}</strong>. {ui('Čekáme, až učitel hodinu odstartuje.', 'Waiting for the teacher to start the lesson.')}</p>
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
            <h1 className="student-session-title" lang={state.lessonLanguage ?? undefined} dir={state.lessonLanguage ? 'auto' : undefined}>{state.title}</h1>
            <div
              className="student-progress-track"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={state.totalBlocks}
              aria-valuenow={currentBlockNumber}
              aria-valuetext={english ? `Block ${currentBlockNumber} of ${state.totalBlocks}` : `Blok ${currentBlockNumber} z ${state.totalBlocks}`}
              aria-label={ui('Průběh hodiny', 'Lesson progress')}
            >
              <div className="student-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </section>

          {state.scoreboard ? (
            <section className="panel" aria-label={ui('Moje průběžné skóre', 'My current score')}>
              <span className="eyebrow">{ui('Průběžné pořadí', 'Current ranking')}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginTop: 8 }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 28, lineHeight: 1.1 }}>{state.scoreboard.score} / {state.scoreboard.maxPoints}</strong>
                  <span className="muted-copy">{ui('Tvoje skóre', 'Your score')}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block', fontSize: 24, lineHeight: 1.1 }}>{state.scoreboard.rank}. {ui('místo', 'place')}</strong>
                  <span className="muted-copy">{ui('Aktuální pořadí', 'Current ranking')}</span>
                </div>
              </div>
            </section>
          ) : null}

          {connectionStatus === 'reconnecting' ? (
            <div className="panel" role="status" style={{ padding: 12 }}>
              <p className="muted-copy" style={{ margin: 0 }}>{ui('Spojení se přerušilo. Poslední známý stav zůstává na obrazovce a Syllonaut se pokusí hodinu automaticky dosynchronizovat.', 'The connection was interrupted. The last known state stays on screen while Syllonaut automatically tries to resynchronise the lesson.')}</p>
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
                contentLanguage={state.lessonLanguage}
              />

              {state.activeBlock.type === 'timer' && state.timer ? <LiveTimer timer={state.timer} label={ui('Společný čas', 'Shared timer')} /> : null}

              {state.activeBlock.type === 'team_task' ? (
                state.myTeam ? (
                  <TeamTaskResponseInput
                    key={`${state.activeBlock.id}-${state.myTeam.id}`}
                    sessionId={sessionId}
                    block={state.activeBlock}
                    teamName={state.myTeam.name}
                    teamId={state.myTeam.id}
                    response={state.myTeamResponse}
                    connectionRestored={connectionStatus === 'restored'}
                    onSaved={() => void refresh()}
                  />
                ) : (
                  <div className="error" role="alert">{ui('Pro týmový úkol si nejdřív vyber tým.', 'Choose a team before working on the team task.')}</div>
                )
              ) : choiceResultsLocked ? (
                state.revealedResults ? <StudentRevealedResults results={state.revealedResults} /> : <div className="panel" role="status"><p className="muted-copy">{ui('Výsledky byly zveřejněné. Načítám je…', 'Results have been revealed. Loading them…')}</p></div>
              ) : (
                <StudentResponseInput
                  key={state.activeBlock.id}
                  sessionId={sessionId}
                  block={state.activeBlock}
                  response={state.myResponse}
                  responseSubmitted={state.myResponseSubmitted ?? false}
                  contentLanguage={state.lessonLanguage}
                  onSaved={(answer, submittedCurrent) => setState((current) => current ? {
                    ...current,
                    myResponse: answer,
                    myResponseSubmitted: submittedCurrent ?? current.myResponseSubmitted,
                  } : current)}
                />
              )}

              {state.myEvaluation && state.myEvaluation.blockId === state.activeBlock.id ? (
                <StudentEvaluationCard evaluation={state.myEvaluation} contentLanguage={state.lessonLanguage} />
              ) : null}
            </>
          ) : <div className="error" role="status">{ui('Čekám na aktivní blok…', 'Waiting for the active block…')}</div>}

          <StudentPreviousActivities activities={state.previousBlocks ?? []} contentLanguage={state.lessonLanguage} />
        </div>
      ) : null}

      {state?.status === 'ended' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel" style={{ textAlign: 'center' }}>
            <span className="eyebrow">{ui('Mise dokončena', 'Mission complete')}</span>
            <h1>{ui('Hodina skončila', 'The lesson has ended')}</h1>
            <p className="muted-copy">{ui('Díky za účast', 'Thanks for taking part')}, {state.participantDisplayName}.</p>
          </section>

          <section className="panel" aria-label={ui('Moje řešení', 'My solutions')}>
            <p className="muted-copy" style={{ marginTop: 0 }}>{ui('Stáhni si svoje odpovědi se vzorovými odpověďmi a hodnocením, které potvrdil učitel.', 'Download your answers with model answers and the evaluations confirmed by your teacher.')}</p>
            <a
              className="button-link primary"
              href={`/api/student/sessions/${sessionId}/solutions-pdf${english ? '?locale=en' : ''}`}
              download={studentSolutionsFilename(state.title, english)}
            >
              {ui('Stáhnout moje řešení (PDF)', 'Download my solutions (PDF)')}
            </a>
          </section>

          {state.scoreboard ? (
            <section className="panel" aria-label={ui('Moje konečné skóre', 'My final score')}>
              <span className="eyebrow">{ui('Konečné pořadí', 'Final ranking')}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginTop: 8 }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 28, lineHeight: 1.1 }}>{state.scoreboard.score} / {state.scoreboard.maxPoints}</strong>
                  <span className="muted-copy">{ui('Tvoje skóre', 'Your score')}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block', fontSize: 24, lineHeight: 1.1 }}>{state.scoreboard.rank}. {ui('místo', 'place')}</strong>
                  <span className="muted-copy">{ui('Konečné pořadí', 'Final ranking')}</span>
                </div>
              </div>
            </section>
          ) : null}

          {state.myEvaluations?.length ? (
            <section aria-label={ui('Moje hodnocení', 'My evaluations')} style={{ display: 'grid', gap: 12 }}>
              <h2 style={{ margin: '4px 0 0' }}>{ui('Moje hodnocení', 'My evaluations')}</h2>
              {state.myEvaluations.map((evaluation) => (
                <StudentEvaluationCard key={evaluation.blockId} evaluation={evaluation} showTitle contentLanguage={state.lessonLanguage} />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
