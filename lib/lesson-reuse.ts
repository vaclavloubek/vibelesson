import type { SupabaseClient } from '@supabase/supabase-js';

export async function getLessonReuseEntitlement(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('lesson_reuse_enabled');

  if (!error) return data === true;

  console.error('load lesson reuse entitlement failed', error);

  // Compatibility fallback for a partially rolled-out database migration.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, active_plan_code')
    .maybeSingle();

  if (profileError) {
    console.error('fallback lesson reuse entitlement failed', profileError);
    return false;
  }

  return Boolean(
    profile
    && (
      profile.role === 'admin'
      || (typeof profile.active_plan_code === 'string' && profile.active_plan_code !== 'free')
    )
  );
}
