import 'server-only';

import { createHash } from 'node:crypto';
import { isUnchangedScaffold, UNCHANGED_SCAFFOLD_ERROR } from '@/lib/answer-scaffold';
import { scheduleNeonGradingDrain } from '@/lib/neon/grading-outbox-worker';
import { createNeonSql } from '@/lib/neon/server';

const LOCK_TTL_SECONDS = 60;

type Participant = { id: string; display_name: string; team_id: string | null };
type SessionRow = { status: string; active_block_id: string | null; lesson_snapshot: unknown; realtime_key: string };
type Context = { participant: Participant; session: SessionRow; blockId: string };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  return String((error as { message?: unknown }).message ?? '');
}

function freeSessionError(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('organization_origin_access_required')) {
    return json({ error: 'Přístup školy k této hodině už není aktivní.' }, 403);
  }
  return message.includes('free_session_expired')
    ? json({ error: 'Tato Free hodina po 6 hodinách skončila.' }, 410)
    : null;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function findBlock(snapshot: unknown, blockId: string) {
  const lesson = (snapshot ?? {}) as { blocks?: unknown };
  if (!Array.isArray(lesson.blocks)) return undefined;
  return lesson.blocks.find((candidate) => (
    Boolean(candidate)
    && typeof candidate === 'object'
    && (candidate as Record<string, unknown>).id === blockId
  )) as Record<string, unknown> | undefined;
}

function blockType(snapshot: unknown, blockId: string) {
  const block = findBlock(snapshot, blockId);
  return typeof block?.type === 'string' ? block.type : null;
}

async function verifyParticipant(sessionId: string, participantToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || participantToken.length < 32 || participantToken.length > 128) {
    return { response: json({ error: 'Neplatná participant identita.' }, 401) };
  }
  const sql = createNeonSql();
  const rows = await sql`
    select id, display_name, team_id
    from public.participants
    where session_id = ${sessionId}::uuid
      and participant_token_hash = ${hash(participantToken)}
      and participant_token_expires_at > now()
    limit 1
  `;
  if (!rows[0]) return { response: json({ error: 'Účastník nebyl ověřen.' }, 401) };
  return { participant: rows[0] as Participant };
}

async function loadContext(body: Record<string, unknown>, requireActive = true) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const participantToken = typeof body.participantToken === 'string' ? body.participantToken : '';
  const blockId = typeof body.blockId === 'string' ? body.blockId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200) {
    return { response: json({ error: 'Neplatný požadavek.' }, 400) };
  }

  const verified = await verifyParticipant(sessionId, participantToken);
  if (verified.response) return verified;
  const participant = verified.participant!;
  if (!participant.team_id) return { response: json({ error: 'Nejdřív si vyber tým.' }, 409) };

  const sql = createNeonSql();
  const [sessionRows, teamRows] = await Promise.all([
    sql`
      select status, active_block_id, lesson_snapshot, realtime_key
      from public.sessions
      where id = ${sessionId}::uuid
      limit 1
    `,
    sql`
      select id
      from public.teams
      where id = ${participant.team_id}::uuid and session_id = ${sessionId}::uuid
      limit 1
    `,
  ]);
  const session = sessionRows[0];
  if (!session) return { response: json({ error: 'Hodina neexistuje.' }, 404) };
  if (!teamRows[0]) return { response: json({ error: 'Tým se nepodařilo ověřit.' }, 409) };
  if (requireActive) {
    if (session.status !== 'live') return { response: json({ error: 'Týmový editor je dostupný jen během živé hodiny.' }, 409) };
    if (session.active_block_id !== blockId) return { response: json({ error: 'Učitel už přešel na jiný blok.' }, 409) };
    if (blockType(session.lesson_snapshot, blockId) !== 'team_task') {
      return { response: json({ error: 'Aktivní blok není týmový úkol.' }, 409) };
    }
  }
  return { context: { participant, session: session as SessionRow, blockId } as Context, sessionId };
}

async function lockInfo(sessionId: string, teamId: string, blockId: string, viewerParticipantId: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select l.participant_id, l.expires_at, coalesce(p.display_name, 'Člen týmu') as holder_display_name
    from public.team_edit_locks l
    left join public.participants p on p.id = l.participant_id and p.session_id = l.session_id
    where l.session_id = ${sessionId}::uuid
      and l.team_id = ${teamId}::uuid
      and l.block_id = ${blockId}
      and l.expires_at > now()
    limit 1
  `;
  const lock = rows[0];
  if (!lock) return null;
  return {
    mine: lock.participant_id === viewerParticipantId,
    holderParticipantId: lock.participant_id as string,
    holderDisplayName: String(lock.holder_display_name),
    expiresAt: String(lock.expires_at),
  };
}

async function claimLock(context: Context, sessionId: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select *
    from public.claim_team_edit_lock(
      ${sessionId}::uuid,
      ${context.participant.team_id}::uuid,
      ${context.blockId},
      ${context.participant.id}::uuid,
      ${LOCK_TTL_SECONDS}::integer
    )
  `;
  return {
    acquired: Boolean(rows[0]?.acquired),
    lock: await lockInfo(sessionId, context.participant.team_id!, context.blockId, context.participant.id),
  };
}

async function status(body: Record<string, unknown>) {
  const loaded = await loadContext(body);
  if ('response' in loaded) return loaded.response ?? json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  const context = loaded.context!;
  const lock = await lockInfo(loaded.sessionId!, context.participant.team_id!, context.blockId, context.participant.id);
  return json({ ok: true, lock });
}

async function claim(body: Record<string, unknown>) {
  const loaded = await loadContext(body);
  if ('response' in loaded) return loaded.response ?? json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  try {
    const result = await claimLock(loaded.context!, loaded.sessionId!);
    return json({ ok: true, ...result });
  } catch (error) {
    return freeSessionError(error) ?? json({ error: 'Editor se nepodařilo zamknout.' }, 500);
  }
}

async function save(body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 1 || text.length > 4000) return json({ error: 'Týmová odpověď musí mít 1 až 4000 znaků.' }, 400);
  const loaded = await loadContext(body);
  if ('response' in loaded) return loaded.response ?? json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;

  let claimed;
  try {
    claimed = await claimLock(context, sessionId);
  } catch (error) {
    return freeSessionError(error) ?? json({ error: 'Editor se nepodařilo ověřit.' }, 500);
  }
  if (!claimed.acquired) return json({ error: 'Týmovou odpověď právě upravuje jiný člen týmu.', lock: claimed.lock }, 409);

  const sql = createNeonSql();
  try {
    const rows = await sql`
      insert into public.team_responses (
        session_id, team_id, block_id, answer, updated_by_participant_id, updated_at
      ) values (
        ${sessionId}::uuid, ${context.participant.team_id}::uuid, ${context.blockId},
        ${JSON.stringify({ text })}::jsonb, ${context.participant.id}::uuid, now()
      )
      on conflict (session_id, team_id, block_id) do update
      set answer = excluded.answer,
          updated_by_participant_id = excluded.updated_by_participant_id,
          updated_at = excluded.updated_at
      returning updated_at
    `;
    return json({ ok: true, text, updatedAt: rows[0]?.updated_at, lock: claimed.lock });
  } catch (error) {
    console.error('Neon autosave team response failed', error);
    return freeSessionError(error) ?? json({ error: 'Týmovou odpověď se nepodařilo uložit.' }, 500);
  }
}

async function submit(body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 1 || text.length > 4000) return json({ error: 'Týmová odpověď musí mít 1 až 4000 znaků.' }, 400);
  const loaded = await loadContext(body);
  if ('response' in loaded) return loaded.response ?? json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;
  if (isUnchangedScaffold(text, findBlock(context.session.lesson_snapshot, context.blockId)?.answerScaffold)) {
    return json({ error: UNCHANGED_SCAFFOLD_ERROR }, 400);
  }

  let claimed;
  try {
    claimed = await claimLock(context, sessionId);
  } catch (error) {
    return freeSessionError(error) ?? json({ error: 'Editor se nepodařilo ověřit.' }, 500);
  }
  if (!claimed.acquired) return json({ error: 'Týmovou odpověď právě upravuje jiný člen týmu.', lock: claimed.lock }, 409);

  const submittedAt = new Date().toISOString();
  const answerJson = JSON.stringify({ text });
  const sql = createNeonSql();
  try {
    const rows = await sql`
      insert into public.team_responses (
        session_id, team_id, block_id, answer, submitted_answer, submitted_at,
        updated_by_participant_id, updated_at
      ) values (
        ${sessionId}::uuid, ${context.participant.team_id}::uuid, ${context.blockId},
        ${answerJson}::jsonb, ${answerJson}::jsonb, ${submittedAt}::timestamptz,
        ${context.participant.id}::uuid, ${submittedAt}::timestamptz
      )
      on conflict (session_id, team_id, block_id) do update
      set answer = excluded.answer,
          submitted_answer = excluded.submitted_answer,
          submitted_at = excluded.submitted_at,
          updated_by_participant_id = excluded.updated_by_participant_id,
          updated_at = excluded.updated_at
      returning id, updated_at, submitted_at
    `;
    const saved = rows[0];
    if (!saved) return json({ error: 'Týmovou odpověď se nepodařilo odevzdat.' }, 500);
    const queuedRows = await sql`
      select public.queue_submitted_team_response_evaluation(${String(saved.id)}::uuid) as queued
    `;
    if (queuedRows[0]?.queued) scheduleNeonGradingDrain();
    return json({
      ok: true,
      submitted: true,
      queuedForEvaluation: Boolean(queuedRows[0]?.queued),
      text,
      submittedAt: saved.submitted_at,
      updatedAt: saved.updated_at,
      lock: claimed.lock,
    });
  } catch (error) {
    console.error('Neon submit team response failed', error);
    return freeSessionError(error) ?? json({ error: 'Týmovou odpověď se nepodařilo odevzdat.' }, 500);
  }
}

async function release(body: Record<string, unknown>) {
  const loaded = await loadContext(body, false);
  if ('response' in loaded) return loaded.response ?? json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;
  const sql = createNeonSql();
  await sql`
    delete from public.team_edit_locks
    where session_id = ${sessionId}::uuid
      and team_id = ${context.participant.team_id}::uuid
      and block_id = ${context.blockId}
      and participant_id = ${context.participant.id}::uuid
  `;
  return json({ ok: true, lock: null });
}

export async function handleNeonTeamEditAction(body: Record<string, unknown>): Promise<Response> {
  try {
    if (body.action === 'status') return await status(body);
    if (body.action === 'claim' || body.action === 'heartbeat') return await claim(body);
    if (body.action === 'save') return await save(body);
    if (body.action === 'submit') return await submit(body);
    if (body.action === 'release') return await release(body);
    return json({ error: 'Neznámá akce.' }, 400);
  } catch (error) {
    console.error('Neon team-edit server module failed', error);
    return json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  }
}
