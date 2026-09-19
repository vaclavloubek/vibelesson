import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing school lesson license-lock safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const lock = migrations.find(({ content }) => content.includes('organization_origin_access_required'));
if (!lock) throw new Error('Missing school lesson license-lock migration.');

for (const [needle, label] of [
  ["m.status = 'active'", 'origin membership must be active'],
  ["o.status = 'active'", 'origin organization must be active'],
  ['zz_lessons_enforce_organization_origin_access', 'all lesson writes are database-gated'],
  ['sessions_enforce_organization_origin_access', 'new live sessions are database-gated'],
  ['participants_enforce_organization_origin_access', 'open sessions stop accepting student joins after license loss'],
  ['responses_enforce_organization_origin_access', 'open sessions stop accepting student responses after license loss'],
  ['sessions_enforce_organization_origin_access_update', 'teacher controls on open sessions are gated after license loss'],
  ["raise exception 'organization_origin_access_required'", 'license failure is explicit'],
]) {
  requireText(lock.content, needle, label);
}

const helper = read('lib/organization-origin-access.ts');
requireText(helper, "organization?.status === 'active'", 'server preflight mirrors organization status');
requireText(helper, "row.status === 'active'", 'server preflight mirrors membership status');

for (const [file, needle, label] of [
  ['app/api/revise/route.ts', 'getLessonOrganizationOriginAccess', 'whole-lesson AI edits are gated before AI cost'],
  ['app/api/revise-block/route.ts', 'getLessonOrganizationOriginAccess', 'block AI edits are gated before AI cost'],
  ['app/api/lessons/[id]/worksheet-pdf/route.ts', 'getLessonOrganizationOriginAccess', 'worksheet PDF export is gated'],
  ['app/api/sessions/route.ts', 'getLessonOrganizationOriginAccess', 'live session creation has clear preflight'],
  ['app/api/lessons/[id]/route.ts', 'getLessonOrganizationOriginAccess', 'manual edits and duplication have clear preflight'],
  ['app/api/lessons/move/route.ts', 'getOrganizationOriginAccessMap', 'folder moves respect the read-only lock'],
  ['app/lessons/[id]/page.tsx', 'licenseLocked', 'lesson detail renders the read-only state'],
  ['app/lessons/LessonLibrary.tsx', 'Školní lekce bez aktivního přístupu', 'locked school lessons are separated in the library'],
  ['components/PricingPage.tsx', 'Licenční zámek školních lekcí', 'pricing advertises the school license lock'],
]) {
  requireText(read(file), needle, label);
}

const pricing = read('components/PricingPage.tsx');
if ((pricing.match(/Licenční zámek školních lekcí/g) ?? []).length !== 2) {
  throw new Error('School license lock must appear in Czech School and Campus plans only.');
}
if ((pricing.match(/School lesson license lock/g) ?? []).length !== 2) {
  throw new Error('School license lock must appear in English School and Campus plans only.');
}
if ((pricing.match(/^\s*'Sdílená knihovna lekcí',$/gm) ?? []).length !== 2) {
  throw new Error('Shared lesson library must appear in Czech School and Campus plans only.');
}
if ((pricing.match(/^\s*'Shared lesson library',$/gm) ?? []).length !== 2) {
  throw new Error('Shared lesson library must appear in English School and Campus plans only.');
}
const teamSection = pricing.slice(pricing.indexOf("id: 'team'"), pricing.indexOf("id: 'school'"));
if (
  teamSection.includes('Licenční zámek školních lekcí')
  || teamSection.includes('School lesson license lock')
  || teamSection.includes('Sdílená knihovna lekcí')
  || teamSection.includes('Shared lesson library')
) {
  throw new Error('Team must not advertise school-library features because Team has no school library.');
}
if (pricing.includes("feature.startsWith('Licenční zámek')") || pricing.includes("feature.startsWith('School lesson license lock')")) {
  throw new Error('School license lock must remain a normal, non-highlighted pricing feature.');
}
requireText(pricing, "feature === 'Sdílená knihovna lekcí'", 'shared library is highlighted as a differentiating school-plan feature');
requireText(pricing, "feature === 'Shared lesson library'", 'English shared library is highlighted as a differentiating school-plan feature');

console.log(`School lesson license lock verified via ${lock.name}.`);
