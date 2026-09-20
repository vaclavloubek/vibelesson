import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing school-device safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['private.organization_member_trusted_devices', 'separate school-member device ledger'],
  ["'maxActive', 5", 'five active school devices'],
  ["'maxNewIn30Days', 10", 'ten new school devices per rolling 30 days'],
  ["interval '30 days'", 'rolling school device window'],
  ['admin_revoked_at', 'admin reset permanently retires old device token'],
  ["'trusted_device_reset_required'", 'admin-reset token cannot silently reactivate'],
  ['reset_organization_member_devices_server', 'school manager reset RPC'],
  ['get_organization_member_device_usage_server', 'school manager usage summary RPC'],
  ['private.trusted_device_hash_valid', 'unified DB validator'],
]) requireText(migrations, needle, label);

const enforcement = read('supabase/migrations/20260920073000_enforce_organization_trusted_devices.sql');
requireText(enforcement, 'private.trusted_device_hash_valid', 'live/regrade DB boundary uses unified validator');
requireText(enforcement, 'create_live_session_server', 'live session server boundary updated');
requireText(enforcement, 'requeue_response_evaluation_server', 'AI regrade server boundary updated');

const repair = read('supabase/migrations/20260920073500_repair_organization_trusted_device_db_boundary.sql');
requireText(repair, 'private.trusted_device_hash_valid', 'production DB-boundary drift repair uses unified validator');
requireText(repair, 'create_live_session_server', 'production live-session boundary is explicitly repaired');
requireText(repair, 'requeue_response_evaluation_server', 'production regrade boundary is explicitly repaired');

const helper = read('lib/trusted-device-access.ts');
for (const needle of [
  'register_trusted_device_server',
  'requireTrustedDeviceForPaidAccess',
  "scope === 'organization'",
  'trusted_device_reset_required',
]) requireText(helper, needle, 'unified trusted-device helper: ' + needle);

const registerRoute = read('app/api/auth/devices/register/route.ts');
for (const needle of [
  'trusted_device_reset_required',
  'createTrustedDeviceToken',
  'httpOnly: true',
  'trusted_device_token_rotated',
]) requireText(registerRoute, needle, 'school reset token rotation: ' + needle);

const deviceRoute = read('app/api/auth/devices/route.ts');
requireText(deviceRoute, 'list_trusted_devices_server', 'self-service lists school devices');
requireText(deviceRoute, 'revoke_trusted_device_server', 'self-service revokes school devices');

const currentOrg = read('app/api/organizations/current/route.ts');
requireText(currentOrg, 'get_organization_member_device_usage_server', 'school manager sees member device counts');

const resetRoute = read('app/api/organizations/members/[userId]/devices/route.ts');
for (const needle of [
  'canManageOrganization',
  'reset_organization_member_devices_server',
  'p_member_user_id',
]) requireText(resetRoute, needle, 'school manager reset endpoint: ' + needle);

const schoolAdmin = read('components/SchoolAdmin.tsx');
for (const needle of [
  'TrustedDevicesPanel',
  'Resetovat zařízení',
  'Historie nových zařízení za 30 dní zůstala zachovaná',
  'member.devices.activeCount',
  'member.devices.newIn30Days',
]) requireText(schoolAdmin, needle, 'school device management UX: ' + needle);

const panel = read('components/TrustedDevicesPanel.tsx');
for (const needle of [
  "payload.summary.scope === 'organization'",
  'Školní uživatelský účet je určený pro jednoho člověka',
  'maxNewIn30Days',
  'Neukládáme IP adresu',
]) requireText(panel, needle, 'school member self-service UX: ' + needle);

for (const [file, label] of [
  ['app/api/generate/route.ts', 'AI generation'],
  ['app/api/revise/route.ts', 'lesson AI revision'],
  ['app/api/revise-block/route.ts', 'block AI revision'],
  ['app/api/sessions/route.ts', 'live session start'],
  ['app/api/lessons/[id]/worksheet-pdf/route.ts', 'worksheet export'],
  ['app/api/lessons/[id]/route.ts', 'lesson mutations'],
  ['app/api/lessons/move/route.ts', 'lesson organization'],
  ['app/api/folders/route.ts', 'folder creation'],
  ['app/api/folders/[id]/route.ts', 'folder management'],
  ['app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts', 'AI grading'],
  ['app/api/sessions/[id]/evaluations/[evaluationId]/regrade/route.ts', 'AI regrade'],
]) {
  requireText(read(file), 'requireTrustedDeviceForPaidAccess', label + ' uses unified device gate');
}

console.log('Organization-member trusted-device safeguards verified.');
