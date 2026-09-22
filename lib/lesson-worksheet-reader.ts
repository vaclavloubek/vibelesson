import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type LessonWorksheetRow = {
  id: string;
  lesson: unknown;
};

export class LessonWorksheetReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson worksheet lookup failed.', { cause });
    this.name = 'LessonWorksheetReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_LESSON_WORKSHEET_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonWorksheetReadError('INVALID_NEON_LESSON_WORKSHEET_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonWorksheetReadError('NEON_PRODUCTION_LESSON_WORKSHEET_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRow(row: Record<string, unknown> | null): LessonWorksheetRow | null {
  if (!row) return null;
  if (typeof row.id !== 'string') {
    throw new LessonWorksheetReadError('INVALID_LESSON_WORKSHEET_RESULT');
  }

  return {
    id: row.id,
    lesson: row.lesson,
  };
}

async function readFromNeon(userId: string, lessonId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select
        id::text as id,
        lesson
      from public.lessons
      where id = ${lessonId}
        and owner_id = ${userId}
      limit 1
    `;

    return normalizeRow((rows[0] as Record<string, unknown> | undefined) ?? null);
  } catch (error) {
    if (error instanceof LessonWorksheetReadError) throw error;
    throw new LessonWorksheetReadError('NEON_LESSON_WORKSHEET_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string, lessonId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson')
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) {
    throw new LessonWorksheetReadError(error.code || 'SUPABASE_LESSON_WORKSHEET_QUERY_FAILED', error);
  }

  return normalizeRow((data as Record<string, unknown> | null) ?? null);
}

export async function readLessonWorksheet(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  return shouldReadFromNeon()
    ? readFromNeon(userId, lessonId)
    : readFromSupabase(supabase, userId, lessonId);
}
