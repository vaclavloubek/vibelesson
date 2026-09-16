import type { StudentAnswer } from '@/lib/live';
import type { LessonBlock } from '@/lib/schema';

type LiveResponse = {
  participantId: string;
  displayName: string;
  answer: StudentAnswer;
  updatedAt: string;
};

type Props = {
  block: LessonBlock;
  responses: LiveResponse[];
  participantCount: number;
};

export default function TeacherResponses({ block, responses, participantCount }: Props) {
  if (!['poll', 'quiz', 'open_text'].includes(block.type)) return null;

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
