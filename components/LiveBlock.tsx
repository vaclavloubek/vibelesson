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
  contentLanguage = null,
}: {
  block: LessonBlock | PublicLessonBlock;
  teacherMode?: boolean;
  hideOptions?: boolean;
  hideItems?: boolean;
  contentLanguage?: string | null;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const teacherBlock = teacherMode ? block as LessonBlock : null;
  return (
    <article className="lesson-block">
      <div className="block-head">
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="eyebrow">{labels[locale][block.type]}</span>
          <ActivityModeBadge type={block.type} points={block.points} />
          <h3 lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{block.title}</h3>
        </div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <FormattedInstructions text={block.instructions} className="instructions" lang={contentLanguage} />
      {block.dataTable ? <div lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}><LessonDataTable data={block.dataTable} /></div> : null}
      {!hideItems && block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{item}</div>)}</div> : null}
      {!hideOptions && block.options?.length ? <div className="options">{block.options.map((option) => <div className="option" key={option} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{option}</div>)}</div> : null}
      {block.revealText ? <FormattedInstructions text={block.revealText} className="reveal" lang={contentLanguage} /> : null}
      {teacherBlock?.correctAnswer ? <div className="reveal">{english ? 'Correct answer:' : 'Správná odpověď:'} <strong lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{teacherBlock.correctAnswer}</strong></div> : null}
      {teacherBlock?.teacherNote ? <details open><summary>{english ? 'Teacher note' : 'Poznámka pro učitele'}</summary><p lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{teacherBlock.teacherNote}</p></details> : null}
      {/* Collapsed by default so a shared or projected teacher screen does not reveal the model answer. */}
      {teacherBlock?.modelAnswer ? <details><summary>{english ? 'Model answer (written by AI)' : 'Vzorová odpověď (vytvořila AI)'}</summary><p style={{ whiteSpace: 'pre-wrap' }} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{teacherBlock.modelAnswer}</p></details> : null}
      {teacherBlock?.answerScaffold ? <details><summary>{english ? 'Outline for students' : 'Osnova pro studenty'}</summary><p style={{ whiteSpace: 'pre-wrap' }} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{teacherBlock.answerScaffold}</p></details> : null}
    </article>
  );
}
