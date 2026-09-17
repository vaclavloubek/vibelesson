import type { SupabaseClient } from '@supabase/supabase-js';

export type LessonFolderEntitlement = {
  role: string | null;
  enabled: boolean;
};

export async function getLessonFolderEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<LessonFolderEntitlement> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, lesson_folders_enabled')
    .eq('id', userId)
    .single();

  if (error || !data) {
    if (error) console.error('load lesson folder entitlement failed', error);
    return { role: null, enabled: false };
  }

  const role = typeof data.role === 'string' ? data.role : null;
  return {
    role,
    enabled: role === 'admin' || data.lesson_folders_enabled === true,
  };
}
