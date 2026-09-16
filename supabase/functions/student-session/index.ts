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

function publicBlock(block: LessonBlockLike) {
  const result: Record<string, unknown> = {};
  for (const key of ["id", "type", "title", "durationMinutes", "instructions", "options", "items", "revealText", "points"]) {
    if (block[key] !== undefined) result[key] = block[key];
  }
  return result;
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
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || participantToken.length < 32 || participantToken.length > 128) {
    return json({ error: "Neplatná participant identita." }, 401);
  }

  const participantTokenHash = await sha256(participantToken);
  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, display_name")
    .eq("session_id", sessionId)
    .eq("participant_token_hash", participantTokenHash)
    .maybeSingle();
  if (participantError) {
    console.error("Participant lookup failed", participantError);
    return json({ error: "Účastníka se nepodařilo ověřit." }, 500);
  }
  if (!participant) return json({ error: "Účastník nebyl ověřen." }, 401);

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
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks.filter((block): block is LessonBlockLike => !!block && typeof block === "object") : [];
  const activeIndex = typeof session.active_block_id === "string" ? blocks.findIndex((block) => block.id === session.active_block_id) : -1;
  const activeBlock = session.status === "live" && activeIndex >= 0 ? publicBlock(blocks[activeIndex]) : null;

  return json({
    sessionId: session.id,
    status: session.status,
    title: typeof snapshot.title === "string" ? snapshot.title : "Hodina",
    participantDisplayName: participant.display_name,
    activeBlock,
    activeBlockIndex: activeIndex >= 0 ? activeIndex : null,
    totalBlocks: blocks.length,
    realtimeKey: session.realtime_key,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "join") return await joinSession(body);
    if (body.action === "state") return await getState(body);
    return json({ error: "Neznámá akce." }, 400);
  } catch (error) {
    console.error("student-session failed", error);
    return json({ error: "Požadavek se nepodařilo zpracovat." }, 500);
  }
});
