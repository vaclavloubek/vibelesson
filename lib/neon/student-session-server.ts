import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { createNeonSql } from '@/lib/neon/server';

type Block = Record<string, unknown>;
type Answer = { choice: string } | { text: string } | { ranking: string[]; text: string };
type Participant = { id: string; display_name?: string; team_id?: string | null };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  return String((error as { message?: unknown }).message ?? '');
}

function sessionWriteError(error: unknown, fallback: string) {
  const message = errorMessage(error);
  if (message.includes('organization_origin_access_required')) return json({ error: 'Přístup školy k této hodině už není aktivní.' }, 403);
  if (message.includes('free_session_join_window_closed')) return json({ error: 'Okno pro připojení nových studentů v této Free hodině už skončilo.' }, 409);
  if (message.includes('free_session_expired')) return json({ error: 'Tato Free hodina po 6 hodinách skončila.' }, 410);
  if (message.includes('participant_session_ended')) return json({ error: 'Tato hodina už skončila.' }, 410);
  if (message.includes('participant_limit_reached')) return json({ error: 'Do hodiny je už připojen maximální počet studentů.' }, 409);
  if (message.includes('participant_join_rate_limited')) return json({ error: 'Připojuje se příliš mnoho studentů najednou. Zkus to za chvíli znovu.' }, 429);
  return json({ error: fallback }, 500);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function blocks(snapshot: unknown) {
  const value = (snapshot ?? {}) as { blocks?: unknown };
  return Array.isArray(value.blocks)
    ? value.blocks.filter((block): block is Block => Boolean(block) && typeof block === 'object')
    : [];
}

function publicBlock(block: Block) {
  const result: Record<string, unknown> = {};
  for (const key of ['id', 'type', 'title', 'durationMinutes', 'instructions', 'options', 'items', 'dataTable', 'revealText', 'points']) {
    if (block[key] !== undefined) result[key] = block[key];
  }
  return result;
}

function remainingSeconds(
  session: { timer_status?: unknown; timer_started_at?: unknown; timer_remaining_seconds?: unknown },
  now: number,
) {
  const rawBase = Number(session.timer_remaining_seconds);
  const base = Number.isFinite(rawBase) ? Math.max(0, rawBase) : 0;
  if (session.timer_status !== 'running' || !session.timer_started_at) return base;
  const startedAt = Date.parse(String(session.timer_started_at));
  return Number.isFinite(startedAt)
    ? Math.max(0, base - Math.max(0, Math.floor((now - startedAt) / 1000)))
    : base;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function normalizeAnswer(block: Block, raw: unknown): { answer?: Answer; error?: string; status?: number } {
  if (!raw || typeof raw !== 'object') return { error: 'Chybí odpověď.', status: 400 };
  const value = raw as Record<string, unknown>;
  if (block.type === 'poll' || block.type === 'quiz') {
    const choice = typeof value.choice === 'string' ? value.choice : '';
    const options = Array.isArray(block.options) ? block.options.filter((item): item is string => typeof item === 'string') : [];
    return choice && options.includes(choice)
      ? { answer: { choice } }
      : { error: 'Vyber jednu z nabízených možností.', status: 400 };
  }
  if (block.type === 'open_text' || block.type === 'exit_ticket') {
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    return text.length >= 1 && text.length <= 2000
      ? { answer: { text } }
      : { error: 'Odpověď musí mít 1 až 2000 znaků.', status: 400 };
  }
  if (block.type === 'ranking') {
    const items = Array.isArray(block.items) ? block.items.filter((item): item is string => typeof item === 'string') : [];
    const ranking = Array.isArray(value.ranking) ? value.ranking.filter((item): item is string => typeof item === 'string') : [];
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (items.length < 2) return { error: 'Tento blok nemá dost položek k seřazení.', status: 409 };
    if (ranking.length !== items.length || new Set(ranking).size !== items.length || items.some((item) => !ranking.includes(item))) {
      return { error: 'Pořadí musí obsahovat všechny položky právě jednou.', status: 400 };
    }
    return text.length >= 1 && text.length <= 2000
      ? { answer: { ranking, text } }
      : { error: 'Ke svému pořadí přidej krátké zdůvodnění.', status: 400 };
  }
  return { error: 'Tento blok zatím odpověď nepřijímá.', status: 409 };
}

async function verifyParticipant(sessionId: string, rawToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || rawToken.length < 32 || rawToken.length > 128) {
    return { response: json({ error: 'Neplatná participant identita.' }, 401) };
  }
  const sql = createNeonSql();
  const rows = await sql`
    select id, display_name, team_id
    from public.participants
    where session_id = ${sessionId}::uuid
      and participant_token_hash = ${hash(rawToken)}
      and participant_token_expires_at > now()
    limit 1
  `;
  if (!rows[0]) return { response: json({ error: 'Účastník nebyl ověřen.' }, 401) };
  return { participant: rows[0] as Participant };
}

async function join(body: Record<string, unknown>) {
  const joinCode = typeof body.joinCode === 'string' ? body.joinCode.trim().toUpperCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!/^[A-HJ-NP-Z2-9]{7}$/.test(joinCode)) return json({ error: 'Neplatný kód hodiny.' }, 400);
  if (displayName.length < 1 || displayName.length > 60) return json({ error: 'Jméno musí mít 1 až 60 znaků.' }, 400);

  const sql = createNeonSql();
  const sessions = await sql`
    select id, status
    from public.sessions
    where join_code = ${joinCode}
    limit 1
  `;
  const session = sessions[0];
  if (!session) return json({ error: 'Hodina s tímto kódem neexistuje.' }, 404);
  if (session.status === 'ended') return json({ error: 'Tato hodina už skončila.' }, 410);

  const rawToken = randomBytes(32).toString('base64url');
  try {
    const rows = await sql`
      insert into public.participants (session_id, display_name, participant_token_hash)
      values (${String(session.id)}::uuid, ${displayName}, ${hash(rawToken)})
      returning id, participant_token_expires_at
    `;
    const participant = rows[0];
    if (!participant) return json({ error: 'Ke hodině se nepodařilo připojit.' }, 500);
    return json({
      sessionId: session.id,
      participantId: participant.id,
      participantToken: rawToken,
      participantTokenExpiresAt: participant.participant_token_expires_at,
    });
  } catch (error) {
    return sessionWriteError(error, 'Ke hodině se nepodařilo připojit.');
  }
}

async function state(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const rawToken = typeof body.participantToken === 'string' ? body.participantToken : '';
  const verified = await verifyParticipant(sessionId, rawToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;
  const sql = createNeonSql();

  const sessions = await sql`
    select id, status, active_block_id, lesson_snapshot, realtime_key, revealed_block_ids,
           timer_status, timer_started_at, timer_remaining_seconds
    from public.sessions
    where id = ${sessionId}::uuid
    limit 1
  `;
  const session = sessions[0];
  if (!session) return json({ error: 'Hodina neexistuje.' }, 404);

  const lesson = (session.lesson_snapshot ?? {}) as { title?: unknown; language?: unknown };
  const allBlocks = blocks(session.lesson_snapshot);
  const activeIndex = typeof session.active_block_id === 'string'
    ? allBlocks.findIndex((block) => block.id === session.active_block_id)
    : -1;
  const rawBlock = session.status === 'live' && activeIndex >= 0 ? allBlocks[activeIndex] : null;
  const activeBlock = rawBlock ? publicBlock(rawBlock) : null;
  const teamRows = await sql`
    select t.id, t.name, count(p.id)::integer as member_count
    from public.teams t
    left join public.participants p on p.team_id = t.id and p.session_id = t.session_id
    where t.session_id = ${sessionId}::uuid
    group by t.id, t.name, t.sort_order
    order by t.sort_order asc
  `;
  const teams = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: Number(team.member_count ?? 0),
  }));
  const myTeam = typeof participant.team_id === 'string'
    ? teams.find((team) => team.id === participant.team_id) ?? null
    : null;

  let myResponse: Answer | null = null;
  let myResponseSubmitted = false;
  if (activeBlock && typeof session.active_block_id === 'string' && rawBlock?.type !== 'team_task') {
    const rows = await sql`
      select answer, submitted_answer, submitted_at
      from public.responses
      where session_id = ${sessionId}::uuid
        and participant_id = ${participant.id}::uuid
        and block_id = ${session.active_block_id}
      limit 1
    `;
    const response = rows[0];
    myResponse = (response?.answer as Answer | undefined) ?? null;
    myResponseSubmitted = Boolean(response?.submitted_at && sameJson(response.answer, response.submitted_answer));
  }

  let myTeamResponse: { text: string; updatedByParticipantId: string | null; submittedText: string | null; submittedAt: string | null } | null = null;
  if (rawBlock?.type === 'team_task' && typeof participant.team_id === 'string' && typeof session.active_block_id === 'string') {
    const rows = await sql`
      select answer, submitted_answer, submitted_at, updated_by_participant_id
      from public.team_responses
      where session_id = ${sessionId}::uuid
        and team_id = ${participant.team_id}::uuid
        and block_id = ${session.active_block_id}
      limit 1
    `;
    const response = rows[0];
    const answer = response?.answer as Record<string, unknown> | undefined;
    const submittedAnswer = response?.submitted_answer as Record<string, unknown> | null | undefined;
    if (typeof answer?.text === 'string') {
      myTeamResponse = {
        text: answer.text,
        updatedByParticipantId: typeof response.updated_by_participant_id === 'string' ? response.updated_by_participant_id : null,
        submittedText: typeof submittedAnswer?.text === 'string' ? submittedAnswer.text : null,
        submittedAt: response.submitted_at ? String(response.submitted_at) : null,
      };
    }
  }

  const revealed = Array.isArray(session.revealed_block_ids)
    ? session.revealed_block_ids.filter((value): value is string => typeof value === 'string')
    : [];
  const resultsRevealed = typeof session.active_block_id === 'string'
    && revealed.includes(session.active_block_id)
    && (rawBlock?.type === 'poll' || rawBlock?.type === 'quiz');
  let revealedResults: Record<string, unknown> | null = null;
  if (resultsRevealed && rawBlock && typeof session.active_block_id === 'string') {
    const options = Array.isArray(rawBlock.options) ? rawBlock.options.filter((value): value is string => typeof value === 'string') : [];
    const rows = await sql`
      select answer
      from public.responses
      where session_id = ${sessionId}::uuid
        and block_id = ${session.active_block_id}
    `;
    const counts = options.map((option) => ({ option, count: 0 }));
    let total = 0;
    for (const row of rows) {
      const answer = row.answer as Record<string, unknown> | null;
      const choice = typeof answer?.choice === 'string' ? answer.choice : '';
      const item = counts.find((candidate) => candidate.option === choice);
      if (item) { item.count += 1; total += 1; }
    }
    revealedResults = { type: rawBlock.type, counts, total };
    if (rawBlock.type === 'quiz') {
      const correctAnswer = typeof rawBlock.correctAnswer === 'string' ? rawBlock.correctAnswer : undefined;
      const mine = myResponse && 'choice' in myResponse ? myResponse.choice : null;
      revealedResults.correctAnswer = correctAnswer;
      revealedResults.myAnswer = mine;
      revealedResults.isCorrect = mine && correctAnswer ? mine === correctAnswer : null;
    }
  }

  const syncedAt = new Date().toISOString();
  const timer = rawBlock?.type === 'timer'
    ? {
        status: session.timer_status === 'running' || session.timer_status === 'paused' ? session.timer_status : 'idle',
        remainingSeconds: remainingSeconds(session, Date.parse(syncedAt)),
        syncedAt,
      }
    : null;
  return json({
    sessionId: session.id,
    status: session.status,
    title: typeof lesson.title === 'string' ? lesson.title : 'Hodina',
    lessonLanguage: typeof lesson.language === 'string' ? lesson.language : null,
    participantDisplayName: participant.display_name,
    activeBlock,
    activeBlockIndex: activeIndex >= 0 ? activeIndex : null,
    totalBlocks: allBlocks.length,
    realtimeKey: session.realtime_key,
    myResponse,
    myResponseSubmitted,
    resultsRevealed,
    revealedResults,
    timer,
    teams,
    myTeam,
    myTeamResponse,
  });
}

async function chooseTeam(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const rawToken = typeof body.participantToken === 'string' ? body.participantToken : '';
  const teamId = typeof body.teamId === 'string' ? body.teamId : '';
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return json({ error: 'Neplatný tým.' }, 400);
  const verified = await verifyParticipant(sessionId, rawToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;
  const sql = createNeonSql();
  const [sessions, teamRows] = await Promise.all([
    sql`select status from public.sessions where id = ${sessionId}::uuid limit 1`,
    sql`select id, name from public.teams where id = ${teamId}::uuid and session_id = ${sessionId}::uuid limit 1`,
  ]);
  const session = sessions[0];
  const team = teamRows[0];
  if (!session) return json({ error: 'Hodina neexistuje.' }, 404);
  if (!team) return json({ error: 'Tým v této hodině neexistuje.' }, 404);
  if (session.status === 'ended') return json({ error: 'Tato hodina už skončila.' }, 410);
  if (session.status === 'live' && participant.team_id && participant.team_id !== teamId) {
    return json({ error: 'Po zahájení hodiny už tým změnit nejde.' }, 409);
  }
  try {
    await sql`
      update public.participants
      set team_id = ${teamId}::uuid
      where id = ${participant.id}::uuid and session_id = ${sessionId}::uuid
    `;
  } catch (error) {
    return sessionWriteError(error, 'Tým se nepodařilo vybrat.');
  }
  return json({ ok: true, team: { id: team.id, name: team.name } });
}

async function respond(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const rawToken = typeof body.participantToken === 'string' ? body.participantToken : '';
  const blockId = typeof body.blockId === 'string' ? body.blockId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200) {
    return json({ error: 'Neplatný požadavek na odpověď.' }, 400);
  }
  const verified = await verifyParticipant(sessionId, rawToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;
  const sql = createNeonSql();
  const sessions = await sql`
    select status, active_block_id, lesson_snapshot, revealed_block_ids
    from public.sessions
    where id = ${sessionId}::uuid
    limit 1
  `;
  const session = sessions[0];
  if (!session) return json({ error: 'Hodina neexistuje.' }, 404);
  if (session.status !== 'live') return json({ error: 'Odpovídat lze pouze během živé hodiny.' }, 409);
  if (session.active_block_id !== blockId) return json({ error: 'Učitel už přešel na jiný blok.' }, 409);
  const block = blocks(session.lesson_snapshot).find((candidate) => candidate.id === blockId);
  if (!block) return json({ error: 'Aktivní blok nebyl nalezen ve snapshotu.' }, 500);
  if (block.type === 'team_task') return json({ error: 'Týmový úkol použij společnou týmovou odpověď.' }, 409);
  const revealed = Array.isArray(session.revealed_block_ids)
    ? session.revealed_block_ids.filter((value): value is string => typeof value === 'string')
    : [];
  if ((block.type === 'poll' || block.type === 'quiz') && revealed.includes(blockId)) {
    return json({ error: 'Výsledky už byly zveřejněné. Odpověď už nelze změnit.' }, 409);
  }
  const normalized = normalizeAnswer(block, body.answer);
  if (!normalized.answer) return json({ error: normalized.error ?? 'Neplatná odpověď.' }, normalized.status ?? 400);

  const responseAction = body.responseAction === 'submit' ? 'submit' : 'save';
  const marksSubmission = responseAction === 'submit' && (block.type === 'open_text' || block.type === 'exit_ticket' || block.type === 'ranking');
  const queuesEvaluation = responseAction === 'submit' && (block.type === 'open_text' || block.type === 'exit_ticket');
  const timestamp = new Date().toISOString();
  try {
    const rows = marksSubmission
      ? await sql`
          insert into public.responses (
            session_id, participant_id, block_id, answer, submitted_answer, submitted_at, updated_at
          ) values (
            ${sessionId}::uuid, ${participant.id}::uuid, ${blockId},
            ${JSON.stringify(normalized.answer)}::jsonb, ${JSON.stringify(normalized.answer)}::jsonb,
            ${timestamp}::timestamptz, ${timestamp}::timestamptz
          )
          on conflict (session_id, participant_id, block_id) do update
          set answer = excluded.answer,
              submitted_answer = excluded.submitted_answer,
              submitted_at = excluded.submitted_at,
              updated_at = excluded.updated_at
          returning id, answer, submitted_answer, submitted_at, updated_at
        `
      : await sql`
          insert into public.responses (session_id, participant_id, block_id, answer, updated_at)
          values (
            ${sessionId}::uuid, ${participant.id}::uuid, ${blockId},
            ${JSON.stringify(normalized.answer)}::jsonb, ${timestamp}::timestamptz
          )
          on conflict (session_id, participant_id, block_id) do update
          set answer = excluded.answer, updated_at = excluded.updated_at
          returning id, answer, submitted_answer, submitted_at, updated_at
        `;
    const saved = rows[0];
    if (!saved) return json({ error: 'Odpověď se nepodařilo uložit.' }, 500);

    let queuedForEvaluation = false;
    if (queuesEvaluation) {
      const queued = await sql`
        select public.queue_submitted_response_evaluation(${String(saved.id)}::uuid) as queued
      `;
      queuedForEvaluation = Boolean(queued[0]?.queued);
    }
    return json({
      ok: true,
      blockId,
      answer: saved.answer,
      updatedAt: saved.updated_at,
      submitted: marksSubmission,
      submittedCurrent: Boolean(saved.submitted_at && sameJson(saved.answer, saved.submitted_answer)),
      queuedForEvaluation,
    });
  } catch (error) {
    return sessionWriteError(error, 'Odpověď se nepodařilo uložit.');
  }
}

export async function handleNeonStudentSessionAction(body: Record<string, unknown>) {
  try {
    if (body.action === 'join') return await join(body);
    if (body.action === 'state') return await state(body);
    if (body.action === 'choose_team') return await chooseTeam(body);
    if (body.action === 'respond') return await respond(body);
    return json({ error: 'Neznámá akce.' }, 400);
  } catch (error) {
    console.error('Neon student-session server module failed', error);
    return json({ error: 'Požadavek se nepodařilo zpracovat.' }, 500);
  }
}

export async function readNeonStudentScoreboard(sessionId: string, participantTokenHash: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select public.get_student_public_scoreboard(
      ${sessionId}::uuid,
      ${participantTokenHash}
    ) as scoreboard
  `;
  return rows[0]?.scoreboard ?? null;
}
