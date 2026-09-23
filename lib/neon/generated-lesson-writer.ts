import 'server-only';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function saveGeneratedLesson(input: {
  ownerId: string;
  title: string;
  sourcePrompt: string;
  lesson: unknown;
  folderId: string | null;
}): Promise<string> {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const rows = await createNeonSql()`
      insert into public.lessons (owner_id, title, source_prompt, lesson, folder_id)
      values (
        ${input.ownerId}::uuid,
        ${input.title},
        ${input.sourcePrompt},
        ${JSON.stringify(input.lesson)}::jsonb,
        ${input.folderId}::uuid
      )
      returning id
    `;
    if (rows.length !== 1 || typeof rows[0].id !== 'string') {
      throw new Error('generated_lesson_insert_failed');
    }
    return rows[0].id;
  }

  const { data, error } = await createAdminClient().from('lessons')
    .insert({
      owner_id: input.ownerId,
      title: input.title,
      source_prompt: input.sourcePrompt,
      lesson: input.lesson,
      folder_id: input.folderId,
    })
    .select('id').single();
  if (error || !data?.id) throw error ?? new Error('generated_lesson_insert_failed');
  return data.id;
}
