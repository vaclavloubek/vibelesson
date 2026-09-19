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
const css = read('app/globals.css');

for (const target of [
  'lesson-create-brief',
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

for (const signal of ['lesson-created', 'session-created', 'teams-created', 'live-started']) {
  requireText(guide, `signal: '${signal}'`, `guide signal step ${signal}`);
  requireText([workspace, startSession, teacher].join('\n'), `'${signal}'`, `guide signal emitter ${signal}`);
}

requireText(state, 'syllonaut_guide_v1:', 'per-user persisted guide state');
requireText(state, 'restartSyllonautGuideForCurrentContext', 'manual contextual restart');
requireText(accountMenu, 'Průvodce Syllonautem', 'manual guide menu item');
requireText(guide, 'role="dialog"', 'guide dialog semantics');
requireText(guide, 'aria-label={english ? \'Close guide\' : \'Zavřít průvodce\'}', 'accessible close control');
requireText(css, '.syllonaut-guide-shade', 'guide overlay styling');
requireText(css, '.syllonaut-guide-spotlight', 'guide spotlight styling');
requireText(lessonPage, 'userId={userId}', 'user-scoped lesson start guide state');

console.log('onboarding guide regression checks passed');
