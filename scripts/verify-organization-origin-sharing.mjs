import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing organization-origin sharing safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const origin = migrations.find(({ content }) => content.includes('organization_origin_share_forbidden'));
if (!origin) throw new Error('Missing organization-origin sharing migration.');

for (const [needle, label] of [
  ['organization_origin_id uuid', 'immutable organization origin column'],
  ["new.organization_origin_id := new.organization_id", 'library snapshots capture their organization'],
  ["raise exception 'organization_origin_mismatch'", 'school content cannot move to another organization'],
  ["raise exception 'organization_origin_share_forbidden'", 'database blocks public sharing of school content'],
  ['new.organization_origin_id := v_origin_id', 'copies/imports inherit school origin'],
  ['and s.organization_origin_id is null', 'public share reads/imports reject school-origin legacy links'],
  ["status = 'revoked'", 'historical school-origin links are revoked'],
]) {
  requireText(origin.content, needle, label);
}

const shareRoute = read('app/api/lessons/[id]/share/route.ts');
requireText(shareRoute, 'organization_library_public_share_forbidden', 'share API exposes a clear school-origin restriction');

const libraryRoute = read('app/api/organizations/library/route.ts');
requireText(libraryRoute, 'organization_origin_mismatch', 'library publishing blocks cross-organization laundering');

const button = read('components/ShareLessonButton.tsx');
requireText(button, 'sharingRestricted', 'share UI explains why school-origin content cannot be public');

console.log(`Organization-origin sharing safeguards verified via ${origin.name}.`);
