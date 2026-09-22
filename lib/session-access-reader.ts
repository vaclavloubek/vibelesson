import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type SessionAccessRow = { id: string };

export class SessionAccessReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Session access lookup failed.', { cause });
    this.name = 'SessionAccessReadError';
    this.code = code;
  }
}

const RETRY_DELAYS_MS = [200, 600] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_SESSION_ACCESS_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new SessionAccessReadError('INVALID_NEON_SESSION_ACCESS_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new SessionAccessReadError('NEON_PRODUCTION_SESSION_ACCESS_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRow(row: Record<string, unknown> | null): SessionAccessRow | null {
  if (!row) return null;
  if (typeof row.id !== 'string') {
    throw new SessionAccessReadError('INVALID_SESSION_ACCESS_RESULT');
  }
  return { id: row.id };
}

async function readFromNeon(userId: string, sessionId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select id::text as id
      from public.sessions
      where id = ${sessionId}
        and teacher_id = ${userId}
      limit 1
    `;

    return normalizeRow((rows[0] as Record<string, unknown> | undefined) ?? null);
  } catch (error) {
    if (error instanceof SessionAccessReadError) throw error;
    throw new SessionAccessReadError('NEON_SESSION_ACCESS_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string, sessionId: string) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('teacher_id', userId)
      .maybeSingle();

    if (!error) {
      return normalizeRow((data as Record<string, unknown> | null) ?? null);
    }

    lastError = error;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  const code = lastError && typeof lastError === 'object' && 'code' in lastError
    ? String(lastError.code)
    : 'SUPABASE_SESSION_ACCESS_QUERY_FAILED';
  throw new SessionAccessReadError(code, lastError);
}

export async function readOwnedSessionAccess(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  return shouldReadFromNeon()
    ? readFromNeon(userId, sessionId)
    : readFromSupabase(supabase, userId, sessionId);
}
