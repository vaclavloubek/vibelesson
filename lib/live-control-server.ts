import { createHmac, randomUUID } from 'node:crypto';
import type { Lesson } from '@/lib/schema';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type Role = 'teacher' | 'student';

type LiveCapabilityInput = {
  sessionId: string;
  subject: string;
  role: Role;
  ttlSeconds?: number;
};

export type LiveControlAccess = {
  url: string;
  token: string;
  expiresAt: string;
  role: Role;
  subject: string;
};

export type LiveControlSnapshot = {
  sessionId: string;
  joinCode?: string;
  revision: number;
  status: 'lobby' | 'live' | 'ended';
  activeBlockId: string | null;
  lessonSnapshot: unknown;
  teams: Array<{ id: string; name: string; sortOrder?: number }>;
  participants: Array<{ id: string; displayName: string; teamId: string | null }>;
  responses: Array<{
    participantId: string;
    blockId: string;
    answer: unknown;
    submitted?: boolean;
    updatedAt?: string;
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
    updatedAt?: string;
    submittedText?: string | null;
    submittedAt?: string | null;
    updatedByParticipantId?: string | null;
    source?: 'primary' | 'fallback';
    submissionSource?: 'primary' | 'fallback';
  }>;
  revealedBlockIds: string[];
  scoreboardRevealed?: boolean;
  timer: {
    status: 'idle' | 'running' | 'paused';
    startedAt: string | null;
    remainingSeconds: number | null;
  } | null;
  updatedAt: string;
};

function config() {
  const url = process.env.SYLLONAUT_LIVE_CONTROL_URL?.replace(/\/$/, '');
  const bootstrapSecret = process.env.LIVE_BOOTSTRAP_SECRET;
  const capabilitySecret = process.env.LIVE_CAPABILITY_SECRET;
  if (!url || !bootstrapSecret || !capabilitySecret) return null;
  return { url, bootstrapSecret, capabilitySecret };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function liveControlConfigured() {
  return Boolean(config());
}

export function mintLiveCapability(input: LiveCapabilityInput): LiveControlAccess | null {
  const current = config();
  if (!current) return null;

  const exp = Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 8 * 60 * 60);
  const payload = {
    v: 1,
    sid: input.sessionId,
    sub: input.subject,
    role: input.role,
    exp,
  };
  const payloadPart = base64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', current.capabilitySecret).update(payloadPart).digest('base64url');

  return {
    url: current.url,
    token: `${payloadPart}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    role: input.role,
    subject: input.subject,
  };
}

export function publicLessonSnapshot(lesson: Lesson) {
  return {
    ...lesson,
    blocks: lesson.blocks.map(({ teacherNote: _teacherNote, correctAnswer: _correctAnswer, gradingRubric: _gradingRubric, ...block }) => block),
  };
}

export async function bootstrapLiveControl(snapshot: LiveControlSnapshot) {
  const current = config();
  if (!current) return false;

  try {
    const response = await fetchWithTimeout(
      `${current.url}/v1/sessions/${snapshot.sessionId}/bootstrap`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${current.bootstrapSecret}`,
        },
        body: JSON.stringify(snapshot),
        cache: 'no-store',
      },
      3_000,
    );
    const ok = response.ok || response.status === 409;
    if (!ok) {
      console.warn('live control bootstrap rejected', {
        sessionId: snapshot.sessionId,
        status: response.status,
      });
    }
    return ok;
  } catch (error) {
    console.error('live control bootstrap failed', {
      sessionId: snapshot.sessionId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}

export async function mirrorLiveControlEvent(input: {
  sessionId: string;
  role: Role;
  subject: string;
  type: string;
  payload?: unknown;
  operationId?: string;
}) {
  const access = mintLiveCapability({
    sessionId: input.sessionId,
    subject: input.subject,
    role: input.role,
    ttlSeconds: 60,
  });
  if (!access) return false;

  try {
    const response = await fetchWithTimeout(
      `${access.url}/v1/sessions/${input.sessionId}/events`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${access.token}`,
        },
        body: JSON.stringify({
          operationId: input.operationId ?? randomUUID(),
          type: input.type,
          payload: input.payload ?? null,
        }),
        cache: 'no-store',
      },
      3_000,
    );
    if (!response.ok) {
      console.warn('live control mirror rejected', {
        sessionId: input.sessionId,
        type: input.type,
        status: response.status,
      });
    }
    return response.ok;
  } catch (error) {
    console.error('live control mirror failed', {
      sessionId: input.sessionId,
      type: input.type,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}
