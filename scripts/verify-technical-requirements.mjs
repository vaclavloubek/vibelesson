import assert from 'node:assert/strict';
import fs from 'node:fs';

// LEGAL-018: published technical requirements match the product and reach every pre-purchase surface.
const read = (path) => fs.readFileSync(path, 'utf8');

const requirements = read('lib/technical-requirements.ts');
const nextTargets = 'node_modules/next/dist/shared/lib/modern-browserslist-target.js';
if (fs.existsSync(nextTargets)) {
  const targets = read(nextTargets);
  for (const [browser, version] of [['chrome', '111'], ['edge', '111'], ['firefox', '111'], ['safari', '16.4']]) {
    assert.ok(targets.includes(`'${browser} ${version}'`), `Next.js browser target changed for ${browser}; update SUPPORTED_BROWSERS`);
  }
}
for (const needle of ["chrome: 111", "edge: 111", "firefox: 111", "safari: '16.4'"]) {
  assert.ok(requirements.includes(needle), `published browser support is missing ${needle}`);
}
for (const needle of [
  'MATERIAL_MAX_FILES', 'MATERIAL_MAX_TOTAL_BYTES', 'PDF, PPTX, DOCX, TXT',
  'challenges.cloudflare.com', 'Service Worker, IndexedDB', 'WebSocket', 'CSV', 'JavaScript',
]) {
  assert.ok(requirements.includes(needle), `technical requirements must state: ${needle}`);
}
const workspace = read('components/LessonWorkspace.tsx');
assert.ok(workspace.includes('accept=".pdf,.pptx,.docx,.txt,.md'), 'upload formats changed; update the technical requirements');
assert.ok(read('components/AuthControls.tsx').includes('https://challenges.cloudflare.com/turnstile'), 'Turnstile host changed; update the technical requirements');

assert.ok(read('app/requirements/page.tsx').includes('TECHNICAL_REQUIREMENTS[locale]'), 'public requirements page renders the shared source');
assert.ok(fs.existsSync('app/[locale]/requirements/page.tsx'), 'localized requirements route exists');
assert.ok(read('proxy.ts').includes("pathname === '/requirements'"), 'requirements page uses the locale gateway');
assert.ok(read('components/SiteFooter.tsx').includes('/requirements`'), 'footer links the requirements page');
const pricing = read('components/PricingPage.tsx');
assert.ok((pricing.match(/\/requirements`/g) ?? []).length >= 2, 'Pricing and the card checkout dialog link the requirements');
assert.ok(read('components/SchoolAdmin.tsx').includes('/requirements`'), 'school order summary links the requirements');
assert.ok(read('.github/workflows/accessibility.yml').includes('/cs/requirements'), 'requirements page is covered by axe checks');

console.log('LEGAL-018 technical requirements checks passed.');
