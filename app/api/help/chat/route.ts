import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { aiBillingPausedMessage, getEffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';
import { quotaSourceLabel, type AiQuotaSnapshot } from '@/lib/ai-quota';
import {
  HELP_HISTORY_MAX_MESSAGES,
  HELP_INPUT_MAX_CHARS,
  HELP_PAGES,
  HELP_PAGE_ROUTES,
  isHelpTokenLine,
} from '@/lib/help/actions';
import {
  createHelpOutputFilter,
  isHelpAssistantSwitchOn,
  streamHelpAnswer,
  type HelpUserContext,
} from '@/lib/help-assistant';

export const maxDuration = 60;

// Assistant turns come back from the browser; clamp them so a forged history
// cannot inflate the prompt.
const HISTORY_ASSISTANT_MAX_CHARS = 2000;

const InputSchema = z.object({
  locale: z.enum(['cs', 'en']),
  page: z.enum(HELP_PAGES),
  message: z.string().trim().min(1).max(HELP_INPUT_MAX_CHARS),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(HISTORY_ASSISTANT_MAX_CHARS),
  })).max(HELP_HISTORY_MAX_MESSAGES).default([]),
});

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  teacher: 'Teacher',
  teacher_pro: 'Teacher Pro',
  team: 'Team',
  school: 'School',
  campus: 'Campus',
  admin: 'Admin',
};

type HelpProfile = {
  role: string;
  help_assistant_enabled: boolean;
  multilingual_lessons_enabled: boolean;
  worksheet_export_enabled: boolean;
  ai_grading_enabled: boolean;
  lesson_folders_enabled: boolean;
};

async function loadHelpProfile(supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase'], userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, help_assistant_enabled, multilingual_lessons_enabled, worksheet_export_enabled, ai_grading_enabled, lesson_folders_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as HelpProfile | null;
}

function remainingOf(used: number | null | undefined, limit: number | null | undefined) {
  if (limit === null || limit === undefined) return null;
  return Math.max(0, limit - (used ?? 0));
}

function deniedMessage(code: string, locale: 'cs' | 'en') {
  const en = locale === 'en';
  switch (code) {
    case 'rate_limited':
      return en ? 'Too many questions in a short time. Try again in a minute.' : 'Příliš mnoho dotazů za krátkou dobu. Zkuste to za minutu znovu.';
    case 'monthly_limit':
    case 'budget_exhausted':
      return en ? 'The Help message allowance for this period is used up.' : 'Limit zpráv Nápovědy pro toto období je vyčerpaný.';
    default:
      return en ? 'Help with AI is not available for this account.' : 'Nápověda s AI není pro tento účet dostupná.';
  }
}

// Remaining messages for the panel header.
export async function GET() {
  if (!isHelpAssistantSwitchOn()) return NextResponse.json(null, { status: 404 });
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json(null, { status: 401 });

  const { data, error } = await createPrivilegedRpcClient().rpc('get_help_message_usage_server', { p_user_id: userId });
  if (error) {
    console.error('help usage lookup failed', { code: error.code });
    return NextResponse.json(null, { status: 500 });
  }
  const usage = data as { enabled: boolean; unlimited: boolean; used: number; limit: number | null; windowEnd: string | null };
  return NextResponse.json({
    enabled: usage.enabled,
    unlimited: usage.unlimited,
    remaining: usage.unlimited ? null : remainingOf(usage.used, usage.limit),
    limit: usage.limit,
    windowEnd: usage.windowEnd,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!isHelpAssistantSwitchOn()) return NextResponse.json(null, { status: 404 });

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_input' }, { status: 400 });
  const { locale, page, message, history } = parsed.data;

  let profile: HelpProfile | null;
  try {
    profile = await loadHelpProfile(supabase, userId);
  } catch (error) {
    console.error('help profile lookup failed', { code: (error as { code?: string }).code });
    return NextResponse.json({ code: 'unavailable' }, { status: 503 });
  }
  // Fast fail; the reservation below enforces the same entitlement in the DB.
  if (!profile || !(profile.role === 'admin' || profile.help_assistant_enabled)) {
    return NextResponse.json({ code: 'not_entitled', message: deniedMessage('not_entitled', locale) }, { status: 403 });
  }

  let billing: Awaited<ReturnType<typeof getEffectiveAiBillingPauseState>>;
  try {
    billing = await getEffectiveAiBillingPauseState(userId);
  } catch {
    return NextResponse.json({ code: 'unavailable' }, { status: 503 });
  }
  if (billing.reason) {
    // Fixed text, not from AI: Help with AI is paused together with other AI features.
    const paused = aiBillingPausedMessage(locale, billing.reason, billing.scope, billing.manager);
    const helpNote = locale === 'en'
      ? 'Help with AI is paused during that time as well.'
      : 'Nápověda s AI je v té době také pozastavená.';
    return NextResponse.json({ code: 'payment_required', message: `${paused} ${helpNote}`, actions: ['[[link:subscription]]'] }, { status: 402 });
  }

  const rpc = createPrivilegedRpcClient();
  const { data: reserveRows, error: reserveError } = await rpc.rpc('reserve_help_message_server', {
    p_user_id: userId,
    p_route: HELP_PAGE_ROUTES[page],
  });
  if (reserveError) {
    console.error('help reservation failed', { code: reserveError.code });
    return NextResponse.json({ code: 'unavailable' }, { status: 503 });
  }
  const reservation = (Array.isArray(reserveRows) ? reserveRows[0] : reserveRows) as {
    request_id: string | null;
    allowed: boolean;
    denial_code: string | null;
    used: number;
    monthly_limit: number | null;
  };
  if (!reservation?.allowed || !reservation.request_id) {
    const code = reservation?.denial_code ?? 'not_entitled';
    const status = code === 'rate_limited' || code === 'monthly_limit' || code === 'budget_exhausted' ? 429 : code === 'payment_required' ? 402 : 403;
    return NextResponse.json({
      code,
      message: deniedMessage(code, locale),
      remaining: code === 'rate_limited' ? undefined : 0,
    }, { status });
  }
  const requestId = reservation.request_id;

  let quota: AiQuotaSnapshot | null = null;
  try {
    const { data } = await supabase.rpc('get_ai_quota');
    quota = (Array.isArray(data) ? data[0] : data) as AiQuotaSnapshot | null;
  } catch {
    // The answer can still help without the allowance numbers.
  }

  const context: HelpUserContext = {
    planName: PLAN_NAMES[quota?.plan_code ?? (profile.role === 'admin' ? 'admin' : '')] ?? (locale === 'en' ? 'unknown' : 'neznámý'),
    organizationPlan: quota?.quota_scope === 'organization',
    lessonUsed: quota?.lesson_used ?? null,
    lessonLimit: quota?.lesson_limit ?? null,
    revisionUsed: quota?.revision_used ?? null,
    revisionLimit: quota?.revision_limit ?? null,
    gradingEnabled: Boolean(quota?.grading_enabled),
    gradingUsed: quota?.grading_used ?? null,
    gradingLimit: quota?.grading_limit ?? null,
    quotaWindowStart: quota?.quota_window_start ?? null,
    quotaWindowEnd: quota?.quota_window_end ?? null,
    quotaSourceLabel: quotaSourceLabel(quota?.quota_source, locale === 'en'),
    multilingual: profile.role === 'admin' || profile.multilingual_lessons_enabled,
    worksheets: profile.role === 'admin' || profile.worksheet_export_enabled,
    aiGrading: profile.role === 'admin' || profile.ai_grading_enabled,
    folders: profile.role === 'admin' || profile.lesson_folders_enabled,
    aiBillingPaused: false,
    page,
  };

  const messages: ModelMessage[] = [
    ...history.map((turn): ModelMessage => (
      turn.role === 'user'
        ? { role: 'user', content: turn.content.slice(0, HELP_INPUT_MAX_CHARS) }
        : {
            role: 'assistant',
            content: turn.content.split('\n').filter((line) => !isHelpTokenLine(line)).join('\n'),
          }
    )),
    { role: 'user', content: message },
  ];

  let finished = false;
  async function finish(status: 'succeeded' | 'failed', costUsd: number | null, topic: string | null) {
    if (finished) return;
    finished = true;
    const { error } = await rpc.rpc('finish_help_message_server', {
      p_user_id: userId,
      p_request_id: requestId,
      p_status: status,
      p_cost_usd: costUsd,
      p_topic: topic,
    });
    if (error) console.error('finish help request failed', { code: error.code });
  }

  const abort = new AbortController();
  let answer: ReturnType<typeof streamHelpAnswer>;
  try {
    answer = streamHelpAnswer({ locale, context, messages, abortSignal: abort.signal });
  } catch {
    await finish('failed', null, null);
    return NextResponse.json({ code: 'unavailable' }, { status: 503 });
  }

  const filter = createHelpOutputFilter();
  const encoder = new TextEncoder();
  const iterator = answer.text[Symbol.asyncIterator]();
  // Stage timings and token counts only, never text.
  const startedAt = Date.now();
  let firstDeltaMs: number | null = null;
  let lastDeltaMs: number | null = null;
  let deltas = 0;
  function logTiming(outcome: string) {
    console.info('help assistant stream timing', {
      outcome,
      firstDeltaMs,
      lastDeltaMs,
      deltas,
      totalMs: Date.now() - startedAt,
      end: answer.endInfo(),
    });
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (!next.done) {
          const now = Date.now() - startedAt;
          if (firstDeltaMs === null) firstDeltaMs = now;
          lastDeltaMs = now;
          deltas += 1;
          const out = filter.push(next.value);
          if (out) controller.enqueue(encoder.encode(out));
          return;
        }
        const tail = filter.flush();
        if (tail) controller.enqueue(encoder.encode(tail));
        const cost = await Promise.race([
          answer.cost,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        const ok = !answer.failed() && filter.hasVisibleText();
        await finish(ok ? 'succeeded' : 'failed', cost, filter.topic());
        logTiming(ok ? 'succeeded' : 'failed');
        controller.close();
      } catch {
        await finish('failed', null, null);
        logTiming('stream_error');
        controller.error(new Error('help_stream_failed'));
      }
    },
    async cancel() {
      abort.abort();
      await finish('failed', null, null);
      logTiming('client_cancelled');
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Help-Request-Id': requestId,
      'X-Help-Remaining': reservation.monthly_limit === null
        ? 'unlimited'
        : String(Math.max(0, reservation.monthly_limit - reservation.used)),
    },
  });
}
