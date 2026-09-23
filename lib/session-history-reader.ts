import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type SessionHistoryRow = {
  id: string;
  lesson_id: string | null;
  join_code: string;
  lesson_snapshot: unknown;
  started_at: string | null;
  ended_at: string;
};

export class SessionHistoryReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Session history lookup failed.', { cause });
    this.name = 'SessionHistoryReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.DATABASE_BACKEND === 'neon' ? 'true' : process.env.NEON_SESSION_HISTORY_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new SessionHistoryReadError('INVALID_NEON_SESSION_HISTORY_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new SessionHistoryReadError('NEON_PRODUCTION_SESSION_HISTORY_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRows(rows: Record<string, unknown>[]): SessionHistoryRow[] {
  return rows.map((row) => {
    if (
      typeof row.id !== 'string'
      || (row.lesson_id !== null && typeof row.lesson_id !== 'string')
      || typeof row.join_code !== 'string'
      || (row.started_at !== null && typeof row.started_at !== 'string')
      || typeof row.ended_at !== 'string'
    ) {
      throw new SessionHistoryReadError('INVALID_SESSION_HISTORY_RESULT');
    }

    return {
      id: row.id,
      lesson_id: row.lesson_id,
      join_code: row.join_code,
      lesson_snapshot: row.lesson_snapshot,
      started_at: row.started_at,
      ended_at: row.ended_at,
    };
  }).sort((left, right) => (
    right.ended_at.localeCompare(left.ended_at) || left.id.localeCompare(right.id)
  ));
}

async function readFromNeon(userId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select
        id::text as id,
        lesson_id::text as lesson_id,
        join_code,
        lesson_snapshot,
        started_at::text as started_at,
        ended_at::text as ended_at
      from public.sessions
      where teacher_id = ${userId}
        and status = 'ended'
        and ended_at is not null
      order by ended_at desc, id asc
    `;

    return normalizeRows(rows);
  } catch (error) {
    if (error instanceof SessionHistoryReadError) throw error;
    throw new SessionHistoryReadError('NEON_SESSION_HISTORY_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, lesson_id, join_code, lesson_snapshot, started_at, ended_at')
    .eq('teacher_id', userId)
    .eq('status', 'ended')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    throw new SessionHistoryReadError(error.code || 'SUPABASE_SESSION_HISTORY_QUERY_FAILED', error);
  }

  return normalizeRows((data ?? []) as Record<string, unknown>[]);
}

export async function readSessionHistory(supabase: SupabaseClient, userId: string) {
  return shouldReadFromNeon()
    ? readFromNeon(userId)
    : readFromSupabase(supabase, userId);
}
