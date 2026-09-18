import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Live resilience regression: ${message}`);
}

const [liveServer, teacherRoute, studentSession, studentResponse, teamResponse, layout, sw, offline] = await Promise.all([
  source('lib/live-server.ts'),
  source('app/api/sessions/[id]/route.ts'),
  source('components/StudentSession.tsx'),
  source('components/StudentResponseInput.tsx'),
  source('components/TeamTaskResponseInput.tsx'),
  source('app/layout.tsx'),
  source('public/sw.js'),
  source('lib/live-offline.ts'),
]);

requirePattern(liveServer, /AbortController/, 'Realtime broadcast must keep a hard timeout.');
requirePattern(teacherRoute, /after\(async \(\) =>/, 'Realtime invalidation must not block teacher state writes.');
requirePattern(studentSession, /refreshInFlightRef/, 'student refreshes must remain single-flight.');
requirePattern(studentSession, /loadLiveSnapshot/, 'student session lost its last-known-state fallback.');
requirePattern(studentSession, /flushLiveOutbox/, 'student session lost automatic outbox synchronization.');
requirePattern(studentResponse, /queueLiveRequest/, 'student answers are no longer persisted to the local outbox on network failure.');
requirePattern(teamResponse, /saveLiveDraft/, 'team drafts are no longer durably stored locally.');
requirePattern(layout, /<ServiceWorkerRegistration\s*\/>/, 'service worker registration is missing.');
requirePattern(sw, /url\.pathname\.startsWith\('\/student\/'\)/, 'service worker no longer protects the live student shell.');
requirePattern(offline, /indexedDB\.open/, 'IndexedDB persistence layer is missing.');

console.log('Live resilience source checks passed.');
