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
] = await Promise.all([
  source('lib/fetch-with-timeout.ts'),
  source('lib/live-resume.ts'),
  source('components/TeacherSession.tsx'),
  source('components/PresenterMode.tsx'),
  source('cloudflare/live-control/src/index.ts'),
  source('app/api/sessions/[id]/live-control/route.ts'),
  source('app/api/internal/grading/jobs/route.ts'),
  source('lib/live-control-client.ts'),
]);

requirePattern(timeout, /class FetchTimeoutError/, 'raw AbortError must be normalized before reaching live UI.');
requirePattern(resume, /httpOnly:\s*true/, 'teacher live resume cookie must remain HttpOnly.');
requirePattern(resume, /secure:\s*true/, 'teacher live resume cookie must remain Secure.');
requirePattern(resume, /TOKEN_NAMESPACE = 'syllonaut-live-resume-v1'/, 'resume HMAC must remain domain-separated.');
requirePattern(liveControlRoute, /if \(authError && resume\)/, 'resume fallback must require a real primary auth failure.');
requirePattern(liveControlRoute, /setLiveResumeCookie\(id, userId\)/, 'healthy ownership verification must mint a live resume ticket.');
if (/localStorage/.test(liveControlClient)) {
  throw new Error('Live resilience regression: live bearer capabilities must not persist in localStorage.');
}
requirePattern(teacher, /Promise\.any\(\[primary, fallback\]\)/, 'teacher commands must race primary and fallback paths.');
requirePattern(teacher, /const operationId = crypto\.randomUUID\(\)/, 'teacher primary/fallback paths must share an idempotency key.');
requirePattern(worker, /expectedActiveBlockId && expectedActiveBlockId !== snapshot\.activeBlockId/, 'fallback navigation must reject stale teacher commands.');
requirePattern(presenter, /fetchLiveControlState\(sessionId, 'teacher'\)/, 'Presenter must retain a direct Cloudflare snapshot fallback.');
requirePattern(presenter, /connectionMode === 'fallback'/, 'Presenter must expose degraded connection state.');
requirePattern(gradingWorker, /claim_grading_job/, 'AI grading must have a server-driven capability claim path.');
requirePattern(gradingWorker, /finish_grading_job/, 'server-driven AI grading must finish through the scoped capability.');
requirePattern(gradingWorker, /fail_grading_job/, 'server-driven AI grading must fail closed through the scoped capability.');

console.log('Live resilience source checks passed.');
