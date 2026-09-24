/**
 * Deterministic traces of text copied from an AI chat interface. They are
 * properties of the submitted text only (no typing or paste telemetry), so the
 * integrity signal keeps evaluating the answer, not monitoring the student.
 * Every kind is independent evidence; ordinary typing on a keyboard, including
 * Czech typography (non-breaking spaces inside a line, „quotes“, en dashes),
 * does not produce any of them.
 */
export type CopyArtifactKind = 'invisible_characters' | 'latex_markup' | 'markdown_markup' | 'markdown_line_breaks';

export type CopyArtifact = {
  kind: CopyArtifactKind;
  signal: string;
};

const INVISIBLE_CHARACTERS = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
// Preceded by a letter, digit, colon or backslash it is a file path, not LaTeX.
const LATEX_MARKUP = /(?<![A-Za-z0-9:\\])\\(?:rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|longrightarrow|times|cdot|div|frac|dfrac|approx|neq|leq|geq|pm|sqrt|textbf|mathrm|mathbf|sum|Delta)(?![A-Za-z])|\$\$[^$]+\$\$|\\\([^)]*\\\)|\\\[[^\]]*\\\]/g;
const MARKDOWN_BOLD = /\*\*[^*\n]{2,}\*\*/g;
const MARKDOWN_HEADING = /^#{1,6}[ \t]+\S/gm;
const MARKDOWN_TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m;
// A Markdown hard line break ("two spaces + newline") copied from a rendered
// chat answer arrives as a non-breaking space at the end of the line.
const MARKDOWN_LINE_BREAK = /\u00A0[ \t\u00A0]*(?=\r?\n)/g;

function count(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

export function detectCopyArtifacts(text: string): CopyArtifact[] {
  const artifacts: CopyArtifact[] = [];

  const invisible = count(text, INVISIBLE_CHARACTERS);
  if (invisible > 0) {
    artifacts.push({
      kind: 'invisible_characters',
      signal: `Text obsahuje neviditelné znaky (${invisible}×, např. U+2060 nebo U+200B), které vznikají kopírováním z AI chatu, ne psaním na klávesnici.`,
    });
  }

  const latex = count(text, LATEX_MARKUP);
  if (latex > 0) {
    artifacts.push({
      kind: 'latex_markup',
      signal: `Text obsahuje příkazy LaTeXu (${latex}×, např. \\rightarrow), které AI chaty používají pro zápis vzorců a šipek.`,
    });
  }

  const markdown = count(text, MARKDOWN_BOLD) + count(text, MARKDOWN_HEADING) + (MARKDOWN_TABLE_RULE.test(text) ? 1 : 0);
  if (markdown > 0) {
    artifacts.push({
      kind: 'markdown_markup',
      signal: `Text obsahuje formátovací značky Markdownu (${markdown}×: **tučně**, # nadpis nebo tabulka), typické pro výstup AI chatu.`,
    });
  }

  const lineBreaks = count(text, MARKDOWN_LINE_BREAK);
  if (lineBreaks >= 2) {
    artifacts.push({
      kind: 'markdown_line_breaks',
      signal: `Řádky končí pevnou mezerou (${lineBreaks}×), což je stopa zkopírovaných zalomení řádků z vykresleného AI chatu.`,
    });
  }

  return artifacts;
}
