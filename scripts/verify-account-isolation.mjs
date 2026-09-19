import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`SEC-016 regression: ${message}`);
}

function requireBefore(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`SEC-016 regression: ${message}`);
  }
}

const [lessonPage, lessonsIndex, dashboardLogout, workspace, authControls, revise, reviseBlock] = await Promise.all([
  source('app/lessons/[id]/page.tsx'),
  source('app/lessons/page.tsx'),
  source('components/DashboardLogoutButton.tsx'),
  source('components/LessonWorkspace.tsx'),
  source('components/AuthControls.tsx'),
  source('app/api/revise/route.ts'),
  source('app/api/revise-block/route.ts'),
]);

requirePattern(lessonPage, /initialOwnerId=\{userId\}/, 'server-loaded lessons must carry their authenticated owner into the client boundary.');
requirePattern(workspace, /lessonOwnerIdRef = useRef<string \| null>\(initialLesson \? initialOwnerId : null\)/, 'workspace must bind hydrated lesson state to its server owner.');
requirePattern(workspace, /currentLessonOwnerId === nextUserId/, 'workspace must compare lesson owner with every auth identity update.');
requirePattern(workspace, /setLesson\(null\)[\s\S]*setLessonId\(null\)[\s\S]*setUndoLesson\(null\)/, 'account changes must synchronously clear sensitive lesson state.');
requirePattern(workspace, /localStorage\.removeItem\(LAST_LESSON_KEY\)/, 'account changes must purge account-scoped recovery content.');
requirePattern(workspace, /key\?\.startsWith\(REVISION_HIGHLIGHT_KEY_PREFIX\)/, 'account changes must purge lesson-scoped session highlights.');
requirePattern(workspace, /window\.location\.replace\(nextUserId \? '\/lessons' : '\/'\)/, 'account changes must leave the stale lesson route with a hard navigation.');
requirePattern(workspace, /authUser\.id !== initialOwnerId/, 'a server-hydrated lesson must never be re-stamped into recovery storage for another user.');
requirePattern(workspace, /authUserIdRef\.current !== expectedOwnerId/, 'late async lesson responses must be rejected after an account change.');
requirePattern(authControls, /window\.location\.assign\('\/'\)/, 'explicit sign-out must destroy page-local account state with a hard navigation.');
requirePattern(lessonsIndex, /<DashboardLogoutButton\s*\/>/, 'My lessons must expose an explicit sign-out control for every signed-in account.');
requirePattern(dashboardLogout, /supabase\.auth\.signOut\(\)/, 'dashboard logout must terminate the Supabase session.');
requirePattern(dashboardLogout, /window\.location\.assign\(\`\/\$\{locale\}\`\)/, 'dashboard logout must hard-navigate after sign-out.');

for (const [name, route] of [['whole lesson', revise], ['single block', reviseBlock]]) {
  requirePattern(route, /\.from\('lessons'\)[\s\S]*\.select\('lesson'\)[\s\S]*\.eq\('id', lessonId\)[\s\S]*\.eq\('owner_id', userId\)/, `${name} revision must load the authoritative owned lesson.`);
  requireBefore(route, ".eq('owner_id', userId)", "reserve_revision_operation", `${name} ownership must be verified before quota reservation.`);
}

requirePattern(revise, /reviseLesson\(sourceLesson, instruction/, 'whole-lesson AI must receive the authoritative DB lesson.');
requirePattern(reviseBlock, /sourceLesson\.blocks\.find/, 'block AI must select the block from the authoritative DB lesson.');
requirePattern(reviseBlock, /sourceLesson\.blocks\.map/, 'block revision result must be merged into the authoritative DB lesson.');

console.log('SEC-016 account-isolation checks passed.');
