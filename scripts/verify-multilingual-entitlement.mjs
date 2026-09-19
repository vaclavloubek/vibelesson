import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, snippet, message) {
  if (!text.includes(snippet)) throw new Error(`multilingual entitlement regression: ${message}`);
}

function planBlock(pricing, id, nextId) {
  const start = pricing.indexOf(`id: '${id}'`);
  if (start < 0) throw new Error(`multilingual entitlement regression: pricing plan ${id} is missing`);
  const end = nextId ? pricing.indexOf(`id: '${nextId}'`, start + 1) : pricing.length;
  return pricing.slice(start, end < 0 ? pricing.length : end);
}

const [migration, entitlements, generate, revise, reviseBlock, ai, workspace, pricing, version] = await Promise.all([
  source('supabase/migrations/20260919040333_add_multilingual_lessons_entitlement.sql'),
  source('app/api/entitlements/route.ts'),
  source('app/api/generate/route.ts'),
  source('app/api/revise/route.ts'),
  source('app/api/revise-block/route.ts'),
  source('lib/ai.ts'),
  source('components/LessonWorkspace.tsx'),
  source('components/PricingPage.tsx'),
  source('lib/version.ts'),
]);

requireText(migration, 'multilingual_lessons_enabled boolean not null default false', 'database entitlement columns must default fail-closed.');
requireText(migration, "code in ('teacher', 'teacher_pro', 'admin')", 'Teacher, Teacher Pro and Admin must receive the individual multilingual entitlement.');
requireText(migration, 'v_override.multilingual_lessons_enabled', 'manual entitlement overrides must support multilingual lessons.');
requireText(migration, 'multilingual_lessons_enabled = v_multilingual', 'plan provisioning must persist the effective multilingual entitlement.');

requireText(entitlements, 'multilingualLessonsEnabled', 'entitlements API must expose multilingual lesson access.');
requireText(entitlements, 'multilingual_lessons_enabled', 'entitlements API must read the server-authoritative profile flag.');

requireText(generate, 'LOCALE_REQUEST_HEADER', 'generation must derive the active UI locale from the server request.');
requireText(generate, ".select('role, ai_grading_enabled, multilingual_lessons_enabled')", 'generation must load the multilingual entitlement server-side.');
requireText(generate, "input.lessonLanguage !== 'auto'", 'direct premium-language requests must be rejected for unentitled users.');
requireText(generate, 'const effectiveLessonLanguage = multilingualLessonsEnabled', 'generation must compute an entitlement-aware lesson language.');
requireText(generate, ': requestLocale;', 'Free generation must fall back to the active UI locale.');
requireText(generate, 'lessonLanguage: effectiveLessonLanguage', 'AI generation must receive the entitlement-enforced language.');
requireText(generate, 'uiLocale: requestLocale', 'AI generation must use the server-resolved UI locale.');

for (const [name, route] of [['whole-lesson revision', revise], ['block revision', reviseBlock]]) {
  requireText(route, ".select('role, multilingual_lessons_enabled')", `${name} must load the multilingual entitlement server-side.`);
  requireText(route, "profile.role === 'admin' || profile.multilingual_lessons_enabled", `${name} must derive language-change access from the server-authoritative profile.`);
  requireText(route, '{ allowLanguageChange }', `${name} must pass the entitlement decision into the AI revision layer.`);
}

requireText(ai, 'type RevisionOptions = {', 'AI revision layer must expose an internal language-change policy option.');
requireText(ai, 'options.allowLanguageChange === false', 'AI revisions must support an explicit language lock.');
requireText(ai, 'TARIFNÍ OMEZENÍ JAZYKA REVIZE — ZÁVAZNÉ', 'Free revision language lock must be enforced in the AI system instruction.');
requireText(ai, 'Cizojazyčný obsah je povolený jako učivo', 'language lock must still allow foreign-language teaching content.');
requireText(ai, "throw new Error('Revision changed a locked lesson language.')", 'whole-lesson revisions must fail closed if the language tag changes despite the lock.');

requireText(workspace, 'multilingualLessonsEnabled', 'lesson authoring must react to the multilingual entitlement.');
requireText(workspace, "Ve Free tarifu se lekce vytvoří v jazyce rozhraní.", 'Free UI must explain its language restriction.');
requireText(workspace, 'disabled={!authUser || !entitlementsLoaded || !multilingualLessonsEnabled}', 'language picker must remain locked without the entitlement.');
requireText(workspace, "Automatické rozpoznání jazyka zadání a další jazyky jsou dostupné v tarifech Teacher, Teacher Pro a školních plánech.", 'UI must explain where multilingual generation is available.');
requireText(workspace, "Free tarif omezuje hlavní jazyk lekce.", 'saved Free lessons must show a prominent language-limit notice.');
requireText(workspace, 'href="/pricing"', 'Free language-limit notice must link to Pricing.');
requireText(workspace, "setRevisionLanguageNotice('whole_lesson')", 'successful Free whole-lesson revisions must surface language-lock feedback.');
requireText(workspace, "setRevisionLanguageNotice('activity')", 'successful Free block revisions must surface language-lock feedback.');
requireText(workspace, "Pokud pokyn žádal překlad nebo změnu hlavního jazyka, tato část se proto neprovedla.", 'revision feedback must explain why a requested language change was ignored.');

const free = planBlock(pricing, 'free', 'teacher');
const teacher = planBlock(pricing, 'teacher', 'teacher-pro');
const teacherPro = planBlock(pricing, 'teacher-pro', 'team');
const team = planBlock(pricing, 'team', 'school');
const school = planBlock(pricing, 'school', 'campus');
const campus = planBlock(pricing, 'campus', null);

if (free.includes('Lekce v libovolném jazyce') || free.includes('Lessons in any language')) {
  throw new Error('multilingual entitlement regression: Free pricing must not advertise lessons in any language.');
}
for (const [name, block] of [['Teacher', teacher], ['Teacher Pro', teacherPro], ['Team', team], ['School', school], ['Campus', campus]]) {
  if (!block.includes('Lekce v libovolném jazyce')) {
    throw new Error(`multilingual entitlement regression: ${name} must advertise lessons in any language.`);
  }
}
requireText(pricing, "feature === 'Lekce v libovolném jazyce'", 'teacher multilingual feature must use the premium emphasis hook.');
requireText(pricing, "plan.id === 'teacher' || plan.id === 'teacher-pro'", 'premium multilingual emphasis must be limited to individual paid teacher plans.');
requireText(version, "APP_VERSION = '0.9.19'", 'localized subscription lifecycle emails must publish as version 0.9.19.');

console.log('Multilingual entitlement checks passed.');
