import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`Lesson workspace scroll regression: ${message}`);
}

const workspace = source('components/LessonWorkspace.tsx');
const styles = source('app/globals.css');

requireText(workspace, "--builder-available-height", 'desktop builder does not publish its measured viewport height.');
requireText(workspace, "builder.getBoundingClientRect().top", 'builder height is not based on its real viewport position.');
requireText(workspace, "window.visualViewport", 'visual viewport changes are not accounted for.');
requireText(workspace, "window.addEventListener('scroll', updateBuilderViewportHeight", 'page scrolling does not refresh the available builder height.');
requireText(workspace, "window.addEventListener('resize', updateBuilderViewportHeight", 'viewport resizing does not refresh the available builder height.');
requireText(workspace, "window.matchMedia('(max-width: 900px)').matches", 'mobile fallback boundary is missing.');

requireText(
  styles,
  'max-height: var(--builder-available-height, calc(100dvh - 112px));',
  'builder does not consume the measured viewport height with a safe CSS fallback.',
);
requireText(styles, 'overflow-y: auto;', 'builder no longer has its own desktop scroll.');
requireText(styles, 'max-height: none;', 'mobile layout must return to normal page scrolling.');

console.log('Lesson workspace scroll checks passed.');
