import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type LessonFolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

export class LessonFolderReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson folder lookup failed.', { cause });
    this.name = 'LessonFolderReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.DATABASE_BACKEND === 'neon' ? 'true' : process.env.NEON_LESSON_FOLDER_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonFolderReadError('INVALID_NEON_LESSON_FOLDER_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonFolderReadError('NEON_PRODUCTION_FOLDER_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRows(rows: Record<string, unknown>[]): LessonFolderRow[] {
  return rows.map((row) => {
    if (
      typeof row.id !== 'string'
      || typeof row.name !== 'string'
      || (row.parent_id !== null && typeof row.parent_id !== 'string')
    ) {
      throw new LessonFolderReadError('INVALID_LESSON_FOLDER_RESULT');
    }

    return {
      id: row.id,
      name: row.name,
      parent_id: row.parent_id,
    };
  }).sort((left, right) => (
    left.name.localeCompare(right.name, 'cs') || left.id.localeCompare(right.id)
  ));
}

async function readFromNeon(userId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select id::text as id, name, parent_id::text as parent_id
      from public.lesson_folders
      where owner_id = ${userId}
      order by name asc, id asc
    `;

    return normalizeRows(rows);
  } catch (error) {
    if (error instanceof LessonFolderReadError) throw error;
    throw new LessonFolderReadError('NEON_LESSON_FOLDER_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('lesson_folders')
    .select('id, name, parent_id')
    .eq('owner_id', userId)
    .order('name', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    throw new LessonFolderReadError(error.code || 'SUPABASE_LESSON_FOLDER_QUERY_FAILED', error);
  }

  return normalizeRows((data ?? []) as Record<string, unknown>[]);
}

export async function readLessonFolders(supabase: SupabaseClient, userId: string) {
  return shouldReadFromNeon()
    ? readFromNeon(userId)
    : readFromSupabase(supabase, userId);
}
