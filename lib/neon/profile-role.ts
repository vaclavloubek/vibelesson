import 'server-only';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function readProfileRole(userId: string): Promise<string | null> {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const rows = await createNeonSql()`
      select role from public.profiles where id = ${userId}::uuid limit 1
    `;
    return typeof rows[0]?.role === 'string' ? rows[0].role : null;
  }
  const { data, error } = await createAdminClient().from('profiles')
    .select('role').eq('id', userId).maybeSingle();
  if (error) throw new Error('profile_lookup_failed');
  return data?.role ?? null;
}

export async function readProfileLocale(userId: string): Promise<string | null> {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const rows = await createNeonSql()`
      select ui_locale from public.profiles where id = ${userId}::uuid limit 1
    `;
    return typeof rows[0]?.ui_locale === 'string' ? rows[0].ui_locale : null;
  }
  const { data, error } = await createAdminClient().from('profiles')
    .select('ui_locale').eq('id', userId).maybeSingle();
  if (error) throw new Error('profile_lookup_failed');
  return data?.ui_locale ?? null;
}
