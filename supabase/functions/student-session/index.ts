import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!supabaseUrl || !secretKey || !publishableKey) throw new Error("Supabase Edge Function environment is incomplete.");

const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function makeParticipantToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

type LessonBlockLike = Record<string, unknown>;
type LessonLike = { title?: unknown; blocks?: unknown };
type StudentAnswer = { choice: string } | { text: string } | { ranking: string[]; text: string };

type VerifiedParticipant = {
  id: string;
  display_name?: string;
  team_id?: string | null;
};

function lessonBlocks(snapshot: unknown) {
  const lesson = (snapshot ?? {}) as LessonLike;
  return Array.isArray(lesson.blocks)
    ? lesson.blocks.filter((block): block is LessonBlockLike => !!block && typeof block === "object")
    : [];
}

function publicBlock(block: LessonBlockLike) {
  const result: Record<string, unknown> = {};
  for (const key of ["id", "type", "title", "durationMinutes", "instructions", "options", "items", "revealText", "points"]) {
    if (block[key] !== undefined) result[key] = block[key];
  }
  return result;
}

function normalizeAnswer(block: LessonBlockLike, raw: unknown): { answer?: StudentAnswer; error?: string; status?: number } {
  if (!raw || typeof raw !== "object") return { error: "Chybí odpověď.", status: 400 };
  const value = raw as Record<string, unknown>;

  if (block.type === "poll" || block.type === "quiz") {
    const choice = typeof value.choice === "string" ? value.choice : "";
    const options = Array.isArray(block.options) ? block.options.filter((option): option is string => typeof option === "string") : [];
    if (!choice || !options.includes(choice)) return { error: "Vyber jednu z nabízených možností.", status: 400 };
    return { answer: { choice } };
  }

  if (block.type === "open_text" || block.type === "exit_ticket") {
    const text = typeof value.text === "string" ? value.text.trim() : "";
    if (text.length < 1 || text.length > 2000) return { error: "Odpověď musí mít 1 až 2000 znaků.", status: 400 };
    return { answer: { text } };
  }

  if (block.type === "ranking") {
    const items = Array.isArray(block.items) ? block.items.filter((item): item is string => typeof item === "string") : [];
    const ranking = Array.isArray(value.ranking) ? value.ranking.filter((item): item is string => typeof item === "string") : [];
    if (items.length < 2) return { error: "Tento blok nemá dost položek k seřazení.", status: 409 };
    if (ranking.length !== items.length || new Set(ranking).size !== items.length || items.some((item) => !ranking.includes(item))) {
      return { error: "Pořadí musí obsahovat všechny položky právě jednou.", status: 400 };
    }
    const text = typeof value.text === "string" ? value.text.trim() : "";
    if (text.length < 1 || text.length > 2000) return { error: "Ke svému pořadí přidej krátké zdůvodnění.", status: 400 };
    return { answer: { ranking, text } };
  }

  return { error: "Tento blok zatím odpověď nepřijímá.", status: 409 };
}

async function broadcastInvalidate(realtimeKey: string) {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publishableKey },
      body: JSON.stringify({ messages: [{ topic: `session:${realtimeKey}`, event: "invalidate", payload: {}, private: false }] }),
    });
  } catch (error) {
    console.error("Realtime invalidate broadcast failed", error);
  }
}

async function verifyParticipant(sessionId: string, participantToken: string, select = "id, display_name, team_id") {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || participantToken.length < 32 || participantToken.length > 128) {
    return { response: json({ error: "Neplatná participant identita." }, 401) };
  }

  const participantTokenHash = await sha256(participantToken);
  const { data: participant, error } = await admin
    .from("participants")
    .select(select)
    .eq("session_id", sessionId)
    .eq("participant_token_hash", participantTokenHash)
    .maybeSingle();

  if (error) {
    console.error("Participant lookup failed", error);
    return { response: json({ error: "Účastníka se nepodařilo ověřit." }, 500) };
  }
  if (!participant) return { response: json({ error: "Účastník nebyl ověřen." }, 401) };
  return { participant: participant as unknown as VerifiedParticipant };
}

async function joinSession(body: Record<string, unknown>) {
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim().toUpperCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!/^[A-HJ-NP-Z2-9]{7}$/.test(joinCode)) return json({ error: "Neplatný kód hodiny." }, 400);
  if (displayName.length < 1 || displayName.length > 60) return json({ error: "Jméno musí mít 1 až 60 znaků." }, 400);

  const { data: session, error: sessionError } = await admin.from("sessions").select("id, status, realtime_key").eq("join_code", joinCode).maybeSingle();
  if (sessionError) {
    console.error("Session lookup failed", sessionError);
    return json({ error: "Hodinu se nepodařilo načíst." }, 500);
  }
  if (!session) return json({ error: "Hodina s tímto kódem neexistuje." }, 404);
  if (session.status === "ended") return json({ error: "Tato hodina už skončila." }, 410);

  const participantToken = makeParticipantToken();
  const participantTokenHash = await sha256(participantToken);
  const { data: participant, error: insertError } = await admin
    .from("participants")
    .insert({ session_id: session.id, display_name: displayName, participant_token_hash: participantTokenHash })
    .select("id")
    .single();
  if (insertError || !participant) {
    console.error("Participant insert failed", insertError);
    return json({ error: "Ke hodině se nepodařilo připojit." }, 500);
  }

  await broadcastInvalidate(session.realtime_key as string);
  return json({ sessionId: session.id, participantId: participant.id, participantToken });
}

async function getState(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const participantToken = typeof body.participantToken === "string" ? body.participantToken : "";
  const verified = await verifyParticipant(sessionId, participantToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, status, active_block_id, lesson_snapshot, realtime_key")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Student session lookup failed", sessionError);
    return json({ error: "Hodinu se nepodařilo načíst." }, 500);
  }
  if (!session) return json({ error: "Hodina neexistuje." }, 404);

  const snapshot = (session.lesson_snapshot ?? {}) as LessonLike;
  const blocks = lessonBlocks(session.lesson_snapshot);
  const activeIndex = typeof session.active_block_id === "string" ? blocks.findIndex((block) => block.id === session.active_block_id) : -1;
  const rawActiveBlock = session.status === "live" && activeIndex >= 0 ? blocks[activeIndex] : null;
  const activeBlock = rawActiveBlock ? publicBlock(rawActiveBlock) : null;

  const [{ data: teamRows, error: teamsError }, { data: memberRows, error: membersError }] = await Promise.all([
    admin.from("teams").select("id, name, sort_order").eq("session_id", sessionId).order("sort_order", { ascending: true }),
    admin.from("participants").select("team_id").eq("session_id", sessionId),
  ]);
  if (teamsError || membersError) {
    console.error("Student teams load failed", teamsError ?? membersError);
    return json({ error: "Týmy se nepodařilo načíst." }, 500);
  }

  const memberCounts = new Map<string, number>();
  for (const member of memberRows ?? []) {
    if (typeof member.team_id !== "string") continue;
    memberCounts.set(member.team_id, (memberCounts.get(member.team_id) ?? 0) + 1);
  }
  const teams = (teamRows ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: memberCounts.get(team.id as string) ?? 0,
  }));
  const myTeam = typeof participant.team_id === "string"
    ? teams.find((team) => team.id === participant.team_id) ?? null
    : null;

  let myResponse: StudentAnswer | null = null;
  if (activeBlock && typeof session.active_block_id === "string" && rawActiveBlock?.type !== "team_task") {
    const { data: savedResponse, error: responseError } = await admin
      .from("responses")
      .select("answer")
      .eq("session_id", sessionId)
      .eq("participant_id", participant.id)
      .eq("block_id", session.active_block_id)
      .maybeSingle();
    if (responseError) {
      console.error("Student response lookup failed", responseError);
      return json({ error: "Odpověď se nepodařilo načíst." }, 500);
    }
    myResponse = (savedResponse?.answer as StudentAnswer | undefined) ?? null;
  }

  let myTeamResponse: { text: string; updatedByParticipantId: string | null } | null = null;
  if (rawActiveBlock?.type === "team_task" && typeof participant.team_id === "string" && typeof session.active_block_id === "string") {
    const { data: teamResponse, error: teamResponseError } = await admin
      .from("team_responses")
      .select("answer, updated_by_participant_id")
      .eq("session_id", sessionId)
      .eq("team_id", participant.team_id)
      .eq("block_id", session.active_block_id)
      .maybeSingle();
    if (teamResponseError) {
      console.error("Student team response lookup failed", teamResponseError);
      return json({ error: "Týmovou odpověď se nepodařilo načíst." }, 500);
    }
    const answer = teamResponse?.answer as Record<string, unknown> | undefined;
    if (answer && typeof answer.text === "string") {
      myTeamResponse = {
        text: answer.text,
        updatedByParticipantId: teamResponse.updated_by_participant_id as string | null,
      };
    }
  }

  return json({
    sessionId: session.id,
    status: session.status,
    title: typeof snapshot.title === "string" ? snapshot.title : "Hodina",
    participantDisplayName: participant.display_name,
    activeBlock,
    activeBlockIndex: activeIndex >= 0 ? activeIndex : null,
    totalBlocks: blocks.length,
    realtimeKey: session.realtime_key,
    myResponse,
    teams,
    myTeam,
    myTeamResponse,
  });
}

async function chooseTeam(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const participantToken = typeof body.participantToken === "string" ? body.participantToken : "";
  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return json({ error: "Neplatný tým." }, 400);

  const verified = await verifyParticipant(sessionId, participantToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;

  const [{ data: session, error: sessionError }, { data: team, error: teamError }] = await Promise.all([
    admin.from("sessions").select("status, realtime_key").eq("id", sessionId).maybeSingle(),
    admin.from("teams").select("id, name").eq("id", teamId).eq("session_id", sessionId).maybeSingle(),
  ]);
  if (sessionError || teamError) {
    console.error("Choose team lookup failed", sessionError ?? teamError);
    return json({ error: "Tým se nepodařilo načíst." }, 500);
  }
  if (!session) return json({ error: "Hodina neexistuje." }, 404);
  if (!team) return json({ error: "Tým v této hodině neexistuje." }, 404);
  if (session.status === "ended") return json({ error: "Tato hodina už skončila." }, 410);
  if (session.status === "live" && participant.team_id && participant.team_id !== teamId) {
    return json({ error: "Po zahájení hodiny už tým změnit nejde." }, 409);
  }

  const { error: updateError } = await admin.from("participants").update({ team_id: teamId }).eq("id", participant.id).eq("session_id", sessionId);
  if (updateError) {
    console.error("Choose team update failed", updateError);
    return json({ error: "Tým se nepodařilo vybrat." }, 500);
  }

  await broadcastInvalidate(session.realtime_key as string);
  return json({ ok: true, team: { id: team.id, name: team.name } });
}

async function submitResponse(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const participantToken = typeof body.participantToken === "string" ? body.participantToken : "";
  const blockId = typeof body.blockId === "string" ? body.blockId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200) {
    return json({ error: "Neplatný požadavek na odpověď." }, 400);
  }

  const verified = await verifyParticipant(sessionId, participantToken, "id");
  if (verified.response) return verified.response;
  const participant = verified.participant!;

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("status, active_block_id, lesson_snapshot, realtime_key")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Response session lookup failed", sessionError);
    return json({ error: "Hodinu se nepodařilo načíst." }, 500);
  }
  if (!session) return json({ error: "Hodina neexistuje." }, 404);
  if (session.status !== "live") return json({ error: "Odpovídat lze pouze během živé hodiny." }, 409);
  if (session.active_block_id !== blockId) return json({ error: "Učitel už přešel na jiný blok." }, 409);

  const block = lessonBlocks(session.lesson_snapshot).find((candidate) => candidate.id === blockId);
  if (!block) return json({ error: "Aktivní blok nebyl nalezen ve snapshotu." }, 500);
  if (block.type === "team_task") return json({ error: "Týmový úkol použij společnou týmovou odpověď." }, 409);

  const normalized = normalizeAnswer(block, body.answer);
  if (!normalized.answer) return json({ error: normalized.error ?? "Neplatná odpověď." }, normalized.status ?? 400);

  const { data: saved, error: saveError } = await admin
    .from("responses")
    .upsert({
      session_id: sessionId,
      participant_id: participant.id,
      block_id: blockId,
      answer: normalized.answer,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,participant_id,block_id" })
    .select("answer, updated_at")
    .single();
  if (saveError || !saved) {
    console.error("Student response save failed", saveError);
    return json({ error: "Odpověď se nepodařilo uložit." }, 500);
  }

  await broadcastInvalidate(session.realtime_key as string);
  return json({ ok: true, blockId, answer: saved.answer, updatedAt: saved.updated_at });
}

async function submitTeamResponse(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const participantToken = typeof body.participantToken === "string" ? body.participantToken : "";
  const blockId = typeof body.blockId === "string" ? body.blockId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200 || text.length < 1 || text.length > 4000) {
    return json({ error: "Neplatná týmová odpověď." }, 400);
  }

  const verified = await verifyParticipant(sessionId, participantToken);
  if (verified.response) return verified.response;
  const participant = verified.participant!;
  if (!participant.team_id) return json({ error: "Nejdřív si vyber tým." }, 409);

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("status, active_block_id, lesson_snapshot, realtime_key")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Team response session lookup failed", sessionError);
    return json({ error: "Hodinu se nepodařilo načíst." }, 500);
  }
  if (!session) return json({ error: "Hodina neexistuje." }, 404);
  if (session.status !== "live") return json({ error: "Týmovou odpověď lze odeslat pouze během živé hodiny." }, 409);
  if (session.active_block_id !== blockId) return json({ error: "Učitel už přešel na jiný blok." }, 409);

  const block = lessonBlocks(session.lesson_snapshot).find((candidate) => candidate.id === blockId);
  if (!block || block.type !== "team_task") return json({ error: "Aktivní blok není týmový úkol." }, 409);

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id")
    .eq("id", participant.team_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (teamError || !team) return json({ error: "Tým se nepodařilo ověřit." }, teamError ? 500 : 409);

  const { data: saved, error: saveError } = await admin
    .from("team_responses")
    .upsert({
      session_id: sessionId,
      team_id: participant.team_id,
      block_id: blockId,
      answer: { text },
      updated_by_participant_id: participant.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,team_id,block_id" })
    .select("answer, updated_at")
    .single();
  if (saveError || !saved) {
    console.error("Team response save failed", saveError);
    return json({ error: "Týmovou odpověď se nepodařilo uložit." }, 500);
  }

  await broadcastInvalidate(session.realtime_key as string);
  return json({ ok: true, blockId, text, updatedAt: saved.updated_at });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "join") return await joinSession(body);
    if (body.action === "state") return await getState(body);
    if (body.action === "choose_team") return await chooseTeam(body);
    if (body.action === "respond") return await submitResponse(body);
    if (body.action === "respond_team") return await submitTeamResponse(body);
    return json({ error: "Neznámá akce." }, 400);
  } catch (error) {
    console.error("student-session failed", error);
    return json({ error: "Požadavek se nepodařilo zpracovat." }, 500);
  }
});
