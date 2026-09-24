import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, snippet, message) {
  if (!text.includes(snippet)) throw new Error(`i18n regression: ${message}`);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`i18n regression: ${message}`);
}

function requireOrder(text, snippets, message) {
  let previous = -1;
  for (const snippet of snippets) {
    const index = text.indexOf(snippet);
    if (index < 0 || index <= previous) throw new Error(`i18n regression: ${message}`);
    previous = index;
  }
}

const [
  i18n,
  proxy,
  layout,
  localizedHome,
  localeSwitcher,
  workspace,
  schema,
  ai,
  studentSession,
  studentEdge,
  presenterRoute,
  presenterMode,
  liveBlock,
  evaluationReviewQueue,
  studentResponseInput,
] = await Promise.all([
  source('lib/i18n.ts'),
  source('proxy.ts'),
  source('app/layout.tsx'),
  source('app/[locale]/page.tsx'),
  source('components/LocaleSwitcher.tsx'),
  source('components/LessonWorkspace.tsx'),
  source('lib/schema.ts'),
  source('lib/ai.ts'),
  source('components/StudentSession.tsx'),
  source('supabase/functions/student-session/index.ts'),
  source('app/api/sessions/[id]/presenter/route.ts'),
  source('components/PresenterMode.tsx'),
  source('components/LiveBlock.tsx'),
  source('components/EvaluationReviewQueue.tsx'),
  source('components/StudentResponseInput.tsx'),
]);

{
  const teamsRoute = await source('app/api/sessions/[id]/teams/route.ts');
  requireText(teamsRoute, "normalizeUiLocale(req.headers.get(LOCALE_REQUEST_HEADER)) === 'en' ? 'Team' : 'Tým'", 'default team names must follow the teacher UI language.');
}
requireText(i18n, "UI_LOCALES = ['cs', 'en']", 'supported UI locales must remain Czech and English.');
requirePattern(i18n, /normalized === 'CZ' \|\| normalized === 'SK' \? 'cs' : 'en'/, 'CZ and SK must default to Czech UI while other valid countries default to English.');
requireText(i18n, "if (locale === 'en') return enFallback;", 'English UI errors must not expose untranslated server messages.');
requireOrder(i18n, [
  'normalizeUiLocale(pathLocale)',
  'normalizeUiLocale(cookieLocale)',
  'localeFromCountry(country)',
  'localeFromAcceptLanguage(acceptLanguage)',
  "?? 'en'",
], 'locale priority must remain explicit path -> saved preference -> country -> Accept-Language -> English.');

requireText(proxy, "pathname === '/'", 'root locale gateway is missing.');
requireText(proxy, 'target.pathname = `/${locale}`', 'root gateway must redirect to the resolved locale URL.');
requirePattern(proxy, /pathname === '\/pricing' \|\| pathname === '\/gdpr'/, 'public pricing/GDPR routes must remain locale-aware gateways.');
requireText(proxy, "function localizedAppGatewayPath", 'localized acquisition gateway helper is missing.');
requireText(proxy, "unprefixed === '/new'", 'localized new-lesson entry must redirect to the canonical app route.');
requireText(proxy, "unprefixed === '/lessons'", 'localized lessons entry must redirect to the canonical app route.');
requireText(proxy, "unprefixed.startsWith('/lessons/')", 'localized lesson subroutes must redirect to the canonical app route.');
requireText(proxy, "unprefixed.startsWith('/s/')", 'localized shared-lesson entries must redirect to the canonical share route.');
requireText(proxy, "unprefixed === '/school'", 'localized school root must redirect to the canonical app route.');
requireText(proxy, "unprefixed.startsWith('/school/')", 'localized school subroutes must redirect to the canonical app route.');
requireText(proxy, 'target.pathname = gatewayPath', 'localized app gateways must preserve the canonical app path.');
requireText(proxy, 'persistLocale(response, request, pathLocale)', 'localized app gateways must persist the explicitly requested locale.');
requireText(layout, '<html lang={locale}>', 'document language must follow the active UI locale.');
requireText(localeSwitcher, 'document.cookie = `${LOCALE_COOKIE}=${nextLocale}', 'explicit locale choice must persist in the locale cookie.');
requireText(localeSwitcher, "segments[0] === 'cs' || segments[0] === 'en'", 'locale switcher must preserve localized route structure.');

requireText(localizedHome, "cs: '/cs'", 'Czech hreflang is missing.');
requireText(localizedHome, "en: '/en'", 'English hreflang is missing.');
requireText(localizedHome, "'x-default': '/en'", 'x-default must remain English.');

requireText(schema, 'language: LanguageTagSchema.optional()', 'saved lessons must keep backward-compatible optional language metadata.');
requireText(ai, 'language: LanguageTagSchema,', 'new AI lessons must emit a language tag.');
requireText(workspace, "lessonLanguage: requestedLessonLanguage || 'auto'", 'lesson-language selection must be sent to generation.');
requireText(workspace, 'uiLocale: locale', 'UI locale must be sent separately from lesson language.');
requireText(workspace, "localizedApiError(data.error, locale, 'Generování selhalo.', 'Lesson generation failed.')", 'lesson authoring errors must remain localized instead of leaking server text.');
requireText(workspace, 'Write your brief in the language you want to use for the lesson.', 'lesson authoring must explicitly tell users they can write in the lesson language.');
requireText(ai, 'JAZYK LEKCE:', 'AI generation must receive an explicit lesson-language instruction.');
requireText(ai, 'Jazyk podkladů nesmí sám o sobě jazyk lekce změnit.', 'source-material language must not override lesson language.');
requireText(ai, 'JAZYK REVIZE: Zachovej hlavní jazyk existující lekce', 'locked whole-lesson revisions must preserve the current lesson language.');
requireText(ai, 'JAZYK REVIZE: Zachovej jazyk existující lekce', 'entitled block revisions must preserve language unless a change is explicitly requested.');
requireText(ai, 'options.allowLanguageChange === false', 'revision language behavior must remain entitlement-aware.');
if (ai.includes('Jazyk výstupu je čeština')) {
  throw new Error('i18n regression: AI output must not default unconditionally to Czech.');
}

requireText(studentEdge, 'lessonLanguage: typeof lesson.language === "string" ? lesson.language : null', 'student primary state must expose lesson language.');
requireText(studentSession, 'lessonLanguage: string | null;', 'student live state must carry lesson language.');
requireText(studentSession, 'contentLanguage={state.lessonLanguage}', 'student live lesson content must receive lesson language.');
requireText(studentSession, "localizedApiError(data.error, locale, 'Hodinu se nepodařilo načíst.', 'The lesson could not be loaded.')", 'student live errors must remain localized instead of leaking server text.');
requireText(studentSession, "ui('Tvoje skóre', 'Your score')", 'student final score label must remain localized.');
requireText(studentSession, "ui('místo', 'place')", 'student final rank suffix must remain localized.');
requireText(presenterRoute, 'lessonLanguage: lesson.data.language ?? null', 'Presenter primary API must expose lesson language.');
requireText(studentResponseInput, "ui('Odpověď je bezpečně uložená v tomto zařízení a odešle se po obnovení spojení.', 'Your answer is safely stored on this device and will be sent when the connection is restored.')", 'student offline answer message must remain localized.');
requireText(presenterMode, 'lessonLanguage: string | null;', 'Presenter state must carry lesson language.');
requireText(presenterMode, 'lang={data.lessonLanguage ?? undefined}', 'Presenter content must expose lesson language in the DOM.');
requireText(presenterMode, "localizedApiError(body.error, english ? 'en' : 'cs', 'Prezentační režim se nepodařilo načíst.', 'Presenter mode could not be loaded.')", 'presenter errors must remain localized instead of leaking server text.');
requireText(liveBlock, 'contentLanguage?: string | null;', 'live lesson block must accept content language.');
requireText(liveBlock, "dir={contentLanguage ? 'auto' : undefined}", 'lesson content must preserve automatic text direction for RTL languages.');
requireText(evaluationReviewQueue, "ui('Připravit novou verzi k hodnocení', 'Prepare newer version for grading')", 'evaluation regrade action must remain localized.');
requireText(evaluationReviewQueue, "ui('Potvrzeno učitelem.', 'Confirmed by teacher.')", 'evaluation review states must remain localized.');
requireText(evaluationReviewQueue, "ui('b.', 'pts')", 'grading criterion point suffix must remain localized.');

console.log('i18n source checks passed.');
