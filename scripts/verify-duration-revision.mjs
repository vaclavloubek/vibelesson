import { readFile } from 'node:fs/promises';

const ai = await readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8');

function requirePattern(pattern, message) {
  if (!pattern.test(ai)) throw new Error(`Duration-revision regression: ${message}`);
}

requirePattern(/významně měníš časovou dotaci aktivity[\s\S]*skutečný rozsah práce studentů/, 'shared pedagogical rules must couple duration changes to real student work.');
requirePattern(/Samotné přepsání durationMinutes nestačí/, 'duration-only changes must be explicitly forbidden by default.');
requirePattern(/function durationChangeNeedsSubstantiveRetry/, 'block revisions must include a deterministic substantive-change guard.');
requirePattern(/isSignificantDurationChange[\s\S]*delta >= 5[\s\S]*delta >= 3/, 'the guard must detect meaningful absolute and relative duration changes.');
requirePattern(/substantiveBlockSignature[\s\S]*instructions[\s\S]*options[\s\S]*items[\s\S]*dataTable/, 'the substantive comparison must inspect student-facing activity content.');
requirePattern(/explicitlyAllowsDurationOnlyChange[\s\S]*(?:jen|pouze)[\s\S]*(?:only|just)/, 'explicit teacher requests for duration-only changes must remain supported.');
requirePattern(/durationChangeNeedsSubstantiveRetry\(block, revisedBlock, instruction\)[\s\S]*generateRevision\(retryGuidance\)/, 'a duration-only first result must trigger one corrective AI retry.');
requirePattern(/Block duration changed substantially without a corresponding substantive activity change/, 'a second duration-only result must fail closed instead of being persisted.');

console.log('Duration-revision source checks passed.');
