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

type Props = {
  block: LessonBlock;
  responses: LiveResponse[];
  participantCount: number;
  teams?: Team[];
  teamResponses?: TeamResponse[];
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

export default function TeacherResponses({ block, responses, participantCount, teams = [], teamResponses = [] }: Props) {
  if (!['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(block.type)) return null;

  if (block.type === 'team_task') {
    return (
      <section className="panel teacher-responses-panel">
        <span className="eyebrow">Týmové odpovědi</span>
        <ResponseProgress count={teamResponses.length} total={teams.length} label="týmů hotovo" />
        <p className="muted-copy">Každý tým má jednu společnou odpověď. Kdokoli z jeho členů ji může během aktivního bloku upravit.</p>
        <div className="teacher-response-list">
          {teams.map((team) => {
            const response = teamResponses.find((item) => item.teamId === team.id);
            return (
              <div className={`item teacher-response-item${response ? ' answered' : ''}`} key={team.id}>
                <div className="teacher-response-item-head"><strong>{team.name}</strong><span>{response ? 'Hotovo' : 'Čeká'}</span></div>
                {response ? (
                  <>
                    <p style={{ marginBottom: 6, whiteSpace: 'pre-wrap' }}>{response.text}</p>
                    <p className="muted-copy">Naposledy upravil/a: {response.updatedByDisplayName ?? 'člen týmu'}</p>
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
      {responses.length ? (
        <div className="teacher-response-list">
          {responses.map((response) => (
            <div className="item teacher-response-item answered" key={response.participantId}>
              <strong>{response.displayName}</strong>
              {'text' in response.answer ? <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.answer.text}</p> : null}
            </div>
          ))}
        </div>
      ) : <p className="muted-copy">Zatím nikdo neodpověděl.</p>}
    </section>
  );
}
