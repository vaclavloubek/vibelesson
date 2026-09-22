import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type LessonDetailRow = {
  id: string;
  source_prompt: string | null;
  lesson: unknown;
};

export class LessonDetailReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson detail lookup failed.', { cause });
    this.name = 'LessonDetailReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_LESSON_DETAIL_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonDetailReadError('INVALID_NEON_LESSON_DETAIL_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonDetailReadError('NEON_PRODUCTION_LESSON_DETAIL_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRow(row: Record<string, unknown> | null): LessonDetailRow | null {
  if (!row) return null;
  if (
    typeof row.id !== 'string'
    || (row.source_prompt !== null && typeof row.source_prompt !== 'string')
  ) {
    throw new LessonDetailReadError('INVALID_LESSON_DETAIL_RESULT');
  }

  return {
    id: row.id,
    source_prompt: row.source_prompt,
    lesson: row.lesson,
  };
}

async function readFromNeon(userId: string, lessonId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select
        id::text as id,
        source_prompt,
        lesson
      from public.lessons
      where id = ${lessonId}
        and owner_id = ${userId}
      limit 1
    `;

    return normalizeRow((rows[0] as Record<string, unknown> | undefined) ?? null);
  } catch (error) {
    if (error instanceof LessonDetailReadError) throw error;
    throw new LessonDetailReadError('NEON_LESSON_DETAIL_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string, lessonId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, source_prompt, lesson')
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) {
    throw new LessonDetailReadError(error.code || 'SUPABASE_LESSON_DETAIL_QUERY_FAILED', error);
  }

  return normalizeRow((data as Record<string, unknown> | null) ?? null);
}

export async function readLessonDetail(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  return shouldReadFromNeon()
    ? readFromNeon(userId, lessonId)
    : readFromSupabase(supabase, userId, lessonId);
}
