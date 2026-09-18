'use client';

import ActivityModeBadge from '@/components/ActivityModeBadge';
import { useUiLocale } from '@/components/LocaleProvider';
import LessonDataTable from '@/components/LessonDataTable';
import FormattedInstructions from '@/components/FormattedInstructions';
import type { PublicLessonBlock } from '@/lib/live';
import type { LessonBlock } from '@/lib/schema';

const labels = {
  cs: { intro: 'Úvod', team_task: 'Týmová mise', poll: 'Hlasování', quiz: 'Kvíz', open_text: 'Otevřená odpověď', ranking: 'Řazení', reveal: 'Odhalení', timer: 'Časovač', exit_ticket: 'Exit ticket' },
  en: { intro: 'Introduction', team_task: 'Team task', poll: 'Poll', quiz: 'Quiz', open_text: 'Open response', ranking: 'Ranking', reveal: 'Reveal', timer: 'Timer', exit_ticket: 'Exit ticket' },
} satisfies Record<'cs' | 'en', Record<LessonBlock['type'], string>>;

export default function LiveBlock({
  block,
  teacherMode = false,
  hideOptions = false,
  hideItems = false,
}: {
  block: LessonBlock | PublicLessonBlock;
  teacherMode?: boolean;
  hideOptions?: boolean;
  hideItems?: boolean;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const teacherBlock = teacherMode ? block as LessonBlock : null;
  return (
    <article className="lesson-block">
      <div className="block-head">
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="eyebrow">{labels[locale][block.type]}</span>
          <ActivityModeBadge type={block.type} />
          <h3>{block.title}</h3>
        </div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <FormattedInstructions text={block.instructions} className="instructions" />
      {block.dataTable ? <LessonDataTable data={block.dataTable} /> : null}
      {!hideItems && block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item}>{item}</div>)}</div> : null}
      {!hideOptions && block.options?.length ? <div className="options">{block.options.map((option) => <div className="option" key={option}>{option}</div>)}</div> : null}
      {block.revealText ? <FormattedInstructions text={block.revealText} className="reveal" /> : null}
      {teacherBlock?.correctAnswer ? <div className="reveal">{english ? 'Correct answer:' : 'Správná odpověď:'} <strong>{teacherBlock.correctAnswer}</strong></div> : null}
      {teacherBlock?.teacherNote ? <details open><summary>{english ? 'Teacher note' : 'Poznámka pro učitele'}</summary><p>{teacherBlock.teacherNote}</p></details> : null}
      {typeof block.points === 'number' ? <div className="points">Max. {block.points} {english ? 'points' : 'bodů'}</div> : null}
    </article>
  );
}
