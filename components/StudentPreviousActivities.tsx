'use client';

import { useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import LiveBlock from '@/components/LiveBlock';
import type { StudentAnswer, StudentPreviousActivity } from '@/lib/live';

const ANSWERABLE = new Set(['poll', 'quiz', 'open_text', 'exit_ticket', 'ranking', 'team_task']);

function AnswerContent({ answer, contentLanguage }: { answer: StudentAnswer; contentLanguage: string | null }) {
  const lang = contentLanguage ?? undefined;
  const dir = contentLanguage ? 'auto' : undefined;
  if ('choice' in answer) return <p style={{ margin: '4px 0 0' }} lang={lang} dir={dir}>{answer.choice}</p>;
  if ('ranking' in answer) {
    return (
      <>
        <ol style={{ margin: '4px 0 0' }} lang={lang} dir={dir}>
          {answer.ranking.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }} lang={lang} dir={dir}>{answer.text}</p>
      </>
    );
  }
  return <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }} lang={lang} dir={dir}>{answer.text}</p>;
}

/**
 * Read-only overview of the activities before the active one. The teacher
 * still leads the lesson: nothing here accepts input. Open states live in
 * React state, so a new active block neither closes a section nor moves focus.
 */
export default function StudentPreviousActivities({
  activities,
  contentLanguage,
}: {
  activities: StudentPreviousActivity[];
  contentLanguage: string | null;
}) {
  const locale = useUiLocale();
  const ui = (cs: string, en: string) => locale === 'en' ? en : cs;
  const [open, setOpen] = useState(false);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());

  if (!activities.length) return null;

  const lang = contentLanguage ?? undefined;
  const dir = contentLanguage ? 'auto' : undefined;
  // Default list-item display keeps the native disclosure marker; the padding gives a touch-sized target.
  const summaryStyle = { cursor: 'pointer', padding: '10px 0' } as const;

  return (
    <section className="panel" aria-label={ui('Předchozí aktivity', 'Previous activities')}>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} style={{ margin: 0, color: 'inherit' }}>
        <summary style={{ ...summaryStyle, fontWeight: 700 }}>
          {ui('Předchozí aktivity', 'Previous activities')} ({activities.length})
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 8 }}>
          {activities.map((activity) => {
            const id = activity.block.id;
            const team = activity.block.type === 'team_task';
            return (
              <details
                key={id}
                open={openIds.has(id)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenIds((current) => {
                    if (current.has(id) === isOpen) return current;
                    const next = new Set(current);
                    if (isOpen) next.add(id); else next.delete(id);
                    return next;
                  });
                }}
                style={{ margin: 0, color: 'inherit', borderTop: '1px solid var(--line)', paddingTop: 4 }}
              >
                <summary style={summaryStyle}>
                  {activity.index + 1}. <span lang={lang} dir={dir}>{activity.block.title}</span>
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, marginTop: 8 }}>
                  <LiveBlock block={activity.block} contentLanguage={contentLanguage} />
                  {ANSWERABLE.has(activity.block.type) ? (
                    <div>
                      <span className="eyebrow">{team ? ui('Tvoje týmová odpověď', "Your team's answer") : ui('Tvoje odpověď', 'Your answer')}</span>
                      {team && activity.myTeamAnswer ? (
                        <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }} lang={lang} dir={dir}>{activity.myTeamAnswer}</p>
                      ) : !team && activity.myAnswer ? (
                        <AnswerContent answer={activity.myAnswer} contentLanguage={contentLanguage} />
                      ) : (
                        <p className="muted-copy" style={{ margin: '4px 0 0' }}>{ui('Bez odpovědi', 'No answer')}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    </section>
  );
}
