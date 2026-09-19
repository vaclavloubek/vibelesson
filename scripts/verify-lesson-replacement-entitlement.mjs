import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/lessons/[id]/route.ts', import.meta.url), 'utf8');

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

requireText(route, ".from('lessons')", 'lesson replacement must read the persisted lesson.');
requireText(route, ".eq('id', id)", 'lesson replacement must scope reads/writes to the requested lesson.');
requireText(route, ".eq('owner_id', userId)", 'lesson replacement must remain owner-scoped.');
requireText(route, ".select('role, multilingual_lessons_enabled')", 'lesson replacement must load the server-authoritative multilingual entitlement.');
requireText(route, "profile.role === 'admin' || profile.multilingual_lessons_enabled", 'paid/admin language-change access must derive from the server profile.');
requireText(route, "(lesson.language ?? null) !== (currentLesson.language ?? null)", 'unentitled replacement must compare the proposed language to the persisted language.');
requireText(route, "{ status: 403 }", 'unentitled language changes must be rejected.');
requireText(route, "Ve Free tarifu nelze změnit hlavní jazyk uložené lekce.", 'rejected language replacement must return an explicit product-safe error.');
requireBefore(
  route,
  "(lesson.language ?? null) !== (currentLesson.language ?? null)",
  ".update({ title: lesson.title, lesson",
  'language entitlement must be checked before the replacement write.',
);

console.log('SEC-017 lesson-replacement entitlement checks passed.');
