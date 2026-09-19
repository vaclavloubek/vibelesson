import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repoRoot, 'node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.min.mjs');
const targetDir = resolve(repoRoot, 'public');
const target = resolve(targetDir, 'pdf.worker.min.mjs');

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);

console.log(`Prepared PDF worker at ${target}`);
