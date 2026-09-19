import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing organization seat-rotation safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const rotation = migrations.find(({ content }) => content.includes('organization_replacement_limit_reached'));
if (!rotation) throw new Error('Missing organization seat-rotation migration.');

for (const [needle, label] of [
  ['private.organization_seat_activations', 'immutable per-period activation history'],
  ["ceil(v_seat_limit::numeric * 0.10)", '10 percent replacement allowance'],
  ["greatest(1,", 'minimum one replacement'],
  ["raise exception 'organization_seat_limit_reached'", 'simultaneous seat cap'],
  ["raise exception 'organization_replacement_limit_reached'", 'unique-user period cap'],
  ['organization_memberships_enforce_seat_policy', 'database-boundary membership trigger'],
  ['organization_pending_new_seat_reservations', 'pending invitations reserve replacement capacity'],
  ["coalesce(v_app_role, 'user') = 'admin'", 'internal admins are excluded'],
  ['current_period_start', 'real billing period is used'],
  ['is_internal_test', 'internal test organization has fallback period'],
]) {
  requireText(rotation.content, needle, label);
}

const currentRoute = read('app/api/organizations/current/route.ts');
requireText(currentRoute, 'get_organization_seat_usage', 'school summary exposes seat-rotation usage');

const inviteRoute = read('app/api/organizations/invitations/route.ts');
requireText(inviteRoute, 'organization_replacement_limit_reached', 'single invite maps replacement exhaustion');

const acceptRoute = read('app/api/organizations/invitations/accept/route.ts');
requireText(acceptRoute, 'organization_replacement_limit_reached', 'invite acceptance maps replacement exhaustion');

const bulkRoute = read('app/api/organizations/invitations/bulk/route.ts');
requireText(bulkRoute, 'replacement_limit_reached', 'bulk invitations stop at replacement exhaustion');

const admin = read('components/SchoolAdmin.tsx');
requireText(admin, 'Unikátní uživatelé v období', 'admin UI labels unique-period users separately');
requireText(admin, 'Nejde o souběžná místa.', 'admin UI explicitly distinguishes unique users from active seats');
requireText(admin, 'summary.seats.active', 'admin UI shows active seats independently');

console.log(`Organization seat rotation safeguards verified via ${rotation.name}.`);
