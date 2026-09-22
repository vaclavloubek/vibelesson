import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type LessonFolderMutationRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

export class LessonFolderWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson folder mutation failed.', { cause });
    this.name = 'LessonFolderWriteError';
    this.code = code;
  }
}

function shouldWriteToNeon() {
  const enabled = process.env.NEON_LESSON_FOLDER_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonFolderWriteError('INVALID_NEON_LESSON_FOLDER_WRITES');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonFolderWriteError('NEON_PRODUCTION_FOLDER_WRITE_NOT_APPROVED');
  }

  return true;
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function normalizeFolder(row: Record<string, unknown> | undefined): LessonFolderMutationRow {
  if (
    !row
    || typeof row.id !== 'string'
    || typeof row.name !== 'string'
    || (row.parent_id !== null && typeof row.parent_id !== 'string')
  ) {
    throw new LessonFolderWriteError('INVALID_LESSON_FOLDER_WRITE_RESULT');
  }

  return { id: row.id, name: row.name, parent_id: row.parent_id };
}

async function createInNeon(userId: string, name: string, parentId: string | null) {
  const sql = createNeonSql();

  if (parentId) {
    const parents = await sql`
      select parent_id::text as parent_id
      from public.lesson_folders
      where id = ${parentId}
        and owner_id = ${userId}
      limit 1
    `;
    const parent = parents[0];
    if (!parent) throw new LessonFolderWriteError('PARENT_NOT_FOUND');
    if (parent.parent_id !== null) throw new LessonFolderWriteError('FOLDER_DEPTH_LIMIT');
  }

  try {
    const rows = await sql`
      insert into public.lesson_folders (owner_id, parent_id, name)
      values (${userId}, ${parentId}, ${name})
      returning id::text as id, name, parent_id::text as parent_id
    `;
    return normalizeFolder(rows[0]);
  } catch (error) {
    if (error instanceof LessonFolderWriteError) throw error;
    const code = databaseErrorCode(error);
    if (code === '23505') throw new LessonFolderWriteError('DUPLICATE_FOLDER', error);
    if (code === '23503') throw new LessonFolderWriteError('PARENT_NOT_FOUND', error);
    if (code === '23514') throw new LessonFolderWriteError('FOLDER_DEPTH_LIMIT', error);
    throw new LessonFolderWriteError('NEON_CREATE_FOLDER_FAILED', error);
  }
}

async function createInSupabase(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  parentId: string | null,
) {
  if (parentId) {
    const { data: parent, error } = await supabase
      .from('lesson_folders')
      .select('parent_id')
      .eq('id', parentId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error) throw new LessonFolderWriteError(error.code || 'SUPABASE_PARENT_LOOKUP_FAILED', error);
    if (!parent) throw new LessonFolderWriteError('PARENT_NOT_FOUND');
    if (parent.parent_id) throw new LessonFolderWriteError('FOLDER_DEPTH_LIMIT');
  }

  const { data, error } = await supabase
    .from('lesson_folders')
    .insert({ owner_id: userId, parent_id: parentId, name })
    .select('id, name, parent_id')
    .single();

  if (error) {
    if (error.code === '23505') throw new LessonFolderWriteError('DUPLICATE_FOLDER', error);
    throw new LessonFolderWriteError(error.code || 'SUPABASE_CREATE_FOLDER_FAILED', error);
  }
  return normalizeFolder(data as Record<string, unknown> | undefined);
}

async function renameInNeon(userId: string, folderId: string, name: string) {
  const sql = createNeonSql();
  try {
    const rows = await sql`
      update public.lesson_folders
      set name = ${name}, updated_at = now()
      where id = ${folderId}
        and owner_id = ${userId}
      returning id::text as id, name, parent_id::text as parent_id
    `;
    if (!rows[0]) throw new LessonFolderWriteError('FOLDER_NOT_FOUND');
    return normalizeFolder(rows[0]);
  } catch (error) {
    if (error instanceof LessonFolderWriteError) throw error;
    if (databaseErrorCode(error) === '23505') {
      throw new LessonFolderWriteError('DUPLICATE_FOLDER', error);
    }
    throw new LessonFolderWriteError('NEON_RENAME_FOLDER_FAILED', error);
  }
}

async function renameInSupabase(
  supabase: SupabaseClient,
  userId: string,
  folderId: string,
  name: string,
) {
  const { data, error } = await supabase
    .from('lesson_folders')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .eq('owner_id', userId)
    .select('id, name, parent_id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') throw new LessonFolderWriteError('DUPLICATE_FOLDER', error);
    throw new LessonFolderWriteError(error.code || 'SUPABASE_RENAME_FOLDER_FAILED', error);
  }
  if (!data) throw new LessonFolderWriteError('FOLDER_NOT_FOUND');
  return normalizeFolder(data as Record<string, unknown>);
}

async function deleteInNeon(userId: string, folderId: string) {
  const sql = createNeonSql();
  try {
    const rows = await sql`
      delete from public.lesson_folders
      where id = ${folderId}
        and owner_id = ${userId}
      returning id::text as id
    `;
    if (!rows[0]) throw new LessonFolderWriteError('FOLDER_NOT_FOUND');
  } catch (error) {
    if (error instanceof LessonFolderWriteError) throw error;
    if (databaseErrorCode(error) === '23503') {
      throw new LessonFolderWriteError('FOLDER_HAS_CHILDREN', error);
    }
    throw new LessonFolderWriteError('NEON_DELETE_FOLDER_FAILED', error);
  }
}

async function deleteInSupabase(supabase: SupabaseClient, userId: string, folderId: string) {
  const { data: children, error: childrenError } = await supabase
    .from('lesson_folders')
    .select('id')
    .eq('owner_id', userId)
    .eq('parent_id', folderId)
    .limit(1);

  if (childrenError) {
    throw new LessonFolderWriteError(childrenError.code || 'SUPABASE_FOLDER_CHILD_LOOKUP_FAILED', childrenError);
  }
  if (children?.length) throw new LessonFolderWriteError('FOLDER_HAS_CHILDREN');

  const { data, error } = await supabase
    .from('lesson_folders')
    .delete()
    .eq('id', folderId)
    .eq('owner_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new LessonFolderWriteError(error.code || 'SUPABASE_DELETE_FOLDER_FAILED', error);
  if (!data) throw new LessonFolderWriteError('FOLDER_NOT_FOUND');
}

export async function createLessonFolder(
  supabase: SupabaseClient,
  userId: string,
  input: { name: string; parentId: string | null },
) {
  return shouldWriteToNeon()
    ? createInNeon(userId, input.name, input.parentId)
    : createInSupabase(supabase, userId, input.name, input.parentId);
}

export async function renameLessonFolder(
  supabase: SupabaseClient,
  userId: string,
  folderId: string,
  name: string,
) {
  return shouldWriteToNeon()
    ? renameInNeon(userId, folderId, name)
    : renameInSupabase(supabase, userId, folderId, name);
}

export async function deleteLessonFolder(
  supabase: SupabaseClient,
  userId: string,
  folderId: string,
) {
  return shouldWriteToNeon()
    ? deleteInNeon(userId, folderId)
    : deleteInSupabase(supabase, userId, folderId);
}
