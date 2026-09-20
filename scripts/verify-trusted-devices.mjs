import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing trusted-device safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const migration = migrations.find(({ content }) => content.includes('private.user_trusted_devices'));
const allMigrationText = migrations.map(({ content }) => content).join('\n');
if (!migration) throw new Error('Missing trusted-device migration.');

for (const [needle, label] of [
  ["p.active_plan_code in ('teacher', 'teacher_pro')", 'individual paid plans are scoped'],
  ["p.role <> 'admin'", 'internal admins are exempt'],
  ["m.status = 'active'", 'active school membership exemption'],
  ["v_active_count >= 3", 'three simultaneously trusted devices'],
  ["v_new_30d >= 5", 'five genuinely new devices per rolling 30 days'],
  ["interval '30 days'", 'rolling 30-day window'],
  ["v_existing.revoked_at is null", 'returning known devices are recognized'],
  ['revoke_personal_trusted_device', 'self-service device revocation'],
]) requireText(migration.content, needle, label);

const proxy = read('proxy.ts');
requireText(proxy, 'TRUSTED_DEVICE_COOKIE', 'proxy issues the HttpOnly device cookie');
requireText(proxy, 'httpOnly: true', 'device token is inaccessible to browser JavaScript');

const header = read('components/PublicHeaderAccountMenu.tsx');
requireText(header, '/api/auth/devices/register', 'signed-in browser bootstraps device registration');

for (const [file, label] of [
  ['app/api/generate/route.ts', 'AI generation'],
  ['app/api/revise/route.ts', 'whole-lesson AI revision'],
  ['app/api/revise-block/route.ts', 'block AI revision'],
  ['app/api/sessions/route.ts', 'live session start'],
  ['app/api/lessons/[id]/worksheet-pdf/route.ts', 'worksheet export'],
  ['app/api/lessons/[id]/route.ts', 'lesson mutations'],
  ['app/api/lessons/move/route.ts', 'premium lesson organization'],
  ['app/api/folders/route.ts', 'premium folder creation'],
  ['app/api/folders/[id]/route.ts', 'premium folder management'],
]) {
  requireText(read(file), 'requireTrustedDeviceForPaidIndividual', `${label} is server-gated by trusted device`);
}

for (const [needle, label] of [
  ['create_live_session_server', 'live session creation has a server-only RPC'],
  ['personal_trusted_device_hash_valid', 'DB validates active trusted-device hashes'],
  ['requeue_response_evaluation_server', 'AI regrade has a server-only RPC'],
  ["coalesce(p_token_hash ~ '^[0-9a-f]{64}
  ['revoke insert on table public.sessions from authenticated', 'direct authenticated session insert is revoked'],
  ['revoke execute on function public.requeue_response_evaluation_for_teacher(uuid)', 'legacy direct regrade RPC is revoked'],
]) requireText(allMigrationText, needle, label);

const sessionRoute = read('app/api/sessions/route.ts');
requireText(sessionRoute, "admin.rpc('create_live_session_server'", 'live session start uses the server-only DB boundary');
requireText(sessionRoute, 'currentTrustedDeviceHash', 'live session start passes server-read device hash');

const gradeRoute = read('app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts');
requireText(gradeRoute, 'requireTrustedDeviceForPaidIndividual', 'browser-driven AI grading requires trusted device');

const regradeRoute = read('app/api/sessions/[id]/evaluations/[evaluationId]/regrade/route.ts');
requireText(regradeRoute, 'requireTrustedDeviceForPaidIndividual', 'AI regrade requires trusted device');
requireText(regradeRoute, "admin.rpc('requeue_response_evaluation_server'", 'AI regrade uses the server-only DB boundary');

const panel = read('components/TrustedDevicesPanel.tsx');
requireText(panel, 'Aktivní zařízení', 'device management distinguishes active devices');
requireText(panel, 'Nová zařízení za posledních 30 dní', 'rolling device limit is visible');
requireText(panel, 'Neukládáme IP', 'privacy promise is explicit in UI');

console.log(`Trusted-device safeguards verified via ${migration.name}.`);
, false)", 'missing device hashes fail closed'],
  ['revoke insert on table public.sessions from authenticated', 'direct authenticated session insert is revoked'],
  ['revoke execute on function public.requeue_response_evaluation_for_teacher(uuid)', 'legacy direct regrade RPC is revoked'],
]) requireText(allMigrationText, needle, label);

const sessionRoute = read('app/api/sessions/route.ts');
requireText(sessionRoute, "admin.rpc('create_live_session_server'", 'live session start uses the server-only DB boundary');
requireText(sessionRoute, 'currentTrustedDeviceHash', 'live session start passes server-read device hash');

const gradeRoute = read('app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts');
requireText(gradeRoute, 'requireTrustedDeviceForPaidIndividual', 'browser-driven AI grading requires trusted device');

const regradeRoute = read('app/api/sessions/[id]/evaluations/[evaluationId]/regrade/route.ts');
requireText(regradeRoute, 'requireTrustedDeviceForPaidIndividual', 'AI regrade requires trusted device');
requireText(regradeRoute, "admin.rpc('requeue_response_evaluation_server'", 'AI regrade uses the server-only DB boundary');

const panel = read('components/TrustedDevicesPanel.tsx');
requireText(panel, 'Aktivní zařízení', 'device management distinguishes active devices');
requireText(panel, 'Nová zařízení za posledních 30 dní', 'rolling device limit is visible');
requireText(panel, 'Neukládáme IP', 'privacy promise is explicit in UI');

console.log(`Trusted-device safeguards verified via ${migration.name}.`);
