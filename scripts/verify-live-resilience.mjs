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
] = await Promise.all([
  source('lib/fetch-with-timeout.ts'),
  source('lib/live-resume.ts'),
  source('components/TeacherSession.tsx'),
  source('components/PresenterMode.tsx'),
  source('cloudflare/live-control/src/index.ts'),
  source('app/api/sessions/[id]/live-control/route.ts'),
  source('app/api/internal/grading/jobs/route.ts'),
  source('lib/live-control-client.ts'),
  source('components/AuthControls.tsx'),
  source('app/api/auth/clear-live-resume/route.ts'),
  source('app/sessions/[id]/page.tsx'),
  source('app/sessions/[id]/presenter/page.tsx'),
  source('public/sw.js'),
  source('lib/live-identifiers.ts'),
  source('components/PresenterSession.module.css'),
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
requirePattern(presenter, /fetchLiveControlState\(sessionId, 'presenter'\)/, 'Presenter must use a dedicated read-only Cloudflare capability.');
requirePattern(presenter, /live-control\?role=presenter/, 'Presenter capability acquisition must explicitly request the presenter role.');
requirePattern(liveControlRoute, /requestedRole\(req\)/, 'live-control capability route must derive the requested read role.');
requirePattern(liveControlRoute, /searchParams\.get\('role'\) === 'presenter' \? 'presenter' : 'teacher'/, 'live-control route must restrict browser roles to teacher or presenter.');
requirePattern(presenter, /connectionMode === 'fallback'/, 'Presenter must expose degraded connection state.');
requirePattern(gradingWorker, /claim_grading_job/, 'AI grading must have a server-driven capability claim path.');
requirePattern(gradingWorker, /finish_grading_job/, 'server-driven AI grading must finish through the scoped capability.');
requirePattern(gradingWorker, /fail_grading_job/, 'server-driven AI grading must fail closed through the scoped capability.');

console.log('Live resilience source checks passed.');
