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
  lessonPreview,
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
  source('components/LessonPreview.tsx'),
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
requirePattern(lessonPreview, /Kontrola přístupnosti obsahu/, 'ATAG authoring feedback is missing from teacher preview.');
requirePattern(ai, /Pravidla přístupnosti vytvářeného obsahu \(ATAG\/WCAG by default\)/, 'AI authoring accessibility guardrails are missing.');
requirePattern(ai, /caption:\s*z\.string\(\)\.min\(1\)/, 'AI-generated tables no longer require a caption.');
requirePattern(authoring, /drag-only-instruction/, 'deterministic drag-only authoring check is missing.');
requirePattern(authoring, /visual-only-cue/, 'deterministic visual-only authoring check is missing.');
requirePattern(presenterCss, /prefers-reduced-motion:\s*reduce/, 'presenter reduced-motion fallback is missing.');

console.log('Accessibility source checks passed.');
