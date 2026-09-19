import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!supabaseUrl || !secretKey || !publishableKey) throw new Error("Supabase Edge Function environment is incomplete.");

const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const LOCK_TTL_SECONDS = 60;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function databaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String((error as { message?: unknown }).message ?? "");
}

function freeSessionError(error: unknown) {
  return databaseErrorMessage(error).includes("free_session_expired")
    ? json({ error: "Tato Free hodina po 6 hodinách skončila." }, 410)
    : null;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

async function broadcastInvalidate(realtimeKey: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: publishableKey },
        body: JSON.stringify({
          messages: [{ topic: `session:${realtimeKey}`, event: "invalidate", payload: {}, private: false }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Realtime invalidate broadcast failed", error);
  }
}

function scheduleBroadcastInvalidate(realtimeKey: string) {
  EdgeRuntime.waitUntil(broadcastInvalidate(realtimeKey));
}

type Participant = { id: string; display_name: string; team_id: string | null };
type SessionRow = {
  status: string;
  active_block_id: string | null;
  lesson_snapshot: unknown;
  realtime_key: string;
};

type Context = {
  participant: Participant;
  session: SessionRow;
  blockId: string;
};

function blockType(snapshot: unknown, blockId: string) {
  const lesson = (snapshot ?? {}) as { blocks?: unknown };
  if (!Array.isArray(lesson.blocks)) return null;
  const block = lesson.blocks.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    return (candidate as Record<string, unknown>).id === blockId;
  }) as Record<string, unknown> | undefined;
  return typeof block?.type === "string" ? block.type : null;
}

async function verifyParticipant(sessionId: string, participantToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || participantToken.length < 32 || participantToken.length > 128) {
    return { response: json({ error: "Neplatná participant identita." }, 401) };
  }

  const participantTokenHash = await sha256(participantToken);
  const { data, error } = await admin
    .from("participants")
    .select("id, display_name, team_id")
    .eq("session_id", sessionId)
    .eq("participant_token_hash", participantTokenHash)
    .gt("participant_token_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Team edit participant lookup failed", error);
    return { response: json({ error: "Účastníka se nepodařilo ověřit." }, 500) };
  }
  if (!data) return { response: json({ error: "Účastník nebyl ověřen." }, 401) };
  return { participant: data as Participant };
}

async function loadContext(body: Record<string, unknown>, requireActive = true) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const participantToken = typeof body.participantToken === "string" ? body.participantToken : "";
  const blockId = typeof body.blockId === "string" ? body.blockId.trim() : "";

  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || blockId.length < 1 || blockId.length > 200) {
    return { response: json({ error: "Neplatný požadavek." }, 400) };
  }

  const verified = await verifyParticipant(sessionId, participantToken);
  if (verified.response) return verified;
  const participant = verified.participant!;
  if (!participant.team_id) return { response: json({ error: "Nejdřív si vyber tým." }, 409) };

  const [{ data: session, error: sessionError }, { data: team, error: teamError }] = await Promise.all([
    admin
      .from("sessions")
      .select("status, active_block_id, lesson_snapshot, realtime_key")
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("teams")
      .select("id")
      .eq("id", participant.team_id)
      .eq("session_id", sessionId)
      .maybeSingle(),
  ]);

  if (sessionError || teamError) {
    console.error("Team edit context lookup failed", sessionError ?? teamError);
    return { response: json({ error: "Týmový úkol se nepodařilo načíst." }, 500) };
  }
  if (!session) return { response: json({ error: "Hodina neexistuje." }, 404) };
  if (!team) return { response: json({ error: "Tým se nepodařilo ověřit." }, 409) };

  if (requireActive) {
    if (session.status !== "live") return { response: json({ error: "Týmový editor je dostupný jen během živé hodiny." }, 409) };
    if (session.active_block_id !== blockId) return { response: json({ error: "Učitel už přešel na jiný blok." }, 409) };
    if (blockType(session.lesson_snapshot, blockId) !== "team_task") {
      return { response: json({ error: "Aktivní blok není týmový úkol." }, 409) };
    }
  }

  return { context: { participant, session: session as SessionRow, blockId } as Context, sessionId };
}

async function lockInfo(sessionId: string, teamId: string, blockId: string, viewerParticipantId: string) {
  const now = new Date().toISOString();
  const { data: lock, error } = await admin
    .from("team_edit_locks")
    .select("participant_id, expires_at")
    .eq("session_id", sessionId)
    .eq("team_id", teamId)
    .eq("block_id", blockId)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) throw error;
  if (!lock) return null;

  let holderDisplayName = "Člen týmu";
  const { data: holder } = await admin
    .from("participants")
    .select("display_name")
    .eq("id", lock.participant_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (holder?.display_name) holderDisplayName = holder.display_name as string;

  return {
    mine: lock.participant_id === viewerParticipantId,
    holderParticipantId: lock.participant_id as string,
    holderDisplayName,
    expiresAt: lock.expires_at as string,
  };
}

async function claimLock(context: Context, sessionId: string) {
  const { data, error } = await admin.rpc("claim_team_edit_lock", {
    p_session_id: sessionId,
    p_team_id: context.participant.team_id,
    p_block_id: context.blockId,
    p_participant_id: context.participant.id,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });

  if (error) {
    console.error("Claim team edit lock failed", error);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const acquired = Boolean(row?.acquired);
  const lock = await lockInfo(sessionId, context.participant.team_id!, context.blockId, context.participant.id);
  return { acquired, lock };
}

async function status(body: Record<string, unknown>) {
  const loaded = await loadContext(body);
  if (loaded.response) return loaded.response;
  const { context } = loaded;
  const lock = await lockInfo(loaded.sessionId!, context!.participant.team_id!, context!.blockId, context!.participant.id);
  return json({ ok: true, lock });
}

async function claim(body: Record<string, unknown>, broadcast = true) {
  const loaded = await loadContext(body);
  if (loaded.response) return loaded.response;
  try {
    const result = await claimLock(loaded.context!, loaded.sessionId!);
    if (broadcast && result.acquired) scheduleBroadcastInvalidate(loaded.context!.session.realtime_key);
    return json({ ok: true, ...result });
  } catch (error) {
    return freeSessionError(error) ?? json({ error: "Editor se nepodařilo zamknout." }, 500);
  }
}

async function save(body: Record<string, unknown>) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 1 || text.length > 4000) return json({ error: "Týmová odpověď musí mít 1 až 4000 znaků." }, 400);

  const loaded = await loadContext(body);
  if (loaded.response) return loaded.response;
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;

  let claimed;
  try {
    claimed = await claimLock(context, sessionId);
  } catch (error) {
    return freeSessionError(error) ?? json({ error: "Editor se nepodařilo ověřit." }, 500);
  }
  if (!claimed.acquired) {
    return json({ error: "Týmovou odpověď právě upravuje jiný člen týmu.", lock: claimed.lock }, 409);
  }

  const { data: saved, error: saveError } = await admin
    .from("team_responses")
    .upsert({
      session_id: sessionId,
      team_id: context.participant.team_id,
      block_id: context.blockId,
      answer: { text },
      updated_by_participant_id: context.participant.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,team_id,block_id" })
    .select("updated_at")
    .single();

  if (saveError || !saved) {
    console.error("Autosave team response failed", saveError);
    return freeSessionError(saveError) ?? json({ error: "Týmovou odpověď se nepodařilo uložit." }, 500);
  }

  scheduleBroadcastInvalidate(context.session.realtime_key);
  return json({ ok: true, text, updatedAt: saved.updated_at, lock: claimed.lock });
}

async function submit(body: Record<string, unknown>) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 1 || text.length > 4000) return json({ error: "Týmová odpověď musí mít 1 až 4000 znaků." }, 400);

  const loaded = await loadContext(body);
  if (loaded.response) return loaded.response;
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;

  let claimed;
  try {
    claimed = await claimLock(context, sessionId);
  } catch {
    return json({ error: "Editor se nepodařilo ověřit." }, 500);
  }
  if (!claimed.acquired) {
    return json({ error: "Týmovou odpověď právě upravuje jiný člen týmu.", lock: claimed.lock }, 409);
  }

  const submittedAt = new Date().toISOString();
  const submittedAnswer = { text };
  const { data: saved, error: saveError } = await admin
    .from("team_responses")
    .upsert({
      session_id: sessionId,
      team_id: context.participant.team_id,
      block_id: context.blockId,
      answer: submittedAnswer,
      submitted_answer: submittedAnswer,
      submitted_at: submittedAt,
      updated_by_participant_id: context.participant.id,
      updated_at: submittedAt,
    }, { onConflict: "session_id,team_id,block_id" })
    .select("id, updated_at, submitted_at")
    .single();

  if (saveError || !saved) {
    console.error("Submit team response save failed", saveError);
    return freeSessionError(saveError) ?? json({ error: "Týmovou odpověď se nepodařilo odevzdat." }, 500);
  }

  const { data: queued, error: queueError } = await admin.rpc("queue_submitted_team_response_evaluation", {
    p_team_response_id: saved.id,
  });

  if (queueError) {
    console.error("Submit team response grading queue failed", queueError);
    return json({ error: "Odpověď je odevzdaná, ale nepodařilo se zařadit hodnocení. Zkus odevzdání znovu." }, 500);
  }

  scheduleBroadcastInvalidate(context.session.realtime_key);
  return json({
    ok: true,
    submitted: true,
    queuedForEvaluation: Boolean(queued),
    text,
    submittedAt: saved.submitted_at,
    updatedAt: saved.updated_at,
    lock: claimed.lock,
  });
}

async function release(body: Record<string, unknown>) {
  const loaded = await loadContext(body, false);
  if (loaded.response) return loaded.response;
  const context = loaded.context!;
  const sessionId = loaded.sessionId!;

  const { error } = await admin
    .from("team_edit_locks")
    .delete()
    .eq("session_id", sessionId)
    .eq("team_id", context.participant.team_id)
    .eq("block_id", context.blockId)
    .eq("participant_id", context.participant.id);

  if (error) {
    console.error("Release team edit lock failed", error);
    return json({ error: "Editor se nepodařilo uvolnit." }, 500);
  }

  scheduleBroadcastInvalidate(context.session.realtime_key);
  return json({ ok: true, lock: null });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "status") return await status(body);
    if (body.action === "claim") return await claim(body, true);
    if (body.action === "heartbeat") return await claim(body, false);
    if (body.action === "save") return await save(body);
    if (body.action === "submit") return await submit(body);
    if (body.action === "release") return await release(body);
    return json({ error: "Neznámá akce." }, 400);
  } catch (error) {
    console.error("team-edit failed", error);
    return json({ error: "Požadavek se nepodařilo zpracovat." }, 500);
  }
});