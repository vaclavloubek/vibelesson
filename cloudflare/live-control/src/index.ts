import { DurableObject } from 'cloudflare:workers';

type Role = 'teacher' | 'student' | 'presenter';

type Capability = {
  v: 1;
  sid: string;
  sub: string;
  role: Role;
  exp: number;
};

type Env = {
  LIVE_SESSION: DurableObjectNamespace<LiveSession>;
  LIVE_BOOTSTRAP_SECRET: string;
  LIVE_CAPABILITY_SECRET: string;
};

type SessionSnapshot = {
  sessionId: string;
  joinCode?: string;
  revision: number;
  status: 'lobby' | 'live' | 'ended';
  activeBlockId: string | null;
  lessonSnapshot: unknown;
  teams: Array<{ id: string; name: string; sortOrder?: number }>;
  participants: Array<{ id: string; displayName: string; teamId: string | null; teamUpdatedAt?: string | null }>;
  responses: Array<{
    participantId: string;
    blockId: string;
    answer: unknown;
    submitted?: boolean;
    updatedAt: string;
    submittedAnswer?: unknown;
    submittedAt?: string | null;
    source?: 'primary' | 'fallback';
    submissionSource?: 'primary' | 'fallback';
  }>;
  teamResponses?: Array<{
    teamId: string;
    blockId: string;
    text: string;
    submitted?: boolean;
    updatedAt: string;
    submittedText?: string | null;
    submittedAt?: string | null;
    updatedByParticipantId?: string | null;
    source?: 'primary' | 'fallback';
    submissionSource?: 'primary' | 'fallback';
  }>;
  revealedBlockIds: string[];
  scoreboardRevealed?: boolean;
  timer: unknown;
  updatedAt: string;
};

type LiveEvent = {
  id: string;
  revision: number;
  operationId: string;
  actorRole: Role;
  actorId: string;
  type: string;
  payload: unknown;
  createdAt: string;
};

const encoder = new TextEncoder();
const LIVE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const WORKER_VERSION = '0.8.15';
const LIVE_PROTOCOL_VERSION = 2;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin === 'https://www.syllonaut.com' || origin === 'https://syllonaut.com') return origin;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')) return origin;
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:')) return origin;
  } catch {
    return null;
  }
  return null;
}

function cors(response: Response, request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyCapability(token: string, secret: string, sessionId: string): Promise<Capability | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signaturePart),
      encoder.encode(payloadPart),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as Capability;
    if (payload.v !== 1 || payload.sid !== sessionId || !payload.sub || !['teacher', 'student', 'presenter'].includes(payload.role)) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionRoute(url: URL) {
  const match = url.pathname.match(/^\/v1\/sessions\/([0-9a-f-]{36})(\/(?:state|events|ws|bootstrap))?$/i);
  if (!match) return null;
  return { sessionId: match[1], suffix: match[2] ?? '/state' };
}

function applyEvent(snapshot: SessionSnapshot, event: LiveEvent): SessionSnapshot {
  const payload = event.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : {};

  if (event.type === 'teacher.command') {
    const action = typeof payload.action === 'string' ? payload.action : '';
    const lesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
      ? snapshot.lessonSnapshot as { blocks?: Array<Record<string, unknown>> }
      : {};
    const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
    const currentIndex = snapshot.activeBlockId
      ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
      : -1;

    if (action === 'start' && snapshot.status === 'lobby' && blocks.length) {
      const first = blocks[0];
      return {
        ...snapshot,
        status: 'live',
        activeBlockId: typeof first.id === 'string' ? first.id : null,
        timer: null,
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if ((action === 'next' || action === 'previous') && snapshot.status === 'live' && currentIndex >= 0) {
      const targetIndex = action === 'next' ? currentIndex + 1 : currentIndex - 1;
      const target = blocks[targetIndex];
      if (target && typeof target.id === 'string') {
        return {
          ...snapshot,
          activeBlockId: target.id,
          timer: null,
          revision: event.revision,
          updatedAt: event.createdAt,
        };
      }
    }

    if (action === 'reveal_scoreboard' || action === 'hide_scoreboard') {
      return {
        ...snapshot,
        scoreboardRevealed: action === 'reveal_scoreboard',
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if (action === 'end') {
      return {
        ...snapshot,
        status: 'ended',
        timer: null,
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if (action === 'reveal_results' && snapshot.activeBlockId) {
      return {
        ...snapshot,
        revealedBlockIds: Array.from(new Set([...snapshot.revealedBlockIds, snapshot.activeBlockId])),
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if (action === 'timer_reset' && currentIndex >= 0) {
      const current = blocks[currentIndex];
      const minutes = typeof current?.durationMinutes === 'number' ? current.durationMinutes : 0;
      return {
        ...snapshot,
        timer: { status: 'idle', startedAt: null, remainingSeconds: Math.max(0, minutes * 60) },
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if (action === 'timer_start') {
      const timer = snapshot.timer && typeof snapshot.timer === 'object'
        ? snapshot.timer as { remainingSeconds?: number }
        : {};
      return {
        ...snapshot,
        timer: {
          status: 'running',
          startedAt: event.createdAt,
          remainingSeconds: typeof timer.remainingSeconds === 'number' ? timer.remainingSeconds : 0,
        },
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    if (action === 'timer_pause') {
      const timer = snapshot.timer && typeof snapshot.timer === 'object'
        ? snapshot.timer as { status?: string; startedAt?: string | null; remainingSeconds?: number }
        : {};
      let remainingSeconds = typeof timer.remainingSeconds === 'number' ? timer.remainingSeconds : 0;
      if (timer.status === 'running' && timer.startedAt) {
        const elapsed = Math.max(0, Math.floor((Date.parse(event.createdAt) - Date.parse(timer.startedAt)) / 1000));
        remainingSeconds = Math.max(0, remainingSeconds - elapsed);
      }
      return {
        ...snapshot,
        timer: { status: 'paused', startedAt: null, remainingSeconds },
        revision: event.revision,
        updatedAt: event.createdAt,
      };
    }

    return { ...snapshot, revision: event.revision, updatedAt: event.createdAt };
  }

  if (event.type === 'teacher.state_patch') {
    const status = payload.status;
    const activeBlockId = payload.activeBlockId;
    const revealedBlockIds = payload.revealedBlockIds;
    const teams = payload.teams;

    return {
      ...snapshot,
      ...(status === 'lobby' || status === 'live' || status === 'ended' ? { status } : {}),
      ...(typeof activeBlockId === 'string' || activeBlockId === null ? { activeBlockId: activeBlockId as string | null } : {}),
      ...(Array.isArray(revealedBlockIds) ? { revealedBlockIds: revealedBlockIds.filter((value): value is string => typeof value === 'string') } : {}),
      ...(Array.isArray(teams) ? { teams: teams as SessionSnapshot['teams'] } : {}),
      ...(payload.timer !== undefined ? { timer: payload.timer } : {}),
      revision: event.revision,
      updatedAt: event.createdAt,
    };
  }

  if (event.type === 'student.joined') {
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.slice(0, 60) : 'Student';
    const existing = snapshot.participants.find((participant) => participant.id === event.actorId);
    const participant = {
      id: event.actorId,
      displayName,
      teamId: existing?.teamId ?? null,
    };
    return {
      ...snapshot,
      participants: [...snapshot.participants.filter((row) => row.id !== event.actorId), participant],
      revision: event.revision,
      updatedAt: event.createdAt,
    };
  }

  if (event.type === 'student.team_selected') {
    const teamId = typeof payload.teamId === 'string' ? payload.teamId : null;
    return {
      ...snapshot,
      participants: snapshot.participants.map((participant) => (
        participant.id === event.actorId ? { ...participant, teamId, teamUpdatedAt: event.createdAt } : participant
      )),
      revision: event.revision,
      updatedAt: event.createdAt,
    };
  }

  if (event.type === 'student.response') {
    const blockId = typeof payload.blockId === 'string' ? payload.blockId : '';
    if (!blockId) return { ...snapshot, revision: event.revision, updatedAt: event.createdAt };
    const existing = snapshot.responses.find((row) => row.participantId === event.actorId && row.blockId === blockId);
    const answer = payload.answer ?? null;
    const source: 'primary' | 'fallback' = payload.source === 'primary' ? 'primary' : 'fallback';
    const submittedAt = typeof payload.submittedAt === 'string' ? payload.submittedAt : event.createdAt;
    const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : event.createdAt;
    const next = {
      participantId: event.actorId,
      blockId,
      answer,
      submitted: payload.submitted === true ? true : existing?.submitted ?? false,
      updatedAt,
      submittedAnswer: payload.submitted === true ? answer : existing?.submittedAnswer,
      submittedAt: payload.submitted === true ? submittedAt : existing?.submittedAt ?? null,
      source,
      submissionSource: payload.submitted === true ? source : existing?.submissionSource,
    };
    return {
      ...snapshot,
      responses: [
        ...snapshot.responses.filter((row) => !(row.participantId === event.actorId && row.blockId === blockId)),
        next,
      ],
      revision: event.revision,
      updatedAt: event.createdAt,
    };
  }

  if (event.type === 'student.team_response') {
    const teamId = typeof payload.teamId === 'string' ? payload.teamId : '';
    const blockId = typeof payload.blockId === 'string' ? payload.blockId : '';
    const text = typeof payload.text === 'string' ? payload.text.slice(0, 4000) : '';
    if (!teamId || !blockId || !text) return { ...snapshot, revision: event.revision, updatedAt: event.createdAt };
    const existing = (snapshot.teamResponses ?? []).find((row) => row.teamId === teamId && row.blockId === blockId);
    const source: 'primary' | 'fallback' = payload.source === 'primary' ? 'primary' : 'fallback';
    const submittedAt = typeof payload.submittedAt === 'string' ? payload.submittedAt : event.createdAt;
    const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : event.createdAt;
    const next = {
      teamId,
      blockId,
      text,
      submitted: payload.submitted === true ? true : existing?.submitted ?? false,
      updatedAt,
      submittedText: payload.submitted === true ? text : existing?.submittedText ?? null,
      submittedAt: payload.submitted === true ? submittedAt : existing?.submittedAt ?? null,
      updatedByParticipantId: event.actorId,
      source,
      submissionSource: payload.submitted === true ? source : existing?.submissionSource,
    };
    return {
      ...snapshot,
      teamResponses: [
        ...(snapshot.teamResponses ?? []).filter((row) => !(row.teamId === teamId && row.blockId === blockId)),
        next,
      ],
      revision: event.revision,
      updatedAt: event.createdAt,
    };
  }

  return { ...snapshot, revision: event.revision, updatedAt: event.createdAt };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      const origin = allowedOrigin(request);
      if (!origin) return new Response(null, { status: 403 });
      return cors(new Response(null, { status: 204 }), request);
    }
    if (url.pathname === '/health') {
      return cors(json({
        ok: true,
        service: 'syllonaut-live-control',
        workerVersion: WORKER_VERSION,
        protocolVersion: LIVE_PROTOCOL_VERSION,
      }), request);
    }

    const route = sessionRoute(url);
    if (!route) return json({ error: 'Not found.' }, 404);

    // Every live session runs and stores its data only in the EU jurisdiction.
    // Objects created before 0.8.15 outside it are not migrated; their 7-day
    // retention alarm deletes them.
    const liveSessions = env.LIVE_SESSION.jurisdiction('eu');
    const id = liveSessions.idFromName(route.sessionId);
    const stub = liveSessions.get(id);
    const headers = new Headers(request.headers);

    if (route.suffix === '/bootstrap') {
      const auth = request.headers.get('authorization');
      if (!env.LIVE_BOOTSTRAP_SECRET || auth !== `Bearer ${env.LIVE_BOOTSTRAP_SECRET}`) {
        return json({ error: 'Unauthorized.' }, 401);
      }
      headers.set('x-syllonaut-bootstrap-authorized', '1');
    } else {
      const auth = request.headers.get('authorization');
      const bearerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
      const token = route.suffix === '/ws' ? (url.searchParams.get('token') ?? bearerToken) : bearerToken;
      const capability = await verifyCapability(token, env.LIVE_CAPABILITY_SECRET, route.sessionId);
      if (!capability) return json({ error: 'Unauthorized.' }, 401);
      headers.set('x-syllonaut-role', capability.role);
      headers.set('x-syllonaut-sub', capability.sub);
    }

    const response = await stub.fetch(new Request(request, { headers }));
    if (response.status === 101) return response;
    return cors(response, request);
  },
} satisfies ExportedHandler<Env>;

export class LiveSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          revision INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          operation_id TEXT NOT NULL UNIQUE,
          actor_role TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    });
  }

  private readSnapshot(): SessionSnapshot | null {
    const rows = [...this.ctx.storage.sql.exec<{ value: string }>(
      "SELECT value FROM session_state WHERE key = 'snapshot' LIMIT 1",
    )];
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].value) as SessionSnapshot;
    } catch {
      return null;
    }
  }

  private writeSnapshot(snapshot: SessionSnapshot) {
    this.ctx.storage.sql.exec(
      "INSERT INTO session_state(key, value) VALUES ('snapshot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      JSON.stringify(snapshot),
    );
  }

  private async extendRetention() {
    await this.ctx.storage.setAlarm(Date.now() + LIVE_RETENTION_MS);
  }

  private operationResult(operationId: string): LiveEvent | null {
    const rows = [...this.ctx.storage.sql.exec<{
      revision: number;
      id: string;
      operation_id: string;
      actor_role: Role;
      actor_id: string;
      type: string;
      payload: string;
      created_at: string;
    }>(
      'SELECT revision,id,operation_id,actor_role,actor_id,type,payload,created_at FROM events WHERE operation_id = ? LIMIT 1',
      operationId,
    )];
    const row = rows[0];
    return row ? {
      id: row.id,
      revision: row.revision,
      operationId: row.operation_id,
      actorRole: row.actor_role,
      actorId: row.actor_id,
      type: row.type,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    } : null;
  }

  private broadcast(message: unknown) {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch {
        // Broken sockets are cleaned up by the runtime close/error handlers.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/bootstrap') && request.method === 'POST') {
      if (request.headers.get('x-syllonaut-bootstrap-authorized') !== '1') return json({ error: 'Unauthorized.' }, 401);
      const body = await request.json() as SessionSnapshot;
      if (!body.sessionId || !Number.isInteger(body.revision) || body.revision < 0) return json({ error: 'Invalid snapshot.' }, 400);

      const current = this.readSnapshot();
      if (current && current.sessionId !== body.sessionId) return json({ error: 'Session mismatch.' }, 409);
      if (current && current.revision > body.revision) return json({ snapshot: current, stale: true }, 409);

      this.writeSnapshot({ ...body, updatedAt: new Date().toISOString() });
      await this.extendRetention();
      this.broadcast({ type: 'snapshot', revision: body.revision });
      return json({ ok: true, revision: body.revision });
    }

    if (url.pathname.endsWith('/state') && request.method === 'GET') {
      const snapshot = this.readSnapshot();
      if (!snapshot) return json({ error: 'Live session is not bootstrapped.' }, 404);
      const afterRevision = Number(url.searchParams.get('after') ?? '-1');
      const events = Number.isFinite(afterRevision) && afterRevision >= 0
        ? [...this.ctx.storage.sql.exec<{
            revision: number;
            id: string;
            operation_id: string;
            actor_role: Role;
            actor_id: string;
            type: string;
            payload: string;
            created_at: string;
          }>(
            'SELECT revision,id,operation_id,actor_role,actor_id,type,payload,created_at FROM events WHERE revision > ? ORDER BY revision ASC LIMIT 500',
            afterRevision,
          )].map((row) => ({
            id: row.id,
            revision: row.revision,
            operationId: row.operation_id,
            actorRole: row.actor_role,
            actorId: row.actor_id,
            type: row.type,
            payload: JSON.parse(row.payload),
            createdAt: row.created_at,
          }))
        : [];

      return json({ snapshot, events });
    }

    if (url.pathname.endsWith('/events') && request.method === 'POST') {
      const actorRole = request.headers.get('x-syllonaut-role') as Role | null;
      const actorId = request.headers.get('x-syllonaut-sub') ?? '';
      if (!actorRole || !actorId) return json({ error: 'Unauthorized.' }, 401);
      if (actorRole === 'presenter') return json({ error: 'Forbidden.' }, 403);

      const body = await request.json() as { operationId?: string; type?: string; payload?: unknown };
      if (!body.operationId || !/^[0-9a-f-]{36}$/i.test(body.operationId) || !body.type || body.type.length > 80) {
        return json({ error: 'Invalid event.' }, 400);
      }

      const existing = this.operationResult(body.operationId);
      if (existing) return json({ ok: true, event: existing, duplicate: true });

      const snapshot = this.readSnapshot();
      if (!snapshot) return json({ error: 'Live session is not bootstrapped.' }, 409);
      if (snapshot.status === 'ended') return json({ error: 'Session has ended.' }, 410);

      const teacherOnly = body.type.startsWith('teacher.');
      if (teacherOnly && actorRole !== 'teacher') return json({ error: 'Forbidden.' }, 403);
      if (body.type.startsWith('student.') && actorRole !== 'student') return json({ error: 'Forbidden.' }, 403);

      if (body.type === 'teacher.command') {
        const commandPayload = body.payload && typeof body.payload === 'object'
          ? body.payload as Record<string, unknown>
          : {};
        const action = typeof commandPayload.action === 'string' ? commandPayload.action : '';
        const allowed = new Set([
          'start',
          'next',
          'previous',
          'end',
          'reveal_results',
          'reveal_scoreboard',
          'hide_scoreboard',
          'timer_start',
          'timer_pause',
          'timer_reset',
        ]);
        if (!allowed.has(action)) return json({ error: 'Invalid teacher command.' }, 400);

        const lesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
          ? snapshot.lessonSnapshot as { blocks?: Array<Record<string, unknown>> }
          : {};
        const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
        const currentIndex = snapshot.activeBlockId
          ? blocks.findIndex((block) => block.id === snapshot.activeBlockId)
          : -1;
        const activeBlock = currentIndex >= 0 ? blocks[currentIndex] : null;
        const expectedActiveBlockId = typeof commandPayload.expectedActiveBlockId === 'string'
          ? commandPayload.expectedActiveBlockId
          : null;

        if (action === 'start') {
          if (snapshot.status !== 'lobby' || !blocks.length) {
            return json({ error: 'Session cannot be started from its current state.' }, 409);
          }
        }

        if (action === 'next' || action === 'previous') {
          if (snapshot.status !== 'live' || currentIndex < 0) {
            return json({ error: 'The active block cannot be changed now.' }, 409);
          }
          if (expectedActiveBlockId && expectedActiveBlockId !== snapshot.activeBlockId) {
            return json({
              error: 'The teacher command is stale.',
              activeBlockId: snapshot.activeBlockId,
              revision: snapshot.revision,
            }, 409);
          }
          const targetIndex = action === 'next' ? currentIndex + 1 : currentIndex - 1;
          if (targetIndex < 0 || targetIndex >= blocks.length) {
            return json({ error: 'The requested block is outside the lesson.' }, 409);
          }
        }

        if (action === 'reveal_results') {
          if (
            snapshot.status !== 'live'
            || !activeBlock
            || (activeBlock.type !== 'poll' && activeBlock.type !== 'quiz')
          ) {
            return json({ error: 'Results cannot be revealed for the active block.' }, 409);
          }
        }

        if (action === 'reveal_scoreboard' || action === 'hide_scoreboard') {
          if (snapshot.status !== 'live') {
            return json({ error: 'Scoreboard state cannot be changed now.' }, 409);
          }
        }

        if (action === 'timer_start' || action === 'timer_pause' || action === 'timer_reset') {
          if (snapshot.status !== 'live' || activeBlock?.type !== 'timer') {
            return json({ error: 'The active block is not a live timer.' }, 409);
          }
          const timer = snapshot.timer && typeof snapshot.timer === 'object'
            ? snapshot.timer as { status?: unknown; remainingSeconds?: unknown }
            : {};
          const timerStatus = timer.status === 'running' || timer.status === 'paused' ? timer.status : 'idle';
          const remainingSeconds = typeof timer.remainingSeconds === 'number'
            ? Math.max(0, timer.remainingSeconds)
            : 0;

          if (action === 'timer_pause' && timerStatus !== 'running') {
            return json({ error: 'The timer is not running.' }, 409);
          }
          if (action === 'timer_start' && (timerStatus === 'running' || remainingSeconds <= 0)) {
            return json({ error: 'The timer cannot be started now.' }, 409);
          }
        }
      }

      if (body.type === 'student.team_selected') {
        const teamPayload = body.payload && typeof body.payload === 'object'
          ? body.payload as Record<string, unknown>
          : {};
        const teamId = typeof teamPayload.teamId === 'string' ? teamPayload.teamId : '';
        const participant = snapshot.participants.find((row) => row.id === actorId);
        if (!teamId || !snapshot.teams.some((team) => team.id === teamId)) {
          return json({ error: 'Team does not exist.' }, 409);
        }
        if (snapshot.status === 'live' && participant?.teamId && participant.teamId !== teamId) {
          return json({ error: 'Team is already locked.' }, 409);
        }
      }

      if (body.type === 'student.response') {
        const responsePayload = body.payload && typeof body.payload === 'object'
          ? body.payload as Record<string, unknown>
          : {};
        const blockId = typeof responsePayload.blockId === 'string' ? responsePayload.blockId : '';
        if (!blockId || blockId !== snapshot.activeBlockId) {
          return json({ error: 'The active block has changed.' }, 409);
        }
        const lesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
          ? snapshot.lessonSnapshot as { blocks?: Array<Record<string, unknown>> }
          : {};
        const block = (lesson.blocks ?? []).find((item) => item.id === blockId);
        if (!block || block.type === 'team_task') return json({ error: 'Active block does not accept an individual answer.' }, 409);
        if ((block.type === 'poll' || block.type === 'quiz') && snapshot.revealedBlockIds.includes(blockId)) {
          return json({ error: 'Results have already been revealed.' }, 409);
        }
        if (!responsePayload.answer || typeof responsePayload.answer !== 'object') {
          return json({ error: 'Invalid answer.' }, 400);
        }
        if (JSON.stringify(responsePayload.answer).length > 12_000) {
          return json({ error: 'Answer is too large.' }, 413);
        }
      }

      if (body.type === 'student.team_response') {
        const teamPayload = body.payload && typeof body.payload === 'object'
          ? body.payload as Record<string, unknown>
          : {};
        const teamId = typeof teamPayload.teamId === 'string' ? teamPayload.teamId : '';
        const blockId = typeof teamPayload.blockId === 'string' ? teamPayload.blockId : '';
        const text = typeof teamPayload.text === 'string' ? teamPayload.text.trim() : '';
        const participant = snapshot.participants.find((row) => row.id === actorId);
        const lesson = snapshot.lessonSnapshot && typeof snapshot.lessonSnapshot === 'object'
          ? snapshot.lessonSnapshot as { blocks?: Array<Record<string, unknown>> }
          : {};
        const block = (lesson.blocks ?? []).find((item) => item.id === blockId);

        if (!participant || !teamId || participant.teamId !== teamId || !snapshot.teams.some((team) => team.id === teamId)) {
          return json({ error: 'Participant is not a member of this team.' }, 403);
        }
        if (!blockId || blockId !== snapshot.activeBlockId || block?.type !== 'team_task') {
          return json({ error: 'The active team task has changed.' }, 409);
        }
        if (!text || text.length > 4000) return json({ error: 'Invalid team answer.' }, 400);
      }

      const revision = snapshot.revision + 1;
      const event: LiveEvent = {
        id: crypto.randomUUID(),
        revision,
        operationId: body.operationId,
        actorRole,
        actorId,
        type: body.type,
        payload: body.payload ?? null,
        createdAt: new Date().toISOString(),
      };

      const nextSnapshot = applyEvent(snapshot, event);
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          'INSERT INTO events(revision,id,operation_id,actor_role,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
          event.revision,
          event.id,
          event.operationId,
          event.actorRole,
          event.actorId,
          event.type,
          JSON.stringify(event.payload),
          event.createdAt,
        );
        this.writeSnapshot(nextSnapshot);
      });

      await this.extendRetention();
      this.broadcast({ type: 'event', event });
      return json({ ok: true, event });
    }

    if (url.pathname.endsWith('/ws') && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.serializeAttachment({
        role: request.headers.get('x-syllonaut-role'),
        sub: request.headers.get('x-syllonaut-sub'),
      });
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'Not found.' }, 404);
  }

  webSocketMessage(socket: WebSocket, message: ArrayBuffer | string) {
    if (message === 'ping') socket.send('pong');
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean) {
    socket.close(code, reason);
    void wasClean;
  }

  alarm() {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM events; DELETE FROM session_state;');
    });
  }
}
