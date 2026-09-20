import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error('Missing generation completion safeguard: ' + label);
  }
};
const forbidText = (content, needle, label) => {
  if (content.includes(needle)) {
    throw new Error('Unsafe generation completion path remains: ' + label);
  }
};

const migration = read('supabase/migrations/20260920115314_lock_generation_completion_server_side.sql');
for (const [needle, label] of [
  ['finish_generation_request_server', 'service-only completion RPC'],
  ['p_user_id uuid', 'server completion binds explicit user id'],
  ["and user_id = p_user_id", 'completion is scoped to reservation owner'],
  ["and status = 'pending'", 'completion is one-way from pending only'],
  ['complete_free_device_budget_request', 'account and device reservation complete together'],
  ['grant execute on function public.finish_generation_request_server', 'service-role grant exists'],
  ['to service_role', 'service-role is the completion authority'],
  ['revoke all on function public.finish_generation_request(uuid,text,numeric,uuid)', 'legacy client completion is revoked'],
  ['from public, anon, authenticated, service_role', 'legacy completion is closed to API roles'],
]) requireText(migration, needle, label);

for (const route of [
  'app/api/generate/route.ts',
  'app/api/revise/route.ts',
  'app/api/revise-block/route.ts',
]) {
  const source = read(route);
  requireText(source, "admin.rpc('finish_generation_request_server'", route + ' uses service-role completion');
  requireText(source, 'p_user_id: userId', route + ' binds completion to authenticated user');
  forbidText(source, "supabase.rpc('finish_generation_request'", route + ' still exposes user-client completion');
}

console.log('Server-only generation completion safeguards verified.');
