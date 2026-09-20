import { readFile } from 'node:fs/promises';

const [schema, workspace, generateRoute, ai, reviseBlockRoute, teacher] = await Promise.all([
  readFile(new URL('../lib/schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../components/LessonWorkspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/revise-block/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../components/TeacherSession.tsx', import.meta.url), 'utf8'),
]);

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(`Lesson-work-mode regression: ${message}`);
}

requirePattern(schema, /LessonWorkModeSchema = z\.enum\(\['individual', 'teams'\]\)/, 'explicit work-mode schema is missing.');
requirePattern(schema, /workMode: LessonWorkModeSchema\.optional\(\)/, 'lesson JSON must persist explicit work mode while keeping legacy lessons compatible.');
requirePattern(schema, /workMode === 'individual'[\s\S]*team_task/, 'individual lessons must reject team_task at the schema boundary.');
requirePattern(schema, /workMode === 'teams'[\s\S]*!hasTeamTask/, 'team lessons must require at least one team_task at the schema boundary.');

requirePattern(workspace, /Forma práce[\s\S]*Work mode/, 'lesson creation must expose the work-mode selector in CZ/EN.');
requirePattern(workspace, /option value="individual"[\s\S]*option value="teams"/, 'lesson creation must offer individual and team modes.');
requirePattern(workspace, /workMode === 'teams'[\s\S]*Velikost týmu/, 'team size must only be required for team mode.');
requirePattern(workspace, /workMode, groupSize: workMode === 'individual' \? '1' : groupSize/, 'the client must send explicit work mode and deterministic individual group size.');

requirePattern(generateRoute, /workMode: LessonWorkModeSchema\.default\('teams'\)/, 'generation API must validate work mode while retaining backward compatibility.');
requirePattern(generateRoute, /input\.workMode === 'teams' && !input\.groupSize\.trim\(\)/, 'team generation must fail early without a team size.');
requirePattern(generateRoute, /workMode: input\.workMode/, 'generation API must pass work mode into the trusted AI boundary.');

requirePattern(ai, /REŽIM PRÁCE: JEDNOTLIVCI[\s\S]*Nesmíš vytvořit žádný blok typu team_task/, 'AI prompt must explicitly forbid team tasks in individual mode.');
requirePattern(ai, /REŽIM PRÁCE: TÝMY[\s\S]*alespoň jeden blok typu team_task/, 'AI prompt must require a team task in team mode.');
requirePattern(ai, /workModeCompatible\(output, input\.workMode\)[\s\S]*generateAttempt/, 'generation must retry a mode-violating AI result before parsing or saving.');
requirePattern(ai, /Revision violates the lesson work mode/, 'whole-lesson revisions must fail closed on work-mode violations.');
requirePattern(ai, /Block revision violates the lesson work mode/, 'block revisions must fail closed on work-mode violations.');

requirePattern(reviseBlockRoute, /requireTeamTask = sourceLesson\.workMode === 'teams'/, 'the last team task must be protected during block revision.');
requirePattern(reviseBlockRoute, /workMode: sourceLesson\.workMode[\s\S]*requireTeamTask/, 'block revision must pass the authoritative lesson work mode.');

requirePattern(teacher, /const hasTeamTasks = session\?\.lessonSnapshot\.blocks\.some\(\(block\) => block\.type === 'team_task'\)/, 'live team controls must remain driven by actual team tasks.');
requirePattern(teacher, /\{hasTeamTasks \? \([\s\S]*Vytvořit týmy/, 'team setup controls must stay hidden when no team task exists.');

console.log('Lesson work-mode checks passed.');
