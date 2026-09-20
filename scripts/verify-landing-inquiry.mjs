import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Landing inquiry regression: ${message}`);
}

function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(`Landing inquiry regression: ${message}`);
}

const [landing, form, route, migration, gdpr] = await Promise.all([
  source('components/LandingPage.tsx'),
  source('components/LandingContactForm.tsx'),
  source('app/api/contact-inquiry/route.ts'),
  source('supabase/migrations/20260920084131_add_contact_form_rate_limits.sql'),
  source('app/gdpr/page.tsx'),
]);

requirePattern(landing, /<LandingContactForm\s*\/>/, 'homepage must render the inquiry form.');
requirePattern(landing, /href="#kontakt"/, 'homepage must preserve a guided scroll cue to the inquiry section.');
requirePattern(form, /type="email"/, 'form must collect an email address.');
requirePattern(form, /<textarea[\s\S]*name="message"/, 'form must collect the enquiry text.');
requirePattern(form, /name="company"/, 'form must keep a hidden honeypot field.');
requirePattern(form, /startedAt/, 'form must send a client-side fill-start timestamp.');
requirePattern(form, /\/api\/contact-inquiry/, 'form must submit only to the server endpoint.');
requirePattern(form, /\/gdpr/, 'form must link to the privacy notice.');

requirePattern(route, /isSameOrigin\(request\)/, 'endpoint must reject cross-origin submissions.');
requirePattern(route, /MAX_BODY_BYTES/, 'endpoint must cap request size.');
requirePattern(route, /Buffer\.byteLength\(rawBody, 'utf8'\)/, 'endpoint must enforce the cap against the actual body.');
requirePattern(route, /input\.company\.trim\(\)/, 'endpoint must enforce the honeypot.');
requirePattern(route, /MIN_FILL_TIME_MS/, 'endpoint must reject implausibly fast submissions.');
requirePattern(route, /createHmac\('sha256'/, 'anti-abuse identifiers must be pseudonymised before persistence.');
requirePattern(route, /schema\('private'\)\.from\('contact_form_rate_limits'\)/, 'rate-limit ledger must stay in the private schema.');
requirePattern(route, /reservationError\?\.code === '23505'/, 'duplicate rate-limit reservations must become a user-safe 429.');
requirePattern(route, /reply_to: email/, 'reply-to must point to the enquiry sender.');
requirePattern(route, /to: \['vaclav@syllonaut\.com', 'vaclav\.loubek@gmail\.com'\]/, 'each enquiry must be delivered to both configured inboxes.');
forbidPattern(route, /client_hash:\s*ip\b/i, 'raw client IP must never be persisted.');
forbidPattern(route, /email_hash:\s*input\.email\b/i, 'raw email must never be persisted in the rate-limit ledger.');

requirePattern(migration, /create table if not exists private\.contact_form_rate_limits/, 'private rate-limit table migration is missing.');
requirePattern(migration, /enable row level security/, 'rate-limit table must have RLS enabled.');
requirePattern(migration, /revoke all on table private\.contact_form_rate_limits from anon, authenticated/, 'browser roles must not receive direct rate-limit table access.');
requirePattern(migration, /client_hash, window_bucket/, 'client-based rate-limit uniqueness is missing.');
requirePattern(migration, /email_hash, window_bucket/, 'email-based rate-limit uniqueness is missing.');

requirePattern(gdpr, /Kontaktní formulář:/, 'privacy notice must document the contact form.');
requirePattern(gdpr, /Pseudonymizované záznamy rate-limitu/, 'privacy notice must document anti-abuse retention.');

console.log('Landing inquiry checks passed.');
