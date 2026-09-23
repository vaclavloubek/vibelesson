import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function required(name, fallbackName) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`${name} is unavailable.`);
  return value;
}

function assertHost(value, suffix, name) {
  const url = new URL(value);
  if (!url.hostname.endsWith(suffix)) throw new Error(`${name} points to an unexpected host.`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

const neonUrl = required('NEON_DATABASE_URL', 'DATABASE_URL');
const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
assertHost(neonUrl, '.neon.tech', 'NEON_DATABASE_URL');
assertHost(supabaseUrl, '.supabase.co', 'NEXT_PUBLIC_SUPABASE_URL');

const sql = neon(neonUrl, { fetchOptions: { signal: AbortSignal.timeout(15_000) } });
const rows = await sql`
  select token, snapshot
  from public.lesson_shares
  where status = 'active'
    and organization_origin_id is null
  order by created_at
  limit 1
`;

if (rows.length !== 1) throw new Error('No eligible shared lesson exists in Neon staging.');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  },
});
const { data, error } = await supabase.rpc('get_lesson_share', { p_token: rows[0].token });
if (error) throw new Error(`Supabase comparison query failed (${error.code || 'unknown'}).`);
if (fingerprint(rows[0].snapshot) !== fingerprint(data)) {
  throw new Error('Supabase and Neon returned different shared-lesson snapshots.');
}

console.log('PASS: Supabase RPC and Neon server SQL returned the same shared-lesson snapshot.');
console.log('Read-only parity check completed; no token, lesson content, or secret was logged.');
