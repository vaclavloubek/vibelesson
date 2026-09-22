import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/lessons/[id]/route.ts', import.meta.url), 'utf8');
const writer = await readFile(new URL('../lib/lesson-content-writer.ts', import.meta.url), 'utf8');

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`SEC-017 regression: ${message}`);
}

function requireBefore(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`SEC-017 regression: ${message}`);
  }
}

requireText(route, 'readLessonContentForWrite(supabase, userId, id)', 'lesson replacement must read the persisted lesson through the selected backend.');
requireText(writer, ".from('lessons')", 'the Supabase fallback must read the persisted lesson.');
requireText(writer, 'where id = ${lessonId}', 'the Neon path must scope reads/writes to the requested lesson.');
requireText(writer, 'and owner_id = ${userId}', 'the Neon path must remain owner-scoped.');
requireText(writer, ".eq('id', lessonId)", 'the Supabase fallback must scope reads/writes to the requested lesson.');
requireText(writer, ".eq('owner_id', userId)", 'the Supabase fallback must remain owner-scoped.');
requireText(route, ".select('role, multilingual_lessons_enabled')", 'lesson replacement must load the server-authoritative multilingual entitlement.');
requireText(route, "profile.role === 'admin' || profile.multilingual_lessons_enabled", 'paid/admin language-change access must derive from the server profile.');
requireText(route, "(lesson.language ?? null) !== (currentLesson.language ?? null)", 'unentitled replacement must compare the proposed language to the persisted language.');
requireText(route, "{ status: 403 }", 'unentitled language changes must be rejected.');
requireText(route, "Ve Free tarifu nelze změnit hlavní jazyk uložené lekce.", 'rejected language replacement must return an explicit product-safe error.');
requireBefore(
  route,
  "(lesson.language ?? null) !== (currentLesson.language ?? null)",
  'writeLessonContent(supabase, userId, id, lesson)',
  'language entitlement must be checked before the replacement write.',
);

console.log('SEC-017 lesson-replacement entitlement checks passed.');
