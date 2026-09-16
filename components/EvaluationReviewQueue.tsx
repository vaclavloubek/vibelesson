'use client';

import { useEffect, useState, type FormEvent } from 'react';

type EvaluationStatus = 'pending' | 'grading' | 'graded' | 'needs_review' | 'failed';
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
};

type ReviewPatch = {
  evaluationId: string;
  teacherScore: number;
  teacherConfirmed: boolean;
  teacherNote: string | null;
};

function reviewPriority(item: QueueEvaluation) {
  if (!item.teacherConfirmed && item.status === 'needs_review') return 0;
  if (!item.teacherConfirmed && item.status === 'graded') return 1;
  if (item.status === 'pending' || item.status === 'grading') return 2;
  if (item.status === 'failed') return 3;
  return 4;
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
      onReviewed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodnocení se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      key={`${evaluation.id}:${evaluation.teacherScore ?? 'ai'}:${evaluation.teacherNote ?? ''}`}
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

function EvaluationItem({ evaluation, sessionId, onReviewed }: {
  evaluation: QueueEvaluation;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
}) {
  const effectiveScore = evaluation.teacherScore ?? evaluation.aiScore;
  const confidence = evaluation.confidence === null ? null : Math.round(evaluation.confidence * 100);
  const criterionScores = new Map(evaluation.criterionScores.map((item) => [item.criterionId, item]));
  const ready = evaluation.status === 'graded' || evaluation.status === 'needs_review';

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

      {evaluation.status === 'pending' ? <p className="muted-copy" style={{ marginBottom: 0 }}>Čeká na AI hodnocení.</p> : null}
      {evaluation.status === 'grading' ? <p className="muted-copy" style={{ marginBottom: 0 }}>AI právě hodnotí…</p> : null}
      {evaluation.status === 'failed' ? <p className="muted-copy" style={{ marginBottom: 0 }}>AI hodnocení se nepodařilo. Odpověď zůstává uložená.</p> : null}

      {ready ? (
        <>
          <p className="muted-copy" style={{ margin: '8px 0 0' }}>
            {evaluation.teacherConfirmed
              ? 'Potvrzeno učitelem.'
              : evaluation.status === 'needs_review'
                ? 'Ke kontrole kvůli nižší jistotě AI.'
                : 'AI návrh čeká na potvrzení.'}
            {confidence === null ? '' : ` Jistota AI: ${confidence} %.`}
          </p>
          {evaluation.teacherConfirmed && evaluation.teacherNote ? (
            <p style={{ margin: '8px 0 0' }}><strong>Poznámka učitele:</strong> {evaluation.teacherNote}</p>
          ) : null}
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/evaluations/queue`, { cache: 'no-store' });
        const data = await response.json() as { evaluations?: QueueEvaluation[]; error?: string };
        if (!response.ok || !Array.isArray(data.evaluations)) throw new Error(data.error || 'AI hodnocení se nepodařilo načíst.');
        if (cancelled) return;
        setEvaluations(data.evaluations);
        setError('');
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'AI hodnocení se nepodařilo načíst.');
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

  if (!loaded) return null;
  if (!evaluations.length && !error) return null;

  const sorted = [...evaluations].sort((a, b) => reviewPriority(a) - reviewPriority(b) || a.blockIndex - b.blockIndex);
  const toReview = evaluations.filter((item) => !item.teacherConfirmed && (item.status === 'graded' || item.status === 'needs_review')).length;
  const waiting = evaluations.filter((item) => item.status === 'pending' || item.status === 'grading').length;
  const confirmed = evaluations.filter((item) => item.teacherConfirmed).length;

  const summary = error
    ? 'AI hodnocení · chyba načtení'
    : toReview
      ? `AI hodnocení · ${toReview} ke kontrole${waiting ? ` · ${waiting} čeká` : ''}`
      : waiting
        ? `AI hodnocení · ${waiting} čeká`
        : `AI hodnocení · ${confirmed} potvrzeno`;

  return (
    <aside style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 80, width: 'min(430px, calc(100vw - 24px))' }}>
      <details className="panel" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.28)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, padding: '14px 16px', listStylePosition: 'inside' }}>{summary}</summary>
        <div style={{ borderTop: '1px solid var(--border)', padding: 12, maxHeight: '68vh', overflowY: 'auto' }}>
          {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
          {!error ? <p className="muted-copy" style={{ margin: '0 0 10px' }}>Hodnocení můžeš potvrdit i poté, co studenti pokračují na další úkol.</p> : null}
          {!error ? <div style={{ display: 'grid', gap: 8 }}>{sorted.map((evaluation) => <EvaluationItem key={evaluation.id} evaluation={evaluation} sessionId={sessionId} onReviewed={applyReview} />)}</div> : null}
        </div>
      </details>
    </aside>
  );
}
