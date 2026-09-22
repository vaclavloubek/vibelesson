import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const packageJson = JSON.parse(read('package.json'));
const envExample = read('.env.example');
const lessonsPage = read('app/lessons/page.tsx');
const lessonDetailPage = read('app/lessons/[id]/page.tsx');
const lessonWorksheetRoute = read('app/api/lessons/[id]/worksheet-pdf/route.ts');
const lessonWorksheetPage = read('app/lessons/[id]/worksheet/page.tsx');
const terms = read('lib/terms-acceptance.ts');
const migration = read('scripts/neon/migrate.sh');
const authImport = read('scripts/neon/auth-import.sh');
const authUserImport = read('neon/migrations/0002_neon_auth_user_import.sql');
const lessonShareReader = read('lib/lesson-share-reader.ts');
const lessonFolderReader = read('lib/lesson-folder-reader.ts');
const lessonFolderWriter = read('lib/lesson-folder-writer.ts');
const lessonFolderRoute = read('app/api/folders/route.ts');
const lessonFolderDetailRoute = read('app/api/folders/[id]/route.ts');
const lessonMoveWriter = read('lib/lesson-move-writer.ts');
const lessonMoveRoute = read('app/api/lessons/move/route.ts');
const lessonListReader = read('lib/lesson-list-reader.ts');
const sessionHistoryReader = read('lib/session-history-reader.ts');
const lessonDetailReader = read('lib/lesson-detail-reader.ts');
const lessonWorksheetReader = read('lib/lesson-worksheet-reader.ts');
const lessonReuseReader = read('lib/lesson-reuse-reader.ts');
const sessionAccessReader = read('lib/session-access-reader.ts');
const teacherSessionPage = read('app/sessions/[id]/page.tsx');
const presenterPage = read('app/sessions/[id]/presenter/page.tsx');
const runbook = read('docs/NEON_MIGRATION.md');
const wrangler = read('cloudflare/live-control/wrangler.jsonc');

for (const dependency of ['@neondatabase/serverless', '@neondatabase/auth', '@neondatabase/neon-js']) {
  const version = packageJson.dependencies?.[dependency];
  if (!version || /^[~^]/.test(version)) throw new Error(`${dependency} must be installed and pinned exactly.`);
}

for (const path of ['lib/supabase/server.ts', 'lib/supabase/client.ts', 'lib/supabase/admin.ts', 'lib/supabase/proxy.ts']) {
  requireText(read(path), 'createFetchWithTimeout(8_000)', `${path} is missing the backend timeout.`);
}

requireText(lessonsPage, 'Promise.all([', '/lessons must parallelize independent backend calls.');
requireText(terms, "rpc('has_any_terms_acceptance_for_service'", 'Terms gate must use the batch RPC.');
requireText(migration, 'NEON_MIGRATION_APPROVED', 'Migration script must have an explicit write gate.');
requireText(migration, 'Preview only; nothing was changed.', 'Migration script must default to dry-run.');
requireText(migration, 'Refusing to migrate into a non-empty target', 'Migration script must reject a non-empty target.');
requireText(authImport, 'NEON_AUTH_IMPORT_APPROVED', 'Auth import must have an explicit write gate.');
requireText(authImport, 'Password hashes and sessions are never copied', 'Auth import must document credential exclusion.');
requireText(authUserImport, 'There is intentionally no neon_auth.account insert', 'Auth import must not copy incompatible password hashes.');
requireText(lessonShareReader, "process.env.VERCEL_ENV === 'production'", 'The Neon read canary must be isolated from unapproved production use.');
requireText(lessonShareReader, 'where token = ${token}', 'The Neon lesson-share lookup must remain parameterized.');
requireText(lessonFolderReader, "process.env.VERCEL_ENV === 'production'", 'The Neon folder-read canary must be isolated from unapproved production use.');
requireText(lessonFolderReader, 'where owner_id = ${userId}', 'The Neon lesson-folder lookup must remain owner-scoped and parameterized.');
requireText(lessonsPage, 'readLessonFolders(supabase, userId)', '/lessons must use the folder reader abstraction.');
requireText(envExample, 'NEON_LESSON_FOLDER_READS=false', 'The folder-read canary must default to disabled.');
requireText(lessonFolderWriter, "process.env.VERCEL_ENV === 'production'", 'The Neon folder-write canary must be isolated from unapproved production use.');
requireText(lessonFolderWriter, 'where id = ${folderId}', 'The Neon folder writes must remain folder-scoped and parameterized.');
requireText(lessonFolderWriter, 'and owner_id = ${userId}', 'The Neon folder writes must remain owner-scoped and parameterized.');
requireText(lessonFolderRoute, 'createLessonFolder(supabase, userId, input)', 'The folder-create route must use the folder writer abstraction.');
requireText(lessonFolderDetailRoute, 'renameLessonFolder(auth.supabase, auth.userId, id, name)', 'The folder-rename route must use the folder writer abstraction.');
requireText(lessonFolderDetailRoute, 'deleteLessonFolder(auth.supabase, auth.userId, id)', 'The folder-delete route must use the folder writer abstraction.');
requireText(envExample, 'NEON_LESSON_FOLDER_WRITES=false', 'The folder-write canary must default to disabled.');
requireText(lessonMoveWriter, "process.env.VERCEL_ENV === 'production'", 'The Neon lesson-move canary must be isolated from unapproved production use.');
requireText(lessonMoveWriter, 'where owner_id = ${userId}', 'The Neon lesson move must remain owner-scoped and parameterized.');
requireText(lessonMoveWriter, 'jsonb_array_elements_text(${JSON.stringify(lessonIds)}::jsonb)', 'The Neon lesson move ID set must remain parameterized.');
requireText(lessonMoveRoute, 'moveLessonsToFolder(supabase, userId, lessonIds, input.folderId)', 'The lesson-move route must use the write abstraction.');
requireText(envExample, 'NEON_LESSON_MOVE_WRITES=false', 'The lesson-move canary must default to disabled.');
requireText(lessonListReader, "process.env.VERCEL_ENV === 'production'", 'The Neon lesson-list canary must be isolated from unapproved production use.');
requireText(lessonListReader, 'where owner_id = ${userId}', 'The Neon lesson-list lookup must remain owner-scoped and parameterized.');
requireText(lessonsPage, 'readLessonList(supabase, userId)', '/lessons must use the lesson-list reader abstraction.');
requireText(envExample, 'NEON_LESSON_LIST_READS=false', 'The lesson-list canary must default to disabled.');
requireText(sessionHistoryReader, "process.env.VERCEL_ENV === 'production'", 'The Neon session-history canary must be isolated from unapproved production use.');
requireText(sessionHistoryReader, 'where teacher_id = ${userId}', 'The Neon session-history lookup must remain owner-scoped and parameterized.');
requireText(sessionHistoryReader, "and status = 'ended'", 'The Neon session-history lookup must remain limited to ended sessions.');
requireText(lessonsPage, 'readSessionHistory(supabase, userId)', '/lessons must use the session-history reader abstraction.');
requireText(envExample, 'NEON_SESSION_HISTORY_READS=false', 'The session-history canary must default to disabled.');
requireText(lessonDetailReader, "process.env.VERCEL_ENV === 'production'", 'The Neon lesson-detail canary must be isolated from unapproved production use.');
requireText(lessonDetailReader, 'where id = ${lessonId}', 'The Neon lesson-detail lookup must remain lesson-scoped and parameterized.');
requireText(lessonDetailReader, 'and owner_id = ${userId}', 'The Neon lesson-detail lookup must remain owner-scoped and parameterized.');
requireText(lessonDetailPage, 'readLessonDetail(supabase, userId, id)', '/lessons/[id] must use the lesson-detail reader abstraction.');
requireText(envExample, 'NEON_LESSON_DETAIL_READS=false', 'The lesson-detail canary must default to disabled.');
requireText(lessonWorksheetReader, "process.env.VERCEL_ENV === 'production'", 'The Neon lesson-worksheet canary must be isolated from unapproved production use.');
requireText(lessonWorksheetReader, 'where id = ${lessonId}', 'The Neon lesson-worksheet lookup must remain lesson-scoped and parameterized.');
requireText(lessonWorksheetReader, 'and owner_id = ${userId}', 'The Neon lesson-worksheet lookup must remain owner-scoped and parameterized.');
requireText(lessonWorksheetRoute, 'readLessonWorksheet(supabase, userId, id)', 'The worksheet PDF route must use the lesson-worksheet reader abstraction.');
requireText(lessonWorksheetPage, 'readLessonWorksheet(supabase, userId, id)', 'The worksheet page must use the lesson-worksheet reader abstraction.');
requireText(envExample, 'NEON_LESSON_WORKSHEET_READS=false', 'The lesson-worksheet canary must default to disabled.');
requireText(lessonReuseReader, "process.env.VERCEL_ENV === 'production'", 'The Neon lesson-reuse canary must be isolated from unapproved production use.');
requireText(lessonReuseReader, 'from private.current_active_organization(${userId}::uuid)', 'The Neon lesson-reuse entitlement must remain user-scoped and parameterized.');
requireText(lessonReuseReader, 'where owner_id = ${userId}', 'The Neon live-usage lookup must remain owner-scoped and parameterized.');
requireText(lessonReuseReader, 'and lesson_id = ${lessonId}', 'The Neon live-usage detail lookup must remain lesson-scoped and parameterized.');
requireText(lessonsPage, 'readLessonReuseEntitlement(supabase, userId)', '/lessons must use the lesson-reuse reader abstraction.');
requireText(lessonsPage, 'readLessonLiveUsage(supabase, userId)', '/lessons must use the live-usage reader abstraction.');
requireText(lessonDetailPage, 'readLessonReuseEntitlement(supabase, userId)', '/lessons/[id] must use the lesson-reuse reader abstraction.');
requireText(lessonDetailPage, 'readLessonLiveUsage(supabase, userId, id)', '/lessons/[id] must use the owner-scoped live-usage reader abstraction.');
requireText(envExample, 'NEON_LESSON_REUSE_READS=false', 'The lesson-reuse canary must default to disabled.');
requireText(sessionAccessReader, "process.env.VERCEL_ENV === 'production'", 'The Neon session-access canary must be isolated from unapproved production use.');
requireText(sessionAccessReader, 'where id = ${sessionId}', 'The Neon session-access lookup must remain session-scoped and parameterized.');
requireText(sessionAccessReader, 'and teacher_id = ${userId}', 'The Neon session-access lookup must remain owner-scoped and parameterized.');
requireText(teacherSessionPage, 'readOwnedSessionAccess(supabase, userId, id)', 'The teacher session page must use the session-access reader abstraction.');
requireText(presenterPage, 'readOwnedSessionAccess(supabase, userId, id)', 'The presenter page must use the session-access reader abstraction.');
requireText(envExample, 'NEON_SESSION_ACCESS_READS=false', 'The session-access canary must default to disabled.');
requireText(read('lib/neon/server.ts'), 'AbortSignal.timeout(8_000)', 'Neon server reads must have a bounded timeout.');
requireText(wrangler, 'new_sqlite_classes', 'Durable Object migration declaration is missing.');
requireText(runbook, 'Rollback', 'Neon runbook must include rollback.');
requireText(runbook, 'JWT', 'Neon runbook must document the incident evidence.');

if (envExample.includes('NEXT_PUBLIC_NEON_DATABASE_URL')) {
  throw new Error('A Neon database connection string must never be public.');
}

console.log('Neon migration preparation verification passed.');
