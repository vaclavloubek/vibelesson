import type { StudentEvaluation } from '@/lib/live';
import type { LessonBlock, LessonDataTable } from '@/lib/schema';

/**
 * "My solutions" PDF for a student after the lesson has ended. This module
 * has no runtime imports: it only picks the fields a student may see and
 * builds a pdfmake definition. It never reads teacherNote, gradingRubric or
 * any evaluation field beyond what the student already sees in "My
 * evaluations" (StudentEvaluation).
 */

// Same palette as lib/worksheet-pdf.ts.
const ACCENT = '#5B57E8';
const INK = '#20222A';
const MUTED = '#6B6D77';
const SOFT = '#F4F3FF';

type PdfNode = Record<string, unknown>;
type RawBlock = Record<string, unknown>;

export type SolutionResponseRow = {
  blockId: string;
  answer: unknown;
  submittedAnswer: unknown;
  submittedAt: unknown;
};

export type SolutionAnswer =
  | { kind: 'choice'; choice: string }
  | { kind: 'text'; text: string }
  | { kind: 'ranking'; ranking: string[]; text: string };

export type SolutionItem = {
  blockId: string;
  type: LessonBlock['type'];
  title: string;
  instructions: string;
  dataTable: LessonDataTable | null;
  options: string[];
  team: boolean;
  answer: SolutionAnswer | null;
  draft: boolean;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  showModelAnswer: boolean;
  modelAnswer: string | null;
  evaluation: StudentEvaluation | null;
};

const SOLUTION_BLOCK_TYPES = new Set(['quiz', 'poll', 'ranking', 'open_text', 'exit_ticket', 'team_task']);

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toAnswer(value: unknown): SolutionAnswer | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.choice === 'string' && raw.choice) return { kind: 'choice', choice: raw.choice };
  if (Array.isArray(raw.ranking)) return { kind: 'ranking', ranking: stringList(raw.ranking), text: text(raw.text) };
  if (typeof raw.text === 'string' && raw.text.trim()) return { kind: 'text', text: raw.text };
  return null;
}

// The submitted version is the one the teacher evaluated; a newer unsubmitted
// draft is shown only when nothing was submitted.
function pickAnswer(row: SolutionResponseRow | undefined) {
  if (!row) return { answer: null, submitted: false };
  const submitted = row.submittedAt ? toAnswer(row.submittedAnswer) : null;
  return submitted ? { answer: submitted, submitted: true } : { answer: toAnswer(row.answer), submitted: false };
}

function dataTable(value: unknown): LessonDataTable | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const columns = stringList(raw.columns);
  const rows = Array.isArray(raw.rows) ? raw.rows.map(stringList).filter((row) => row.length === columns.length) : [];
  if (columns.length < 2 || !rows.length) return null;
  return { caption: typeof raw.caption === 'string' ? raw.caption : undefined, columns, rows };
}

export function buildStudentSolutionItems({
  blocks,
  responses,
  teamResponses,
  evaluations,
}: {
  blocks: RawBlock[];
  responses: SolutionResponseRow[];
  teamResponses: SolutionResponseRow[];
  evaluations: StudentEvaluation[];
}): SolutionItem[] {
  const items: SolutionItem[] = [];
  for (const block of blocks) {
    const type = text(block.type) as LessonBlock['type'];
    const blockId = text(block.id);
    if (!blockId || !SOLUTION_BLOCK_TYPES.has(type)) continue;
    const team = type === 'team_task';
    const picked = pickAnswer((team ? teamResponses : responses).find((row) => row.blockId === blockId));
    // A poll has no key; it is listed only when the student voted.
    if (type === 'poll' && !picked.answer) continue;

    const choiceType = type === 'quiz' || type === 'poll';
    const correctAnswer = type === 'quiz' && typeof block.correctAnswer === 'string' ? block.correctAnswer : null;
    const myChoice = picked.answer?.kind === 'choice' ? picked.answer.choice : null;
    const modelAnswer = typeof block.modelAnswer === 'string' && block.modelAnswer.trim() ? block.modelAnswer : null;
    items.push({
      blockId,
      type,
      title: text(block.title),
      instructions: text(block.instructions),
      dataTable: dataTable(block.dataTable),
      options: choiceType ? stringList(block.options) : [],
      team,
      answer: picked.answer,
      draft: !choiceType && Boolean(picked.answer) && !picked.submitted,
      correctAnswer,
      isCorrect: correctAnswer && myChoice ? myChoice === correctAnswer : null,
      showModelAnswer: !choiceType,
      modelAnswer: choiceType ? null : modelAnswer,
      evaluation: evaluations.find((evaluation) => evaluation.blockId === blockId) ?? null,
    });
  }
  return items;
}

function cleanText(value: string | undefined | null) {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
}

function label(english: boolean, cs: string, en: string) {
  return english ? en : cs;
}

function sectionLabel(value: string): PdfNode {
  return { text: value.toUpperCase(), fontSize: 7, bold: true, color: MUTED, characterSpacing: 0.5, margin: [0, 8, 0, 2] };
}

function boxed(stack: PdfNode[], fillColor: string, borderColor: string): PdfNode {
  return {
    table: { widths: ['*'], body: [[{ stack, fillColor, margin: [8, 6, 8, 6] }]] },
    layout: {
      hLineColor: () => borderColor,
      vLineColor: () => borderColor,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

function dataTableNode(table: LessonDataTable): PdfNode {
  return {
    margin: [0, 6, 0, 0],
    stack: [
      ...(table.caption ? [{ text: cleanText(table.caption), fontSize: 8, bold: true, color: MUTED, margin: [0, 0, 0, 3] }] : []),
      {
        table: {
          headerRows: 1,
          widths: table.columns.map(() => '*'),
          body: [
            table.columns.map((column) => ({ text: cleanText(column), bold: true, fillColor: '#F2F2F5' })),
            ...table.rows.map((row) => row.map((cell) => cleanText(cell))),
          ],
        },
        layout: {
          hLineColor: () => '#C9CAD0',
          vLineColor: () => '#C9CAD0',
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          paddingLeft: () => 5,
          paddingRight: () => 5,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        fontSize: 8,
      },
    ],
  };
}

function answerNodes(item: SolutionItem, english: boolean): PdfNode[] {
  if (!item.answer) return [{ text: label(english, 'Bez odpovědi', 'No answer'), italics: true, color: MUTED }];
  const nodes: PdfNode[] = [];
  if (item.answer.kind === 'choice') nodes.push({ text: cleanText(item.answer.choice) });
  if (item.answer.kind === 'text') nodes.push({ text: cleanText(item.answer.text), lineHeight: 1.3 });
  if (item.answer.kind === 'ranking') {
    nodes.push({ ol: item.answer.ranking.map((entry) => cleanText(entry)), margin: [12, 0, 0, 0] });
    if (item.answer.text.trim()) nodes.push({ text: cleanText(item.answer.text), margin: [0, 4, 0, 0], lineHeight: 1.3 });
  }
  if (item.draft) nodes.push({ text: label(english, 'Neodevzdaný koncept', 'Draft, not submitted'), fontSize: 8, italics: true, color: MUTED, margin: [0, 3, 0, 0] });
  return nodes;
}

function evaluationNodes(evaluation: StudentEvaluation, english: boolean): PdfNode[] {
  const nodes: PdfNode[] = [
    sectionLabel(evaluation.team ? label(english, 'Hodnocení týmu', 'Team evaluation') : label(english, 'Moje hodnocení', 'My evaluation')),
    { text: [{ text: `${evaluation.score} / ${evaluation.maxPoints} `, bold: true }, label(english, 'bodů', 'points')] },
  ];
  if (evaluation.source === 'ai') {
    nodes.push({ text: label(english, 'Souhrn AI hodnocení, potvrzený učitelem', 'AI evaluation summary, confirmed by the teacher'), fontSize: 8, color: MUTED, margin: [0, 3, 0, 0] });
    if (evaluation.summary) nodes.push({ text: cleanText(evaluation.summary), margin: [0, 2, 0, 0] });
  } else {
    nodes.push({ text: label(english, 'Hodnocení učitele', 'Teacher evaluation'), fontSize: 8, color: MUTED, margin: [0, 3, 0, 0] });
  }
  if (evaluation.teacherNote) {
    nodes.push({ text: [{ text: label(english, 'Poznámka učitele: ', 'Teacher note: '), bold: true }, cleanText(evaluation.teacherNote)], margin: [0, 3, 0, 0] });
  }
  if (evaluation.outdated) {
    nodes.push({ text: label(english, 'Hodnocení se týká dříve odevzdané verze odpovědi.', 'This evaluation refers to an earlier submitted version of the answer.'), fontSize: 8, italics: true, color: MUTED, margin: [0, 3, 0, 0] });
  }
  return nodes;
}

function itemNode(item: SolutionItem, index: number, english: boolean, teamName: string | null): PdfNode {
  // The heading stays on the same page as the task text.
  const heading: PdfNode[] = [
    {
      columns: [
        {
          width: 24,
          table: { widths: [22], body: [[{ text: String(index + 1), alignment: 'center', bold: true, color: ACCENT, fillColor: SOFT, margin: [0, 4, 0, 4] }]] },
          layout: 'noBorders',
        },
        {
          width: '*',
          text: cleanText(item.title),
          fontSize: 13,
          bold: true,
          color: INK,
          margin: [5, 3, 0, 0],
        },
      ],
      columnGap: 4,
    },
    sectionLabel(label(english, 'Zadání', 'Task')),
    { text: cleanText(item.instructions), lineHeight: 1.3 },
  ];
  const body: PdfNode[] = [{ stack: heading, unbreakable: true }];
  if (item.dataTable) body.push(dataTableNode(item.dataTable));
  if (item.options.length) body.push({ ul: item.options.map((option) => cleanText(option)), margin: [12, 4, 0, 0], fontSize: 9 });

  const answerTitle = item.team
    ? (teamName ? label(english, `Odpověď týmu ${teamName}`, `Answer of team ${teamName}`) : label(english, 'Odpověď týmu', 'Team answer'))
    : label(english, 'Moje odpověď', 'My answer');
  body.push(sectionLabel(answerTitle));
  body.push(...answerNodes(item, english));

  if (item.type === 'quiz') {
    body.push(sectionLabel(label(english, 'Správná odpověď', 'Correct answer')));
    body.push({ text: item.correctAnswer ? cleanText(item.correctAnswer) : label(english, 'Není k dispozici', 'Not available') });
    if (item.isCorrect !== null) {
      body.push({
        text: item.isCorrect ? label(english, 'Moje odpověď je správná.', 'My answer is correct.') : label(english, 'Moje odpověď není správná.', 'My answer is not correct.'),
        bold: true,
        color: item.isCorrect ? '#1E7A46' : '#A33A2B',
        margin: [0, 3, 0, 0],
      });
    }
  }

  if (item.showModelAnswer) {
    body.push({ text: ' ', fontSize: 4 });
    body.push(item.modelAnswer
      ? boxed([
          { text: label(english, 'VZOROVÁ ODPOVĚĎ (VYTVOŘILA AI)', 'MODEL ANSWER (WRITTEN BY AI)'), fontSize: 7, bold: true, color: ACCENT, characterSpacing: 0.5, margin: [0, 0, 0, 3] },
          { text: cleanText(item.modelAnswer), lineHeight: 1.3 },
        ], '#F7F6FF', '#CFCDF5')
      : { text: label(english, 'Vzorová odpověď není k dispozici.', 'No model answer is available.'), fontSize: 8.5, italics: true, color: MUTED });
  }

  if (item.evaluation) body.push(...evaluationNodes(item.evaluation, english));

  body.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 0.55, lineColor: '#E0E0E5' }], margin: [0, 11, 0, 0] });
  return { stack: body, margin: [0, 0, 0, 10] };
}

export function createStudentSolutionsPdfDefinition({
  lessonTitle,
  lessonLanguage,
  studentName,
  teamName,
  sessionDate,
  english,
  items,
}: {
  lessonTitle: string;
  lessonLanguage: string | null;
  studentName: string;
  teamName: string | null;
  sessionDate: string;
  english: boolean;
  items: SolutionItem[];
}) {
  const hasModelAnswer = items.some((item) => item.modelAnswer);
  const content: PdfNode[] = [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 3, lineColor: ACCENT }], margin: [0, 0, 0, 10] },
    {
      columns: [
        { width: '*', text: 'Syllonaut', bold: true, fontSize: 11, color: INK },
        { width: 'auto', text: label(english, 'MOJE ŘEŠENÍ', 'MY SOLUTIONS'), bold: true, fontSize: 8, color: ACCENT, characterSpacing: 0.8 },
      ],
    },
    { text: cleanText(lessonTitle), fontSize: 22, bold: true, color: INK, margin: [0, 18, 0, 0] },
    {
      margin: [0, 10, 0, 0],
      table: {
        widths: ['*', '*'],
        body: [[
          { text: [{ text: label(english, 'Student: ', 'Student: '), bold: true }, cleanText(studentName), ...(teamName ? [` · ${cleanText(teamName)}`] : [])], fontSize: 9, color: INK },
          { text: [{ text: label(english, 'Datum hodiny: ', 'Lesson date: '), bold: true }, sessionDate], fontSize: 9, color: INK, alignment: 'right' },
        ]],
      },
      layout: 'noBorders',
    },
    { text: ' ', margin: [0, 4, 0, 0] },
  ];

  if (items.length) {
    items.forEach((item, index) => content.push(itemNode(item, index, english, teamName)));
  } else {
    content.push({ text: label(english, 'V této hodině nebyly žádné úkoly s odpovědí.', 'This lesson had no tasks with answers.'), color: MUTED, margin: [0, 12, 0, 0] });
  }

  // AI Act Art. 50(2): mark the AI-generated model answers.
  content.push(boxed([
    { text: label(english, 'Vzorové odpovědi vytvořila AI a mohou obsahovat chyby.', 'The model answers were generated by AI and may contain errors.'), fontSize: 8.5, color: '#4F4BBA' },
  ], '#F7F6FF', '#CFCDF5'));

  return {
    pageSize: 'A4',
    pageMargins: [42, 44, 42, 42],
    language: lessonLanguage ?? (english ? 'en' : 'cs'),
    info: {
      title: `${lessonTitle} — ${label(english, 'Moje řešení', 'My solutions')}`,
      author: 'Syllonaut',
      subject: label(english, 'Moje odpovědi a vzorová řešení z hodiny', 'My answers and model solutions from the lesson'),
      creator: 'Syllonaut',
      keywords: hasModelAnswer ? label(english, 'obsahuje text vytvořený AI', 'contains AI-generated text') : '',
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [42, 10, 42, 0],
      columns: [
        { text: label(english, 'Vytvořeno v Syllonautu', 'Created in Syllonaut') + ' · syllonaut.com', fontSize: 7, color: '#858790' },
        { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: '#858790' },
      ],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, lineHeight: 1.25 },
  };
}

export function studentSolutionsFilename(lessonTitle: string, english: boolean) {
  const base = lessonTitle.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${english ? 'syllonaut-solutions' : 'syllonaut-reseni'}${base ? `-${base}` : ''}.pdf`;
}
