import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Accessibility regression: ${message}`);
}

const [
  layout,
  accessibilityCss,
  authControls,
  studentSession,
  studentResponse,
  teamTask,
  lessonWorkspace,
  lessonPreview,
  lessonLibrary,
  teacherSession,
  ai,
  authoring,
  presenterCss,
] = await Promise.all([
  source('app/layout.tsx'),
  source('app/accessibility.css'),
  source('components/AuthControls.tsx'),
  source('components/StudentSession.tsx'),
  source('components/StudentResponseInput.tsx'),
  source('components/TeamTaskResponseInput.tsx'),
  source('components/LessonWorkspace.tsx'),
  source('components/LessonPreview.tsx'),
  source('app/lessons/LessonLibrary.tsx'),
  source('components/TeacherSession.tsx'),
  source('lib/ai.ts'),
  source('lib/accessibility-authoring.ts'),
  source('components/PresenterScoreboard.module.css'),
]);

requirePattern(layout, /<html lang="cs">/, 'root document must declare Czech language.');
requirePattern(layout, /className="skip-link"[^>]+href="#main-content"/, 'skip link to main content is missing.');
requirePattern(accessibilityCss, /:focus-visible/, 'global visible keyboard focus style is missing.');
requirePattern(accessibilityCss, /--line-strong:\s*#8b8d94/i, 'form-control boundary contrast token regressed.');
requirePattern(authControls, /role="dialog"/, 'authentication popover lost dialog semantics.');
requirePattern(authControls, /aria-haspopup="dialog"/, 'authentication trigger lost dialog relationship.');
requirePattern(authControls, /event\.key !== 'Escape'/, 'authentication popover lost Escape handling.');
requirePattern(studentSession, /role="progressbar"/, 'student live progressbar semantics are missing.');
requirePattern(studentSession, /Aktuální úkol \$\{blockNumber\} z \$\{state\.totalBlocks\}/, 'active lesson-block announcement is missing.');
requirePattern(studentResponse, /aria-pressed=\{selected === option\}/, 'quiz\/poll selected state is not exposed.');
requirePattern(studentResponse, /role="alert"/, 'student response errors are not exposed as alerts.');
requirePattern(teamTask, /Společná týmová odpověď/, 'team response field lost its accessible label.');
requirePattern(teamTask, /aria-describedby=\{statusId\}/, 'team response field lost status description.');
requirePattern(lessonWorkspace, /Pokyn pro úpravu celé lekce/, 'whole-lesson AI revision field lost its label.');
requirePattern(lessonWorkspace, /Pokyn pro úpravu vybrané aktivity/, 'block AI revision field lost its label.');
requirePattern(lessonWorkspace, /folderId:\s*initialFolderId/, 'folder-aware generation was lost while applying accessibility changes.');
requirePattern(lessonPreview, /Kontrola přístupnosti obsahu/, 'ATAG authoring feedback is missing from teacher preview.');
requirePattern(lessonLibrary, /aria-label="Složky lekcí"/, 'folder navigation lost its accessible name.');
requirePattern(lessonLibrary, /aria-pressed=\{scope === root\.id\}/, 'selected lesson-folder state is not exposed.');
requirePattern(lessonLibrary, /aria-label=\{`Přejmenovat složku \$\{root\.name\}`\}/, 'folder icon actions lost explicit accessible names.');
requirePattern(lessonLibrary, /role="alert"/, 'lesson-library errors are not exposed as alerts.');
requirePattern(teacherSession, /role="progressbar"/, 'teacher live progressbar semantics are missing.');
requirePattern(teacherSession, /aria-valuetext=\{`Blok \$\{activeIndex \+ 1\} z \$\{session\.lessonSnapshot\.blocks\.length\}`\}/, 'teacher live progress lacks meaningful value text.');
requirePattern(ai, /Pravidla přístupnosti vytvářeného obsahu \(ATAG\/WCAG by default\)/, 'AI authoring accessibility guardrails are missing.');
requirePattern(ai, /caption:\s*z\.string\(\)\.min\(1\)/, 'AI-generated tables no longer require a caption.');
requirePattern(authoring, /drag-only-instruction/, 'deterministic drag-only authoring check is missing.');
requirePattern(authoring, /visual-only-cue/, 'deterministic visual-only authoring check is missing.');
requirePattern(presenterCss, /prefers-reduced-motion:\s*reduce/, 'presenter reduced-motion fallback is missing.');

console.log('Accessibility source checks passed.');
