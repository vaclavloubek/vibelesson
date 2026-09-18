import { DurableObject } from 'cloudflare:workers';

type Role = 'teacher' | 'student';

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
  revision: number;
  status: 'lobby' | 'live' | 'ended';
  activeBlockId: string | null;
  lessonSnapshot: unknown;
  teams?: unknown[];
  revealedBlockIds?: string[];
  timer?: unknown;
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
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
    if (payload.v !== 1 || payload.sid !== sessionId || !payload.sub || !['teacher', 'student'].includes(payload.role)) return null;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'syllonaut-live-control' });

    const route = sessionRoute(url);
    if (!route) return json({ error: 'Not found.' }, 404);

    const id = env.LIVE_SESSION.idFromName(route.sessionId);
    const stub = env.LIVE_SESSION.get(id);
    const headers = new Headers(request.headers);

    if (route.suffix === '/bootstrap') {
      const auth = request.headers.get('authorization');
      if (!env.LIVE_BOOTSTRAP_SECRET || auth !== `Bearer ${env.LIVE_BOOTSTRAP_SECRET}`) {
        return json({ error: 'Unauthorized.' }, 401);
      }
      headers.set('x-syllonaut-bootstrap-authorized', '1');
    } else {
      const auth = request.headers.get('authorization');
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
      const capability = await verifyCapability(token, env.LIVE_CAPABILITY_SECRET, route.sessionId);
      if (!capability) return json({ error: 'Unauthorized.' }, 401);
      headers.set('x-syllonaut-role', capability.role);
      headers.set('x-syllonaut-sub', capability.sub);
    }

    return stub.fetch(new Request(request, { headers }));
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
        this.writeSnapshot({ ...snapshot, revision, updatedAt: event.createdAt });
      });

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
}
