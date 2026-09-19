import type { Lesson, LessonBlock } from '@/lib/schema';
import {
  worksheetAnswerLineCount,
  worksheetBlockLabel,
  type WorksheetMode,
  type WorksheetSpace,
} from '@/lib/worksheet';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(pdfFonts);

const ACCENT = '#5B57E8';
const INK = '#20222A';
const MUTED = '#6B6D77';
const LINE = '#D7D8DE';
const SOFT = '#F4F3FF';

type PdfNode = Record<string, unknown>;

function cleanText(value: string | undefined) {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
}

function parseNumberedList(text: string) {
  const matches = [...text.matchAll(/(^|\s)(\d{1,2})[.)]\s+/g)];
  if (matches.length < 2) return null;
  const markers = matches.map((match) => ({
    number: Number(match[2]),
    markerStart: (match.index ?? 0) + match[1].length,
    contentStart: (match.index ?? 0) + match[0].length,
  }));
  if (markers[0].number !== 1) return null;
  for (let index = 1; index < markers.length; index += 1) {
    if (markers[index].number !== markers[index - 1].number + 1) return null;
  }
  const items = markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].markerStart : text.length;
    return text.slice(marker.contentStart, end).trim();
  });
  if (items.some((item) => !item)) return null;
  return { prefix: text.slice(0, markers[0].markerStart).trim(), items };
}

function instructionNodes(text: string): PdfNode[] {
  const cleaned = cleanText(text);
  const parsed = parseNumberedList(cleaned);
  if (!parsed) return [{ text: cleaned, margin: [0, 6, 0, 0], lineHeight: 1.35 }];
  const nodes: PdfNode[] = [];
  if (parsed.prefix) nodes.push({ text: parsed.prefix, margin: [0, 6, 0, 3], lineHeight: 1.35 });
  nodes.push({ ol: parsed.items, margin: [14, parsed.prefix ? 0 : 6, 0, 0], lineHeight: 1.3 });
  return nodes;
}

function answerLines(count: number): PdfNode {
  const body = Array.from({ length: count }, () => [{ text: ' ', margin: [0, 0, 0, 8] }]);
  return {
    margin: [28, 8, 0, 0],
    table: { widths: ['*'], body },
    layout: {
      hLineWidth: (index: number) => index === 0 ? 0 : 0.5,
      hLineColor: () => '#BFC0C6',
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

function dataTableNode(block: LessonBlock): PdfNode | null {
  if (!block.dataTable) return null;
  return {
    margin: [28, 8, 0, 0],
    stack: [
      ...(block.dataTable.caption ? [{ text: block.dataTable.caption, fontSize: 8, bold: true, color: MUTED, margin: [0, 0, 0, 3] }] : []),
      {
        table: {
          headerRows: 1,
          widths: block.dataTable.columns.map(() => '*'),
          body: [
            block.dataTable.columns.map((column) => ({ text: column, bold: true, fillColor: '#F2F2F5' })),
            ...block.dataTable.rows.map((row) => row.map((cell) => cleanText(cell))),
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

function teacherKey(block: LessonBlock, english: boolean): PdfNode | null {
  const parts: PdfNode[] = [];
  if (block.correctAnswer) parts.push({ text: [{ text: english ? 'Correct answer: ' : 'Správná odpověď: ', bold: true }, cleanText(block.correctAnswer)] });
  if (block.revealText) {
    parts.push({ text: english ? 'Reveal / solution:' : 'Odhalení / řešení:', bold: true, margin: [0, parts.length ? 4 : 0, 0, 1] });
    parts.push(...instructionNodes(block.revealText));
  }
  if (block.teacherNote) parts.push({ text: [{ text: english ? 'Teacher note: ' : 'Poznámka pro učitele: ', bold: true }, cleanText(block.teacherNote)], margin: [0, parts.length ? 4 : 0, 0, 0] });
  if (block.gradingRubric?.length) {
    parts.push({ text: english ? 'Scoring rubric:' : 'Hodnoticí rubrika:', bold: true, margin: [0, parts.length ? 5 : 0, 0, 2] });
    parts.push({
      ul: block.gradingRubric.map((criterion) => ({
        text: [{ text: criterion.title + ' · ' + criterion.maxPoints + ' b. ', bold: true }, cleanText(criterion.description)],
      })),
      margin: [12, 0, 0, 0],
    });
  }
  if (!parts.length) return null;
  return {
    margin: [28, 9, 0, 0],
    table: { widths: ['*'], body: [[{ stack: [{ text: english ? 'TEACHER KEY' : 'KLÍČ PRO UČITELE', fontSize: 7.5, bold: true, color: ACCENT, margin: [0, 0, 0, 4] }, ...parts], fillColor: '#F7F6FF', margin: [8, 7, 8, 7] }]] },
    layout: {
      hLineColor: () => '#CFCDF5',
      vLineColor: () => '#CFCDF5',
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    fontSize: 8.5,
  };
}

function activityNode(block: LessonBlock, index: number, mode: WorksheetMode, space: WorksheetSpace, english: boolean): PdfNode {
  const body: PdfNode[] = [
    {
      columns: [
        {
          width: 24,
          table: { widths: [22], body: [[{ text: String(index + 1), alignment: 'center', bold: true, color: ACCENT, fillColor: SOFT, margin: [0, 4, 0, 4] }]] },
          layout: 'noBorders',
        },
        {
          width: '*',
          stack: [
            { text: worksheetBlockLabel(block.type, english).toUpperCase(), fontSize: 7, bold: true, color: ACCENT, characterSpacing: 0.5 },
            { text: cleanText(block.title), fontSize: 13, bold: true, color: INK, margin: [0, 1, 0, 0] },
          ],
          margin: [5, 0, 0, 0],
        },
        ...(typeof block.points === 'number' ? [{ width: 'auto', text: 'Max. ' + block.points + ' b.', fontSize: 7.5, color: MUTED, margin: [8, 2, 0, 0] }] : []),
      ],
      columnGap: 4,
    },
    ...instructionNodes(block.instructions),
  ];

  const table = dataTableNode(block);
  if (table) body.push(table);

  if (block.type === 'ranking' && block.items?.length) {
    body.push({
      margin: [28, 7, 0, 0],
      table: {
        widths: [24, '*'],
        body: block.items.map((item) => [{ text: '___', color: MUTED }, { text: cleanText(item) }]),
      },
      layout: {
        hLineWidth: (i: number) => i === 0 ? 0 : 0.45,
        hLineColor: () => LINE,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      fontSize: 9,
    });
  } else if (block.items?.length) {
    body.push({ ul: block.items.map((item) => cleanText(item)), margin: [42, 7, 0, 0], fontSize: 9.5 });
  }

  if (block.options?.length) {
    body.push({
      ul: block.options.map((option) => ({ text: '□  ' + cleanText(option) })),
      margin: [42, 7, 0, 0],
      fontSize: 9.5,
      markerColor: '#8D8F98',
    });
  }

  if (block.type === 'team_task') {
    body.push({ text: english ? 'Team / members: ______________________________________________' : 'Tým / členové: ______________________________________________', fontSize: 8.5, color: MUTED, margin: [28, 8, 0, 0] });
  }

  if (block.type === 'open_text' || block.type === 'exit_ticket' || block.type === 'team_task') {
    body.push(answerLines(worksheetAnswerLineCount(space, block.type)));
  }

  if (mode === 'teacher') {
    const key = teacherKey(block, english);
    if (key) body.push(key);
  }

  body.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 490, y2: 0, lineWidth: 0.55, lineColor: '#E0E0E5' }], margin: [0, 11, 0, 0] });

  return {
    margin: [0, 0, 0, 10],
    table: {
      widths: ['*'],
      dontBreakRows: true,
      body: [[{ stack: body, margin: [0, 0, 0, 0] }]],
    },
    layout: 'noBorders',
  };
}

export function createWorksheetPdfDefinition({
  lesson,
  blocks,
  mode,
  space,
  english,
}: {
  lesson: Lesson;
  blocks: Array<{ block: LessonBlock; originalIndex: number }>;
  mode: WorksheetMode;
  space: WorksheetSpace;
  english: boolean;
}) {
  const teacherMode = mode === 'teacher';
  const content: PdfNode[] = [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 3, lineColor: ACCENT }], margin: [0, 0, 0, 10] },
    {
      columns: [
        { width: '*', text: 'Syllonaut', bold: true, fontSize: 11, color: INK },
        { width: 'auto', text: teacherMode ? (english ? 'TEACHER KEY' : 'KLÍČ PRO UČITELE') : (english ? 'WORKSHEET' : 'PRACOVNÍ LIST'), bold: true, fontSize: 8, color: ACCENT, characterSpacing: 0.8 },
      ],
    },
    { text: cleanText(lesson.title), fontSize: 22, bold: true, color: INK, margin: [0, 18, 0, 0] },
    ...(lesson.subtitle ? [{ text: cleanText(lesson.subtitle), fontSize: 10.5, color: MUTED, margin: [0, 3, 0, 0] }] : []),
    { text: [cleanText(lesson.audience), '   ·   ', String(lesson.totalMinutes) + ' min', '   ·   ', cleanText(lesson.groupSize)], fontSize: 8.5, color: MUTED, margin: [0, 8, 0, 0] },
  ];

  if (teacherMode) {
    content.push({
      margin: [0, 12, 0, 0],
      table: { widths: ['*'], body: [[{ text: english ? 'Teacher version with answers, notes and scoring where available.' : 'Učitelská verze obsahuje řešení, poznámky a bodování tam, kde jsou v lekci k dispozici.', color: '#4F4BBA', fillColor: '#F7F6FF', fontSize: 8.5, margin: [8, 6, 8, 6] }]] },
      layout: 'noBorders',
    });
  } else {
    content.push({
      margin: [0, 13, 0, 0],
      table: {
        widths: ['*', '*', '*'],
        body: [[
          { text: english ? 'Name\n____________________________' : 'Jméno\n____________________________', fontSize: 8.5, color: MUTED },
          { text: english ? 'Class / group\n____________________' : 'Třída / skupina\n____________________', fontSize: 8.5, color: MUTED },
          { text: english ? 'Date\n_______________' : 'Datum\n_______________', fontSize: 8.5, color: MUTED },
        ]],
      },
      layout: 'noBorders',
    });
  }

  content.push({ text: ' ', margin: [0, 4, 0, 0] });
  blocks.forEach(({ block }, worksheetIndex) => content.push(activityNode(block, worksheetIndex, mode, space, english)));

  return {
    pageSize: 'A4',
    pageMargins: [42, 44, 42, 42],
    info: {
      title: lesson.title + ' — ' + (english ? 'Worksheet' : 'Pracovní list'),
      author: 'Syllonaut',
      subject: english ? 'Printable lesson worksheet' : 'Pracovní list k lekci',
      creator: 'Syllonaut',
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [42, 10, 42, 0],
      columns: [
        { text: (english ? 'Created in Syllonaut' : 'Vytvořeno v Syllonautu') + ' · syllonaut.com', fontSize: 7, color: '#858790' },
        { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: '#858790' },
      ],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, lineHeight: 1.25 },
  };
}

export async function createWorksheetPdfBuffer(args: Parameters<typeof createWorksheetPdfDefinition>[0]) {
  const definition = createWorksheetPdfDefinition(args);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
}
