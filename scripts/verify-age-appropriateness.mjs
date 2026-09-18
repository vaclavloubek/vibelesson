import { readFile } from 'node:fs/promises';

const ai = await readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8');

function requirePattern(pattern, message) {
  if (!pattern.test(ai)) throw new Error(`Age-appropriateness regression: ${message}`);
}

requirePattern(/VĚKOVÁ A VÝVOJOVÁ PŘIMĚŘENOST JE ZÁVAZNÁ/, 'central developmental-fit rule is missing.');
requirePattern(/úroveň čtení a psaní[\s\S]*slovní zásobu[\s\S]*míru abstrakce[\s\S]*počet kroků/, 'the prompt no longer covers core developmental dimensions.');
requirePattern(/nejmladších žáků a začínajících čtenářů/, 'early-reader safeguard is missing.');
requirePattern(/nepoužívej infantilní jazyk/, 'older-learner safeguard is missing.');
requirePattern(/potichu zkontroluj každý blok proti cílové skupině/, 'pre-return block-level fit check is missing.');
requirePattern(/Cílová skupina: \$\{input\.audience\}/, 'generation prompt no longer passes the teacher audience explicitly.');
requirePattern(/system:\s*baseRules/g, 'AI authoring calls must continue to use the shared pedagogical rules.');

const baseRuleUses = ai.match(/system:\s*baseRules/g) ?? [];
if (baseRuleUses.length < 3) {
  throw new Error('Age-appropriateness regression: generation and both revision paths must use the shared pedagogical rules.');
}

console.log('Age-appropriateness source checks passed.');
