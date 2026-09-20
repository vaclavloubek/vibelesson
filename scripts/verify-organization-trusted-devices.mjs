import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing organization trusted-device safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['private.organization_user_trusted_devices', 'organization-scoped device ledger'],
  ['register_trusted_device_access', 'unified registration RPC'],
  ['list_trusted_device_access', 'unified device listing RPC'],
  ['revoke_trusted_device_access', 'unified device revocation RPC'],
  ['list_organization_member_device_usage', 'manager device usage summary'],
  ['reset_organization_member_trusted_devices', 'safe manager reset'],
  ['v_active_count >= 5', 'five active organization devices'],
  ['v_new_30d >= 8', 'eight new organization devices per 30 days'],
  ["interval '30 days'", 'rolling 30-day history'],
  ["p_actor_user_id = p_target_user_id", 'admin cannot reset own devices'],
  ["v_actor_role = 'admin' and v_target_role = 'admin'", 'admin cannot reset peer admin devices'],
  ["private.active_trusted_device_organization", 'organization context helper'],
  ["private.personal_trusted_device_hash_valid", 'DB write boundary extended to organization devices'],
]) requireText(migrations, needle, label);

const access = read('lib/trusted-device-access.ts');
requireText(access, "register_trusted_device_access", 'application uses unified registration');
requireText(access, "'organization'", 'gate exposes organization scope');

const deviceRoute = read('app/api/auth/devices/route.ts');
requireText(deviceRoute, "list_trusted_device_access", 'self-service lists organization devices');
requireText(deviceRoute, "revoke_trusted_device_access", 'self-service revokes organization devices');

const resetRoute = read('app/api/organizations/members/[userId]/devices/reset/route.ts');
requireText(resetRoute, 'reset_organization_member_trusted_devices', 'school reset is server-authoritative');
requireText(resetRoute, 'canManageOrganization', 'school reset requires manager');

const currentRoute = read('app/api/organizations/current/route.ts');
requireText(currentRoute, 'list_organization_member_device_usage', 'school summary exposes device usage only through server RPC');

const schoolAdmin = read('components/SchoolAdmin.tsx');
requireText(schoolAdmin, 'Reset zařízení', 'school manager has device reset control');
requireText(schoolAdmin, '30denní historie', 'UI explains reset preserves rotation history');

const panel = read('components/TrustedDevicesPanel.tsx');
requireText(panel, "scope === 'organization'", 'trusted-device panel explains school scope');
requireText(panel, 'maxNewIn30Days', 'device UI uses dynamic organization rotation limit');

console.log('Organization trusted-device safeguards verified.');
