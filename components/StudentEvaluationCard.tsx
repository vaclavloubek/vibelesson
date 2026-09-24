'use client';

import { useUiLocale } from '@/components/LocaleProvider';
import type { StudentEvaluation } from '@/lib/live';

type Props = {
  evaluation: StudentEvaluation;
  showTitle?: boolean;
  contentLanguage?: string | null;
};

export default function StudentEvaluationCard({ evaluation, showTitle = false, contentLanguage }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;

  return (
    <section className="panel" aria-label={ui('Hodnocení odpovědi', 'Answer evaluation')}>
      <span className="eyebrow">
        {evaluation.team ? ui('Hodnocení týmu', 'Team evaluation') : ui('Tvoje hodnocení', 'Your evaluation')}
      </span>
      {showTitle && evaluation.blockTitle ? (
        <h3 style={{ margin: '6px 0 0' }} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{evaluation.blockTitle}</h3>
      ) : null}
      <p style={{ margin: '8px 0 0' }}>
        <strong style={{ fontSize: 24 }}>{evaluation.score} / {evaluation.maxPoints}</strong>{' '}
        <span className="muted-copy">{ui('bodů', 'points')}</span>
      </p>
      {evaluation.source === 'ai' ? (
        <>
          <p className="muted-copy" style={{ margin: '8px 0 0' }}>{ui('Souhrn AI hodnocení, potvrzený učitelem', 'AI evaluation summary, confirmed by the teacher')}</p>
          {evaluation.summary ? <p style={{ margin: '4px 0 0' }}>{evaluation.summary}</p> : null}
        </>
      ) : (
        <p className="muted-copy" style={{ margin: '8px 0 0' }}>{ui('Hodnocení učitele', 'Teacher evaluation')}</p>
      )}
      {evaluation.teacherNote ? (
        <p style={{ margin: '8px 0 0' }}><strong>{ui('Poznámka učitele:', 'Teacher note:')}</strong> {evaluation.teacherNote}</p>
      ) : null}
      {evaluation.outdated ? (
        <p className="muted-copy" style={{ margin: '8px 0 0' }}>{ui('Hodnocení se týká dříve odevzdané verze odpovědi.', 'This evaluation refers to an earlier submitted version of the answer.')}</p>
      ) : null}
    </section>
  );
}
