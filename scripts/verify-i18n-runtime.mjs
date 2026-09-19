const baseUrl = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

function fail(message) {
  throw new Error(`i18n runtime regression: ${message}`);
}

async function request(path, { country, cookie, acceptLanguage, redirect = 'manual' } = {}) {
  const headers = {};
  if (country) headers['x-vercel-ip-country'] = country;
  if (cookie) headers.cookie = cookie;
  if (acceptLanguage) headers['accept-language'] = acceptLanguage;
  return fetch(`${baseUrl}${path}`, { headers, redirect });
}

function redirectPath(res) {
  const location = res.headers.get('location');
  return location ? new URL(location, baseUrl).pathname : null;
}

async function expectRedirect(path, expected, options = {}) {
  const res = await request(path, options);
  if (![301, 302, 303, 307, 308].includes(res.status)) {
    fail(`${path}: expected redirect to ${expected}, got HTTP ${res.status}`);
  }
  const actual = redirectPath(res);
  if (actual !== expected) fail(`${path}: expected redirect to ${expected}, got ${actual}`);
}

async function expectHtml(path, snippets, options = {}) {
  const res = await request(path, { ...options, redirect: 'follow' });
  if (!res.ok) fail(`${path}: expected HTTP 2xx, got ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) fail(`${path}: expected HTML, got ${contentType}`);
  const html = await res.text();
  for (const snippet of snippets) {
    if (!html.includes(snippet)) fail(`${path}: missing ${JSON.stringify(snippet)}`);
  }
  return html;
}

await expectRedirect('/', '/cs', { country: 'CZ' });
await expectRedirect('/', '/cs', { country: 'SK' });
await expectRedirect('/', '/en', { country: 'US' });
await expectRedirect('/', '/en', { country: 'CZ', cookie: 'syllonaut_locale=en' });
await expectRedirect('/', '/cs', { country: 'US', cookie: 'syllonaut_locale=cs' });
await expectRedirect('/', '/en', { acceptLanguage: 'en-US,en;q=0.9' });
await expectRedirect('/', '/cs', { acceptLanguage: 'sk-SK,sk;q=0.9' });

await expectRedirect('/pricing', '/cs/pricing', { country: 'CZ' });
await expectRedirect('/pricing', '/en/pricing', { country: 'US' });
await expectRedirect('/gdpr', '/cs/gdpr', { country: 'CZ' });
await expectRedirect('/gdpr', '/en/gdpr', { country: 'US' });

const enHome = await expectHtml('/en', [
  '<html lang="en"',
  'From an idea to a live interactive lesson.',
  'Write in the language you want to teach in.',
]);
const enHomeLower = enHome.toLowerCase();
for (const hreflang of ['cs', 'en', 'x-default']) {
  if (!enHomeLower.includes(`hreflang="${hreflang}"`)) {
    fail(`/en is missing hreflang="${hreflang}"`);
  }
}
if (enHome.includes('Z nápadu do živé interaktivní hodiny.')) {
  fail('/en contains the Czech hero headline');
}

const csHome = await expectHtml('/cs', [
  '<html lang="cs"',
  'Z nápadu do živé interaktivní hodiny.',
  'Pište v jazyce, ve kterém chcete učit.',
]);
if (csHome.includes('From an idea to a live interactive lesson.')) {
  fail('/cs contains the English hero headline');
}

await expectHtml('/en/pricing', [
  '<html lang="en"',
  'Start free. Add more capacity when you need it.',
  'For teachers',
  'For schools',
]);
await expectHtml('/cs/pricing', [
  '<html lang="cs"',
  'Začněte zdarma. Přidejte výkon, až ho budete potřebovat.',
  'Pro učitele',
  'Pro školy',
]);

await expectHtml('/en/pricing', [
  '<html lang="en"',
  '199 Kč',
], { country: 'CZ' });
await expectHtml('/cs/pricing', [
  '<html lang="cs"',
  '$8.99',
], { country: 'US' });

await expectHtml('/en/gdpr', [
  '<html lang="en"',
  'Privacy and personal data (GDPR)',
  'Data controller',
]);
await expectHtml('/cs/gdpr', [
  '<html lang="cs"',
  'Ochrana osobních údajů (GDPR)',
  'Správce osobních údajů',
]);

await expectHtml('/new', [
  '<html lang="en"',
  'What should students experience today?',
  'On Free, the lesson is created in the interface language.',
  'Automatic brief-language detection and additional languages are available on Teacher, Teacher Pro and school plans.',
], { cookie: 'syllonaut_locale=en' });

await expectHtml('/new', [
  '<html lang="cs"',
  'Co mají studenti dnes zažít?',
  'Ve Free tarifu se lekce vytvoří v jazyce rozhraní.',
  'Automatické rozpoznání jazyka zadání a další jazyky jsou dostupné v tarifech Teacher, Teacher Pro a školních plánech.',
], { cookie: 'syllonaut_locale=cs' });

await expectHtml('/join', [
  '<html lang="en"',
  'Enter the lesson code',
], { cookie: 'syllonaut_locale=en' });

await expectHtml('/join', [
  '<html lang="cs"',
  'Zadej kód hodiny',
], { cookie: 'syllonaut_locale=cs' });

for (const locale of ['cs', 'en']) {
  const image = await request(`/${locale}/opengraph-image`, { redirect: 'follow' });
  if (!image.ok) fail(`/${locale}/opengraph-image: expected HTTP 2xx, got ${image.status}`);
  const contentType = image.headers.get('content-type') || '';
  if (!contentType.includes('image/png')) {
    fail(`/${locale}/opengraph-image: expected image/png, got ${contentType}`);
  }
}

console.log('i18n runtime smoke checks passed.');
