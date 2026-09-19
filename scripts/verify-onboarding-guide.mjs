import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`onboarding guide regression: missing ${label}`);
}

const guide = read('components/SyllonautGuide.tsx');
const state = read('lib/onboarding-guide.ts');
const workspace = read('components/LessonWorkspace.tsx');
const preview = read('components/LessonPreview.tsx');
const startSession = read('components/StartSessionButton.tsx');
const lessonPage = read('app/lessons/[id]/page.tsx');
const teacher = read('components/TeacherSession.tsx');
const quickAction = read('components/TeacherScoreboardQuickAction.tsx');
const report = read('components/SessionReport.tsx');
const accountMenu = read('components/PublicHeaderAccountMenu.tsx');
const helpButton = read('components/GuideHelpButton.tsx');
const sessionPage = read('app/sessions/[id]/page.tsx');
const css = read('app/globals.css');

for (const target of [
  'lesson-create-form',
  'lesson-create-submit',
  'lesson-edit-whole',
  'lesson-edit-block',
  'lesson-edit-block-editor',
  'lesson-start',
  'live-join',
  'live-team-create',
  'live-presenter',
  'live-start',
  'live-controls',
  'live-end',
  'session-ended-summary',
  'session-report',
]) {
  const all = [workspace, preview, startSession, teacher, quickAction, report].join('\n');
  requireText(all, `data-tour="${target}"`, target);
}

for (const signal of ['lesson-created', 'lesson-revised', 'activity-revised', 'session-created', 'teams-created', 'live-started', 'live-ended']) {
  requireText(guide, `signal: '${signal}'`, `guide signal step ${signal}`);
  requireText([workspace, startSession, teacher].join('\n'), `'${signal}'`, `guide signal emitter ${signal}`);
}

requireText(state, 'syllonaut_guide_v1:', 'per-user persisted guide state');
requireText(state, 'satisfiedSteps', 'persisted satisfied guide steps');
requireText(state, 'restartSyllonautGuideForCurrentContext', 'manual contextual restart');
requireText(helpButton, 'startSyllonautGuide(userId, chapter, step)', 'contextual help launcher');
for (const source of [workspace, startSession, teacher, quickAction, report]) {
  requireText(source, 'GuideHelpButton', 'contextual guide help placement');
}
requireText(sessionPage, 'TeacherScoreboardQuickAction sessionId={id} userId={userId}', 'presenter help user scope');
requireText(sessionPage, 'SessionReport sessionId={id} userId={userId}', 'evaluation help user scope');
requireText(guide, 'const retreat = useCallback', 'back navigation within the current chapter');
requireText(guide, 'state.satisfiedSteps.includes(currentStepKey)', 'manual next for already satisfied steps');
requireText(guide, 'advance(false)', 'optional missing target must skip without marking the action complete');
requireText(accountMenu, 'Průvodce Syllonautem', 'manual guide menu item');
requireText(guide, 'role="dialog"', 'guide dialog semantics');
requireText(guide, 'aria-label={english ? \'Close guide\' : \'Zavřít průvodce\'}', 'accessible close control');
requireText(css, '.syllonaut-guide-shade', 'guide overlay styling');
requireText(css, '.syllonaut-guide-spotlight', 'guide spotlight styling');
requireText(css, '.syllonaut-guide-back', 'back button styling');
requireText(css, '.syllonaut-guide-help', 'contextual help styling');
requireText(workspace, '<form data-tour="lesson-create-form"', 'first guide step must expose the complete lesson form');
requireText(guide, "target: 'lesson-create-form'", 'first guide step must spotlight the complete lesson form');
requireText(lessonPage, 'userId={userId}', 'user-scoped lesson start guide state');

console.log('onboarding guide regression checks passed');
