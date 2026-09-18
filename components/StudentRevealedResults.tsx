'use client';

import { useUiLocale } from '@/components/LocaleProvider';
import type { RevealedChoiceResults } from '@/lib/live';

type Props = { results: RevealedChoiceResults };

export default function StudentRevealedResults({ results }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;

  return (
    <section className="panel">
      <span className="eyebrow">{ui('Zveřejněné výsledky', 'Revealed results')}</span>
      {results.type === 'quiz' ? (
        <>
          <h2 style={{ marginBottom: 8 }}>
            {results.isCorrect === true
              ? ui('Tvoje odpověď je správná.', 'Your answer is correct.')
              : results.isCorrect === false
                ? ui('Tvoje odpověď není správná.', 'Your answer is not correct.')
                : ui('Správná odpověď', 'Correct answer')}
          </h2>
          {results.correctAnswer ? <p><strong>{ui('Správná odpověď:', 'Correct answer:')}</strong> {results.correctAnswer}</p> : null}
          {results.myAnswer
            ? <p className="muted-copy">{ui('Tvoje volba:', 'Your choice:')} {results.myAnswer}</p>
            : <p className="muted-copy">{ui('Na tento kvíz jsi neodpověděl/a.', 'You did not answer this quiz.')}</p>}
        </>
      ) : (
        <h2 style={{ marginBottom: 8 }}>{ui('Jak hlasovala skupina', 'How the group voted')}</h2>
      )}
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {results.counts.map(({ option, count }) => {
          const percentage = results.total ? Math.round((count / results.total) * 100) : 0;
          return (
            <div className="item" key={option} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <strong>{option}</strong>
              <span><strong>{count}</strong> <span className="muted-copy">({percentage} %)</span></span>
            </div>
          );
        })}
      </div>
      <p className="muted-copy" style={{ marginBottom: 0, marginTop: 12 }}>{ui('Celkem odpovědí:', 'Total answers:')} {results.total}</p>
    </section>
  );
}
