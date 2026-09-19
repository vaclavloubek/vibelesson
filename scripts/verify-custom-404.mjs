import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/not-found.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app/not-found.module.css', import.meta.url), 'utf8');

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(`Custom 404 regression: ${message}`);
}

requirePattern(page, /SyllonautMark/, 'the 404 page must use the real Syllonaut brand mark.');
requirePattern(page, /Vaše lekce doletěla do prázdného vesmíru\./, 'the Czech cosmic headline is missing.');
requirePattern(page, /Your lesson drifted into empty space\./, 'the English cosmic headline is missing.');
requirePattern(page, /LOCALE_REQUEST_HEADER[\s\S]*normalizeUiLocale/, 'the 404 page must follow the existing locale routing logic.');
requirePattern(page, /href=\{\`\/\$\{locale\}\`\}/, 'the 404 page must link back to the localized home page.');
requirePattern(page, /href="\/lessons"/, 'the 404 page must offer a direct My lessons route.');
requirePattern(page, /aria-labelledby="not-found-title"/, 'the main 404 card must have an accessible heading relationship.');
requirePattern(page, /aria-hidden="true"/, 'the decorative cosmic visual must stay hidden from assistive technology.');

requirePattern(styles, /var\(--bg\)/, 'the page must use the Syllonaut background token.');
requirePattern(styles, /var\(--accent\)/, 'the page must use the Syllonaut accent token.');
requirePattern(styles, /var\(--font-geist-mono\)/, 'the 404 visual must reuse the project mono typography.');
requirePattern(styles, /@media \(max-width: 820px\)/, 'the 404 layout must adapt for tablet/mobile.');
requirePattern(styles, /@media \(max-width: 480px\)/, 'the 404 actions must adapt for narrow mobile screens.');

console.log('Custom 404 source checks passed.');
