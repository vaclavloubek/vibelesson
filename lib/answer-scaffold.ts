/**
 * The answer scaffold is a short outline or set of sentence starters the
 * student may insert into an empty answer field. The scaffold itself is not
 * the student's work: an answer that is only the unchanged scaffold cannot be
 * submitted, and grading never awards points for it.
 */
export const UNCHANGED_SCAFFOLD_ERROR = 'Doplň osnovu vlastními slovy.';

export function normalizeScaffoldComparison(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function isUnchangedScaffold(answer: string, scaffold: unknown) {
  if (typeof scaffold !== 'string') return false;
  const normalizedScaffold = normalizeScaffoldComparison(scaffold);
  return normalizedScaffold.length > 0 && normalizeScaffoldComparison(answer) === normalizedScaffold;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes the scaffold lines the student kept verbatim (with the spaces
 * around them), so copy-trace detection judges only the text the student
 * wrote.
 */
export function stripScaffoldFromAnswer(answer: string, scaffold: unknown) {
  if (typeof scaffold !== 'string') return answer;
  const lines = scaffold
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  let result = answer;
  for (const line of lines) {
    result = result.replace(new RegExp(`[ \\t\\u00A0]*${escapeRegExp(line)}[ \\t\\u00A0]*`, 'g'), '');
  }
  return result;
}
