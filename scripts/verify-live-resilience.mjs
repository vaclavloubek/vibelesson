import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Live resilience regression: ${message}`);
}

const [
  timeout,
  resume,
  teacher,
  presenter,
  worker,
  liveControlRoute,
  gradingWorker,
  liveControlClient,
  authControls,
  clearResumeRoute,
  teacherPage,
  presenterPage,
  serviceWorker,
  liveIdentifiers,
  presenterStyles,
  studentSession,
] = await Promise.all([
  source('lib/fetch-with-timeout.ts'),
  source('lib/live-resume.ts'),
  source('components/TeacherSession.tsx'),
  source('components/PresenterMode.tsx'),
  source('cloudflare/live-control/src/index.ts'),
  source('app/api/sessions/[id]/live-control/route.ts'),
  source('lib/neon/grading-outbox-worker.ts'),
  source('lib/live-control-client.ts'),
  source('components/AuthControls.tsx'),
  source('app/api/auth/clear-live-resume/route.ts'),
  source('app/sessions/[id]/page.tsx'),
  source('app/sessions/[id]/presenter/page.tsx'),
  source('public/sw.js'),
  source('lib/live-identifiers.ts'),
  source('components/PresenterSession.module.css'),
  source('components/StudentSession.tsx'),
]);

requirePattern(timeout, /class FetchTimeoutError/, 'raw AbortError must be normalized before reaching live UI.');
requirePattern(liveIdentifiers, /randomInt\(JOIN_ALPHABET\.length\)/, 'join code generation must sample only valid alphabet indexes.');
requirePattern(presenterStyles, /grid-template-columns:\s*minmax\(220px, 340px\) minmax\(0, 1fr\)/, 'Presenter lobby join panel must allow the details column to shrink safely.');
requirePattern(presenterStyles, /\.joinCode[^}]*white-space:\s*nowrap/s, 'Presenter lesson code must stay on one line.');
requirePattern(presenterStyles, /\.joinLink[^}]*white-space:\s*nowrap/s, 'Presenter join address must stay on one line.');
requirePattern(presenterStyles, /\.joinLink[^}]*font-size:\s*clamp\(18px, 1\.45vw, 26px\)/s, 'Presenter join address must use the bounded projector-safe scale.');
if (/\.joinLink[^}]*overflow-wrap:\s*anywhere/s.test(presenterStyles)) {
  throw new Error('Live resilience regression: Presenter join address must not break inside /join.');
}
requirePattern(presenterStyles, /font-size:\s*clamp\(44px, 4\.2vw, 72px\)/, 'Presenter lesson code must use the bounded projector-safe scale.');
requirePattern(presenterStyles, /@media \(max-width:\s*1200px\)[\s\S]*\.joinPanel \{ grid-template-columns: 1fr;/, 'Presenter join card must stack QR and details on narrower projection layouts.');
if (/byte\s*&\s*31/.test(liveIdentifiers)) {
  throw new Error('Live resilience regression: join code generation must not use a 32-value bitmask with the 31-character alphabet.');
}
requirePattern(resume, /httpOnly:\s*true/, 'teacher live resume cookie must remain HttpOnly.');
requirePattern(resume, /secure:\s*true/, 'teacher live resume cookie must remain Secure.');
requirePattern(resume, /TOKEN_NAMESPACE = 'syllonaut-live-resume-v1'/, 'resume HMAC must remain domain-separated.');
requirePattern(liveControlRoute, /if \(authError && resume\)/, 'live-control resume fallback must require a primary auth failure.');
requirePattern(teacherPage, /if \(!authFailure \|\| !resume\) redirect\((?:'\/'|\`\/\$\{locale\}\`)\)/, 'teacher resume must not bypass a clean signed-out state.');
requirePattern(presenterPage, /if \(!authError \|\| !resume\) redirect\((?:'\/'|\`\/\$\{locale\}\`)\)/, 'Presenter resume must not bypass a clean signed-out state.');
requirePattern(serviceWorker, /response\.redirected/, 'live navigation cache must reject redirected responses.');
requirePattern(serviceWorker, /responseUrl\.pathname === requestUrl\.pathname/, 'live navigation cache must only store the requested live route.');
requirePattern(serviceWorker, /CACHE_NAME = 'syllonaut-live-shell-v2'/, 'live shell cache epoch must invalidate pre-hardening cache entries.');
requirePattern(authControls, /\/api\/auth\/clear-live-resume/, 'explicit teacher logout must clear live recovery tickets.');
requirePattern(clearResumeRoute, /clearAllLiveResumeCookies\(\)/, 'logout cleanup endpoint must clear every live recovery ticket.');
requirePattern(liveControlRoute, /setLiveResumeCookie\(id, userId\)/, 'healthy ownership verification must mint a live resume ticket.');
if (/localStorage/.test(liveControlClient)) {
  throw new Error('Live resilience regression: live bearer capabilities must not persist in localStorage.');
}
requirePattern(teacher, /Promise\.any\(\[primary, fallback\]\)/, 'teacher commands must race primary and fallback paths.');
requirePattern(teacher, /const operationId = crypto\.randomUUID\(\)/, 'teacher primary/fallback paths must share an idempotency key.');
requirePattern(teacher, /Ukončit bez spuštění/, 'teacher lobby must offer an explicit exit without starting the lesson.');
requirePattern(teacher, /session\?\.status === 'lobby'[\s\S]*End this prepared lesson without starting it\?/, 'lobby exit must use a dedicated confirmation message.');
requirePattern(teacher, /if \(current\.status !== 'live'\) return;[\s\S]*trackEvent\('live_session_ended'/, 'ending an unstarted lobby must not count as a completed live lesson.');
requirePattern(worker, /expectedActiveBlockId && expectedActiveBlockId !== snapshot\.activeBlockId/, 'fallback navigation must reject stale teacher commands.');
requirePattern(worker, /type Role = 'teacher' \| 'student' \| 'presenter'/, 'Worker must support a dedicated Presenter capability role.');
requirePattern(worker, /actorRole === 'presenter'\) return json\(\{ error: 'Forbidden\.' \}, 403\)/, 'Presenter capability must be unable to write live events.');
requirePattern(worker, /workerVersion: WORKER_VERSION/, 'Worker health must expose its deployable version.');
requirePattern(worker, /timer: idleTimerFor\(first\)/, 'starting a lesson on a timer block must give the Worker snapshot the full idle duration, not null (0:00 after reconciliation).');
requirePattern(worker, /timer: idleTimerFor\(target\)/, 'moving to a timer block must give the Worker snapshot the full idle duration, not null (0:00 after reconciliation).');
// The browser fallback must be allowed to reach the Worker (CSP connect-src), over HTTPS and WebSocket.
{
  const nextConfig = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
  requirePattern(nextConfig, /const LIVE_CONTROL_HOST = 'syllonaut-live-control\.vaclav-loubek\.workers\.dev';/, 'CSP must name the Live Control Worker host.');
  requirePattern(nextConfig, /const connectSources = \[[\s\S]*`https:\/\/\$\{LIVE_CONTROL_HOST\}`[\s\S]*`wss:\/\/\$\{LIVE_CONTROL_HOST\}`[\s\S]*\];/, 'CSP connect-src must allow the Live Control Worker over https and wss.');
}
requirePattern(worker, /protocolVersion: LIVE_PROTOCOL_VERSION/, 'Worker health must expose its live protocol version.');
requirePattern(studentSession, /connectLiveControl\(sessionId, 'student', \(\) => \{\s*void refreshFromLiveControl\('push'\)/, 'student WebSocket wake-ups must use the silent push path, not the fallback path.');
requirePattern(studentSession, /if \(source === 'fallback'\) \{\s*disconnectedRef\.current = true;\s*setConnectionStatus\('reconnecting'\);/, 'only a failed primary API may switch the student page to reconnecting; a push wake-up must not insert the banner above the task.');
requirePattern(studentSession, /myTeamResponse: teamResponse\s*\?\s*\{[^}]*submittedText: teamResponse\.submittedText/, 'student fallback team answer must carry submittedText so an edited draft is not shown as submitted.');
if (/myTeamResponse: teamResponse\s*\?\s*\{[^}]*submitted: Boolean\(teamResponse\.submitted\)/.test(studentSession)) {
  throw new Error('Live resilience regression: the sticky snapshot submitted flag must not mark an edited team draft as submitted.');
}
requirePattern(presenter, /fetchLiveControlState\(sessionId, 'presenter'\)/, 'Presenter must use a dedicated read-only Cloudflare capability.');
requirePattern(presenter, /live-control\?role=presenter/, 'Presenter capability acquisition must explicitly request the presenter role.');
requirePattern(liveControlRoute, /requestedRole\(req\)/, 'live-control capability route must derive the requested read role.');
requirePattern(liveControlRoute, /searchParams\.get\('role'\) === 'presenter' \? 'presenter' : 'teacher'/, 'live-control route must restrict browser roles to teacher or presenter.');
requirePattern(presenter, /connectLiveControl\(sessionId, 'presenter', \(\) => \{\s*void loadFallback\('push'\)/, 'Presenter WebSocket wake-ups must use the push path, not the backup-connection path.');
requirePattern(presenter, /if \(source === 'fallback'\) setConnectionMode\('fallback'\)/, 'only a failed primary presenter API may switch the projector to the backup connection label.');
requirePattern(presenter, /connectionMode === 'fallback'/, 'Presenter must expose degraded connection state.');
requirePattern(gradingWorker, /claim_next_grading_outbox_job/, 'AI grading must have a server-driven capability claim path.');
requirePattern(gradingWorker, /finish_grading_job/, 'server-driven AI grading must finish through the scoped capability.');
requirePattern(gradingWorker, /fail_grading_job/, 'server-driven AI grading must fail closed through the scoped capability.');

{
  // A blur caused by clicking "Submit team answer" must not release the edit
  // lock between the submit's lock claim and its write (DB trigger
  // enforce_team_response_edit_lock would reject the submit with 500).
  const teamTask = await source('components/TeamTaskResponseInput.tsx');
  requirePattern(teamTask, /if \(!lockRef\.current\?\.mine \|\| submittingRef\.current\) return;/, 'team editor must not release its lock while a submit is running.');
  requirePattern(teamTask, /submittingRef\.current = true;\s*try \{\s*await submitClaimedAnswer\(value\);/, 'team submit must mark itself synchronously before the first await.');
  requirePattern(teamTask, /if \(releasePromiseRef\.current\) await releasePromiseRef\.current;/, 'team submit must wait for an in-flight lock release before claiming the lock.');
  requirePattern(teamTask, /submittingRef\.current = false;\s*if \(!focusedRef\.current\) void releaseLock\(\);/, 'team editor must release the lock after submit when the field is no longer focused.');
  requirePattern(teamTask, /debounceRef\.current = null;\s*\}\s*(?:\/\/[^\n]*\n\s*)*if \(submittingRef\.current\) return;\s*if \(savePromiseRef\.current\)/, 'handleBlur must not save or release while a submit is running.');
  requirePattern(teamTask, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}\s*onMouseDown=\{\(event\) => event\.preventDefault\(\)\}\s*onClick=\{\(\) => \{ void submitAnswer\(\); \}\}/, 'the submit button must keep focus in the field on pointer and mouse down.');

  // Even with the client guard, the server must not let a release land
  // between the lock claim and the team answer write: both run in one
  // transaction, a lost lock is retried once and then answered with 409.
  // Race reproducer (temporary Neon branch): scripts/neon/reproduce-team-edit-submit-race.mjs.
  const teamEditServer = await source('lib/neon/team-edit-server.ts');
  requirePattern(teamEditServer, /await sql\.transaction\(\[\s*claimLockQuery\(sql, context, sessionId\),\s*write\(sql\),\s*\]\)/, 'team answer writes must claim the lock in the same transaction.');
  requirePattern(teamEditServer, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/, 'a lost team edit lock must be retried exactly once.');
  requirePattern(teamEditServer, /if \(!errorMessage\(error\)\.includes\(LOCK_LOST_ERROR\)\) throw error;/, 'only team_response_active_edit_lock_required may be retried.');
  for (const action of ['save', 'submit']) {
    const body = teamEditServer.slice(teamEditServer.indexOf(`async function ${action}(`));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    requirePattern(fn, /claimLockAndWrite\(context, sessionId,/, `team edit ${action} must write through claimLockAndWrite.`);
    requirePattern(fn, /where \$\{heldLockCondition\(sql, context, sessionId\)\}/, `team edit ${action} must guard its write by the held lock.`);
    requirePattern(fn, /written\.outcome === 'lost'\) return json\(\{ error: 'Editor se mezitím uvolnil, [^']+', lock \}, 409\)/, `team edit ${action} must answer a lost lock with 409, not 500.`);
    if (/await claimLock\(/.test(fn)) throw new Error(`Live resilience regression: team edit ${action} must not claim the lock outside the write transaction.`);
  }
  requirePattern(teamEditServer, /'Editor se mezitím uvolnil, zkus odevzdat znovu\.'/, 'submit must tell the student to submit again after a lost lock.');
}

console.log('Live resilience source checks passed.');
