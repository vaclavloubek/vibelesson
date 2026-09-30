import { access, readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

function fail(message) {
  throw new Error(`SEO files regression: ${message}`);
}

for (const file of ['app/robots.ts', 'app/sitemap.ts', 'app/apple-icon.tsx']) {
  await access(new URL(file, root)).catch(() => fail(`${file} is missing.`));
}

const robots = await readFile(new URL('app/robots.ts', root), 'utf8');
if (!robots.includes("sitemap: 'https://www.syllonaut.com/sitemap.xml'")) {
  fail('robots.ts must point to https://www.syllonaut.com/sitemap.xml.');
}

const layout = await readFile(new URL('app/layout.tsx', root), 'utf8');
const metadataBase = layout.match(/metadataBase: new URL\('([^']+)'\)/)?.[1];
const sitemapSource = await readFile(new URL('app/sitemap.ts', root), 'utf8');
if (!metadataBase || !sitemapSource.includes(`const BASE_URL = '${metadataBase}';`)) {
  fail(`sitemap.ts BASE_URL must match metadataBase in app/layout.tsx (${metadataBase}).`);
}

// Evaluate the real sitemap: strip the type-only import and TS annotations so
// plain Node can run it without a build step.
const runnable = sitemapSource
  .replace(/^import type .*$/m, '')
  .replace(/\): MetadataRoute\.Sitemap/, ')')
  .replace(/ as const/g, '');
const { default: sitemap } = await import(`data:text/javascript,${encodeURIComponent(runnable)}`);
const entries = sitemap();
const urls = new Set(entries.map((entry) => entry.url));

const paths = ['', '/pricing', '/requirements', '/terms', '/gdpr', '/dpa', '/withdrawal', '/complaint', '/referral'];
for (const locale of ['cs', 'en']) {
  for (const path of paths) {
    const url = `${metadataBase}/${locale}${path}`;
    if (!urls.has(url)) fail(`sitemap is missing ${url}.`);
    const entry = entries.find((item) => item.url === url);
    const languages = entry.alternates?.languages ?? {};
    if (languages.cs !== `${metadataBase}/cs${path}` || languages.en !== `${metadataBase}/en${path}`) {
      fail(`sitemap entry ${url} must list cs and en alternates.`);
    }
  }
}
if (entries.length !== paths.length * 2) fail(`sitemap must contain exactly ${paths.length * 2} URLs, found ${entries.length}.`);

// Every page under app/[locale] is either in the sitemap or disallowed for
// both locales, so a new private localized page can't slip into the index.
const robotsRunnable = robots
  .replace(/^import type .*$/m, '')
  .replace(/\): MetadataRoute\.Robots/, ')');
const { default: robotsConfig } = await import(`data:text/javascript,${encodeURIComponent(robotsRunnable)}`);
const disallow = [robotsConfig().rules.disallow].flat();
const isDisallowed = (url) => disallow.some((rule) => url.startsWith(rule));

for (const required of ['/lessons', '/lessons/1', '/join', '/school', '/subscription', '/cs/subscription', '/en/terms/accept']) {
  if (!isDisallowed(required)) fail(`robots.txt must disallow ${required}.`);
}

const localeDir = new URL('app/[locale]/', root);
const localePages = (await readdir(localeDir, { recursive: true }))
  .filter((file) => file === 'page.tsx' || file.endsWith('/page.tsx'))
  .map((file) => (file === 'page.tsx' ? '' : `/${file.slice(0, -'/page.tsx'.length)}`));
for (const pagePath of localePages) {
  for (const locale of ['cs', 'en']) {
    const path = `/${locale}${pagePath}`;
    const inSitemap = urls.has(`${metadataBase}${path}`);
    if (inSitemap && isDisallowed(path)) fail(`${path} is in the sitemap but disallowed in robots.txt.`);
    if (!inSitemap && !isDisallowed(path)) fail(`${path} is neither in the sitemap nor disallowed in robots.txt.`);
  }
}

console.log('SEO files checks passed.');
