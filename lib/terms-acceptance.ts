import {
  TERMS_ACCEPTANCE_KEY,
  TERMS_PRODUCT_ACCESS_KEYS,
  TERMS_VERSION,
} from '@/lib/legal';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

export const TERMS_RECONSENT_SOURCE = 'reconsent';

export async function hasCurrentTermsAcceptance(userId: string) {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select exists (
        select 1 from private.terms_acceptance_events tae
        where tae.user_id = ${userId}::uuid
          and tae.acceptance_key = any (
            array(select jsonb_array_elements_text(${JSON.stringify(TERMS_PRODUCT_ACCESS_KEYS)}::jsonb))
          )
      ) as accepted
    `;
    return rows[0]?.accepted === true;
  }

  const admin = createAdminClient();
  const batchResult = await admin.rpc('has_any_terms_acceptance_for_service', {
    p_user_id: userId,
    p_acceptance_keys: [...TERMS_PRODUCT_ACCESS_KEYS],
  });

  if (!batchResult.error) return batchResult.data === true;

  // Keep deploys reversible: old databases can serve the new application until
  // the additive batch RPC migration is applied.
  const missingBatchRpc = batchResult.error.code === 'PGRST202'
    || batchResult.error.message.includes('has_any_terms_acceptance_for_service');
  if (!missingBatchRpc) {
    console.error('current Terms acceptance batch lookup failed', {
      userId,
      error: batchResult.error.message,
      termsVersion: TERMS_VERSION,
    });
    throw new Error('terms_acceptance_lookup_failed');
  }

  const legacyResults = await Promise.all(TERMS_PRODUCT_ACCESS_KEYS.map((acceptanceKey) =>
    admin.rpc('has_terms_acceptance_for_service', {
      p_user_id: userId,
      p_acceptance_key: acceptanceKey,
    }).then((result) => ({ acceptanceKey, ...result })),
  ));

  for (const { acceptanceKey, data, error } of legacyResults) {
    if (error) {
      console.error('current Terms acceptance lookup failed', {
        userId,
        error: error.message,
        termsVersion: TERMS_VERSION,
        acceptanceKey,
      });
      throw new Error('terms_acceptance_lookup_failed');
    }
  }

  return legacyResults.some(({ data }) => data === true);
}

export async function recordCurrentTermsReconsent(userId: string) {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    // Like Neon signup, write the append-only audit row directly so a new
    // Terms version needs no database key/version mapping.
    const rows = await sql`
      with inserted as (
        insert into private.terms_acceptance_events (user_id, terms_version, acceptance_key, source)
        select ${userId}::uuid, ${TERMS_VERSION}::text, ${TERMS_ACCEPTANCE_KEY}::text, ${TERMS_RECONSENT_SOURCE}::text
        where exists (select 1 from public.profiles p where p.id = ${userId}::uuid)
        on conflict (user_id, acceptance_key, source) do nothing
        returning accepted_at
      )
      select accepted_at from inserted
      union all
      select tae.accepted_at from private.terms_acceptance_events tae
      where tae.user_id = ${userId}::uuid
        and tae.acceptance_key = ${TERMS_ACCEPTANCE_KEY}::text
        and tae.source = ${TERMS_RECONSENT_SOURCE}::text
      order by accepted_at asc
      limit 1
    `;
    const acceptedAt = rows[0]?.accepted_at;
    if (acceptedAt instanceof Date) return acceptedAt.toISOString();
    if (typeof acceptedAt === 'string') return acceptedAt;
    throw new Error('terms_reconsent_write_failed');
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_terms_reconsent_for_service', {
    p_user_id: userId,
    p_acceptance_key: TERMS_ACCEPTANCE_KEY,
  });

  if (error || typeof data !== 'string') {
    console.error('Terms re-consent audit write failed', {
      userId,
      error: error?.message ?? null,
      termsVersion: TERMS_VERSION,
      acceptanceKey: TERMS_ACCEPTANCE_KEY,
    });
    throw new Error('terms_reconsent_write_failed');
  }

  return data;
}
