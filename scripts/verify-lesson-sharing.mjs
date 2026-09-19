import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Lesson-sharing regression: ${message}`);
}

const [
  migration,
  ownerRoute,
  importRoute,
  publicPage,
  shareButton,
  lessonPreview,
  sessionRoute,
  startButton,
  pricing,
  version,
  authControls,
  confirmPage,
  confirmRoute,
  confirmTemplate,
  cookieConsent,
  sharedAuthControls,
  importButton,
] = await Promise.all([
  source('supabase/migrations/20260919105631_add_lesson_sharing_and_session_concurrency.sql'),
  source('app/api/lessons/[id]/share/route.ts'),
  source('app/api/lesson-shares/[token]/import/route.ts'),
  source('app/s/[token]/page.tsx'),
  source('components/ShareLessonButton.tsx'),
  source('components/LessonPreview.tsx'),
  source('app/api/sessions/route.ts'),
  source('components/StartSessionButton.tsx'),
  source('components/PricingPage.tsx'),
  source('lib/version.ts'),
  source('components/AuthControls.tsx'),
  source('app/auth/confirm/page.tsx'),
  source('app/auth/confirm/verify/route.ts'),
  source('supabase/auth-templates/confirm-signup.html'),
  source('components/CookieConsent.tsx'),
  source('components/SharedLessonAuthControls.tsx'),
  source('components/ImportSharedLessonButton.tsx'),
]);

requirePattern(migration, /alter table public\.lesson_shares enable row level security/, 'lesson_shares must have RLS enabled.');
requirePattern(migration, /revoke all on table public\.lesson_shares from anon, authenticated/, 'lesson shares must start from revoked client grants.');
requirePattern(migration, /create policy lesson_share_owners_can_view[\s\S]*auth\.uid\(\)[\s\S]*owner_id/, 'only owners may read stored share records.');
requirePattern(migration, /create policy lesson_owners_can_create_shares[\s\S]*l\.owner_id = \(select auth\.uid\(\)\)[\s\S]*l\.lesson = snapshot/, 'share creation must bind the owner and immutable lesson snapshot.');
requirePattern(migration, /security definer[\s\S]*set search_path = ''[\s\S]*auth\.uid\(\)/, 'the import function must use a hardened definer boundary and authenticated identity.');
requirePattern(migration, /revoke all on function public\.import_lesson_share\(text\) from public, anon/, 'anonymous callers must not import shared lessons.');
requirePattern(migration, /create or replace function public\.get_lesson_share\(p_token text\)[\s\S]*security definer[\s\S]*set search_path = ''/, 'public share lookup must use a hardened narrow function.');
requirePattern(migration, /revoke all on function public\.get_lesson_share\(text\) from public;[\s\S]*grant execute on function public\.get_lesson_share\(text\) to anon, authenticated/, 'only the public snapshot lookup may be called without an account.');
requirePattern(migration, /create policy lesson_clients_cannot_forge_share_provenance[\s\S]*as restrictive[\s\S]*source_share_id is null[\s\S]*source_lesson_id is null/, 'authenticated clients must not forge import provenance.');
requirePattern(migration, /create trigger enforce_lesson_share_provenance_immutability[\s\S]*before update of source_share_id, source_lesson_id/, 'import provenance must remain immutable after creation.');
requirePattern(migration, /old\.source_share_id is not null[\s\S]*new\.source_share_id is null[\s\S]*not exists \([\s\S]*from public\.lesson_shares/, 'share provenance may be cleared only after the referenced share is actually gone.');
requirePattern(migration, /old\.source_lesson_id is not null[\s\S]*new\.source_lesson_id is null[\s\S]*not exists \([\s\S]*from public\.lessons/, 'source provenance may be cleared only after the referenced source lesson is actually gone.');
requirePattern(migration, /sessions_one_active_per_teacher_idx[\s\S]*where status in \('lobby', 'live'\)/, 'the database must enforce one active lesson per teacher.');

requirePattern(ownerRoute, /\.eq\('owner_id', userId\)/, 'share management must scope every share to the lesson owner.');
requirePattern(ownerRoute, /LessonSchema\.parse\(lessonRow\.lesson\)/, 'public snapshots must be schema validated before storage.');
requirePattern(importRoute, /supabase\.rpc\('import_lesson_share'/, 'imports must use the transactional database function.');
requirePattern(importRoute, /Authorization: `Bearer \\${accessToken}`/, 'bearer-authenticated imports must forward the verified user JWT into the Supabase client context.');
requirePattern(importRoute, /supabase\.auth\.getUser\(accessToken\)/, 'bearer tokens must be verified by Supabase before import.');
requirePattern(importRoute, /if \(authorization\)[\s\S]*return \{ supabase, userId: data\.user\.id \}/, 'explicit bearer auth must resolve a concrete authenticated user.');
requirePattern(publicPage, /supabase\.rpc\('get_lesson_share', \{ p_token: token \}\)/, 'the public page must request only the share snapshot through the narrow capability function.');
requirePattern(publicPage, /mode="shared"/, 'the public page must use the read-only lesson preview.');
requirePattern(publicPage, /robots: \{ index: false, follow: false \}/, 'capability links must not be indexed.');
requirePattern(publicPage, /referrer: 'no-referrer'/, 'share tokens must not leak through browser referrers.');
requirePattern(publicPage, /<SharedLessonAuthControls[\s\S]*initialOpen=\{signin\}[\s\S]*token=\{token\}/, 'the shared page must preserve its token through signup.');
requirePattern(importButton, /serverAuthenticated[\s\S]*resumeImport\(\)/, 'server-confirmed authentication must trigger the import immediately.');
requirePattern(importButton, /supabase\.auth\.getUser\(\)[\s\S]*resumeImport/, 'client auth remains a fallback when server auth is not yet available.');
requirePattern(publicPage, /query\.import[\s\S]*importRequested/, 'the shared page must preserve explicit import intent.');
requirePattern(publicPage, /<ImportSharedLessonButton[\s\S]*importRequested=\{importRequested\}[\s\S]*serverAuthenticated=\{serverAuthenticated\}/, 'the shared page must pass server-confirmed authentication into import resumption.');
requirePattern(lessonPreview, /mode: 'teacher' \| 'student' \| 'shared'/, 'lesson preview must have an explicit shared read-only mode.');
requirePattern(shareButton, /Neuvidí výsledky studentů, kódy hodin ani historii AI úprav/, 'the share dialog must explain its privacy boundary.');
requirePattern(shareButton, /createPortal\([\s\S]*document\.body/, 'the share dialog must render through a body portal so workspace stacking contexts cannot cover it.');
requirePattern(authControls, /emailRedirectTo: signupRedirectUrl\(\)/, 'signup must accept the shared lesson return URL.');
requirePattern(authControls, /onSignInSuccess\?\.\(data\.session\?\.access_token \?\? null\)/, 'AuthControls must pass the fresh access token after successful password sign-in.');
requirePattern(sharedAuthControls, /onSignInSuccess=\{handleSignInSuccess\}/, 'shared lesson auth must hook explicit successful sign-in completion.');
requirePattern(sharedAuthControls, /headers: \{ Authorization: `Bearer \\${accessToken}` \}/, 'shared lesson sign-in must import with the fresh JWT instead of waiting for cookie propagation.');
requirePattern(sharedAuthControls, /response\.ok[\s\S]*window\.location\.replace[\s\S]*lessons[\s\S]*data\.lessonId/, 'successful post-login import must open the saved copy immediately.');
requirePattern(sharedAuthControls, /<Link href="\/lessons">\{english \? 'My lessons' : 'Moje lekce'\}<\/Link>/, 'signed-in shared pages must show a direct My lessons link.');
requirePattern(sharedAuthControls, /window\.location\.replace\(`\/s\/\$\{token\}\?import=1`\)/, 'successful sign-in must force a fresh server-authenticated share request.');
requirePattern(sharedAuthControls, /signupRedirectPath=\{`\/s\/\$\{token\}\$\{importRequested \? '\?import=1' : ''\}`\}/, 'signup confirmation must preserve shared lesson import intent.');
requirePattern(importButton, /\?signin=1&import=1/, 'unauthenticated import must preserve intent through sign-in.');
requirePattern(importButton, /supabase\.auth\.getSession\(\)[\s\S]*session\?\.access_token/, 'manual shared imports must use the current browser session JWT when available.');
requirePattern(importButton, /headers: accessToken[\s\S]*Authorization: `Bearer \\${accessToken}`/, 'manual shared imports must send the browser JWT to the import API.');
requirePattern(importButton, /IMPORT_INTENT_STORAGE_KEY = 'syllonaut_pending_share_import_v1'/, 'shared import intent must be persisted per browser tab.');
requirePattern(importButton, /IMPORT_INTENT_TTL_MS = 5 \* 60 \* 1000/, 'shared import intent must expire quickly.');
requirePattern(importButton, /window\.sessionStorage\.setItem[\s\S]*rememberImportIntent/, 'explicit save-copy intent must be stored before authentication.');
requirePattern(importButton, /hasRecentImportIntent\(token\)/, 'shared import must recover intent even if the URL flag is lost.');
requirePattern(importButton, /setInterval[\s\S]*checkAuthenticatedUser/, 'pending shared imports must briefly retry auth propagation.');
requirePattern(importButton, /clearImportIntent\(token\)[\s\S]*router\.replace/, 'successful imports must clear the pending session intent before navigation.');
requirePattern(importButton, /supabase\.auth\.getUser\(\)[\s\S]*resumeImport/, 'shared import must resume when an authenticated user is already present.');
requirePattern(importButton, /supabase\.auth\.onAuthStateChange[\s\S]*session\?\.user[\s\S]*resumeImport/, 'shared import must resume from the client auth state change after sign-in.');
requirePattern(importButton, /resumedImportRef[\s\S]*importInFlightRef/, 'shared import resumption must be guarded against duplicate requests.');
requirePattern(importButton, /router\.replace\(`\/lessons\/\$\{data\.lessonId\}`\)/, 'successful import should replace the transient share URL with the saved lesson.');
requirePattern(confirmPage, /name="next"/, 'the confirmation interstitial must preserve the return URL.');
requirePattern(confirmRoute, /SHARED_LESSON_PATH[\s\S]*destination\.origin !== requestOrigin/, 'the confirmation endpoint must restrict return URLs to same-origin share pages.');
requirePattern(confirmRoute, /entries\.length === 1[\s\S]*entries\[0\]\[0\] === 'import'[\s\S]*entries\[0\]\[1\] === '1'/, 'the confirmation endpoint may preserve only the explicit import=1 share intent.');
requirePattern(confirmTemplate, /\.SiteURL[\s\S]*next=\{\{ \.RedirectTo \}\}/, 'the signup email must carry the requested return URL through the safe confirmation endpoint.');
requirePattern(cookieConsent, /LESSON_SHARE_PATH[\s\S]*analyticsBlocked[\s\S]*gaDisableKey/, 'GA4 must remain disabled on capability-bearing share URLs.');

requirePattern(sessionRoute, /findActiveSession/, 'session creation must check for an existing live lesson.');
requirePattern(sessionRoute, /activeSessionId/, 'the conflict response must identify the active lesson.');
requirePattern(startButton, /Otevřít rozběhnutou hodinu/, 'the UI must offer a path back to the active lesson.');

requirePattern(pricing, /Samostatný účet pro každého učitele/, 'school pricing must state separate teacher accounts.');
requirePattern(pricing, /pracovního prostoru školy/, 'school pricing must describe a workspace rather than a shared login.');
requirePattern(version, /APP_VERSION = '0\.9\.20'/, 'lesson sharing must publish as version 0.9.20.');

console.log('Lesson-sharing and account-concurrency checks passed.');
