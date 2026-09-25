import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing Free session lifetime safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const lifetime = migrations.find(({ content }) => content.includes('create or replace function private.enforce_free_session_join_window()'));
if (!lifetime) throw new Error('Missing Free session lifetime migration.');

for (const [needle, label] of [
  ["interval '120 minutes'", '120-minute new-participant join window'],
  ["interval '6 hours'", 'six-hour hard session lifetime'],
  ["raise exception 'free_session_join_window_closed'", 'database join-window enforcement'],
  ["raise exception 'free_session_expired'", 'database hard-lifetime enforcement'],
  ["raise exception 'session_reopen_forbidden'", 'ended sessions are terminal'],
  ['responses_enforce_free_session_lifetime', 'individual responses are hard-lifetime gated'],
  ['team_responses_enforce_free_session_lifetime', 'team responses are hard-lifetime gated'],
  ['team_edit_locks_enforce_free_session_lifetime', 'team editing is hard-lifetime gated'],
  ['sessions_enforce_lifecycle', 'teacher live-control writes are hard-lifetime gated'],
  ["'syllonaut-free-session-expiry'", 'expired Free sessions are automatically ended'],
]) {
  requireText(lifetime.content, needle, label);
}

const studentSession = read('lib/neon/student-session-server.ts');
requireText(studentSession, 'free_session_join_window_closed', 'student join maps the Free join-window error');
requireText(studentSession, 'free_session_expired', 'student writes map the Free hard-expiry error');

const teacherRoute = read('app/api/sessions/[id]/route.ts');
requireText(teacherRoute, 'free_session_expired', 'teacher controls map the Free hard-expiry error');

console.log(`Free session lifetime safeguards verified via ${lifetime.name}.`);
