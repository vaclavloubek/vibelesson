import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`Missing free lesson reuse safeguard: ${label}`);
  }
}

const sessionsRoute = read('app/api/sessions/route.ts');
requireText(sessionsRoute, 'free_lesson_replay_locked', 'session API maps the database replay lock');

const lessonRoute = read('app/api/lessons/[id]/route.ts');
requireText(lessonRoute, 'duplicateOwnedLesson', 'duplication uses the selected atomic write backend');

const lessonDuplicateWriter = read('lib/lesson-duplicate-writer.ts');
requireText(lessonDuplicateWriter, 'getLessonReuseEntitlement', 'Supabase fallback charges a creation slot only on Free');
requireText(lessonDuplicateWriter, "admin.rpc('reserve_lesson_import_server'", 'Supabase fallback reserves an import/copy slot through the server-authoritative device-aware path');
requireText(lessonDuplicateWriter, 'public.duplicate_lesson_server(', 'Neon duplication reserves quota and inserts the copy atomically');
requireText(lessonDuplicateWriter, "p_status: 'succeeded'", 'Supabase fallback finishes a successful quota reservation');
requireText(lessonDuplicateWriter, "p_status: 'failed'", 'Supabase fallback releases a failed quota reservation');

const shareImportRoute = read('app/api/lesson-shares/[token]/import/route.ts');
requireText(shareImportRoute, 'free_lesson_import_quota_exhausted', 'shared lesson imports expose the separate Free import quota');

const generateRoute = read('app/api/generate/route.ts');
requireText(generateRoute, 'saveGeneratedLesson', 'AI generation uses a server-only insert path');
const generatedLessonWriter = read('lib/neon/generated-lesson-writer.ts');
requireText(generatedLessonWriter, "import 'server-only'", 'AI lesson insert remains server-only');
requireText(generatedLessonWriter, 'insert into public.lessons', 'Neon AI generation inserts only through server SQL');
requireText(generatedLessonWriter, "createAdminClient().from('lessons')", 'Supabase AI generation retains its server-only insert');

const lessonPage = read('app/lessons/[id]/page.tsx');
requireText(lessonPage, 'readLessonLiveUsage(supabase, userId, id)', 'lesson detail reads owner-scoped live-use history');
requireText(lessonPage, 'liveLocked={liveLocked}', 'lesson detail disables repeat Free live use');

const library = read('app/lessons/LessonLibrary.tsx');
requireText(library, 'Archivované lekce', 'Free library exposes the archive');
requireText(library, 'Stále je můžeš otevírat a upravovat ručně i pomocí AI', 'archive keeps AI editing available');

const pricing = read('components/PricingPage.tsx');
requireText(pricing, '2 importy nebo kopie lekcí za měsíc', 'Free pricing states the separate import/copy quota');
requireText(pricing, 'Každou lekci lze živě použít jednou', 'Free pricing states one live use per lesson');
requireText(pricing, 'Opakované používání lekcí bez omezení', 'paid pricing highlights repeat use');

const migrationDir = path.join(root, 'supabase/migrations');
const migration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }))
  .find(({ content }) => content.includes('create table public.lesson_live_usage'));

if (!migration) {
  throw new Error('Missing migration for lesson_live_usage.');
}

for (const [needle, label] of [
  ['create table public.lesson_live_usage', 'immutable lesson live-use ledger'],
  ['enable row level security', 'RLS on lesson live-use ledger'],
  ['record_lesson_live_usage', 'first participant records usage'],
  ['enforce_free_lesson_reuse', 'database-enforced Free replay lock'],
  ['lesson_reuse_enabled', 'central reusable-lesson entitlement'],
  ['enforce_free_lesson_creation_quota', 'transitional Free lesson creation guard exists'],
  ['insert into public.lesson_live_usage', 'historical live usage backfill'],
]) {
  requireText(migration.content, needle, label);
}

const splitQuotaMigration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }))
  .find(({ content }) => content.includes('create or replace function public.reserve_lesson_import()'));

if (!splitQuotaMigration) {
  throw new Error('Missing migration for the separate Free import/copy quota.');
}

for (const [needle, label] of [
  ["action = 'import_lesson'", 'import/copy usage is tracked separately from AI generations'],
  ['free_lesson_import_quota_exhausted', 'shared imports enforce the import/copy quota'],
]) {
  requireText(splitQuotaMigration.content, needle, label);
}

const reducedFreeMigration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }))
  .find(({ content }) => content.includes('Reduce Free entry limits to protect AI unit economics.'));

if (!reducedFreeMigration) {
  throw new Error('Missing migration for current reduced Free limits.');
}

for (const [needle, label] of [
  ['monthly_lesson_limit = 3', 'Free lesson generation limit is three'],
  ['monthly_revision_limit = 10', 'Free AI revision limit remains ten'],
  ['monthly_import_limit = 2', 'Free import/copy limit is two'],
]) {
  requireText(reducedFreeMigration.content, needle, label);
}

const familyMigration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }))
  .find(({ content }) => content.includes('create table if not exists public.lesson_reuse_usage'));

if (!familyMigration) {
  throw new Error('Missing migration for logical lesson reuse families.');
}

for (const [needle, label] of [
  ['reuse_family_id uuid', 'lessons have a stable reuse family id'],
  ['assign_lesson_reuse_family', 'database propagates reuse family through copies/imports'],
  ['create table if not exists public.lesson_reuse_usage', 'canonical family live-use ledger exists'],
  ['primary key (owner_id, reuse_family_id)', 'live-use is unique per user and lesson family'],
  ['project_used_family_to_new_lesson', 'copies of used families are immediately archived in the compatibility UI'],
  ['u.reuse_family_id = v_family_id', 'Free replay lock checks the lesson family rather than only lesson_id'],
]) {
  requireText(familyMigration.content, needle, label);
}

const lockdownMigration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }))
  .find(({ content }) => content.includes('revoke insert on table public.lessons from anon, authenticated'));

if (!lockdownMigration) {
  throw new Error('Missing migration that closes direct authenticated lesson inserts.');
}

console.log(`Free lesson reuse safeguards verified via ${migration.name}, ${splitQuotaMigration.name}, ${familyMigration.name} and ${lockdownMigration.name}.`);
