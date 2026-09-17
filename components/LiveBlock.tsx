import ActivityModeBadge from '@/components/ActivityModeBadge';
import LessonDataTable from '@/components/LessonDataTable';
import type { PublicLessonBlock } from '@/lib/live';
import type { LessonBlock } from '@/lib/schema';

const labels: Record<LessonBlock['type'], string> = {
  intro: 'Úvod',
  team_task: 'Týmová mise',
  poll: 'Hlasování',
  quiz: 'Kvíz',
  open_text: 'Otevřená odpověď',
  ranking: 'Řazení',
  reveal: 'Odhalení',
  timer: 'Časovač',
  exit_ticket: 'Exit ticket',
};

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
  const teacherBlock = teacherMode ? block as LessonBlock : null;
  return (
    <article className="lesson-block">
      <div className="block-head">
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="eyebrow">{labels[block.type]}</span>
          <ActivityModeBadge type={block.type} />
          <h3>{block.title}</h3>
        </div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <p className="instructions">{block.instructions}</p>
      {block.dataTable ? <LessonDataTable data={block.dataTable} /> : null}
      {!hideItems && block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item}>{item}</div>)}</div> : null}
      {!hideOptions && block.options?.length ? <div className="options">{block.options.map((option) => <div className="option" key={option}>{option}</div>)}</div> : null}
      {block.revealText ? <div className="reveal">{block.revealText}</div> : null}
      {teacherBlock?.correctAnswer ? <div className="reveal">Správná odpověď: <strong>{teacherBlock.correctAnswer}</strong></div> : null}
      {teacherBlock?.teacherNote ? <details open><summary>Poznámka pro učitele</summary><p>{teacherBlock.teacherNote}</p></details> : null}
      {typeof block.points === 'number' ? <div className="points">Max. {block.points} bodů</div> : null}
    </article>
  );
}
