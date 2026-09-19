import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import FormattedInstructions from '@/components/FormattedInstructions';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { LessonSchema, type LessonBlock } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';
import { normalizeWorksheetMode, normalizeWorksheetSpace, resolveWorksheetBlockIds, worksheetAnswerLineCount, worksheetBlockLabel } from '@/lib/worksheet';
import WorksheetPrintToolbar from './WorksheetPrintToolbar';
import styles from './WorksheetPage.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Worksheet – Syllonaut', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string | string[]; space?: string | string[]; block?: string | string[] }> };
function first(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function values(value?: string | string[]) { return value ? (Array.isArray(value) ? value : [value]) : []; }

function WorksheetTable({ block }: { block: LessonBlock }) {
  if (!block.dataTable) return null;
  return <table className={styles.dataTable}><caption>{block.dataTable.caption}</caption><thead><tr>{block.dataTable.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{block.dataTable.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}
function AnswerLines({ count }: { count: number }) { return <div className={styles.answerLines} aria-hidden="true">{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>; }
function TeacherKey({ block, english, lang }: { block: LessonBlock; english: boolean; lang?: string }) {
  const hasKey = Boolean(block.correctAnswer || block.revealText || block.teacherNote || block.gradingRubric?.length);
  if (!hasKey) return null;
  return <aside className={styles.teacherKey}><strong>{english ? 'Teacher key' : 'Klíč pro učitele'}</strong>
    {block.correctAnswer ? <p><b>{english ? 'Correct answer:' : 'Správná odpověď:'}</b> {block.correctAnswer}</p> : null}
    {block.revealText ? <div><b>{english ? 'Reveal / solution:' : 'Odhalení / řešení:'}</b><FormattedInstructions text={block.revealText} lang={lang} /></div> : null}
    {block.teacherNote ? <p><b>{english ? 'Teacher note:' : 'Poznámka pro učitele:'}</b> {block.teacherNote}</p> : null}
    {block.gradingRubric?.length ? <div><b>{english ? 'Scoring rubric:' : 'Hodnoticí rubrika:'}</b><ul>{block.gradingRubric.map((criterion) => <li key={criterion.id}><strong>{criterion.title} · {criterion.maxPoints} b.</strong> {criterion.description}</li>)}</ul></div> : null}
  </aside>;
}

export default async function WorksheetPage({ params, searchParams }: Props) {
  const [{ id }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');

  const [lessonResult, profileResult] = await Promise.all([
    supabase.from('lessons').select('id, lesson').eq('id', id).eq('owner_id', userId).maybeSingle(),
    supabase.from('profiles').select('role, worksheet_export_enabled').eq('id', userId).maybeSingle(),
  ]);
  if (lessonResult.error || !lessonResult.data) notFound();
  if (profileResult.error || !profileResult.data) { console.error('worksheet entitlement lookup failed', profileResult.error); throw new Error('Worksheet entitlement lookup failed.'); }
  if (!(profileResult.data.role === 'admin' || profileResult.data.worksheet_export_enabled)) redirect('/pricing#teacher-pro');

  const parsed = LessonSchema.safeParse(lessonResult.data.lesson);
  if (!parsed.success) notFound();
  const lesson = parsed.data;
  const mode = normalizeWorksheetMode(first(query.mode));
  const space = normalizeWorksheetSpace(first(query.space));
  const selectedIds = new Set(resolveWorksheetBlockIds(values(query.block), lesson));
  const blocks = lesson.blocks.map((block, originalIndex) => ({ block, originalIndex })).filter(({ block }) => selectedIds.has(block.id));
  const teacherMode = mode === 'teacher';
  const pdfParams = new URLSearchParams();
  pdfParams.set('mode', mode);
  pdfParams.set('space', space);
  pdfParams.set('locale', english ? 'en' : 'cs');
  for (const blockId of selectedIds) pdfParams.append('block', blockId);

  return <main className={styles.worksheetShell}>
    <WorksheetPrintToolbar lessonId={id} lessonTitle={lesson.title} english={english} teacherMode={teacherMode} worksheetQuery={pdfParams.toString()} />
    <article className={styles.paper} lang={lesson.language} dir={lesson.language ? 'auto' : undefined}>
      <header className={styles.sheetHeader}>
        <div className={styles.brandRow}><div className={styles.brand}><SyllonautMark /><span>Syllonaut</span></div><span className={styles.documentType}>{teacherMode ? (english ? 'Teacher key' : 'Klíč pro učitele') : (english ? 'Worksheet' : 'Pracovní list')}</span></div>
        <div className={styles.titleBlock}><h1>{lesson.title}</h1>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div>
        <div className={styles.metaRow}><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.groupSize}</span></div>
        {!teacherMode ? <div className={styles.identityRow}><span><b>{english ? 'Name' : 'Jméno'}</b></span><span><b>{english ? 'Class / group' : 'Třída / skupina'}</b></span><span><b>{english ? 'Date' : 'Datum'}</b></span></div>
          : <div className={styles.teacherBanner}>{english ? 'Teacher version with answers, notes and scoring where available.' : 'Učitelská verze obsahuje řešení, poznámky a bodování tam, kde jsou v lekci k dispozici.'}</div>}
      </header>
      {blocks.length > 0 ? <div className={styles.activities}>{blocks.map(({ block, originalIndex }) => {
        const answerType = block.type === 'open_text' || block.type === 'exit_ticket' || block.type === 'team_task';
        return <section className={styles.activity} key={block.id}>
          <div className={styles.activityHeader}><span className={styles.activityNumber}>{originalIndex + 1}</span><div><span className={styles.activityType}>{worksheetBlockLabel(block.type, english)}</span><h2>{block.title}</h2></div>{typeof block.points === 'number' ? <span className={styles.points}>Max. {block.points} b.</span> : null}</div>
          <FormattedInstructions text={block.instructions} className={styles.instructions} lang={lesson.language} />
          <WorksheetTable block={block} />
          {block.type === 'ranking' && block.items?.length ? <div className={styles.rankingList}>{block.items.map((item) => <div className={styles.rankingRow} key={item}><span className={styles.rankBox} aria-hidden="true" /><span>{item}</span></div>)}</div>
            : block.items?.length ? <ul className={styles.itemList}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {block.options?.length ? <ul className={styles.optionList}>{block.options.map((option) => <li key={option}><span className={styles.optionMark} aria-hidden="true" />{option}</li>)}</ul> : null}
          {block.type === 'team_task' ? <div className={styles.teamLine}><b>{english ? 'Team / members:' : 'Tým / členové:'}</b></div> : null}
          {answerType ? <AnswerLines count={worksheetAnswerLineCount(space, block.type)} /> : null}
          {teacherMode ? <TeacherKey block={block} english={english} lang={lesson.language} /> : null}
        </section>;
      })}</div> : <section className={styles.emptyState}><h2>{english ? 'No printable activities selected' : 'Nejsou vybrané žádné tisknutelné aktivity'}</h2><p>{english ? 'Return to the lesson and choose at least one activity.' : 'Vraťte se k lekci a vyberte alespoň jednu aktivitu.'}</p></section>}
      <footer className={styles.sheetFooter}><span>{english ? 'Created in Syllonaut' : 'Vytvořeno v Syllonautu'}</span><span>syllonaut.com</span></footer>
    </article>
  </main>;
}
