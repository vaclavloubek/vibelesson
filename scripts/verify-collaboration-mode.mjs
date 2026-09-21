import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`Collaboration mode regression: ${message}`);
}

const schema = source('lib/schema.ts');
const workspace = source('components/LessonWorkspace.tsx');
const generateRoute = source('app/api/generate/route.ts');
const ai = source('lib/ai.ts');
const reviseBlock = source('app/api/revise-block/route.ts');
const teacher = source('components/TeacherSession.tsx');
const sessionRoute = source('app/api/sessions/[id]/route.ts');
const preview = source('components/LessonPreview.tsx');
const styles = source('app/globals.css');

requireText(schema, "CollaborationModeSchema = z.enum(['individual', 'teams'])", 'explicit collaboration enum is missing.');
requireText(schema, 'resolveLessonCollaborationMode', 'legacy lesson compatibility resolver is missing.');

requireText(workspace, "value={collaborationMode}", 'lesson builder does not expose the explicit work mode.');
requireText(workspace, "Má lekce obsahovat týmové aktivity?", 'lesson builder copy must describe team activities rather than an all-or-nothing team mode.');
requireText(workspace, "Ne, pouze individuální", 'individual-only option copy is missing.');
requireText(workspace, "Ano, kombinovat individuální a týmové", 'mixed individual-and-team option copy is missing.');
requireText(workspace, '<option value="individual">', 'individual mode option is missing.');
requireText(workspace, '<option value="teams">', 'team mode option is missing.');
requireText(workspace, 'collaborationMode, tone', 'generation request does not send collaboration mode.');
requireText(workspace, "collaborationMode === 'teams' ?", 'team size must only be required in team mode.');
requireText(workspace, 'className="team-size-field"', 'team size field must expose a stable layout hook.');
requireText(styles, '.team-size-field { order: 1; }', 'desktop layout must place team size after the stable tone field.');
requireText(styles, '.team-size-field { order: 0; }', 'mobile layout must restore natural stacked field order.');

requireText(generateRoute, 'collaborationMode: CollaborationModeSchema', 'generation API does not validate collaboration mode.');
requireText(generateRoute, "input.collaborationMode === 'individual'", 'generation API does not derive individual-safe group semantics.');
requireText(generateRoute, 'collaborationMode: input.collaborationMode', 'generation API does not pass the authoritative mode to AI generation.');

requireText(ai, 'Nesmíš vytvořit žádný blok typu team_task.', 'individual AI rule does not forbid team_task.');
requireText(ai, 'Lekce musí obsahovat alespoň jeden blok typu team_task', 'team AI rule does not require actual team work.');
requireText(ai, 'Generated lesson violates the explicit collaboration mode.', 'generation does not fail closed after retry.');
requireText(ai, 'Revised lesson violates the explicit collaboration mode.', 'whole-lesson revision does not preserve mode.');
requireText(ai, 'Individual lesson block revision produced a team task.', 'block revision does not fail closed for individual lessons.');

requireText(reviseBlock, 'resolveLessonCollaborationMode(sourceLesson)', 'block revision does not resolve authoritative lesson mode.');
requireText(reviseBlock, "collaborationMode === 'individual' && hasTeamTask", 'block revision does not validate the resulting lesson invariant.');

requireText(teacher, 'resolveLessonCollaborationMode(session.lessonSnapshot)', 'live UI is not driven by explicit collaboration mode.');
requireText(teacher, '{teamMode ? (', 'team setup panel is not conditioned on team mode.');
requireText(teacher, "teamMode && session.teams.length < 2 ? (", 'team-mode lobby does not expose the pre-start prerequisite state.');
requireText(teacher, "Nejdřív vytvoř týmy", 'team-mode lobby does not clearly tell the teacher what to do first.');
requireText(teacher, 'onClick={focusTeamSetup}', 'team setup prerequisite does not navigate the teacher to team creation.');
requireText(teacher, 'ref={teamCountInputRef}', 'team setup shortcut does not focus the team-count control.');
requireText(teacher, "const [teamCount, setTeamCount] = useState('4')", 'team count input must preserve editable string state so it can be cleared.');
requireText(teacher, 'setTeamCount(event.target.value)', 'team count input must not clamp an empty edit back to the minimum.');
requireText(teacher, 'disabled={busy || !hasValidTeamCount}', 'team creation must stay disabled until the team count is valid.');
requireText(teacher, 'body: JSON.stringify({ count: parsedTeamCount })', 'team creation must send the validated numeric team count.');
requireText(styles, '.live-start-prerequisite {', 'team setup prerequisite is not visually distinguished.');
requireText(sessionRoute, "resolveLessonCollaborationMode(lesson) === 'teams'", 'server live-start boundary is not driven by collaboration mode.');

requireText(preview, 'resolveLessonCollaborationMode(lesson)', 'lesson preview does not surface collaboration mode.');
requireText(preview, "collaborationMode === 'individual'", 'lesson preview does not distinguish individual and team lessons.');

console.log('Collaboration mode checks passed.');
