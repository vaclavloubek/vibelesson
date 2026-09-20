import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing Free device-budget safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const budget = migrations.find(({ content }) => content.includes('private.free_device_budget_requests'));
if (!budget) throw new Error('Missing Free device-budget migration.');

for (const [needle, label] of [
  ["p.active_plan_code = 'free'", 'only Free accounts consume the shared device budget'],
  ["interval '30 days'", 'rolling 30-day accounting window'],
  ['for update', 'device/account reservations are serialized'],
  ['reserve_lesson_generation_server', 'server-only generation reservation'],
  ['reserve_revision_operation_server', 'server-only revision reservation'],
  ['reserve_lesson_import_server', 'server-only import reservation'],
  ["raise exception 'free_device_budget_server_required'", 'direct authenticated Free reserve calls fail closed'],
  ['complete_free_device_budget_request', 'failed operations release their device reservation'],
]) requireText(budget.content, needle, label);

const currentLimits = migrations.find(({ content }) =>
  content.includes('Reduce Free entry limits to protect AI unit economics.')
  && content.includes('v_free_lesson_limit * 2')
);
if (!currentLimits) throw new Error('Missing current Free limit/device-budget rebalance migration.');

for (const [needle, label] of [
  ['monthly_lesson_limit = 3', 'Free has three AI lesson generations per month'],
  ['monthly_revision_limit = 10', 'Free keeps ten AI revisions per month'],
  ['monthly_import_limit = 2', 'Free has two imports/copies per month'],
  ['v_free_lesson_limit * 2', 'device lesson budget follows two Free accounts'],
  ['v_free_revision_limit * 2', 'device revision budget follows two Free accounts'],
  ['v_free_import_limit * 2', 'device import budget follows two Free accounts'],
]) requireText(currentLimits.content, needle, label);

for (const [file, needle, label] of [
  ['app/api/generate/route.ts', 'reserve_lesson_generation_server', 'generation uses server-authoritative device hash'],
  ['app/api/revise/route.ts', 'reserve_revision_operation_server', 'whole-lesson revision uses server device budget'],
  ['app/api/revise-block/route.ts', 'reserve_revision_operation_server', 'block revision uses server device budget'],
  ['app/api/lessons/[id]/route.ts', 'reserve_lesson_import_server', 'duplication uses server device budget'],
  ['app/api/lesson-shares/[token]/import/route.ts', 'import_lesson_share_server', 'public-share import uses server device budget'],
]) requireText(read(file), needle, label);

const helper = read('lib/free-device-budget.ts');
requireText(helper, 'currentTrustedDeviceHash', 'Free budget reuses the privacy-minimal random device token');
requireText(helper, 'napříč Free účty', 'user-facing explanation is explicit');

console.log(`Free device-budget safeguards verified via ${budget.name}.`);
