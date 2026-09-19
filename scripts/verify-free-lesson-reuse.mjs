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
requireText(lessonRoute, "supabase.rpc('reserve_lesson_generation')", 'duplication reserves a lesson creation slot');
requireText(lessonRoute, "p_status: 'succeeded'", 'successful duplication finishes its quota reservation');
requireText(lessonRoute, "p_status: 'failed'", 'failed duplication releases its quota reservation');

const lessonPage = read('app/lessons/[id]/page.tsx');
requireText(lessonPage, "from('lesson_live_usage')", 'lesson detail reads live-use history');
requireText(lessonPage, 'liveLocked={liveLocked}', 'lesson detail disables repeat Free live use');

const library = read('app/lessons/LessonLibrary.tsx');
requireText(library, 'Archivované lekce', 'Free library exposes the archive');
requireText(library, 'Stále je můžeš otevírat a upravovat ručně i pomocí AI', 'archive keeps AI editing available');

const pricing = read('components/PricingPage.tsx');
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
  ['insert into public.lesson_live_usage', 'historical live usage backfill'],
]) {
  requireText(migration.content, needle, label);
}

console.log(`Free lesson reuse safeguards verified via ${migration.name}.`);
