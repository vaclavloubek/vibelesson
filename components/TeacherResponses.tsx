'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { StudentAnswer } from '@/lib/live';
import type { LessonBlock } from '@/lib/schema';

type LiveResponse = {
  participantId: string;
  displayName: string;
  answer: StudentAnswer;
  updatedAt: string;
};
type Team = { id: string; name: string };
type TeamResponse = {
  teamId: string;
  text: string;
  updatedByParticipantId: string | null;
  updatedByDisplayName: string | null;
  updatedAt: string;
};

type EvaluationStatus = 'pending' | 'grading' | 'graded' | 'needs_review' | 'failed';
type EvaluationCriterion = {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
};
type EvaluationCriterionScore = {
  criterionId: string;
  points: number;
  rationale: string;
};
type LiveEvaluation = {
  id: string;
  participantId: string | null;
  teamId: string | null;
  status: EvaluationStatus;
  maxPoints: number;
  aiScore: number | null;
  teacherScore: number | null;
  rationale: string | null;
  confidence: number | null;
  rubric: EvaluationCriterion[];
  criterionScores: EvaluationCriterionScore[];
  teacherConfirmed: boolean;
  teacherReviewedAt: string | null;
  teacherNote: string | null;
  evaluatedAt: string | null;
};

type Props = {
  block: LessonBlock;
  responses: LiveResponse[];
  participantCount: number;
  teams?: Team[];
  teamResponses?: TeamResponse[];
};

type ReviewPatch = {
  evaluationId: string;
  teacherScore: number;
  teacherConfirmed: boolean;
  teacherReviewedAt: string;
  teacherNote: string | null;
};

function ResponseProgress({ count, total, label = 'odpovědí' }: { count: number; total: number; label?: string }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (count / total) * 100)) : 0;
  return (
    <div className="teacher-response-progress">
      <div className="teacher-response-progress-copy"><strong>{count} z {total}</strong><span>{label}</span></div>
      <div className="teacher-response-progress-track"><div className="teacher-response-progress-fill" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function isAIGradingConfigured(block: LessonBlock) {
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) return false;
  if (!block.points || block.points <= 0 || !block.gradingRubric?.length) return false;
  return block.gradingRubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0) === block.points;
}

function hasBrokenAIGradingConfig(block: LessonBlock) {
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) return false;
  if (!block.points || block.points <= 0) return false;
  return !isAIGradingConfigured(block);
}

function EvaluationCard({
  evaluation,
  sessionId,
  onReviewed,
}: {
  evaluation: LiveEvaluation | null;
  sessionId: string;
  onReviewed: (patch: ReviewPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [scoreInput, setScoreInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    if (!evaluation) return;
    const effective = evaluation.teacherScore ?? evaluation.aiScore;
    setScoreInput(effective === null ? '' : String(effective));
    setNoteInput(evaluation.teacherNote ?? '');
    setReviewError('');
  }, [evaluation?.id, evaluation?.teacherScore, evaluation?.teacherNote, evaluation?.aiScore]);

  if (!evaluation) {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>Připravuji AI hodnocení…</p>;
  }

  if (evaluation.status === 'pending') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>Čeká na AI hodnocení.</p>;
  }

  if (evaluation.status === 'grading') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>AI právě hodnotí…</p>;
  }

  if (evaluation.status === 'failed') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>AI hodnocení se nepodařilo. Odpověď zůstává bezpečně uložená.</p>;
  }

  const effectiveScore = evaluation.teacherScore ?? evaluation.aiScore;
  const confidence = evaluation.confidence === null ? null : Math.round(evaluation.confidence * 100);
  const scoreByCriterion = new Map(evaluation.criterionScores.map((item) => [item.criterionId, item]));

  async function saveReview(score: number, note: string) {
    if (saving) return;
    setSaving(true);
    setReviewError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/${evaluation.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, note }),
      });
      const data = await response.json() as (ReviewPatch & { error?: string });
      if (!response.ok) throw new Error(data.error || 'Hodnocení se nepodařilo uložit.');
      onReviewed(data);
      setEditing(false);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Hodnocení se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  }

  function submitEditedReview() {
    const score = Number(scoreInput);
    if (!Number.isInteger(score) || score < 0 || score > evaluation.maxPoints) {
      setReviewError(`Body musí být celé číslo od 0 do ${evaluation.maxPoints}.`);
      return;
    }
    void saveReview(score, noteInput);
  }

  return (
    <div className="item" style={{ marginTop: 10 }}>
      <div className="teacher-response-item-head">
        <strong>{evaluation.teacherConfirmed ? 'Potvrzené skóre' : evaluation.status === 'needs_review' ? 'Ke kontrole' : 'AI návrh hodnocení'}</strong>
        <strong>{effectiveScore === null ? '—' : `${effectiveScore} / ${evaluation.maxPoints}`}</strong>
      </div>
      <p className="muted-copy" style={{ margin: '6px 0 0' }}>
        {confidence === null ? 'Jistota AI není k dispozici.' : `Jistota AI: ${confidence} %.`}
        {evaluation.teacherConfirmed
          ? ' Výsledek zkontroloval učitel.'
          : evaluation.status === 'needs_review'
            ? ' Výsledek má nízkou jistotu a měl by ho zkontrolovat učitel.'
            : ' AI skóre je návrh pro učitele.'}
      </p>
      {evaluation.teacherConfirmed && evaluation.teacherNote ? (
        <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}><strong>Poznámka učitele:</strong> {evaluation.teacherNote}</p>
      ) : null}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Jak AI hodnotila</summary>
        {evaluation.rationale ? <p style={{ margin: '10px 0', whiteSpace: 'pre-wrap' }}>{evaluation.rationale}</p> : null}
        <div className="teacher-response-list">
          {evaluation.rubric.map((criterion) => {
            const score = scoreByCriterion.get(criterion.id);
            return (
              <div className="item" key={criterion.id}>
                <div className="teacher-response-item-head">
                  <strong>{criterion.title}</strong>
                  <strong>{score ? `${score.points} / ${criterion.maxPoints}` : `— / ${criterion.maxPoints}`}</strong>
                </div>
                <p className="muted-copy" style={{ margin: '5px 0 0' }}>{criterion.description}</p>
                {score?.rationale ? <p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{score.rationale}</p> : null}
              </div>
            );
          })}
        </div>
      </details>

      {!editing ? (
        <div className="actions" style={{ marginTop: 10 }}>
          {!evaluation.teacherConfirmed && evaluation.aiScore !== null ? (
            <button className="primary" disabled={saving} onClick={() => void saveReview(evaluation.aiScore!, noteInput)}>
              {saving ? 'Ukládám…' : 'Potvrdit AI návrh'}
            </button>
          ) : null}
          <button className="secondary" disabled={saving} onClick={() => setEditing(true)}>
            {evaluation.teacherConfirmed ? 'Upravit hodnocení' : 'Změnit body'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label>
            Body učitele
            <input
              type="number"
              min={0}
              max={evaluation.maxPoints}
              step={1}
              value={scoreInput}
              onChange={(event) => setScoreInput(event.target.value)}
            />
          </label>
          <label>
            Poznámka učitele <span className="muted-copy">(volitelná)</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              placeholder="Např. proč jsi body oproti AI změnil/a."
            />
          </label>
          <div className="actions">
            <button className="primary" disabled={saving} onClick={submitEditedReview}>{saving ? 'Ukládám…' : 'Uložit hodnocení'}</button>
            <button className="secondary" disabled={saving} onClick={() => { setEditing(false); setReviewError(''); }}>Zrušit</button>
          </div>
        </div>
      )}
      {reviewError ? <p className="muted-copy" style={{ margin: '8px 0 0' }}>{reviewError}</p> : null}
    </div>
  );
}

export default function TeacherResponses({ block, responses, participantCount, teams = [], teamResponses = [] }: Props) {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params?.id === 'string' ? params.id : '';
  const gradingConfigured = isAIGradingConfigured(block);
  const brokenGradingConfig = hasBrokenAIGradingConfig(block);
  const [evaluations, setEvaluations] = useState<LiveEvaluation[]>([]);
  const [evaluationError, setEvaluationError] = useState('');

  useEffect(() => {
    if (!gradingConfigured || !sessionId) {
      setEvaluations([]);
      setEvaluationError('');
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/evaluations?blockId=${encodeURIComponent(block.id)}`, { cache: 'no-store' });
        const data = await response.json() as { evaluations?: LiveEvaluation[]; error?: string };
        if (!response.ok || !Array.isArray(data.evaluations)) throw new Error(data.error || 'AI hodnocení se nepodařilo načíst.');
        if (cancelled) return;
        setEvaluations(data.evaluations);
        setEvaluationError('');
      } catch (error) {
        if (cancelled) return;
        setEvaluationError(error instanceof Error ? error.message : 'AI hodnocení se nepodařilo načíst.');
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [block.id, gradingConfigured, sessionId]);

  function applyReview(patch: ReviewPatch) {
    setEvaluations((current) => current.map((evaluation) => (
      evaluation.id === patch.evaluationId
        ? {
            ...evaluation,
            teacherScore: patch.teacherScore,
            teacherConfirmed: patch.teacherConfirmed,
            teacherReviewedAt: patch.teacherReviewedAt,
            teacherNote: patch.teacherNote,
          }
        : evaluation
    )));
  }

  const evaluationByParticipant = useMemo(() => {
    const map = new Map<string, LiveEvaluation>();
    for (const evaluation of evaluations) if (evaluation.participantId) map.set(evaluation.participantId, evaluation);
    return map;
  }, [evaluations]);

  const evaluationByTeam = useMemo(() => {
    const map = new Map<string, LiveEvaluation>();
    for (const evaluation of evaluations) if (evaluation.teamId) map.set(evaluation.teamId, evaluation);
    return map;
  }, [evaluations]);

  if (!['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(block.type)) return null;

  if (block.type === 'team_task') {
    return (
      <section className="panel teacher-responses-panel">
        <span className="eyebrow">Týmové odpovědi</span>
        <ResponseProgress count={teamResponses.length} total={teams.length} label="týmů hotovo" />
        <p className="muted-copy">Každý tým má jednu společnou odpověď. Kdokoli z jeho členů ji může během aktivního bloku upravit.</p>
        {brokenGradingConfig ? <p className="muted-copy">Bodování je nastavené, ale rubrika neodpovídá bodům bloku. AI hodnocení proto neběží.</p> : null}
        {evaluationError ? <p className="muted-copy">{evaluationError}</p> : null}
        <div className="teacher-response-list">
          {teams.map((team) => {
            const response = teamResponses.find((item) => item.teamId === team.id);
            const evaluation = gradingConfigured && response ? evaluationByTeam.get(team.id) ?? null : null;
            return (
              <div className={`item teacher-response-item${response ? ' answered' : ''}`} key={team.id}>
                <div className="teacher-response-item-head"><strong>{team.name}</strong><span>{response ? 'Hotovo' : 'Čeká'}</span></div>
                {response ? (
                  <>
                    <p style={{ marginBottom: 6, whiteSpace: 'pre-wrap' }}>{response.text}</p>
                    <p className="muted-copy">Naposledy upravil/a: {response.updatedByDisplayName ?? 'člen týmu'}</p>
                    {gradingConfigured ? <EvaluationCard evaluation={evaluation} sessionId={sessionId} onReviewed={applyReview} /> : null}
                  </>
                ) : <p className="muted-copy" style={{ marginBottom: 0 }}>Zatím bez odpovědi.</p>}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (block.type === 'poll' || block.type === 'quiz') {
    const options = block.options ?? [];
    return (
      <section className="panel teacher-responses-panel">
        <span className="eyebrow">Průběžné odpovědi</span>
        <ResponseProgress count={responses.length} total={participantCount} />
        <p className="muted-copy">Výsledky se aktualizují průběžně. Student může svou volbu změnit, dokud nepřejdeš na další blok.</p>
        <div className="teacher-choice-results">
          {options.map((option) => {
            const count = responses.filter((response) => 'choice' in response.answer && response.answer.choice === option).length;
            const share = responses.length ? Math.round((count / responses.length) * 100) : 0;
            const isCorrect = block.type === 'quiz' && block.correctAnswer === option;
            return (
              <div className={`teacher-choice-result${isCorrect ? ' correct' : ''}`} key={option}>
                <div className="teacher-choice-result-head">
                  <div><strong>{option}</strong>{isCorrect ? <span>Správná odpověď</span> : null}</div>
                  <strong>{count}</strong>
                </div>
                <div className="teacher-choice-result-track"><div style={{ width: `${share}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (block.type === 'ranking') {
    const rankingResponses = responses.filter((response) => 'ranking' in response.answer);
    const items = block.items ?? [];
    const averages = items.map((item, sourceIndex) => {
      const positions = rankingResponses
        .map((response) => 'ranking' in response.answer ? response.answer.ranking.indexOf(item) : -1)
        .filter((position) => position >= 0)
        .map((position) => position + 1);
      const average = positions.length ? positions.reduce((sum, position) => sum + position, 0) / positions.length : null;
      return { item, average, sourceIndex };
    }).sort((a, b) => (a.average ?? Number.POSITIVE_INFINITY) - (b.average ?? Number.POSITIVE_INFINITY));

    return (
      <section className="panel teacher-responses-panel">
        <span className="eyebrow">Průběžné pořadí</span>
        <ResponseProgress count={rankingResponses.length} total={participantCount} />
        <p className="muted-copy">Stejné odstíny jako na studentských telefonech pomáhají sledovat položky i po změně pořadí. Nižší průměr znamená vyšší pozici.</p>
        <div className="teacher-ranking-results">
          {averages.map(({ item, average, sourceIndex }, index) => (
            <div className={`ranking-item ranking-item-tone-${sourceIndex % 5}`} key={item}>
              <strong className="ranking-position">{index + 1}.</strong>
              <strong className="ranking-copy">{item}</strong>
              <span className="teacher-ranking-average">{average === null ? '—' : `Ø ${average.toFixed(1)}`}</span>
            </div>
          ))}
        </div>
        {rankingResponses.length ? (
          <div className="teacher-ranking-reasons">
            <span className="eyebrow">Zdůvodnění</span>
            <div className="teacher-response-list">
              {rankingResponses.map((response) => (
                'ranking' in response.answer ? (
                  <div className="item teacher-response-item answered" key={response.participantId}>
                    <strong>{response.displayName}</strong>
                    <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.answer.text}</p>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="panel teacher-responses-panel">
      <span className="eyebrow">Průběžné odpovědi</span>
      <ResponseProgress count={responses.length} total={participantCount} />
      {brokenGradingConfig ? <p className="muted-copy">Bodování je nastavené, ale rubrika neodpovídá bodům bloku. AI hodnocení proto neběží.</p> : null}
      {evaluationError ? <p className="muted-copy">{evaluationError}</p> : null}
      {responses.length ? (
        <div className="teacher-response-list">
          {responses.map((response) => (
            <div className="item teacher-response-item answered" key={response.participantId}>
              <strong>{response.displayName}</strong>
              {'text' in response.answer ? <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.answer.text}</p> : null}
              {gradingConfigured && 'text' in response.answer ? (
                <EvaluationCard
                  evaluation={evaluationByParticipant.get(response.participantId) ?? null}
                  sessionId={sessionId}
                  onReviewed={applyReview}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : <p className="muted-copy">Zatím nikdo neodpověděl.</p>}
    </section>
  );
}
