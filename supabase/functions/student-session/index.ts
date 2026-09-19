import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publicKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secret = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicKey = publicKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
if (!url || !secret || !publicKey) throw new Error("Supabase Edge Function environment is incomplete.");
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
function dbErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String((error as { message?: unknown }).message ?? "");
}
function sessionWriteError(error: unknown, fallback: string) {
  const message = dbErrorMessage(error);
  if (message.includes("free_session_join_window_closed")) return reply({ error: "Okno pro připojení nových studentů v této Free hodině už skončilo." }, 409);
  if (message.includes("free_session_expired")) return reply({ error: "Tato Free hodina po 6 hodinách skončila." }, 410);
  if (message.includes("participant_session_ended")) return reply({ error: "Tato hodina už skončila." }, 410);
  if (message.includes("participant_limit_reached")) return reply({ error: "Do hodiny je už připojen maximální počet studentů." }, 409);
  if (message.includes("participant_join_rate_limited")) return reply({ error: "Připojuje se příliš mnoho studentů najednou. Zkus to za chvíli znovu." }, 429);
  return reply({ error: fallback }, 500);
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function hash(value: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function token() { const b = new Uint8Array(32); crypto.getRandomValues(b); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, ""); }

type Block = Record<string, unknown>;
type Answer = { choice: string } | { text: string } | { ranking: string[]; text: string };
type Participant = { id: string; display_name?: string; team_id?: string | null };
function blocks(snapshot: unknown) { const x = (snapshot ?? {}) as { blocks?: unknown }; return Array.isArray(x.blocks) ? x.blocks.filter((b): b is Block => !!b && typeof b === "object") : []; }
function publicBlock(block: Block) { const out: Record<string, unknown> = {}; for (const k of ["id","type","title","durationMinutes","instructions","options","items","dataTable","revealText","points"]) if (block[k] !== undefined) out[k] = block[k]; return out; }
function remaining(s: { timer_status?: unknown; timer_started_at?: unknown; timer_remaining_seconds?: unknown }, now: number) { const base = typeof s.timer_remaining_seconds === "number" ? Math.max(0, s.timer_remaining_seconds) : 0; if (s.timer_status !== "running" || typeof s.timer_started_at !== "string") return base; const start = Date.parse(s.timer_started_at); return Number.isFinite(start) ? Math.max(0, base - Math.max(0, Math.floor((now - start) / 1000))) : base; }
function sameJson(left: unknown, right: unknown) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function normalize(block: Block, raw: unknown): { answer?: Answer; error?: string; status?: number } {
  if (!raw || typeof raw !== "object") return { error: "Chybí odpověď.", status: 400 };
  const v = raw as Record<string, unknown>;
  if (block.type === "poll" || block.type === "quiz") { const choice = typeof v.choice === "string" ? v.choice : ""; const opts = Array.isArray(block.options) ? block.options.filter((x): x is string => typeof x === "string") : []; return choice && opts.includes(choice) ? { answer: { choice } } : { error: "Vyber jednu z nabízených možností.", status: 400 }; }
  if (block.type === "open_text" || block.type === "exit_ticket") { const text = typeof v.text === "string" ? v.text.trim() : ""; return text.length >= 1 && text.length <= 2000 ? { answer: { text } } : { error: "Odpověď musí mít 1 až 2000 znaků.", status: 400 }; }
  if (block.type === "ranking") { const items = Array.isArray(block.items) ? block.items.filter((x): x is string => typeof x === "string") : []; const ranking = Array.isArray(v.ranking) ? v.ranking.filter((x): x is string => typeof x === "string") : []; const text = typeof v.text === "string" ? v.text.trim() : ""; if (items.length < 2) return { error: "Tento blok nemá dost položek k seřazení.", status: 409 }; if (ranking.length !== items.length || new Set(ranking).size !== items.length || items.some(x => !ranking.includes(x))) return { error: "Pořadí musí obsahovat všechny položky právě jednou.", status: 400 }; return text.length >= 1 && text.length <= 2000 ? { answer: { ranking, text } } : { error: "Ke svému pořadí přidej krátké zdůvodnění.", status: 400 }; }
  return { error: "Tento blok zatím odpověď nepřijímá.", status: 409 };
}
async function invalidate(key: string) { try { await fetch(`${url}/realtime/v1/api/broadcast`, { method: "POST", headers: { "Content-Type": "application/json", apikey: publicKey }, body: JSON.stringify({ messages: [{ topic: `session:${key}`, event: "invalidate", payload: {}, private: false }] }) }); } catch (e) { console.error("Realtime invalidate failed", e); } }
function scheduleInvalidate(key: string) { EdgeRuntime.waitUntil(invalidate(key)); }
async function verify(sessionId: string, rawToken: string, select = "id, display_name, team_id") {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || rawToken.length < 32 || rawToken.length > 128) return { response: reply({ error: "Neplatná participant identita." }, 401) };
  const { data, error } = await db.from("participants").select(select).eq("session_id", sessionId).eq("participant_token_hash", await hash(rawToken)).gt("participant_token_expires_at", new Date().toISOString()).maybeSingle();
  if (error) { console.error("Participant lookup failed", error); return { response: reply({ error: "Účastníka se nepodařilo ověřit." }, 500) }; }
  if (!data) return { response: reply({ error: "Účastník nebyl ověřen." }, 401) };
  return { participant: data as unknown as Participant };
}

async function join(b: Record<string, unknown>) {
  const code = typeof b.joinCode === "string" ? b.joinCode.trim().toUpperCase() : ""; const name = typeof b.displayName === "string" ? b.displayName.trim() : "";
  if (!/^[A-HJ-NP-Z2-9]{7}$/.test(code)) return reply({ error: "Neplatný kód hodiny." }, 400); if (name.length < 1 || name.length > 60) return reply({ error: "Jméno musí mít 1 až 60 znaků.", }, 400);
  const { data: s, error } = await db.from("sessions").select("id,status,realtime_key").eq("join_code", code).maybeSingle(); if (error) return reply({ error: "Hodinu se nepodařilo načíst." }, 500); if (!s) return reply({ error: "Hodina s tímto kódem neexistuje." }, 404); if (s.status === "ended") return reply({ error: "Tato hodina už skončila." }, 410);
  const raw = token(); const { data: p, error: insertError } = await db.from("participants").insert({ session_id: s.id, display_name: name, participant_token_hash: await hash(raw) }).select("id,participant_token_expires_at").single(); if (insertError || !p) return sessionWriteError(insertError, "Ke hodině se nepodařilo připojit."); scheduleInvalidate(s.realtime_key as string); return reply({ sessionId: s.id, participantId: p.id, participantToken: raw, participantTokenExpiresAt: p.participant_token_expires_at });
}

async function state(b: Record<string, unknown>) {
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : ""; const rawToken = typeof b.participantToken === "string" ? b.participantToken : ""; const v = await verify(sessionId, rawToken); if (v.response) return v.response; const p = v.participant!;
  const { data: s, error } = await db.from("sessions").select("id,status,active_block_id,lesson_snapshot,realtime_key,revealed_block_ids,timer_status,timer_started_at,timer_remaining_seconds").eq("id", sessionId).maybeSingle(); if (error) return reply({ error: "Hodinu se nepodařilo načíst." }, 500); if (!s) return reply({ error: "Hodina neexistuje." }, 404);
  const lesson = (s.lesson_snapshot ?? {}) as { title?: unknown; language?: unknown }; const all = blocks(s.lesson_snapshot); const index = typeof s.active_block_id === "string" ? all.findIndex(x => x.id === s.active_block_id) : -1; const rawBlock = s.status === "live" && index >= 0 ? all[index] : null; const activeBlock = rawBlock ? publicBlock(rawBlock) : null;
  const [{ data: teamRows, error: te }, { data: memberRows, error: me }] = await Promise.all([db.from("teams").select("id,name,sort_order").eq("session_id", sessionId).order("sort_order", { ascending: true }), db.from("participants").select("team_id").eq("session_id", sessionId)]); if (te || me) return reply({ error: "Týmy se nepodařilo načíst." }, 500);
  const counts = new Map<string, number>(); for (const m of memberRows ?? []) if (typeof m.team_id === "string") counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1); const teams = (teamRows ?? []).map(t => ({ id: t.id, name: t.name, memberCount: counts.get(t.id as string) ?? 0 })); const myTeam = typeof p.team_id === "string" ? teams.find(t => t.id === p.team_id) ?? null : null;
  let myResponse: Answer | null = null; let myResponseSubmitted = false; if (activeBlock && typeof s.active_block_id === "string" && rawBlock?.type !== "team_task") { const { data: r, error: re } = await db.from("responses").select("answer,submitted_answer,submitted_at").eq("session_id", sessionId).eq("participant_id", p.id).eq("block_id", s.active_block_id).maybeSingle(); if (re) return reply({ error: "Odpověď se nepodařilo načíst." }, 500); myResponse = (r?.answer as Answer | undefined) ?? null; myResponseSubmitted = Boolean(r?.submitted_at && sameJson(r?.answer, r?.submitted_answer)); }
  let myTeamResponse: { text: string; updatedByParticipantId: string | null; submittedText: string | null; submittedAt: string | null } | null = null; if (rawBlock?.type === "team_task" && typeof p.team_id === "string" && typeof s.active_block_id === "string") { const { data: r, error: re } = await db.from("team_responses").select("answer,submitted_answer,submitted_at,updated_by_participant_id").eq("session_id", sessionId).eq("team_id", p.team_id).eq("block_id", s.active_block_id).maybeSingle(); if (re) return reply({ error: "Týmovou odpověď se nepodařilo načíst." }, 500); const a = r?.answer as Record<string, unknown> | undefined; const submitted = r?.submitted_answer as Record<string, unknown> | null | undefined; if (typeof a?.text === "string") myTeamResponse = { text: a.text, updatedByParticipantId: r?.updated_by_participant_id as string | null, submittedText: typeof submitted?.text === "string" ? submitted.text : null, submittedAt: typeof r?.submitted_at === "string" ? r.submitted_at : null }; }
  const revealed = Array.isArray(s.revealed_block_ids) ? s.revealed_block_ids.filter((x): x is string => typeof x === "string") : []; const resultsRevealed = typeof s.active_block_id === "string" && revealed.includes(s.active_block_id) && (rawBlock?.type === "poll" || rawBlock?.type === "quiz"); let revealedResults: Record<string, unknown> | null = null;
  if (resultsRevealed && rawBlock && typeof s.active_block_id === "string") { const opts = Array.isArray(rawBlock.options) ? rawBlock.options.filter((x): x is string => typeof x === "string") : []; const { data: rows, error: re } = await db.from("responses").select("answer").eq("session_id", sessionId).eq("block_id", s.active_block_id); if (re) return reply({ error: "Zveřejněné výsledky se nepodařilo načíst." }, 500); const agg = opts.map(option => ({ option, count: 0 })); let total = 0; for (const row of rows ?? []) { const a = row.answer as Record<string, unknown> | null; const choice = typeof a?.choice === "string" ? a.choice : ""; const item = agg.find(x => x.option === choice); if (item) { item.count++; total++; } } revealedResults = { type: rawBlock.type, counts: agg, total }; if (rawBlock.type === "quiz") { const correct = typeof rawBlock.correctAnswer === "string" ? rawBlock.correctAnswer : undefined; const mine = myResponse && "choice" in myResponse ? myResponse.choice : null; revealedResults.correctAnswer = correct; revealedResults.myAnswer = mine; revealedResults.isCorrect = mine && correct ? mine === correct : null; } }
  const syncedAt = new Date().toISOString(); const timerState = rawBlock?.type === "timer" ? { status: s.timer_status === "running" || s.timer_status === "paused" ? s.timer_status : "idle", remainingSeconds: remaining(s, Date.parse(syncedAt)), syncedAt } : null;
  return reply({ sessionId: s.id, status: s.status, title: typeof lesson.title === "string" ? lesson.title : "Hodina", lessonLanguage: typeof lesson.language === "string" ? lesson.language : null, participantDisplayName: p.display_name, activeBlock, activeBlockIndex: index >= 0 ? index : null, totalBlocks: all.length, realtimeKey: s.realtime_key, myResponse, myResponseSubmitted, resultsRevealed, revealedResults, timer: timerState, teams, myTeam, myTeamResponse });
}

async function chooseTeam(b: Record<string, unknown>) {
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : ""; const rawToken = typeof b.participantToken === "string" ? b.participantToken : ""; const teamId = typeof b.teamId === "string" ? b.teamId : ""; if (!/^[0-9a-f-]{36}$/i.test(teamId)) return reply({ error: "Neplatný tým." }, 400); const v = await verify(sessionId, rawToken); if (v.response) return v.response; const p = v.participant!;
  const [{ data: s, error: se }, { data: team, error: te }] = await Promise.all([db.from("sessions").select("status,realtime_key").eq("id", sessionId).maybeSingle(), db.from("teams").select("id,name").eq("id", teamId).eq("session_id", sessionId).maybeSingle()]); if (se || te) return reply({ error: "Tým se nepodařilo načíst." }, 500); if (!s) return reply({ error: "Hodina neexistuje." }, 404); if (!team) return reply({ error: "Tým v této hodině neexistuje." }, 404); if (s.status === "ended") return reply({ error: "Tato hodina už skončila." }, 410); if (s.status === "live" && p.team_id && p.team_id !== teamId) return reply({ error: "Po zahájení hodiny už tým změnit nejde." }, 409); const { error } = await db.from("participants").update({ team_id: teamId }).eq("id", p.id).eq("session_id", sessionId); if (error) return sessionWriteError(error, "Tým se nepodařilo vybrat."); scheduleInvalidate(s.realtime_key as string); return reply({ ok: true, team: { id: team.id, name: team.name } });
}

async function respond(b: Record<string, unknown>) {
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : ""; const rawToken = typeof b.participantToken === "string" ? b.participantToken : ""; const blockId = typeof b.blockId === "string" ? b.blockId.trim() : ""; if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200) return reply({ error: "Neplatný požadavek na odpověď." }, 400); const v = await verify(sessionId, rawToken, "id"); if (v.response) return v.response; const p = v.participant!;
  const { data: s, error } = await db.from("sessions").select("status,active_block_id,lesson_snapshot,realtime_key,revealed_block_ids").eq("id", sessionId).maybeSingle(); if (error) return reply({ error: "Hodinu se nepodařilo načíst." }, 500); if (!s) return reply({ error: "Hodina neexistuje." }, 404); if (s.status !== "live") return reply({ error: "Odpovídat lze pouze během živé hodiny." }, 409); if (s.active_block_id !== blockId) return reply({ error: "Učitel už přešel na jiný blok." }, 409); const block = blocks(s.lesson_snapshot).find(x => x.id === blockId); if (!block) return reply({ error: "Aktivní blok nebyl nalezen ve snapshotu." }, 500); if (block.type === "team_task") return reply({ error: "Týmový úkol použij společnou týmovou odpověď." }, 409); const revealed = Array.isArray(s.revealed_block_ids) ? s.revealed_block_ids.filter((x): x is string => typeof x === "string") : []; if ((block.type === "poll" || block.type === "quiz") && revealed.includes(blockId)) return reply({ error: "Výsledky už byly zveřejněné. Odpověď už nelze změnit." }, 409); const n = normalize(block, b.answer); if (!n.answer) return reply({ error: n.error ?? "Neplatná odpověď." }, n.status ?? 400);
  const responseAction = b.responseAction === "submit" ? "submit" : "save";
  const explicitSubmit = responseAction === "submit" && (block.type === "open_text" || block.type === "exit_ticket");
  const timestamp = new Date().toISOString();
  const values: Record<string, unknown> = { session_id: sessionId, participant_id: p.id, block_id: blockId, answer: n.answer, updated_at: timestamp };
  if (explicitSubmit) { values.submitted_answer = n.answer; values.submitted_at = timestamp; }
  const { data: saved, error: saveError } = await db.from("responses").upsert(values, { onConflict: "session_id,participant_id,block_id" }).select("id,answer,submitted_answer,submitted_at,updated_at").single(); if (saveError || !saved) return sessionWriteError(saveError, "Odpověď se nepodařilo uložit.");
  let queuedForEvaluation = false;
  if (explicitSubmit) {
    const { data: queued, error: queueError } = await db.rpc("queue_submitted_response_evaluation", { p_response_id: saved.id });
    if (queueError) { console.error("Submit individual response grading queue failed", queueError); return reply({ error: "Odpověď je odevzdaná, ale nepodařilo se zařadit hodnocení. Zkus odevzdání znovu." }, 500); }
    queuedForEvaluation = Boolean(queued);
  }
  const submittedCurrent = Boolean(saved.submitted_at && sameJson(saved.answer, saved.submitted_answer));
  scheduleInvalidate(s.realtime_key as string); return reply({ ok: true, blockId, answer: saved.answer, updatedAt: saved.updated_at, submitted: explicitSubmit, submittedCurrent, queuedForEvaluation });
}

Deno.serve(async req => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try { const b = await req.json() as Record<string, unknown>; if (b.action === "join") return await join(b); if (b.action === "state") return await state(b); if (b.action === "choose_team") return await chooseTeam(b); if (b.action === "respond") return await respond(b); return reply({ error: "Neznámá akce." }, 400); }
  catch (e) { console.error("student-session failed", e); return reply({ error: "Požadavek se nepodařilo zpracovat." }, 500); }
});
