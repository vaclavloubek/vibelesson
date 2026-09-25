import 'server-only';

import { createHash } from 'node:crypto';
import { sendResendEmail } from '@/lib/billing-email';
import { getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';

// Audit B6: marketing lifecycle failures are counted in
// private.marketing_lifecycle_failures (neon/migrations/0021) and mailed to the
// operator once a day. Recording never throws, so a missing table or a DB
// hiccup cannot break the request that triggered the Resend call.

const CODE_RE = /^[a-z0-9_]{1,64}$/;

/** Method + Resend path pattern; the contact email in the path is never kept. */
export function marketingFailureOperation(method: string | undefined, path: string) {
  const verb = (method ?? 'GET').toUpperCase();
  const pathname = path.split('?')[0].replace(/^\/contacts\/[^/]+/, '/contacts/:email');
  return `${verb} ${pathname}`;
}

export async function recordMarketingLifecycleFailure(operation: string, code: string) {
  if (getDatabaseBackend() !== 'neon') return;
  const safeCode = CODE_RE.test(code) ? code : 'unknown';
  try {
    await createNeonSql()`
      insert into private.marketing_lifecycle_failures (day, operation, code)
      values ((now() at time zone 'utc')::date, ${operation}, ${safeCode})
      on conflict (day, operation, code) do update
        set failure_count = private.marketing_lifecycle_failures.failure_count + 1,
            last_seen_at = now()
    `;
  } catch (error) {
    console.error('marketing lifecycle failure could not be recorded', {
      operation,
      code: safeCode,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

type FailureRow = {
  day: string | Date;
  operation: string;
  code: string;
  failure_count: number;
  reported_count: number;
  last_seen_at: string | Date;
};

function isoDay(value: string | Date) {
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

function isoMinute(value: string | Date) {
  return (value instanceof Date ? value.toISOString() : new Date(value).toISOString()).slice(0, 16).replace('T', ' ');
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Cron: mail the operator the failures not reported yet and keep 90 days. */
export async function sendMarketingFailureDigest() {
  if (getDatabaseBackend() !== 'neon') return { available: false as const };
  const sql = createNeonSql();
  const [ready] = await sql`
    select to_regclass('private.marketing_lifecycle_failures') is not null as ready
  `;
  if (ready?.ready !== true) return { available: false as const };

  await sql`
    delete from private.marketing_lifecycle_failures
    where day < (now() at time zone 'utc')::date - 90
  `;
  const rows = await sql`
    select day, operation, code, failure_count, reported_count, last_seen_at
    from private.marketing_lifecycle_failures
    where failure_count > reported_count
    order by day, operation, code
    limit 200
  ` as FailureRow[];
  if (!rows.length) return { available: true as const, reported: 0 };

  const total = rows.reduce((sum, row) => sum + Number(row.failure_count) - Number(row.reported_count), 0);
  const lines = rows.map((row) => (
    `${isoDay(row.day)}  ${row.operation}  ${row.code}: ${Number(row.failure_count) - Number(row.reported_count)}× (naposledy ${isoMinute(row.last_seen_at)} UTC)`
  ));
  const text = [
    'Marketingové lifecycle e-maily (Resend) hlásily chyby. Dotčené eventy a kontakty se do Resendu nedostaly.',
    '',
    ...lines,
    '',
    'resend_http_401 / resend_http_403: neplatný nebo omezený RESEND_API_KEY ve Vercelu (potřebuje Full access).',
    'resend_api_key_missing: RESEND_API_KEY chybí. resend_network_error / resend_http_5xx: výpadek Resendu.',
    'Záznamy: private.marketing_lifecycle_failures (Neon).',
  ].join('\n');
  const digestHash = createHash('sha256').update(text).digest('hex').slice(0, 16);

  await sendResendEmail({
    to: PROVIDER_CONTACT.email,
    subject: `[Marketing] ${total} chyb lifecycle e-mailů`,
    text,
    html: `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    idempotencyKey: `syllonaut:marketing-failures:${new Date().toISOString().slice(0, 10)}:${digestHash}`,
  });

  for (const row of rows) {
    await sql`
      update private.marketing_lifecycle_failures
      set reported_count = greatest(reported_count, ${Number(row.failure_count)})
      where day = ${isoDay(row.day)}::date and operation = ${row.operation} and code = ${row.code}
    `;
  }
  return { available: true as const, reported: total };
}
