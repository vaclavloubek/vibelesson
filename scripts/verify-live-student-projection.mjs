// A student capability must never receive other participants' names, IDs or
// answers, the live event log or the content of future blocks from the Live
// Control Worker, neither through GET /state nor through the WebSocket.
// Teacher and presenter capabilities keep the full snapshot.
//
// Runs the real cloudflare/live-control/src/index.ts (Node type stripping)
// with a stubbed `cloudflare:workers`, node:sqlite behind ctx.storage.sql and
// fake hibernated sockets. No network, no Cloudflare account.
//
// "Předchozí aktivity": the real student state() of both backends (Neon and
// Supabase) runs against in-memory tables behind a fake Neon SQL tag and a fake
// Supabase query builder. previousBlocks must contain only blocks before the
// active one, without teacher-only fields, with only the student's own answer
// and their own team's text, loaded with one query per table.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${repoRoot}${path}`, 'utf8');
const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      return stub('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
    }
    if (specifier === 'server-only') return stub('export {};');
    if (specifier === '@/lib/neon/server') return stub('export const createNeonSql = () => globalThis.__neonSql;');
    if (specifier === '@/lib/neon/grading-outbox-worker') return stub('export function scheduleNeonGradingDrain() {}');
    if (specifier === '@/lib/supabase/admin') return stub('export const createAdminClient = () => globalThis.__supabase;');
    if (specifier.startsWith('@/')) {
      const base = `${repoRoot}${specifier.slice(2)}`;
      const file = ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find(existsSync);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const worker = await import(pathToFileURL(`${repoRoot}cloudflare/live-control/src/index.ts`).href);

// --- Durable Object harness -------------------------------------------------

function createSocket(role, sub) {
  return {
    role,
    sent: [],
    deserializeAttachment() { return { role, sub }; },
    send(message) { this.sent.push(message); },
  };
}

function createLiveSession() {
  const db = new DatabaseSync(':memory:');
  const sockets = [];
  const sql = {
    exec(query, ...bindings) {
      if (/^\s*select/i.test(query)) return db.prepare(query).all(...bindings);
      if (bindings.length) { db.prepare(query).run(...bindings); return []; }
      db.exec(query);
      return [];
    },
  };
  const ctx = {
    storage: { sql, transactionSync: (fn) => fn(), setAlarm: async () => {} },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets,
    acceptWebSocket: () => {},
  };
  return { object: new worker.LiveSession(ctx, {}), sockets };
}

const SESSION = '11111111-2222-4333-8444-555555555555';
const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const CYRIL = 'cccccccc-0000-4000-8000-000000000003';
const TEACHER = 'dddddddd-0000-4000-8000-000000000004';
const TEAM_1 = 'eeeeeeee-0000-4000-8000-000000000001';
const TEAM_2 = 'eeeeeeee-0000-4000-8000-000000000002';

const blocks = [
  { id: 'b1', type: 'intro', title: 'Úvod', durationMinutes: 3, instructions: 'Vítejte.' },
  { id: 'b2', type: 'open_text', title: 'Hlavní příčiny', durationMinutes: 5, instructions: 'Napiš příčiny.' },
  { id: 'b3', type: 'team_task', title: 'Týmový plán', durationMinutes: 8, instructions: 'Sestavte plán.' },
  { id: 'b4', type: 'quiz', title: 'FUTURE_TITLE', durationMinutes: 2, instructions: 'FUTURE_INSTRUCTIONS', options: ['FUTURE_OPTION_A', 'FUTURE_OPTION_B'] },
  { id: 'b5', type: 'reveal', title: 'FUTURE_REVEAL_TITLE', durationMinutes: 2, instructions: 'x', revealText: 'FUTURE_REVEAL_TEXT' },
];

function fixture(status, activeBlockId) {
  return {
    sessionId: SESSION,
    joinCode: 'ABCDEFG',
    revision: 10,
    status,
    activeBlockId,
    lessonSnapshot: { title: 'Lekce', language: 'cs', audience: 'Třída', blocks },
    teams: [{ id: TEAM_1, name: 'Sovy', sortOrder: 0 }, { id: TEAM_2, name: 'Lišky', sortOrder: 1 }],
    participants: [
      { id: ALICE, displayName: 'Alice', teamId: TEAM_1 },
      { id: BOB, displayName: 'BOB_NAME', teamId: TEAM_1 },
      { id: CYRIL, displayName: 'CYRIL_NAME', teamId: TEAM_2 },
    ],
    responses: [
      { participantId: ALICE, blockId: 'b2', answer: { text: 'ALICE_ANSWER' }, submitted: true, submittedAnswer: { text: 'ALICE_ANSWER' }, updatedAt: '2026-09-26T08:00:00.000Z' },
      { participantId: BOB, blockId: 'b2', answer: { text: 'BOB_ANSWER' }, submitted: true, submittedAnswer: { text: 'BOB_ANSWER' }, updatedAt: '2026-09-26T08:00:00.000Z' },
      { participantId: CYRIL, blockId: 'b2', answer: { text: 'CYRIL_ANSWER' }, updatedAt: '2026-09-26T08:00:00.000Z' },
    ],
    teamResponses: [
      { teamId: TEAM_1, blockId: 'b3', text: 'TEAM1_TEXT', updatedByParticipantId: BOB, updatedAt: '2026-09-26T08:00:00.000Z' },
      { teamId: TEAM_2, blockId: 'b3', text: 'TEAM2_TEXT', updatedByParticipantId: CYRIL, updatedAt: '2026-09-26T08:00:00.000Z' },
    ],
    revealedBlockIds: [],
    timer: null,
    updatedAt: '2026-09-26T08:00:00.000Z',
  };
}

async function bootstrap(object, snapshot) {
  const response = await object.fetch(new Request(`https://do/v1/sessions/${SESSION}/bootstrap`, {
    method: 'POST',
    headers: { 'x-syllonaut-bootstrap-authorized': '1', 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  }));
  assert.equal(response.status, 200, 'bootstrap accepted');
}

async function readState(object, role, sub, after = 0) {
  const response = await object.fetch(new Request(`https://do/v1/sessions/${SESSION}/state?after=${after}`, {
    headers: { 'x-syllonaut-role': role, 'x-syllonaut-sub': sub },
  }));
  assert.equal(response.status, 200, `${role} /state`);
  return { body: await response.json() };
}

async function post(object, role, sub, type, payload, operationId = randomUUID()) {
  const response = await object.fetch(new Request(`https://do/v1/sessions/${SESSION}/events`, {
    method: 'POST',
    headers: { 'x-syllonaut-role': role, 'x-syllonaut-sub': sub, 'content-type': 'application/json' },
    body: JSON.stringify({ operationId, type, payload }),
  }));
  return { status: response.status, body: await response.json(), operationId };
}

const FOREIGN = [BOB, CYRIL, 'BOB_NAME', 'CYRIL_NAME', 'BOB_ANSWER', 'CYRIL_ANSWER', 'TEAM2_TEXT', 'BOB_LIVE_ANSWER'];
const FUTURE = ['b5', 'FUTURE_REVEAL_TITLE', 'FUTURE_REVEAL_TEXT'];

function assertStudentProjection(body, { activeIndex, label }) {
  const text = JSON.stringify(body);
  for (const needle of FOREIGN) assert.ok(!text.includes(needle), `${label}: student must not receive ${needle}`);
  assert.deepEqual(body.events, [], `${label}: student gets no event log`);
  const snapshot = body.snapshot;
  assert.deepEqual(snapshot.participants.map((row) => row.id), [ALICE], `${label}: only own participant row`);
  assert.ok(snapshot.responses.every((row) => row.participantId === ALICE), `${label}: only own answers`);
  assert.ok((snapshot.teamResponses ?? []).every((row) => row.teamId === TEAM_1), `${label}: only own team answer`);
  assert.ok((snapshot.teamResponses ?? []).every((row) => row.updatedByParticipantId === null), `${label}: teammate IDs are removed from team answers`);
  assert.equal(snapshot.lessonSnapshot.totalBlocks, blocks.length, `${label}: totalBlocks keeps the "3 / 8" counter`);
  assert.deepEqual(snapshot.lessonSnapshot.blocks.map((block) => block.id), blocks.slice(0, activeIndex + 1).map((block) => block.id), `${label}: only blocks up to the active one`);
  assert.equal(snapshot.lessonSnapshot.audience, undefined, `${label}: lesson metadata is whitelisted`);
  const counts = Object.fromEntries(snapshot.teams.map((team) => [team.id, team.memberCount]));
  assert.deepEqual(counts, { [TEAM_1]: 2, [TEAM_2]: 1 }, `${label}: memberCount comes from the server`);

  // The pre-0.9.170 StudentSession fallback must still find everything it reads.
  const participant = snapshot.participants.find((row) => row.id === ALICE);
  assert.equal(participant?.displayName, 'Alice', `${label}: own display name`);
  assert.equal(participant?.teamId, TEAM_1, `${label}: own team`);
  if (activeIndex >= 0) {
    const index = snapshot.lessonSnapshot.blocks.findIndex((block) => block.id === snapshot.activeBlockId);
    assert.equal(index, activeIndex, `${label}: active block index matches the full lesson`);
  }
}

// --- 1. Live lesson, active block 3 of 5 ----------------------------------

{
  const { object, sockets } = createLiveSession();
  await bootstrap(object, fixture('live', 'b3'));

  const student = await readState(object, 'student', ALICE);
  assertStudentProjection(student.body, { activeIndex: 2, label: 'live b3' });
  for (const needle of ['b4', 'FUTURE_TITLE', 'FUTURE_INSTRUCTIONS', 'FUTURE_OPTION_A']) {
    assert.ok(!JSON.stringify(student.body).includes(needle), `live b3: future block content ${needle} must stay hidden`);
  }
  assert.ok(JSON.stringify(student.body).includes('ALICE_ANSWER'), 'own answer is present');
  assert.ok(JSON.stringify(student.body).includes('TEAM1_TEXT'), 'own team answer is present');

  const teacher = await readState(object, 'teacher', TEACHER);
  assert.equal(teacher.body.snapshot.participants.length, 3, 'teacher sees every participant');
  assert.equal(teacher.body.snapshot.lessonSnapshot.blocks.length, blocks.length, 'teacher sees every block');
  assert.equal(teacher.body.snapshot.responses.length, 3, 'teacher sees every answer');
  assert.equal(teacher.body.snapshot.teamResponses.length, 2, 'teacher sees every team answer');
  assert.equal(teacher.body.snapshot.teamResponses[0].updatedByParticipantId, BOB, 'teacher snapshot is unchanged');
  const presenter = await readState(object, 'presenter', TEACHER);
  assert.deepEqual(presenter.body.snapshot, teacher.body.snapshot, 'presenter gets the unchanged snapshot');

  // WebSocket: students get a payload-free wake-up, teacher and presenter the event.
  sockets.push(createSocket('student', ALICE), createSocket('teacher', TEACHER), createSocket('presenter', TEACHER), createSocket(null, null));
  const next = await post(object, 'teacher', TEACHER, 'teacher.command', { action: 'next', expectedActiveBlockId: 'b3' });
  assert.equal(next.status, 200, 'teacher next accepted');
  const bob = await post(object, 'student', BOB, 'student.response', { blockId: 'b4', answer: { choice: 'FUTURE_OPTION_A', note: 'BOB_LIVE_ANSWER' } });
  assert.equal(bob.status, 200, 'Bob answer accepted');

  const [studentSocket, teacherSocket, presenterSocket, unknownSocket] = sockets;
  for (const socket of [studentSocket, unknownSocket]) {
    assert.equal(socket.sent.length, 2, 'every accepted event wakes the student socket');
    for (const message of socket.sent) {
      const parsed = JSON.parse(message);
      assert.deepEqual(Object.keys(parsed).sort(), ['revision', 'type'], 'student wake-up carries no payload');
      assert.equal(parsed.type, 'wake');
    }
  }
  assert.ok(teacherSocket.sent.some((message) => message.includes('BOB_LIVE_ANSWER')), 'teacher socket still gets full events');
  assert.ok(presenterSocket.sent.some((message) => message.includes('BOB_LIVE_ANSWER')), 'presenter socket still gets full events');

  const afterNext = await readState(object, 'student', ALICE);
  assertStudentProjection(afterNext.body, { activeIndex: 3, label: 'live b4' });
  const teacherEvents = await readState(object, 'teacher', TEACHER, 10);
  assert.equal(teacherEvents.body.events.length, 2, 'teacher still gets the event replay');

  // A replayed operation ID of another participant must not echo their event.
  const replay = await post(object, 'student', ALICE, 'student.response', { blockId: 'b4', answer: { choice: 'FUTURE_OPTION_B' } }, bob.operationId);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.event, undefined, 'foreign duplicate operation returns no event');
  const ownReplay = await post(object, 'student', BOB, 'student.response', {}, bob.operationId);
  assert.equal(ownReplay.body.event?.operationId, bob.operationId, 'own duplicate operation still returns the event');

  // Previous → the list shrinks back to blocks before the new active block.
  await post(object, 'teacher', TEACHER, 'teacher.command', { action: 'previous', expectedActiveBlockId: 'b4' });
  assertStudentProjection((await readState(object, 'student', ALICE)).body, { activeIndex: 2, label: 'after previous' });
}

// --- 2. Lobby: no blocks at all --------------------------------------------

{
  const { object } = createLiveSession();
  await bootstrap(object, fixture('lobby', null));
  const student = await readState(object, 'student', ALICE);
  assertStudentProjection(student.body, { activeIndex: -1, label: 'lobby' });
  assert.deepEqual(student.body.snapshot.lessonSnapshot.blocks, [], 'lobby exposes no block');
}

// --- 3. Entry Worker: capability decides the role, headers cannot be spoofed --

{
  const secret = 'verify-live-student-projection';
  const { object } = createLiveSession();
  await bootstrap(object, fixture('live', 'b2'));
  const env = {
    LIVE_CAPABILITY_SECRET: secret,
    LIVE_BOOTSTRAP_SECRET: 'unused',
    LIVE_SESSION: { jurisdiction: () => ({ idFromName: (name) => name, get: () => ({ fetch: (request) => object.fetch(request) }) }) },
  };
  const token = (role, sub) => {
    const payload = Buffer.from(JSON.stringify({ v: 1, sid: SESSION, sub, role, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  };
  const response = await worker.default.fetch(new Request(`https://live.example/v1/sessions/${SESSION}/state?after=0`, {
    headers: {
      authorization: `Bearer ${token('student', ALICE)}`,
      'x-syllonaut-role': 'teacher',
      'x-syllonaut-sub': TEACHER,
    },
  }), env);
  assert.equal(response.status, 200);
  assertStudentProjection(await response.json(), { activeIndex: 1, label: 'entry worker' });
}

// --- 4. Server "Předchozí aktivity" in both state() implementations -------

{
  const TOKEN_ALICE = 'alice-token-'.padEnd(40, 'a');
  const TOKEN_BOB = 'bob-token-'.padEnd(40, 'b');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const TEACHER_ONLY = { teacherNote: 'SECRET_TEACHER_NOTE', correctAnswer: 'SECRET_CORRECT', gradingRubric: [{ id: 'r', title: 'SECRET_RUBRIC', description: 'x', maxPoints: 1 }], modelAnswer: 'SECRET_MODEL' };
  const lessonBlocks = [
    { id: 'p1', type: 'poll', title: 'Hlasování', durationMinutes: 2, instructions: 'Vyber.', options: ['Ano', 'Ne'], ...TEACHER_ONLY },
    { id: 'p2', type: 'open_text', title: 'Hlavní příčiny', durationMinutes: 5, instructions: 'Napiš.', dataTable: { caption: 'Data', columns: ['a', 'b'], rows: [['1', '2']] }, ...TEACHER_ONLY },
    { id: 'p3', type: 'team_task', title: 'Týmový plán', durationMinutes: 8, instructions: 'Plán.', ...TEACHER_ONLY },
    { id: 'p4', type: 'quiz', title: 'Kvíz', durationMinutes: 2, instructions: 'Kvíz.', options: ['A', 'B'], ...TEACHER_ONLY },
    { id: 'p5', type: 'reveal', title: 'FUTURE_P5_TITLE', durationMinutes: 2, instructions: 'FUTURE_P5_INSTRUCTIONS', revealText: 'FUTURE_P5_REVEAL', ...TEACHER_ONLY },
  ];
  const tables = {
    sessions: [],
    participants: [
      { id: ALICE, session_id: SESSION, display_name: 'Alice', team_id: TEAM_1, participant_token_hash: hash(TOKEN_ALICE) },
      { id: BOB, session_id: SESSION, display_name: 'BOB_NAME', team_id: TEAM_1, participant_token_hash: hash(TOKEN_BOB) },
      { id: CYRIL, session_id: SESSION, display_name: 'CYRIL_NAME', team_id: TEAM_2, participant_token_hash: hash('cyril') },
    ],
    teams: [
      { id: TEAM_1, session_id: SESSION, name: 'Sovy', sort_order: 0 },
      { id: TEAM_2, session_id: SESSION, name: 'Lišky', sort_order: 1 },
    ],
    responses: [
      { session_id: SESSION, participant_id: ALICE, block_id: 'p1', answer: { choice: 'Ano' }, submitted_answer: null, submitted_at: null },
      { session_id: SESSION, participant_id: ALICE, block_id: 'p2', answer: { text: 'ALICE_SAVED_AFTER_SUBMIT' }, submitted_answer: { text: 'ALICE_SUBMITTED' }, submitted_at: '2026-09-26T08:00:00Z' },
      { session_id: SESSION, participant_id: ALICE, block_id: 'p5', answer: { text: 'ALICE_FUTURE_ROW' }, submitted_answer: null, submitted_at: null },
      { session_id: SESSION, participant_id: BOB, block_id: 'p1', answer: { choice: 'Ne' }, submitted_answer: null, submitted_at: null },
      { session_id: SESSION, participant_id: BOB, block_id: 'p2', answer: { text: 'BOB_ANSWER' }, submitted_answer: { text: 'BOB_ANSWER' }, submitted_at: '2026-09-26T08:00:00Z' },
      { session_id: SESSION, participant_id: CYRIL, block_id: 'p2', answer: { text: 'CYRIL_ANSWER' }, submitted_answer: null, submitted_at: null },
    ],
    team_responses: [
      { session_id: SESSION, team_id: TEAM_1, block_id: 'p3', answer: { text: 'TEAM1_TEXT' }, submitted_answer: null, submitted_at: null, updated_by_participant_id: BOB },
      { session_id: SESSION, team_id: TEAM_2, block_id: 'p3', answer: { text: 'TEAM2_TEXT' }, submitted_answer: { text: 'TEAM2_TEXT' }, submitted_at: '2026-09-26T08:00:00Z', updated_by_participant_id: CYRIL },
    ],
  };
  const setSession = (status, activeBlockId) => {
    tables.sessions = [{
      id: SESSION, status, active_block_id: activeBlockId, realtime_key: 'rk',
      lesson_snapshot: { title: 'Lekce', language: 'cs', blocks: lessonBlocks },
      revealed_block_ids: [], timer_status: 'idle', timer_started_at: null, timer_remaining_seconds: null,
    }];
  };
  const matches = (row, filters) => filters.every(([column, value, op]) => (
    op === 'in' ? value.map(String).includes(String(row[column])) : String(row[column]) === String(value)
  ));
  const queryLog = [];

  // Neon: a tagged template that applies every `column = ${value}` and
  // `column = any(${values})` of the real query to in-memory tables.
  globalThis.__neonSql = async (strings, ...values) => {
    const text = strings.join('?');
    const table = text.match(/from public\.(\w+)/)?.[1];
    queryLog.push({ backend: 'neon', table, text });
    if (table === 'response_evaluations') return [];
    if (table === 'teams') {
      return tables.teams.map((team) => ({ ...team, member_count: tables.participants.filter((row) => row.team_id === team.id).length }));
    }
    const filters = [];
    strings.forEach((part, index) => {
      if (index >= values.length) return;
      const any = part.match(/(\w+) = any\($/);
      const eq = part.match(/(\w+) = $/);
      if (any) filters.push([any[1] === 'id' ? 'id' : any[1], values[index], 'in']);
      else if (eq) filters.push([eq[1], values[index], 'eq']);
    });
    return (tables[table] ?? []).filter((row) => matches(row, filters));
  };

  // Supabase: a minimal query builder with eq/in/gt/order/maybeSingle/single.
  globalThis.__supabase = {
    from(table) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push([column, value, 'eq']); return builder; },
        in(column, values) { filters.push([column, values, 'in']); queryLog.push({ backend: 'supabase', table, text: `in ${column}` }); return builder; },
        gt() { return builder; },
        order() { return builder; },
        result() { return (tables[table] ?? []).filter((row) => matches(row, filters)); },
        maybeSingle() { return Promise.resolve({ data: builder.result()[0] ?? null, error: null }); },
        single() { return builder.maybeSingle(); },
        then(resolve, reject) { return Promise.resolve({ data: builder.result(), error: null }).then(resolve, reject); },
      };
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  };

  const { handleStudentSessionAction } = await import(pathToFileURL(`${repoRoot}lib/student-session-server.ts`).href);
  const backends = [['neon', 'neon'], ['supabase', undefined]];
  const readStudent = async (backend, token) => {
    if (backend === undefined) delete process.env.DATABASE_BACKEND; else process.env.DATABASE_BACKEND = backend;
    const response = await handleStudentSessionAction({ action: 'state', sessionId: SESSION, participantToken: token });
    assert.equal(response.status, 200, 'student state loads');
    return response.json();
  };

  for (const [label, backend] of backends) {
    setSession('live', 'p4');
    queryLog.length = 0;
    const alice = await readStudent(backend, TOKEN_ALICE);
    const text = JSON.stringify(alice);
    assert.deepEqual(alice.previousBlocks.map((item) => [item.index, item.block.id]), [[0, 'p1'], [1, 'p2'], [2, 'p3']], `${label}: only blocks before the active one, numbered like the counter`);
    for (const item of alice.previousBlocks) {
      for (const field of Object.keys(TEACHER_ONLY)) assert.equal(item.block[field], undefined, `${label}: previousBlocks must not carry ${field}`);
    }
    for (const needle of ['SECRET_TEACHER_NOTE', 'SECRET_CORRECT', 'SECRET_RUBRIC', 'SECRET_MODEL', 'BOB_NAME', 'CYRIL_NAME', 'BOB_ANSWER', 'CYRIL_ANSWER', 'TEAM2_TEXT', 'ALICE_FUTURE_ROW', 'FUTURE_P5_TITLE', 'FUTURE_P5_INSTRUCTIONS', 'FUTURE_P5_REVEAL']) {
      assert.ok(!text.includes(needle), `${label}: student state must not contain ${needle}`);
    }
    const byId = Object.fromEntries(alice.previousBlocks.map((item) => [item.block.id, item]));
    assert.deepEqual(byId.p1.myAnswer, { choice: 'Ano' }, `${label}: last saved answer when nothing was submitted`);
    assert.deepEqual(byId.p2.myAnswer, { text: 'ALICE_SUBMITTED' }, `${label}: submitted answer wins over a later save`);
    assert.deepEqual(byId.p2.block.dataTable?.columns, ['a', 'b'], `${label}: dataTable is part of the previous block`);
    assert.equal(byId.p3.myAnswer, null, `${label}: team task has no individual answer`);
    assert.equal(byId.p3.myTeamAnswer, 'TEAM1_TEXT', `${label}: own team text`);
    assert.equal(byId.p1.myTeamAnswer, null, `${label}: no team text on individual blocks`);
    const previousQueries = queryLog.filter((entry) => entry.backend === label && /any\(|^in block_id/.test(entry.text));
    assert.deepEqual(previousQueries.map((entry) => entry.table).sort(), ['responses', 'team_responses'], `${label}: one IN query per table, not one per block`);

    const bob = await readStudent(backend, TOKEN_BOB);
    const bobText = JSON.stringify(bob);
    assert.equal(bob.previousBlocks.find((item) => item.block.id === 'p2').myAnswer.text, 'BOB_ANSWER', `${label}: Bob sees his own answer`);
    for (const needle of ['ALICE_SUBMITTED', 'ALICE_SAVED_AFTER_SUBMIT', 'CYRIL_ANSWER', 'TEAM2_TEXT']) {
      assert.ok(!bobText.includes(needle), `${label}: Bob must not see ${needle}`);
    }

    // Teacher went back ("Předchozí") → the list shrinks.
    setSession('live', 'p2');
    assert.deepEqual((await readStudent(backend, TOKEN_ALICE)).previousBlocks.map((item) => item.block.id), ['p1'], `${label}: previous shrinks the list`);
    setSession('live', 'p1');
    assert.deepEqual((await readStudent(backend, TOKEN_ALICE)).previousBlocks, [], `${label}: first block has no previous activities`);
    for (const status of ['lobby', 'ended']) {
      setSession(status, 'p4');
      assert.deepEqual((await readStudent(backend, TOKEN_ALICE)).previousBlocks, [], `${label}: no previous activities when ${status}`);
    }
  }
  delete process.env.DATABASE_BACKEND;
}

// --- 5. Client and source guards -------------------------------------------

{
  const workerSource = read('cloudflare/live-control/src/index.ts');
  assert.match(workerSource, /readerRole !== 'teacher' && readerRole !== 'presenter'/, 'the /state projection must fail closed for any non-teacher role');
  assert.match(workerSource, /attachment\?\.role === 'teacher' \|\| attachment\?\.role === 'presenter' \? serialized : wake/, 'broadcast must fail closed to the wake-up');

  const student = read('components/StudentSession.tsx');
  assert.ok(!/\blive\.events\b|\.events\b/.test(student), 'StudentSession must not depend on the Worker event log');
  assert.match(student, /connectLiveControl\(sessionId, 'student', \(\) => \{\s*void refreshFromLiveControl\('push'\);/, 'any WebSocket message must trigger a silent /state refresh');
  assert.match(student, /typeof team\.memberCount === 'number' \? team\.memberCount : counts\.get\(team\.id\)/, 'fallback must use the server memberCount and stay compatible with older Workers');
  assert.match(student, /typeof snapshot\.lessonSnapshot\?\.totalBlocks === 'number'/, 'fallback must use totalBlocks from the projection');

  // Fallback previousBlocks come from the projection and only from own rows.
  const fallback = student.match(/const previousBlocks: StudentPreviousActivity\[\] = [\s\S]*?: \[\];/)?.[0] ?? '';
  assert.ok(fallback.includes("snapshot.status === 'live' && activeBlockIndex > 0"), 'fallback previousBlocks only while live and after the first block');
  assert.ok(fallback.includes('blocks.slice(0, activeBlockIndex)'), 'fallback previousBlocks stop before the active block');
  assert.ok(fallback.includes('row.participantId === access.subject'), 'fallback previousBlocks use only own answers');
  assert.ok(fallback.includes('row.teamId === myTeam.id'), 'fallback previousBlocks use only own team text');
  assert.match(student, /<StudentPreviousActivities activities=\{state\.previousBlocks \?\? \[\]\} contentLanguage=\{state\.lessonLanguage\} \/>/, 'StudentSession renders the overview below the current task');
  assert.ok(student.indexOf('<StudentPreviousActivities') > student.indexOf('<StudentResponseInput'), 'the current task stays first on screen');

  const overview = read('components/StudentPreviousActivities.tsx');
  for (const forbidden of ['<input', '<textarea', '<button', '<form', 'StudentResponseInput', 'TeamTaskResponseInput', 'role="dialog"', 'fetch(']) {
    assert.ok(!overview.includes(forbidden), `the previous-activities overview must stay read-only (${forbidden})`);
  }
  for (const needle of ["ui('Předchozí aktivity', 'Previous activities')", "ui('Tvoje odpověď', 'Your answer')", "ui('Tvoje týmová odpověď', \"Your team's answer\")", "ui('Bez odpovědi', 'No answer')", '<summary', '{activity.index + 1}. <span lang={lang} dir={dir}>', '<LiveBlock block={activity.block} contentLanguage={contentLanguage} />']) {
    assert.ok(overview.includes(needle), `previous-activities overview must contain ${needle}`);
  }
  assert.ok(overview.includes('const [open, setOpen] = useState(false);'), 'the overview starts collapsed');
  assert.ok(!/<details\b[^]*?\sopen(?=[\s>/])/.test(overview.replace(/=>/g, '')), 'no <details> is hard-coded open');
}

console.log('Live student projection checks passed.');
