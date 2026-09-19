import { access, readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`pdf worker regression: ${message}`);
}

function rejectText(text, needle, message) {
  if (text.includes(needle)) throw new Error(`pdf worker regression: ${message}`);
}

const [materialsClient, packageJson, copyScript, nextConfig, gitignore] = await Promise.all([
  source('lib/materials-client.ts'),
  source('package.json'),
  source('scripts/copy-pdf-worker.mjs'),
  source('next.config.ts'),
  source('.gitignore'),
]);

requireText(materialsClient, "const PDF_WORKER_URL = '/pdf.worker.min.mjs';", 'browser PDF extraction must use the same-origin worker asset.');
rejectText(materialsClient, 'cdn.jsdelivr.net', 'browser PDF extraction must not depend on an external worker CDN.');

requireText(packageJson, '"predev": "npm run prepare:pdf-worker"', 'local development must prepare the worker before Next.js starts.');
requireText(packageJson, '"prebuild": "npm run prepare:pdf-worker"', 'production builds must prepare the worker before Next.js builds.');
requireText(copyScript, 'node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.min.mjs', 'worker must come from the installed pdf-parse package.');
requireText(copyScript, "resolve(targetDir, 'pdf.worker.min.mjs')", 'worker must be copied to the public same-origin path.');
requireText(gitignore, 'public/pdf.worker.min.mjs', 'generated worker asset must not be committed.');

requireText(nextConfig, '"worker-src \'self\' blob:"', 'CSP must continue allowing same-origin workers.');
rejectText(nextConfig, 'cdn.jsdelivr.net', 'fix must not weaken CSP by allowing the external CDN.');

await access(new URL('../node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.min.mjs', import.meta.url));

console.log('PDF worker checks passed.');
