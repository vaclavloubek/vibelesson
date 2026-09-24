// Reproducer for the team answer submit/release race (production 2026-09-24:
// POST /team-edit action=submit → 500 team_response_active_edit_lock_required,
// with a release from the same device 6–17 ms later).
//
// Runs the real lib/neon/team-edit-server.ts (Node type stripping, no build)
// against a TEMPORARY Neon branch — never production: it rewrites the fixture
// session to live and writes team answers. The fixture participant must hold
// a known token (participant_token_hash = sha256(token)).
//
// Each round claims the lock (the focused editor holds it), then sends submit
// and, after a delay of 0–60 ms, release, the way handleBlur did. A 500 is
// the bug; 409 "Editor se mezitím uvolnil" is the handled outcome.
//
//   TEAM_EDIT_RACE_TEMP_BRANCH=yes NEON_DATABASE_URL=... \
//   TEAM_EDIT_RACE_SESSION_ID=... TEAM_EDIT_RACE_BLOCK_ID=... TEAM_EDIT_RACE_TOKEN=... \
//   node scripts/neon/reproduce-team-edit-submit-race.mjs [--module <path to team-edit-server.ts>] [--rounds 40]
//
// Exit code 1 when any submit ended with 500.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const modulePath = resolvePath(option('--module', `${repoRoot}lib/neon/team-edit-server.ts`));
const rounds = Number(option('--rounds', '40'));

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};
if (process.env.TEAM_EDIT_RACE_TEMP_BRANCH !== 'yes') {
  throw new Error('Set TEAM_EDIT_RACE_TEMP_BRANCH=yes to confirm NEON_DATABASE_URL points to a temporary Neon branch.');
}
env('NEON_DATABASE_URL');
const sessionId = env('TEAM_EDIT_RACE_SESSION_ID');
const blockId = env('TEAM_EDIT_RACE_BLOCK_ID');
const participantToken = env('TEAM_EDIT_RACE_TOKEN');
// Only read to satisfy requireNeonServerConfig(); the team editor never calls them.
process.env.NEON_AUTH_BASE_URL ??= 'https://auth.invalid';
process.env.NEON_DATA_API_URL ??= 'https://data-api.invalid';

const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return stub('export {};');
    if (specifier === '@/lib/neon/grading-outbox-worker') return stub('export function scheduleNeonGradingDrain() {}');
    if (specifier.startsWith('@/')) {
      const base = `${repoRoot}${specifier.slice(2)}`;
      const file = ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find(existsSync);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { handleNeonTeamEditAction } = await import(pathToFileURL(modulePath).href);

async function action(name, extra = {}) {
  const response = await handleNeonTeamEditAction({ action: name, sessionId, blockId, participantToken, ...extra });
  return { status: response.status, body: await response.json() };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const counts = { ok: 0, handled409: 0, other409: 0, error500: 0, other: 0 };

for (let round = 0; round < rounds; round += 1) {
  const releaseDelayMs = Math.round((round % 13) * 5);
  const claimed = await action('claim');
  if (!claimed.body.acquired) throw new Error(`Fixture lock is held by someone else: ${JSON.stringify(claimed.body)}`);

  const [submitted] = await Promise.all([
    action('submit', { text: `Reproducer round ${round}: souběh odevzdání a uvolnění zámku.` }),
    wait(releaseDelayMs).then(() => action('release')),
  ]);
  if (submitted.status === 200 && submitted.body.submitted) counts.ok += 1;
  else if (submitted.status === 409 && String(submitted.body.error).includes('mezitím uvolnil')) counts.handled409 += 1;
  else if (submitted.status === 409) counts.other409 += 1;
  else if (submitted.status === 500) counts.error500 += 1;
  else counts.other += 1;
  if (submitted.status !== 200) console.log(`round ${round} (release +${releaseDelayMs} ms): ${submitted.status} ${submitted.body.error}`);
}

console.log(`module: ${modulePath}`);
console.log(`rounds: ${rounds}`, counts);
if (counts.error500 > 0) {
  console.error('Reproduced: submit failed with 500 while a release raced it.');
  process.exit(1);
}
console.log('No submit ended with 500.');
