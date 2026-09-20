import { readFile, readdir } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(`Contact inquiry regression: ${message}`);
}

function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(`Contact inquiry regression: ${message}`);
}

const [landing, form, route, gdpr] = await Promise.all([
  source('components/LandingPage.tsx'),
  source('components/LandingContactForm.tsx'),
  source('app/api/contact-inquiry/route.ts'),
  source('app/gdpr/page.tsx'),
]);

requirePattern(landing, /<LandingContactForm\s*\/>/, 'landing page must render the inquiry form.');
requirePattern(landing, /SectionCue href="#kontakt"/, 'the final landing CTA must keep the guided down-arrow into the inquiry section.');
requirePattern(form, /id="kontakt"/, 'inquiry section anchor is missing.');
requirePattern(form, /Zůstala vám otázka mimo radar\?/, 'approved light space-tone heading is missing.');
requirePattern(form, /type="email"/, 'email input is missing.');
requirePattern(form, /<textarea[\s\S]*name="message"/, 'question textarea is missing.');
requirePattern(form, /name="company"/, 'honeypot field is missing.');
requirePattern(form, /startedAt/, 'client-side fill timing marker is missing.');
requirePattern(form, /maxLength=\{3000\}/, 'message length must remain bounded.');
requirePattern(form, /contact_inquiry_submit/, 'safe analytics event is missing.');
forbidPattern(form, /trackEvent\([^)]*(email|message)/s, 'analytics must never include the submitted email or message.');

requirePattern(route, /isSameOrigin\(request\)/, 'same-origin POST protection is missing.');
requirePattern(route, /MAX_BODY_BYTES/, 'request body size guard is missing.');
requirePattern(route, /Buffer\.byteLength\(rawBody, 'utf8'\)/, 'actual request body size must be checked, not only content-length.');
requirePattern(route, /input\.company\.trim\(\)/, 'server-side honeypot handling is missing.');
requirePattern(route, /MIN_FILL_TIME_MS = 3_000/, 'minimum fill-time spam guard is missing.');
requirePattern(route, /createHmac\('sha256'/, 'privacy-preserving HMAC client hashing is missing.');
requirePattern(route, /schema\('private'\)\.from\('contact_form_rate_limits'\)/, 'persistent rate-limit reservation must use the private schema.');
requirePattern(route, /reservationError\?\.code === '23505'/, 'atomic unique-conflict rate limiting is missing.');
requirePattern(route, /reply_to: email/, 'inquiry email must remain directly replyable.');
requirePattern(route, /to: \['vaclav@syllonaut\.com', 'vaclav\.loubek@gmail\.com'\]/, 'inquiry must be delivered to both configured inboxes.');
requirePattern(route, /escapeHtml\(message\)/, 'message HTML escaping is missing.');
requirePattern(route, /30 \* 24 \* 60 \* 60 \* 1_000/, 'rate-limit history retention must remain bounded to 30 days.');
forbidPattern(route, /client_ip|ip_address|raw_ip/, 'raw IP addresses must not be stored.');

requirePattern(gdpr, /Kontaktní formulář:/, 'GDPR page must disclose contact-form data.');
requirePattern(gdpr, /Pseudonymizované záznamy rate-limitu/, 'GDPR page must disclose bounded anti-abuse hash retention.');

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = await readdir(migrationsDir);
const privateMigration = migrationFiles.find((file) => file.endsWith('_add_contact_form_rate_limits.sql'));
const cleanupMigration = migrationFiles.find((file) => file.endsWith('_drop_superseded_public_contact_form_rate_limit.sql'));

if (!privateMigration) throw new Error('Contact inquiry regression: private contact rate-limit migration is missing.');
if (!cleanupMigration) throw new Error('Contact inquiry regression: public-table cleanup migration is missing.');

const migration = await source(`supabase/migrations/${privateMigration}`);
const cleanup = await source(`supabase/migrations/${cleanupMigration}`);

requirePattern(migration, /create table if not exists private\.contact_form_rate_limits/i, 'private rate-limit table migration is missing.');
requirePattern(migration, /enable row level security/i, 'private rate-limit table must have RLS enabled.');
requirePattern(migration, /revoke all on table private\.contact_form_rate_limits from anon, authenticated/i, 'browser roles must not access the private rate-limit table.');
requirePattern(migration, /contact_form_rate_limits_client_window_uidx/i, 'per-client atomic rate-limit uniqueness is missing.');
requirePattern(migration, /contact_form_rate_limits_email_window_uidx/i, 'per-email atomic rate-limit uniqueness is missing.');
requirePattern(cleanup, /drop table if exists public\.contact_form_rate_limits/i, 'superseded public rate-limit table must be removed.');

console.log('Contact inquiry checks passed.');
