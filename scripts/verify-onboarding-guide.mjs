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
const presenterHandoff = read('components/PresenterGuideHandoff.tsx');
const presenterMode = read('components/PresenterMode.tsx');
const presenterPage = read('app/sessions/[id]/presenter/page.tsx');
const sessionPage = read('app/sessions/[id]/page.tsx');
const css = read('app/globals.css');

for (const target of [
  'lesson-create-form',
  'lesson-create-submit',
  'lesson-review',
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

requireText(state, 'syllonaut_guide_v3:', 'current per-user persisted guide state');
requireText(state, 'syllonaut_guide_v2:', 'v2 guide state migration source');
requireText(state, 'syllonaut_guide_v1:', 'v1 guide state migration source');
requireText(state, 'version: 3', 'guide state schema v3');
requireText(state, 'migrateV2State', 'v2 guide state migration');
requireText(state, 'migrateV1State', 'v1 guide state migration');
requireText(state, 'V2_LIVE_STEP_TO_V3 = [2, 3, 0, 1, 4, 5, 6]', 'live step order migration');
requireText(state, 'step = SYLLONAUT_LESSON_REVIEW_STEP', 'legacy running lesson resumes at review step');
requireText(state, 'satisfiedSteps', 'persisted satisfied guide steps');
requireText(state, 'restartSyllonautGuideForCurrentContext', 'manual contextual restart');
requireText(state, 'BroadcastChannel(SYLLONAUT_GUIDE_CHANNEL)', 'cross-window guide BroadcastChannel');
requireText(state, "window.addEventListener('storage', onStorage)", 'cross-window guide storage fallback');
requireText(state, 'subscribeSyllonautGuideState', 'shared guide-state subscription helper');
requireText(guide, 'subscribeSyllonautGuideState(userId, setState)', 'teacher window listens for Presenter guide state');
requireText(presenterHandoff, "state.chapter !== 'live' || state.step !== 1", 'Presenter handoff only appears on live step 2/7');
requireText(presenterHandoff, 'step: 2', 'Presenter handoff advances shared guide to live step 3/7');
requireText(presenterHandoff, 'Hotovo – pokračovat', 'Presenter handoff confirmation CTA');
requireText(presenterMode, '<PresenterGuideHandoff userId={userId} />', 'Presenter renders handoff guide');
requireText(presenterPage, '<PresenterMode sessionId={id} userId={resume.userId} />', 'resume Presenter gets teacher user scope');
requireText(presenterPage, '<PresenterMode sessionId={id} userId={userId} />', 'authenticated Presenter gets teacher user scope');
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
requireText(workspace, 'data-tour="lesson-review"', 'generated lesson review target');
requireText(guide, "target: 'lesson-review'", 'review step before whole-lesson editing');
requireText(guide, "button: { cs: 'Lekci jsem prošel', en: 'I reviewed the lesson' }", 'explicit review confirmation');
requireText(guide, "button: { cs: 'Bez úpravy pokračovat', en: 'Continue without editing' }", 'optional whole-lesson edit skip');
requireText(guide, "button: { cs: 'Pokračovat bez úpravy', en: 'Continue without editing' }", 'optional single-activity edit skip');
requireText(guide, "signal: 'lesson-revised'", 'whole-lesson edit still advances after successful revision');
requireText(guide, "custom.detail.action === 'lesson-created' && state.chapter === 'lesson'", 'lesson creation deterministically enters review step');
requireText(guide, 'step: SYLLONAUT_LESSON_REVIEW_STEP', 'lesson creation review destination');
requireText(guide, "if (!step?.signal || custom.detail.action !== step.signal) return;", 'manual optional action can still listen for success signal');
requireText(workspace, 'chapter="lesson" step={3} labelCs="Jak upravit celou lekci"', 'whole-edit contextual help step index');
requireText(startSession, 'chapter="lesson" step={6} labelCs="Jak spustit hodinu"', 'start-session contextual help step index');
requireText(quickAction, 'chapter="live" step={0} labelCs="Jak promítat studentům"', 'Presenter contextual help must start Chapter 2');
requireText(teacher, 'chapter="live" step={2} labelCs="Jak se připojují studenti"', 'student-join contextual help step index');
requireText(teacher, 'chapter="live" step={3} labelCs="Jak vytvořit týmy"', 'team contextual help step index');
requireText(state, "startSyllonautGuide(userId, 'live', 5);", 'live contextual restart must start at live controls');
const liveStepsStart = guide.indexOf('const liveSteps: GuideStep[] = [');
const presenterStep = guide.indexOf("target: 'live-presenter'", liveStepsStart);
const joinStep = guide.indexOf("target: 'live-join'", liveStepsStart);
const teamStep = guide.indexOf("target: 'live-team-create'", liveStepsStart);
if (!(liveStepsStart >= 0 && presenterStep > liveStepsStart && joinStep > presenterStep && teamStep > joinStep)) {
  throw new Error('onboarding guide regression: Chapter 2 must explain Presenter mode before student joining and teams');
}
requireText(lessonPage, 'userId={userId}', 'user-scoped lesson start guide state');

console.log('onboarding guide regression checks passed');
