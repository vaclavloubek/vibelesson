'use client';

import { trackEvent, type ActivityType } from '@/lib/analytics';
import { useEffect, useRef, useState, type FormEvent } from 'react';

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
  rubric: Criterion[];
  criterionScores: CriterionScore[];
  teacherConfirmed: boolean;
  teacherReviewedAt: string | null;
  teacherNote: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  manualOnly: boolean;
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

function reviewPriority(item: QueueEvaluation) {
  if (item.hasNewerSubmission) return 0;
  if (!item.teacherConfirmed && item.status === 'needs_review') return 1;
  if (!item.teacherConfirmed && item.status === 'graded') return 2;
  if (item.status === 'pending' || item.status === 'grading') return 3;
  if (item.status === 'failed') return 4;
  return 5;
}

function ReviewForm({ evaluation, sessionId, onReviewed }: {
  evaluation: QueueEvaluation;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
}) {
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
      setError(`Body musí být celé číslo od 0 do ${evaluation.maxPoints}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/${evaluation.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, note }),
      });
      const data = await response.json() as ReviewPatch & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Hodnocení se nepodařilo uložit.');
      const activityType = gradableActivityType(evaluation.blockType);
      if (activityType) {
        if (evaluation.manualOnly || evaluation.aiScore === null) {
          trackEvent('manual_grading_completed', { activity_type: activityType });
        } else if (score !== evaluation.aiScore) {
          trackEvent('teacher_grade_override', { activity_type: activityType });
        }
      }
      onReviewed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodnocení se nepodařilo uložit.');
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
          Body
          <input name="score" type="number" min={0} max={evaluation.maxPoints} step={1} defaultValue={effectiveScore} />
        </label>
        <label style={{ fontSize: 12 }}>
          Poznámka <span className="muted-copy">(volitelná)</span>
          <input name="note" type="text" maxLength={1000} defaultValue={evaluation.teacherNote ?? ''} />
        </label>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="secondary" type="submit" disabled={saving}>
          {saving ? 'Ukládám…' : evaluation.teacherConfirmed ? 'Uložit změnu' : 'Potvrdit hodnocení'}
        </button>
      </div>
      {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
    </form>
  );
}

function EvaluationItem({ evaluation, sessionId, onReviewed, onRequeued }: {
  evaluation: QueueEvaluation;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
  onRequeued: (evaluationId: string, gradingMode: GradingMode) => void;
}) {
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
      const data = await response.json() as { requeued?: boolean; gradingMode?: GradingMode; error?: string };
      if (!response.ok || !data.requeued || !data.gradingMode) {
        throw new Error(data.error || 'Novější verzi se nepodařilo připravit k hodnocení.');
      }
      onRequeued(evaluation.id, data.gradingMode);
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : 'Novější verzi se nepodařilo připravit k hodnocení.');
    } finally {
      setRegrading(false);
    }
  }

  return (
    <div className="item" style={{ padding: 12 }}>
      <div className="teacher-response-item-head">
        <div>
          <strong>{evaluation.respondentName}</strong>
          <p className="muted-copy" style={{ margin: '3px 0 0' }}>Blok {evaluation.blockIndex + 1}: {evaluation.blockTitle}</p>
        </div>
        <strong>{effectiveScore === null ? '—' : `${effectiveScore} / ${evaluation.maxPoints}`}</strong>
      </div>
      {evaluation.answerText ? <p style={{ margin: '9px 0 0', whiteSpace: 'pre-wrap' }}>{evaluation.answerText}</p> : null}

      {evaluation.hasNewerSubmission ? (
        <div className="reveal" style={{ marginTop: 10 }}>
          <strong>Po tomto hodnocení byla odevzdaná novější verze.</strong>
          {evaluation.latestAnswerText ? <p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{evaluation.latestAnswerText}</p> : null}
          {canRefresh ? (
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="secondary" type="button" disabled={regrading} onClick={() => { void refreshSubmission(); }}>
                {regrading ? 'Připravuji…' : 'Připravit novou verzi k hodnocení'}
              </button>
            </div>
          ) : (
            <p className="muted-copy" style={{ margin: '7px 0 0' }}>Aktuální hodnocení nejdřív doběhne. Nová verze se sama znovu hodnotit nebude.</p>
          )}
          {regradeError ? <p className="muted-copy" style={{ margin: '7px 0 0' }}>{regradeError}</p> : null}
        </div>
      ) : null}

      {evaluation.status === 'pending' ? <p className="muted-copy" style={{ marginBottom: 0 }}>Čeká na AI hodnocení.</p> : null}
      {evaluation.status === 'grading' ? <p className="muted-copy" style={{ marginBottom: 0 }}>AI právě hodnotí…</p> : null}
      {evaluation.status === 'failed' ? <p className="muted-copy" style={{ marginBottom: 0 }}>AI hodnocení se nepodařilo. Odpověď zůstává uložená pro ruční hodnocení.</p> : null}

      {ready ? (
        <>
          <p className="muted-copy" style={{ margin: '8px 0 0' }}>
            {evaluation.teacherConfirmed
              ? 'Potvrzeno učitelem.'
              : evaluation.manualOnly
                ? 'Čeká na ruční hodnocení.'
                : evaluation.status === 'needs_review'
                  ? 'Ke kontrole kvůli nižší jistotě AI.'
                  : 'AI návrh čeká na potvrzení.'}
            {!evaluation.manualOnly && confidence !== null ? ` Jistota AI: ${confidence} %.` : ''}
          </p>
          {evaluation.teacherConfirmed && evaluation.teacherNote ? (
            <p style={{ margin: '8px 0 0' }}><strong>Poznámka učitele:</strong> {evaluation.teacherNote}</p>
          ) : null}

          {evaluation.manualOnly ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Hodnoticí kritéria</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {evaluation.rubric.map((criterion) => (
                  <div className="item" key={criterion.id} style={{ padding: 10 }}>
                    <div className="teacher-response-item-head">
                      <strong>{criterion.title}</strong>
                      <strong>{criterion.maxPoints} b.</strong>
                    </div>
                    <p className="muted-copy" style={{ margin: '4px 0 0' }}>{criterion.description}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Jak AI hodnotila</summary>
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
  const [evaluations, setEvaluations] = useState<QueueEvaluation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const trackedAiEvaluationsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/evaluations/queue`, { cache: 'no-store' });
        const data = await response.json() as { evaluations?: QueueEvaluation[]; error?: string };
        if (!response.ok || !Array.isArray(data.evaluations)) throw new Error(data.error || 'Hodnocení se nepodařilo načíst.');
        if (cancelled) return;
        for (const evaluation of data.evaluations) {
          if (evaluation.manualOnly || (evaluation.status !== 'graded' && evaluation.status !== 'needs_review')) continue;
          if (trackedAiEvaluationsRef.current.has(evaluation.id)) continue;
          const activityType = gradableActivityType(evaluation.blockType);
          if (!activityType) continue;
          trackedAiEvaluationsRef.current.add(evaluation.id);
          trackEvent('ai_grading_completed', {
            activity_type: activityType,
            result_state: evaluation.status,
          });
        }
        setEvaluations(data.evaluations);
        setError('');
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Hodnocení se nepodařilo načíst.');
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

  function applyRequeue(evaluationId: string, gradingMode: GradingMode) {
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
            aiScore: null,
            teacherScore: null,
            rationale: null,
            confidence: null,
            criterionScores: [],
            teacherConfirmed: false,
            teacherReviewedAt: null,
            teacherNote: null,
            evaluatedAt: null,
          }
        : evaluation
    )));
  }

  if (!loaded) return null;
  if (!evaluations.length && !error) return null;

  const sorted = [...evaluations].sort((a, b) => reviewPriority(a) - reviewPriority(b) || a.blockIndex - b.blockIndex);
  const newer = evaluations.filter((item) => item.hasNewerSubmission).length;
  const toReview = evaluations.filter((item) => !item.teacherConfirmed && (item.status === 'graded' || item.status === 'needs_review')).length;
  const waiting = evaluations.filter((item) => item.status === 'pending' || item.status === 'grading').length;
  const confirmed = evaluations.filter((item) => item.teacherConfirmed).length;

  const summary = error
    ? 'Hodnocení · chyba načtení'
    : newer
      ? `Hodnocení · ${newer} novější ${newer === 1 ? 'odpověď' : 'odpovědi'}${toReview ? ` · ${toReview} ke kontrole` : ''}`
      : toReview
        ? `Hodnocení · ${toReview} ke kontrole${waiting ? ` · ${waiting} čeká` : ''}`
        : waiting
          ? `Hodnocení · ${waiting} čeká`
          : `Hodnocení · ${confirmed} potvrzeno`;

  return (
    <aside style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 80, width: 'min(430px, calc(100vw - 24px))' }}>
      <details className="panel" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.28)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, padding: '14px 16px', listStylePosition: 'inside' }}>{summary}</summary>
        <div style={{ borderTop: '1px solid var(--border)', padding: 12, maxHeight: '68vh', overflowY: 'auto' }}>
          {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
          {!error ? <p className="muted-copy" style={{ margin: '0 0 10px' }}>Hodnocení můžeš potvrdit i poté, co studenti pokračují na další úkol. Novější odevzdanou verzi připravíš k novému hodnocení jen na svůj pokyn.</p> : null}
          {!error ? <div style={{ display: 'grid', gap: 8 }}>{sorted.map((evaluation) => <EvaluationItem key={evaluation.id} evaluation={evaluation} sessionId={sessionId} onReviewed={applyReview} onRequeued={applyRequeue} />)}</div> : null}
        </div>
      </details>
    </aside>
  );
}
