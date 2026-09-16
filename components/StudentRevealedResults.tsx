import type { RevealedChoiceResults } from '@/lib/live';

type Props = { results: RevealedChoiceResults };

export default function StudentRevealedResults({ results }: Props) {
  return (
    <section className="panel">
      <span className="eyebrow">Zveřejněné výsledky</span>
      {results.type === 'quiz' ? (
        <>
          <h2 style={{ marginBottom: 8 }}>{results.isCorrect === true ? 'Tvoje odpověď je správná.' : results.isCorrect === false ? 'Tvoje odpověď není správná.' : 'Správná odpověď'}</h2>
          {results.correctAnswer ? <p><strong>Správná odpověď:</strong> {results.correctAnswer}</p> : null}
          {results.myAnswer ? <p className="muted-copy">Tvoje volba: {results.myAnswer}</p> : <p className="muted-copy">Na tento kvíz jsi neodpověděl/a.</p>}
        </>
      ) : (
        <h2 style={{ marginBottom: 8 }}>Jak hlasovala skupina</h2>
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
      <p className="muted-copy" style={{ marginBottom: 0, marginTop: 12 }}>Celkem odpovědí: {results.total}</p>
    </section>
  );
}
