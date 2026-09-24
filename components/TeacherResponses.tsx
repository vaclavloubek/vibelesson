'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import type { StudentAnswer } from '@/lib/live';
import type { LessonBlock } from '@/lib/schema';

type LiveResponse = {
  participantId: string;
  displayName: string;
  answer: StudentAnswer;
  updatedAt: string;
  submitted: boolean;
};
type Team = { id: string; name: string };
type TeamResponse = {
  teamId: string;
  text: string;
  updatedByParticipantId: string | null;
  updatedByDisplayName: string | null;
  updatedAt: string;
  submitted: boolean;
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
  teacherNote: string | null;
  evaluatedAt: string | null;
};

type ReviewPatch = {
  evaluationId: string;
  teacherScore: number;
  teacherConfirmed: boolean;
  teacherNote: string | null;
};

type Props = {
  block: LessonBlock;
  responses: LiveResponse[];
  participantCount: number;
  teams?: Team[];
  teamResponses?: TeamResponse[];
};

function ResponseProgress({ count, total, label }: { count: number; total: number; label?: string }) {
  const english = useUiLocale() === 'en';
  const resolvedLabel = label ?? (english ? 'responses' : 'odpovědí');
  const percent = total > 0 ? Math.min(100, Math.max(0, (count / total) * 100)) : 0;
  return (
    <div className="teacher-response-progress">
      <div className="teacher-response-progress-copy"><strong>{count} z {total}</strong><span>{resolvedLabel}</span></div>
      <div className="teacher-response-progress-track"><div className="teacher-response-progress-fill" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function isAIGradingConfigured(block: LessonBlock) {
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) return false;
  if (!block.points || block.points <= 0 || !block.gradingRubric?.length) return false;
  return block.gradingRubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0) === block.points;
}

function isUngradedWrittenBlock(block: LessonBlock) {
  return ['open_text', 'exit_ticket', 'team_task'].includes(block.type) && (!block.points || block.points <= 0);
}

function hasBrokenAIGradingConfig(block: LessonBlock) {
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) return false;
  if (!block.points || block.points <= 0) return false;
  return !isAIGradingConfigured(block);
}

function EvaluationReviewForm({
  evaluation,
  sessionId,
  onReviewed,
}: {
  evaluation: LiveEvaluation;
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
        body: JSON.stringify({ score, note }),
      });
      const data = await response.json() as ReviewPatch & { error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
      onReviewed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Hodnocení se nepodařilo uložit.', 'The grading could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      key={`${evaluation.id}:${evaluation.teacherScore ?? 'ai'}:${evaluation.teacherNote ?? ''}`}
      onSubmit={submit}
      style={{ marginTop: 12, display: 'grid', gap: 10 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr', gap: 10, alignItems: 'end' }}>
        <label>
          {ui('Body učitele', 'Teacher points')}
          <input name="score" type="number" min={0} max={evaluation.maxPoints} step={1} defaultValue={effectiveScore} />
        </label>
        <label>
          {ui('Poznámka', 'Note')} <span className="muted-copy">{ui('(volitelná)', '(optional)')}</span>
          <input name="note" type="text" maxLength={1000} defaultValue={evaluation.teacherNote ?? ''} placeholder={ui('Proč body měníš nebo potvrzuješ.', 'Why you are changing or confirming the points.')} />
        </label>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="secondary" type="submit" disabled={saving || !sessionId}>
          {saving ? ui('Ukládám…', 'Saving…') : evaluation.teacherConfirmed ? ui('Uložit změnu', 'Save change') : ui('Potvrdit hodnocení', 'Confirm grading')}
        </button>
      </div>
      {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
    </form>
  );
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
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  if (!evaluation) {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>{ui('Připravuji AI hodnocení…', 'Preparing AI grading…')}</p>;
  }

  if (evaluation.status === 'pending') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>{ui('Čeká na AI hodnocení.', 'Waiting for AI grading.')}</p>;
  }

  if (evaluation.status === 'grading') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>{ui('AI právě hodnotí…', 'AI is grading…')}</p>;
  }

  if (evaluation.status === 'failed') {
    return <p className="muted-copy" style={{ margin: '10px 0 0' }}>{ui('AI hodnocení se nepodařilo. Odpověď zůstává bezpečně uložená.', 'AI grading failed. The response remains safely stored.')}</p>;
  }

  const effectiveScore = evaluation.teacherScore ?? evaluation.aiScore;
  const confidence = evaluation.confidence === null ? null : Math.round(evaluation.confidence * 100);
  const scoreByCriterion = new Map(evaluation.criterionScores.map((item) => [item.criterionId, item]));

  return (
    <div className="item" style={{ marginTop: 10 }}>
      <div className="teacher-response-item-head">
        <strong>{evaluation.teacherConfirmed ? ui('Potvrzené skóre', 'Confirmed score') : evaluation.status === 'needs_review' ? ui('Ke kontrole', 'Needs review') : ui('AI návrh hodnocení', 'AI grading suggestion')}</strong>
        <strong>{effectiveScore === null ? '—' : `${effectiveScore} / ${evaluation.maxPoints}`}</strong>
      </div>
      <p className="muted-copy" style={{ margin: '6px 0 0' }}>
        {confidence === null ? ui('Jistota AI není k dispozici.', 'AI confidence is not available.') : (english ? `AI confidence: ${confidence}%.` : `Jistota AI: ${confidence} %.`)}
        {evaluation.teacherConfirmed
          ? ui(' Výsledek zkontroloval učitel.', ' The result was reviewed by the teacher.')
          : evaluation.status === 'needs_review'
            ? ui(' Výsledek má nízkou jistotu a měl by ho zkontrolovat učitel.', ' The result has low confidence and should be reviewed by the teacher.')
            : ui(' AI skóre je návrh pro učitele.', ' The AI score is a suggestion for the teacher.')}
      </p>
      {evaluation.teacherConfirmed && evaluation.teacherNote ? (
        <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}><strong>{ui('Poznámka učitele:', 'Teacher note:')}</strong> {evaluation.teacherNote}</p>
      ) : null}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Jak AI hodnotila', 'How AI graded')}</summary>
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
      <EvaluationReviewForm evaluation={evaluation} sessionId={sessionId} onReviewed={onReviewed} />
    </div>
  );
}

export default function TeacherResponses({ block, responses, participantCount, teams = [], teamResponses = [] }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const params = useParams<{ id: string }>();
  const sessionId = typeof params?.id === 'string' ? params.id : '';
  const gradingConfigured = isAIGradingConfigured(block);
  const brokenGradingConfig = hasBrokenAIGradingConfig(block);
  const ungradedBlock = isUngradedWrittenBlock(block);
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
        if (!response.ok || !Array.isArray(data.evaluations)) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'AI hodnocení se nepodařilo načíst.', 'AI grading could not be loaded.'));
        if (cancelled) return;
        setEvaluations(data.evaluations);
        setEvaluationError('');
      } catch (error) {
        if (cancelled) return;
        setEvaluationError(error instanceof Error ? error.message : ui('AI hodnocení se nepodařilo načíst.', 'AI grading could not be loaded.'));
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
        <span className="eyebrow">{ui('Týmové odpovědi', 'Team responses')}</span>
        <ResponseProgress count={teamResponses.filter((response) => response.submitted).length} total={teams.length} label={ui('týmů odevzdalo', 'teams submitted')} />
        <p className="muted-copy">{ui('Každý tým má jednu společnou odpověď. Kdokoli z jeho členů ji může během aktivního bloku upravit.', 'Each team has one shared response. Any team member can edit it while the block is active.')}</p>
        {brokenGradingConfig ? <p className="muted-copy">{ui('Bodování je nastavené, ale rubrika neodpovídá bodům bloku. AI hodnocení proto neběží.', 'Scoring is configured, but the rubric does not match the block points, so AI grading is disabled.')}</p> : null}
        {ungradedBlock ? <p className="muted-copy">{ui('Tento blok se neboduje, AI hodnocení u něj proto neběží.', 'This block is not scored, so AI grading does not run for it.')}</p> : null}
        {evaluationError ? <p className="muted-copy">{evaluationError}</p> : null}
        <div className="teacher-response-list">
          {teams.map((team) => {
            const response = teamResponses.find((item) => item.teamId === team.id);
            const evaluation = gradingConfigured && response ? evaluationByTeam.get(team.id) ?? null : null;
            return (
              <div className={`item teacher-response-item${response ? ' answered' : ''}`} key={team.id}>
                <div className="teacher-response-item-head">
                  <strong>{team.name}</strong>
                  <span style={response && !response.submitted ? { color: '#a16207', fontWeight: 800 } : undefined}>
                    {response ? (response.submitted ? ui('Odevzdáno', 'Submitted') : ui('Rozepsaná', 'Draft')) : ui('Čeká', 'Waiting')}
                  </span>
                </div>
                {response ? (
                  <>
                    <p style={{ marginBottom: 6, whiteSpace: 'pre-wrap' }}>{response.text}</p>
                    <p className="muted-copy">{ui('Naposledy upravil/a', 'Last edited by')}: {response.updatedByDisplayName ?? ui('člen týmu', 'team member')}</p>
                    {gradingConfigured ? <EvaluationCard evaluation={evaluation} sessionId={sessionId} onReviewed={applyReview} /> : null}
                  </>
                ) : <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Zatím bez odpovědi.', 'No response yet.')}</p>}
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
        <span className="eyebrow">{ui('Průběžné odpovědi', 'Live responses')}</span>
        <ResponseProgress count={responses.length} total={participantCount} />
        <p className="muted-copy">{ui('Výsledky se aktualizují průběžně. Student může svou volbu změnit, dokud nepřejdeš na další blok.', 'Results update live. Students can change their choice until you move to the next block.')}</p>
        <div className="teacher-choice-results">
          {options.map((option) => {
            const count = responses.filter((response) => 'choice' in response.answer && response.answer.choice === option).length;
            const share = responses.length ? Math.round((count / responses.length) * 100) : 0;
            const isCorrect = block.type === 'quiz' && block.correctAnswer === option;
            return (
              <div className={`teacher-choice-result${isCorrect ? ' correct' : ''}`} key={option}>
                <div className="teacher-choice-result-head">
                  <div><strong>{option}</strong>{isCorrect ? <span>{ui('Správná odpověď', 'Correct answer')}</span> : null}</div>
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
    const submittedRankingResponses = rankingResponses.filter((response) => response.submitted);
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
        <span className="eyebrow">{ui('Průběžné pořadí', 'Live ranking')}</span>
        <ResponseProgress count={submittedRankingResponses.length} total={participantCount} />
        <p className="muted-copy">{ui('Stejné odstíny jako na studentských telefonech pomáhají sledovat položky i po změně pořadí. Nižší průměr znamená vyšší pozici.', 'The same tones as on student phones help track items after reordering. A lower average means a higher position.')}</p>
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
            <span className="eyebrow">{ui('Zdůvodnění', 'Reasoning')}</span>
            <div className="teacher-response-list">
              {rankingResponses.map((response) => (
                'ranking' in response.answer ? (
                  <div className="item teacher-response-item answered" key={response.participantId}>
                    <div className="teacher-response-item-head">
                      <strong>{response.displayName}</strong>
                      <span style={!response.submitted ? { color: '#a16207', fontWeight: 800 } : undefined}>{response.submitted ? ui('Odevzdáno', 'Submitted') : ui('Rozepsaná', 'Draft')}</span>
                    </div>
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

  const submittedResponses = responses.filter((response) => response.submitted);

  return (
    <section className="panel teacher-responses-panel">
      <span className="eyebrow">{ui('Průběžné odpovědi', 'Live responses')}</span>
      <ResponseProgress count={submittedResponses.length} total={participantCount} />
      {brokenGradingConfig ? <p className="muted-copy">{ui('Bodování je nastavené, ale rubrika neodpovídá bodům bloku. AI hodnocení proto neběží.', 'Scoring is configured, but the rubric does not match the block points, so AI grading is disabled.')}</p> : null}
      {ungradedBlock ? <p className="muted-copy">{ui('Tento blok se neboduje, AI hodnocení u něj proto neběží.', 'This block is not scored, so AI grading does not run for it.')}</p> : null}
      {evaluationError ? <p className="muted-copy">{evaluationError}</p> : null}
      {responses.length ? (
        <div className="teacher-response-list">
          {responses.map((response) => (
            <div className="item teacher-response-item answered" key={response.participantId}>
              <div className="teacher-response-item-head">
                <strong>{response.displayName}</strong>
                <span style={!response.submitted ? { color: '#a16207', fontWeight: 800 } : undefined}>{response.submitted ? ui('Odevzdáno', 'Submitted') : ui('Rozepsaná', 'Draft')}</span>
              </div>
              {'text' in response.answer ? <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.answer.text}</p> : null}
              {gradingConfigured && 'text' in response.answer ? (
                <EvaluationCard evaluation={evaluationByParticipant.get(response.participantId) ?? null} sessionId={sessionId} onReviewed={applyReview} />
              ) : null}
            </div>
          ))}
        </div>
      ) : <p className="muted-copy">{ui('Zatím nikdo neodpověděl.', 'No responses yet.')}</p>}
    </section>
  );
}
