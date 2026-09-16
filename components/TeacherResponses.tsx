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

export default function TeacherResponses({ block, responses, participantCount, teams = [], teamResponses = [] }: Props) {
  if (!['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket', 'team_task'].includes(block.type)) return null;

  if (block.type === 'team_task') {
    return (
      <section className="panel">
        <span className="eyebrow">Týmové odpovědi</span>
        <h2 style={{ marginBottom: 8 }}>{teamResponses.length} z {teams.length} týmů</h2>
        <p className="muted-copy">Každý tým má jednu společnou odpověď. Kdokoli z jeho členů ji může během aktivního bloku upravit.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {teams.map((team) => {
            const response = teamResponses.find((item) => item.teamId === team.id);
            return (
              <div className="item" key={team.id}>
                <strong>{team.name}</strong>
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
      <section className="panel">
        <span className="eyebrow">Průběžné odpovědi</span>
        <h2 style={{ marginBottom: 8 }}>{responses.length} z {participantCount}</h2>
        <p className="muted-copy">Výsledky se aktualizují průběžně. Student může svou volbu změnit, dokud nepřejdeš na další blok.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {options.map((option) => {
            const count = responses.filter((response) => 'choice' in response.answer && response.answer.choice === option).length;
            const isCorrect = block.type === 'quiz' && block.correctAnswer === option;
            return (
              <div className="item" key={option} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <strong>{option}</strong>
                  {isCorrect ? <div className="muted-copy" style={{ marginTop: 4 }}>Správná odpověď</div> : null}
                </div>
                <strong style={{ fontSize: 22 }}>{count}</strong>
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
    const averages = items.map((item) => {
      const positions = rankingResponses
        .map((response) => 'ranking' in response.answer ? response.answer.ranking.indexOf(item) : -1)
        .filter((position) => position >= 0)
        .map((position) => position + 1);
      const average = positions.length ? positions.reduce((sum, position) => sum + position, 0) / positions.length : null;
      return { item, average };
    }).sort((a, b) => (a.average ?? Number.POSITIVE_INFINITY) - (b.average ?? Number.POSITIVE_INFINITY));

    return (
      <section className="panel">
        <span className="eyebrow">Průběžné pořadí</span>
        <h2 style={{ marginBottom: 8 }}>{rankingResponses.length} z {participantCount}</h2>
        <p className="muted-copy">Položky jsou seřazené podle průměrné pozice ve studentských odpovědích. Nižší průměr znamená vyšší pořadí.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {averages.map(({ item, average }, index) => (
            <div className="item" key={item} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}>
              <strong style={{ fontSize: 18, textAlign: 'center' }}>{index + 1}.</strong>
              <strong>{item}</strong>
              <span className="muted-copy">{average === null ? '—' : `Ø ${average.toFixed(1)}`}</span>
            </div>
          ))}
        </div>
        {rankingResponses.length ? (
          <div style={{ marginTop: 18 }}>
            <span className="eyebrow">Zdůvodnění</span>
            <div className="items" style={{ marginTop: 10 }}>
              {rankingResponses.map((response) => (
                'ranking' in response.answer ? (
                  <div className="item" key={response.participantId}>
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
    <section className="panel">
      <span className="eyebrow">Průběžné odpovědi</span>
      <h2 style={{ marginBottom: 8 }}>{responses.length} z {participantCount}</h2>
      {responses.length ? (
        <div className="items" style={{ marginTop: 16 }}>
          {responses.map((response) => (
            <div className="item" key={response.participantId}>
              <strong>{response.displayName}</strong>
              {'text' in response.answer ? <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.answer.text}</p> : null}
            </div>
          ))}
        </div>
      ) : <p className="muted-copy">Zatím nikdo neodpověděl.</p>}
    </section>
  );
}
