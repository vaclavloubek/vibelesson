'use client';

import { trackEvent, trackEventOnce, type ActivityType } from '@/lib/analytics';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import {
  GRADING_QUEUE_EVENT,
  manualGradingStatusText,
  type GradingQueueEventDetail,
  type ManualGradingReason,
} from '@/lib/ai-grading-quota-communication';

type EvaluationStatus = 'pending' | 'grading' | 'graded' | 'needs_review' | 'failed';
type GradingMode = 'ai' | 'manual';
type Criterion = { id: string; title: string; description: string; maxPoints: number };
type CriterionScore = { criterionId: string; points: number; rationale: string };
type QueueEvaluation = {
  id: string;
  blockId: string;
  blockTitle: string;
  blockType: string;
  blockIndex: number;
  respondentName: string;
  answerText: string;
  hasNewerSubmission: boolean;
  latestAnswerText: string | null;
  latestSubmittedAt: string | null;
  status: EvaluationStatus;
  maxPoints: number;
  aiScore: number | null;
  teacherScore: number | null;
  rationale: string | null;
  confidence: number | null;
  aiUseSuspicion: 'none' | 'low' | 'high';
  aiUseSignals: string[];
  rubric: Criterion[];
  criterionScores: CriterionScore[];
  teacherConfirmed: boolean;
  teacherReviewedAt: string | null;
  teacherNote: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  manualOnly: boolean;
  manualReason?: ManualGradingReason | null;
};

type ReviewPatch = {
  evaluationId: string;
  teacherScore: number;
  teacherConfirmed: boolean;
  teacherNote: string | null;
};

function gradableActivityType(value: string): Extract<ActivityType, 'open_text' | 'exit_ticket' | 'team_task'> | null {
  return value === 'open_text' || value === 'exit_ticket' || value === 'team_task' ? value : null;
}

function reviewPriority(item: QueueEvaluation, activeBlockId: string | null) {
  const blockPriority = item.blockId === activeBlockId ? 0 : 10;
  if (item.hasNewerSubmission) return blockPriority;
  if (!item.teacherConfirmed && item.status === 'needs_review') return blockPriority + 1;
  if (!item.teacherConfirmed && item.status === 'graded') return blockPriority + 2;
  if (item.status === 'pending' || item.status === 'grading') return blockPriority + 3;
  if (item.status === 'failed') return blockPriority + 4;
  return blockPriority + 5;
}

function ReviewForm({ evaluation, sessionId, onReviewed }: {
  evaluation: QueueEvaluation;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
}) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const effectiveScore = evaluation.teacherScore ?? evaluation.aiScore ?? 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const score = Number(form.get('score'));
    const note = String(form.get('note') ?? '').trim();
    if (!Number.isInteger(score) || score < 0 || score > evaluation.maxPoints) {
      setError(english ? `Points must be a whole number from 0 to ${evaluation.maxPoints}.` : `Body musí být celé číslo od 0 do ${evaluation.maxPoints}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/${evaluation.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, note, noteForStudent: true }),
      });
      const data = await response.json() as ReviewPatch & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
      const activityType = gradableActivityType(evaluation.blockType);
      if (activityType) {
        if ((evaluation.manualOnly || evaluation.aiScore === null) && !evaluation.teacherConfirmed) {
          trackEvent('manual_grading_completed', { activity_type: activityType });
        } else if (
          !evaluation.manualOnly
          && evaluation.aiScore !== null
          && score !== evaluation.aiScore
          && score !== evaluation.teacherScore
        ) {
          trackEvent('teacher_grade_override', { activity_type: activityType });
        }
      }
      onReviewed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
    } finally {
      setSaving(false);
    }
  }


  async function confirmUnauthorizedAiUse() {
    if (saving || evaluation.aiUseSuspicion !== 'high' || evaluation.teacherConfirmed) return;
    const confirmed = window.confirm(ui(
      'Opravdu potvrdit nepovolené využití generativní AI? Hodnocení bude nastaveno na 0 bodů.',
      'Confirm unauthorized generative AI use? The score will be set to 0 points.',
    ));
    if (!confirmed) return;

    setSaving(true);
    setError('');
    const note = ui(
      'Integritní kontrola: učitel potvrdil nepovolené využití generativní AI.',
      'Integrity review: teacher confirmed unauthorized generative AI use.',
    );
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/${evaluation.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 0, note }),
      });
      const data = await response.json() as ReviewPatch & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
      const activityType = gradableActivityType(evaluation.blockType);
      if (activityType && evaluation.aiScore !== 0) {
        trackEvent('teacher_grade_override', { activity_type: activityType });
      }
      onReviewed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      key={`${evaluation.id}:${evaluation.teacherScore ?? 'base'}:${evaluation.teacherNote ?? ''}`}
      onSubmit={submit}
      style={{ marginTop: 10, display: 'grid', gap: 8 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'end' }}>
        <label style={{ fontSize: 12 }}>
          {ui('Body', 'Points')}
          <input name="score" type="number" min={0} max={evaluation.maxPoints} step={1} defaultValue={effectiveScore} />
        </label>
        <label style={{ fontSize: 12 }}>
          {ui('Poznámka pro studenta', 'Note for the student')} <span className="muted-copy">{ui('(volitelná, student ji uvidí)', '(optional, the student will see it)')}</span>
          <input name="note" type="text" maxLength={1000} defaultValue={evaluation.teacherNote ?? ''} />
        </label>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="secondary" type="submit" disabled={saving}>
          {saving ? ui('Ukládám…', 'Saving…') : evaluation.teacherConfirmed ? ui('Uložit změnu', 'Save change') : ui('Potvrdit hodnocení', 'Confirm grading')}
        </button>
        {evaluation.aiUseSuspicion === 'high' && !evaluation.teacherConfirmed ? (
          <button
            className="secondary"
            type="button"
            disabled={saving}
            onClick={() => { void confirmUnauthorizedAiUse(); }}
          >
            {ui('Potvrdit nepovolené využití AI → 0 bodů', 'Confirm unauthorized AI use → 0 points')}
          </button>
        ) : null}
      </div>
      {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
    </form>
  );
}

function EvaluationItem({ evaluation, sessionId, onReviewed, onRequeued }: {
  evaluation: QueueEvaluation;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
  onRequeued: (evaluationId: string, gradingMode: GradingMode, manualReason: ManualGradingReason | null) => void;
}) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState('');
  const effectiveScore = evaluation.teacherScore ?? evaluation.aiScore;
  const confidence = evaluation.confidence === null ? null : Math.round(evaluation.confidence * 100);
  const criterionScores = new Map(evaluation.criterionScores.map((item) => [item.criterionId, item]));
  const ready = evaluation.status === 'graded' || evaluation.status === 'needs_review';
  const canRefresh = evaluation.hasNewerSubmission && ['graded', 'needs_review', 'failed'].includes(evaluation.status);

  async function refreshSubmission() {
    if (!canRefresh || regrading) return;
    setRegrading(true);
    setRegradeError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/${evaluation.id}/regrade`, {
        method: 'POST',
      });
      const data = await response.json() as {
        requeued?: boolean;
        gradingMode?: GradingMode;
        aiBillingPaused?: boolean;
        manualReason?: ManualGradingReason | null;
        error?: string;
      };
      if (!response.ok || !data.requeued || !data.gradingMode) {
        throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Novější verzi se nepodařilo připravit k hodnocení.', 'The newer version could not be prepared for grading.'));
      }
      const manualReason = data.gradingMode === 'ai'
        ? null
        : data.manualReason ?? (data.aiBillingPaused ? 'payment' : 'plan');
      onRequeued(evaluation.id, data.gradingMode, manualReason);
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : ui('Novější verzi se nepodařilo připravit k hodnocení.', 'The newer version could not be prepared for grading.'));
    } finally {
      setRegrading(false);
    }
  }

  return (
    <div className="item" style={{ padding: 12 }}>
      <div className="teacher-response-item-head">
        <div>
          <strong>{evaluation.respondentName}</strong>
          <p className="muted-copy" style={{ margin: '3px 0 0' }}>{ui('Blok', 'Block')} {evaluation.blockIndex + 1}: {evaluation.blockTitle}</p>
        </div>
        <strong>{effectiveScore === null ? '—' : `${effectiveScore} / ${evaluation.maxPoints}`}</strong>
      </div>
      {evaluation.answerText ? <p style={{ margin: '9px 0 0', whiteSpace: 'pre-wrap' }}>{evaluation.answerText}</p> : null}

      {evaluation.hasNewerSubmission ? (
        <div className="reveal" style={{ marginTop: 10 }}>
          <strong>{ui('Po tomto hodnocení byla odevzdaná novější verze.', 'A newer version was submitted after this grading.')}</strong>
          {evaluation.latestAnswerText ? <p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{evaluation.latestAnswerText}</p> : null}
          {canRefresh ? (
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="secondary" type="button" disabled={regrading} onClick={() => { void refreshSubmission(); }}>
                {regrading ? ui('Připravuji…', 'Preparing…') : ui('Připravit novou verzi k hodnocení', 'Prepare newer version for grading')}
              </button>
            </div>
          ) : (
            <p className="muted-copy" style={{ margin: '7px 0 0' }}>{ui('Aktuální hodnocení nejdřív doběhne. Nová verze se sama znovu hodnotit nebude.', 'The current grading must finish first. The newer version will not be graded again automatically.')}</p>
          )}
          {regradeError ? <p className="muted-copy" style={{ margin: '7px 0 0' }}>{regradeError}</p> : null}
        </div>
      ) : null}

      {evaluation.status === 'pending' ? <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Čeká na AI hodnocení.', 'Waiting for AI grading.')}</p> : null}
      {evaluation.status === 'grading' ? <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('AI právě hodnotí…', 'AI is grading…')}</p> : null}
      {evaluation.status === 'failed' ? <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('AI hodnocení se nepodařilo. Odpověď zůstává uložená pro ruční hodnocení.', 'AI grading failed. The response remains stored for manual grading.')}</p> : null}

      {ready ? (
        <>
          <p className="muted-copy" style={{ margin: '8px 0 0' }}>
            {evaluation.teacherConfirmed
              ? ui('Potvrzeno učitelem.', 'Confirmed by teacher.')
              : evaluation.manualOnly
                ? manualGradingStatusText(evaluation.manualReason ?? null, english)
                : evaluation.aiUseSuspicion === 'high'
                  ? ui('Ke kontrole kvůli podezření na využití AI.', 'Needs review because of suspected AI use.')
                  : evaluation.status === 'needs_review'
                    ? ui('Ke kontrole kvůli nižší jistotě AI.', 'Needs review because AI confidence is lower.')
                    : ui('AI návrh čeká na potvrzení.', 'AI suggestion is waiting for confirmation.')}
            {!evaluation.manualOnly && confidence !== null ? (english ? ` AI confidence: ${confidence}%.` : ` Jistota AI: ${confidence} %.`) : ''}
          </p>
          {!evaluation.manualOnly && evaluation.aiUseSuspicion === 'high' ? (
            <div className="reveal" style={{ marginTop: 10 }}>
              <strong>{ui('Podezření na využití generativní AI', 'Suspected generative AI use')}</strong>
              <p style={{ margin: '7px 0 0' }}>
                {ui(
                  'Jde pouze o upozornění podle textových vzorců, ne o důkaz. Body se tím automaticky nemění.',
                  'This is only a text-pattern alert, not proof. It does not automatically change the score.',
                )}
              </p>
              {evaluation.aiUseSignals.length ? (
                <ul style={{ margin: '7px 0 0', paddingLeft: 20 }}>
                  {evaluation.aiUseSignals.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
          {!evaluation.manualOnly && evaluation.aiUseSuspicion === 'low' && evaluation.aiUseSignals.length ? (
            <p className="muted-copy" style={{ margin: '8px 0 0' }}>
              {ui('Slabý signál možného využití AI, jen pro informaci:', 'Weak signal of possible AI use, for information only:')} {evaluation.aiUseSignals.join(' ')}
            </p>
          ) : null}
          {evaluation.teacherConfirmed && evaluation.teacherNote ? (
            <p style={{ margin: '8px 0 0' }}><strong>{ui('Poznámka učitele:', 'Teacher note:')}</strong> {evaluation.teacherNote}</p>
          ) : null}

          {evaluation.manualOnly ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Hodnoticí kritéria', 'Grading criteria')}</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {evaluation.rubric.map((criterion) => (
                  <div className="item" key={criterion.id} style={{ padding: 10 }}>
                    <div className="teacher-response-item-head">
                      <strong>{criterion.title}</strong>
                      <strong>{criterion.maxPoints} {ui('b.', 'pts')}</strong>
                    </div>
                    <p className="muted-copy" style={{ margin: '4px 0 0' }}>{criterion.description}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Jak AI hodnotila', 'How AI graded')}</summary>
              {evaluation.rationale ? <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{evaluation.rationale}</p> : null}
              <div style={{ display: 'grid', gap: 6 }}>
                {evaluation.rubric.map((criterion) => {
                  const score = criterionScores.get(criterion.id);
                  return (
                    <div className="item" key={criterion.id} style={{ padding: 10 }}>
                      <div className="teacher-response-item-head">
                        <strong>{criterion.title}</strong>
                        <strong>{score ? `${score.points} / ${criterion.maxPoints}` : `— / ${criterion.maxPoints}`}</strong>
                      </div>
                      <p className="muted-copy" style={{ margin: '4px 0 0' }}>{criterion.description}</p>
                      {score?.rationale ? <p style={{ margin: '6px 0 0' }}>{score.rationale}</p> : null}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <ReviewForm evaluation={evaluation} sessionId={sessionId} onReviewed={onReviewed} />
        </>
      ) : null}
    </div>
  );
}

export default function EvaluationReviewQueue({ sessionId }: { sessionId: string }) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [evaluations, setEvaluations] = useState<QueueEvaluation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const previousStatusesRef = useRef(new Map<string, EvaluationStatus>());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/evaluations/queue`, { cache: 'no-store' });
        const data = await response.json() as { evaluations?: QueueEvaluation[]; activeBlockId?: string | null; error?: string };
        if (!response.ok || !Array.isArray(data.evaluations)) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Hodnocení se nepodařilo načíst.', 'Grading could not be loaded.'));
        if (cancelled) return;

        for (const evaluation of data.evaluations) {
          const previousStatus = previousStatusesRef.current.get(evaluation.id);
          const completedNow = previousStatus === 'pending' || previousStatus === 'grading';
          const resultState = evaluation.status === 'graded' || evaluation.status === 'needs_review'
            ? evaluation.status
            : null;
          const activityType = gradableActivityType(evaluation.blockType);

          if (!evaluation.manualOnly && completedNow && resultState && activityType) {
            trackEventOnce(`ai-grading:${evaluation.id}`, 'ai_grading_completed', {
              activity_type: activityType,
              result_state: resultState,
            });
          }

          previousStatusesRef.current.set(evaluation.id, evaluation.status);
        }

        setEvaluations(data.evaluations);
        setActiveBlockId(typeof data.activeBlockId === 'string' ? data.activeBlockId : null);
        setError('');
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : ui('Hodnocení se nepodařilo načíst.', 'Grading could not be loaded.'));
        setLoaded(true);
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  function applyReview(patch: ReviewPatch) {
    setEvaluations((current) => current.map((evaluation) => (
      evaluation.id === patch.evaluationId
        ? { ...evaluation, teacherScore: patch.teacherScore, teacherConfirmed: patch.teacherConfirmed, teacherNote: patch.teacherNote }
        : evaluation
    )));
  }

  function applyRequeue(evaluationId: string, gradingMode: GradingMode, manualReason: ManualGradingReason | null) {
    setEvaluations((current) => current.map((evaluation) => (
      evaluation.id === evaluationId
        ? {
            ...evaluation,
            answerText: evaluation.latestAnswerText ?? evaluation.answerText,
            hasNewerSubmission: false,
            latestAnswerText: null,
            latestSubmittedAt: null,
            status: gradingMode === 'ai' ? 'pending' : 'needs_review',
            manualOnly: gradingMode === 'manual',
            manualReason: gradingMode === 'manual' ? manualReason : null,
            aiScore: null,
            teacherScore: null,
            rationale: null,
            confidence: null,
            aiUseSuspicion: 'none',
            aiUseSignals: [],
            criterionScores: [],
            teacherConfirmed: false,
            teacherReviewedAt: null,
            teacherNote: null,
            evaluatedAt: null,
          }
        : evaluation
    )));
  }

  const queueSignature = evaluations
    .map((evaluation) => `${evaluation.id}:${evaluation.status}:${evaluation.manualReason ?? ''}:${evaluation.teacherConfirmed ? 1 : 0}`)
    .join('|');

  useEffect(() => {
    if (!loaded) return;
    const detail: GradingQueueEventDetail = {
      sessionId,
      signature: queueSignature,
      manualReasons: evaluations.map((evaluation) => evaluation.manualReason ?? null),
      pendingQuotaCount: evaluations.filter((evaluation) => (
        evaluation.manualReason === 'quota'
        && evaluation.status === 'needs_review'
        && !evaluation.teacherConfirmed
      )).length,
    };
    window.dispatchEvent(new CustomEvent<GradingQueueEventDetail>(GRADING_QUEUE_EVENT, { detail }));
    // evaluations is represented by queueSignature; re-announce only when it changes.
  }, [loaded, queueSignature, sessionId]);

  if (!loaded) return null;

  const visibleEvaluations = evaluations.filter((item) => !item.teacherConfirmed || item.hasNewerSubmission);
  if (!visibleEvaluations.length && !error) return null;

  const sorted = [...visibleEvaluations].sort((a, b) => reviewPriority(a, activeBlockId) - reviewPriority(b, activeBlockId) || a.blockIndex - b.blockIndex);
  const newer = visibleEvaluations.filter((item) => item.hasNewerSubmission).length;
  const toReview = visibleEvaluations.filter((item) => !item.teacherConfirmed && (item.status === 'graded' || item.status === 'needs_review')).length;
  const waiting = visibleEvaluations.filter((item) => item.status === 'pending' || item.status === 'grading').length;

  const summary = error
    ? ui('Hodnocení · chyba načtení', 'Grading · loading error')
    : newer
      ? (english
          ? `Grading · ${newer} newer ${newer === 1 ? 'response' : 'responses'}${toReview ? ` · ${toReview} to review` : ''}`
          : `Hodnocení · ${newer} novější ${newer === 1 ? 'odpověď' : 'odpovědi'}${toReview ? ` · ${toReview} ke kontrole` : ''}`)
      : toReview
        ? (english ? `Grading · ${toReview} to review${waiting ? ` · ${waiting} pending` : ''}` : `Hodnocení · ${toReview} ke kontrole${waiting ? ` · ${waiting} čeká` : ''}`)
        : waiting
          ? (english ? `Grading · ${waiting} pending` : `Hodnocení · ${waiting} čeká`)
          : ui('Hodnocení · bez nevyřízených položek', 'Grading · no pending items');

  return (
    <aside style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 80, width: 'min(430px, calc(100vw - 24px))' }}>
      <details className="panel" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.28)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, padding: '14px 16px', listStylePosition: 'inside' }}>{summary}</summary>
        <div style={{ borderTop: '1px solid var(--border)', padding: 12, maxHeight: '68vh', overflowY: 'auto' }}>
          {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
          {!error ? <p className="muted-copy" style={{ margin: '0 0 10px' }}>{ui('Hodnocení můžeš potvrdit i poté, co studenti pokračují na další úkol. Novější odevzdanou verzi připravíš k novému hodnocení jen na svůj pokyn.', 'You can confirm grading even after students move to the next task. A newer submitted version is prepared for another grading pass only when you request it.')}</p> : null}
          {!error ? <div style={{ display: 'grid', gap: 8 }}>{sorted.map((evaluation) => <EvaluationItem key={evaluation.id} evaluation={evaluation} sessionId={sessionId} onReviewed={applyReview} onRequeued={applyRequeue} />)}</div> : null}
        </div>
      </details>
    </aside>
  );
}
