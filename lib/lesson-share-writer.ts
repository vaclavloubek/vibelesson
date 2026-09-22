import 'server-only';

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';
import { LessonSchema } from '@/lib/schema';

export type LessonShareRow = {
  token: string;
  created_at: string;
};

export type LessonShareState = {
  share: LessonShareRow | null;
  sharingRestricted: boolean;
};

export class LessonShareWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson share mutation failed.', { cause });
    this.name = 'LessonShareWriteError';
    this.code = code;
  }
}

function shouldWriteToNeon() {
  const enabled = process.env.NEON_LESSON_SHARE_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') throw new LessonShareWriteError('INVALID_NEON_LESSON_SHARE_WRITES');

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonShareWriteError('NEON_PRODUCTION_LESSON_SHARE_WRITE_NOT_APPROVED');
  }

  return true;
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function normalizeShare(row: Record<string, unknown> | undefined): LessonShareRow | null {
  if (!row) return null;
  if (typeof row.token !== 'string') throw new LessonShareWriteError('INVALID_LESSON_SHARE_RESULT');
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : typeof row.created_at === 'string'
      ? row.created_at
      : null;
  if (!createdAt) throw new LessonShareWriteError('INVALID_LESSON_SHARE_RESULT');
  return { token: row.token, created_at: createdAt };
}

async function activeShareInNeon(lessonId: string, userId: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select token, created_at
    from public.lesson_shares
    where lesson_id = ${lessonId}
      and owner_id = ${userId}
      and status = 'active'
    limit 1
  `;
  return normalizeShare(rows[0] as Record<string, unknown> | undefined);
}

async function lessonInNeon(lessonId: string, userId: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select lesson, organization_origin_id::text as organization_origin_id
    from public.lessons
    where id = ${lessonId}
      and owner_id = ${userId}
    limit 1
  `;
  return rows[0] as Record<string, unknown> | undefined;
}

async function readStateInNeon(lessonId: string, userId: string): Promise<LessonShareState> {
  const lesson = await lessonInNeon(lessonId, userId);
  if (!lesson) throw new LessonShareWriteError('LESSON_NOT_FOUND');
  if (typeof lesson.organization_origin_id === 'string') {
    return { share: null, sharingRestricted: true };
  }
  return { share: await activeShareInNeon(lessonId, userId), sharingRestricted: false };
}

async function createInNeon(lessonId: string, userId: string): Promise<LessonShareRow> {
  const lesson = await lessonInNeon(lessonId, userId);
  if (!lesson) throw new LessonShareWriteError('LESSON_NOT_FOUND');
  if (typeof lesson.organization_origin_id === 'string') {
    throw new LessonShareWriteError('ORGANIZATION_LIBRARY_PUBLIC_SHARE_FORBIDDEN');
  }

  const existing = await activeShareInNeon(lessonId, userId);
  if (existing) return existing;

  const snapshot = LessonSchema.parse(lesson.lesson);
  const token = randomBytes(24).toString('hex');
  const sql = createNeonSql();
  try {
    const rows = await sql`
      insert into public.lesson_shares (lesson_id, owner_id, token, snapshot)
      values (${lessonId}, ${userId}, ${token}, ${JSON.stringify(snapshot)}::jsonb)
      returning token, created_at
    `;
    const created = normalizeShare(rows[0] as Record<string, unknown> | undefined);
    if (!created) throw new LessonShareWriteError('LESSON_SHARE_INSERT_RETURNED_NO_ROW');
    return created;
  } catch (error) {
    if (error instanceof LessonShareWriteError) throw error;
    if (databaseErrorCode(error) === '23505') {
      const raced = await activeShareInNeon(lessonId, userId);
      if (raced) return raced;
    }
    throw new LessonShareWriteError('NEON_CREATE_LESSON_SHARE_FAILED', error);
  }
}

async function revokeInNeon(lessonId: string, userId: string) {
  const sql = createNeonSql();
  try {
    const rows = await sql`
      update public.lesson_shares
      set status = 'revoked', revoked_at = now()
      where lesson_id = ${lessonId}
        and owner_id = ${userId}
        and status = 'active'
      returning id::text as id
    `;
    return rows.length > 0;
  } catch (error) {
    throw new LessonShareWriteError('NEON_REVOKE_LESSON_SHARE_FAILED', error);
  }
}

async function activeShareInSupabase(supabase: SupabaseClient, lessonId: string, userId: string) {
  const { data, error } = await supabase
    .from('lesson_shares')
    .select('token, created_at')
    .eq('lesson_id', lessonId)
    .eq('owner_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new LessonShareWriteError(error.code || 'SUPABASE_LESSON_SHARE_READ_FAILED', error);
  return normalizeShare(data as Record<string, unknown> | undefined);
}

async function lessonInSupabase(supabase: SupabaseClient, lessonId: string, userId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('lesson, organization_origin_id')
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw new LessonShareWriteError(error.code || 'SUPABASE_LESSON_SHARE_SOURCE_FAILED', error);
  return data as Record<string, unknown> | null;
}

async function readStateInSupabase(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string,
): Promise<LessonShareState> {
  const lesson = await lessonInSupabase(supabase, lessonId, userId);
  if (!lesson) throw new LessonShareWriteError('LESSON_NOT_FOUND');
  if (typeof lesson.organization_origin_id === 'string') {
    return { share: null, sharingRestricted: true };
  }
  return { share: await activeShareInSupabase(supabase, lessonId, userId), sharingRestricted: false };
}

async function createInSupabase(supabase: SupabaseClient, lessonId: string, userId: string) {
  const lesson = await lessonInSupabase(supabase, lessonId, userId);
  if (!lesson) throw new LessonShareWriteError('LESSON_NOT_FOUND');
  if (typeof lesson.organization_origin_id === 'string') {
    throw new LessonShareWriteError('ORGANIZATION_LIBRARY_PUBLIC_SHARE_FORBIDDEN');
  }

  const existing = await activeShareInSupabase(supabase, lessonId, userId);
  if (existing) return existing;

  const snapshot = LessonSchema.parse(lesson.lesson);
  const token = randomBytes(24).toString('hex');
  const { data, error } = await supabase
    .from('lesson_shares')
    .insert({ lesson_id: lessonId, owner_id: userId, token, snapshot })
    .select('token, created_at')
    .single();

  if (error?.code === '23505') {
    const raced = await activeShareInSupabase(supabase, lessonId, userId);
    if (raced) return raced;
  }
  if (error) throw new LessonShareWriteError(error.code || 'SUPABASE_CREATE_LESSON_SHARE_FAILED', error);
  const created = normalizeShare(data as Record<string, unknown> | undefined);
  if (!created) throw new LessonShareWriteError('LESSON_SHARE_INSERT_RETURNED_NO_ROW');
  return created;
}

async function revokeInSupabase(supabase: SupabaseClient, lessonId: string, userId: string) {
  const { data, error } = await supabase
    .from('lesson_shares')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('lesson_id', lessonId)
    .eq('owner_id', userId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw new LessonShareWriteError(error.code || 'SUPABASE_REVOKE_LESSON_SHARE_FAILED', error);
  return Boolean(data);
}

export async function readOwnedLessonShare(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string,
) {
  return shouldWriteToNeon()
    ? readStateInNeon(lessonId, userId)
    : readStateInSupabase(supabase, lessonId, userId);
}

export async function createOwnedLessonShare(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string,
) {
  return shouldWriteToNeon()
    ? createInNeon(lessonId, userId)
    : createInSupabase(supabase, lessonId, userId);
}

export async function revokeOwnedLessonShare(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string,
) {
  return shouldWriteToNeon()
    ? revokeInNeon(lessonId, userId)
    : revokeInSupabase(supabase, lessonId, userId);
}
