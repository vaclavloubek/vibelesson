import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROVIDER_CONTACT } from '../lib/provider-contact.ts';

const read = (path) => fs.readFileSync(path, 'utf8');

assert.equal(PROVIDER_CONTACT.phoneDisplay, '+420 733 377 199');
assert.equal(PROVIDER_CONTACT.phoneE164, '+420733377199');
assert.equal(PROVIDER_CONTACT.phoneHref, 'tel:+420733377199');
assert.equal(PROVIDER_CONTACT.email, 'vaclav@syllonaut.com');

for (const [path, requirements] of Object.entries({
  'app/terms/page.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'app/gdpr/page.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'components/PricingPage.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'components/SchoolAdmin.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'components/LandingContactForm.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'components/SiteFooter.tsx': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'lib/individual-contract-snapshot.ts': ['PROVIDER_CONTACT.phoneHref', 'PROVIDER_CONTACT.phoneDisplay'],
  'app/api/organizations/route.ts': ['providerContact:', 'phone: PROVIDER_CONTACT.phoneE164'],
})) {
  const source = read(path);
  for (const requirement of requirements) {
    assert.ok(source.includes(requirement), `${path} is missing ${requirement}`);
  }
}

const legal = read('lib/legal.ts');
assert.ok(legal.includes("TERMS_VERSION = '1.9'"));
assert.ok(legal.includes("TERMS_ACCEPTANCE_KEY = '2026-09-23-v10'"));
assert.ok(legal.includes("'2026-09-23-v9'"), 'Terms 1.8 access compatibility must be retained');
assert.ok(legal.includes("'2026-09-23-v8'"), 'Terms 1.7 access compatibility must be retained');
assert.ok(legal.includes("'2026-09-23-v7'"), 'Terms 1.6 access compatibility must be retained');
assert.ok(legal.includes("'2026-09-21-v6'"), 'Terms 1.5 access compatibility must be retained');
assert.ok(legal.includes("'2026-09-21-v5'"), 'Terms 1.4 access compatibility must be retained');
assert.ok(legal.includes("'2026-09-21-v4'"), 'Terms 1.3 access compatibility must be retained');

const migration = read('supabase/migrations/20260921114500_update_terms_1_4_legal_011.sql');
assert.ok(migration.includes("when '2026-09-21-v5' then '1.4'"));
assert.ok(migration.includes("'2026-09-21-v4', '2026-09-21-v5'"));
assert.ok(migration.includes('from public, anon, authenticated'));
assert.ok(migration.includes('to service_role'));

console.log('Provider telephone and current Terms compatibility checks passed.');
