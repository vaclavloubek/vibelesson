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

const [migration, entitlements, generate, workspace, pricing, version] = await Promise.all([
  source('supabase/migrations/20260919040333_add_multilingual_lessons_entitlement.sql'),
  source('app/api/entitlements/route.ts'),
  source('app/api/generate/route.ts'),
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

requireText(workspace, 'multilingualLessonsEnabled', 'lesson authoring must react to the multilingual entitlement.');
requireText(workspace, "Ve Free tarifu se lekce vytvoří v jazyce rozhraní.", 'Free UI must explain its language restriction.');
requireText(workspace, 'disabled={!authUser || !entitlementsLoaded || !multilingualLessonsEnabled}', 'language picker must remain locked without the entitlement.');
requireText(workspace, "Automatické rozpoznání jazyka zadání a další jazyky jsou dostupné v tarifech Teacher, Teacher Pro a školních plánech.", 'UI must explain where multilingual generation is available.');

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
requireText(version, "APP_VERSION = '0.9.01'", 'this functional change must publish as version 0.9.01.');

console.log('Multilingual entitlement checks passed.');
