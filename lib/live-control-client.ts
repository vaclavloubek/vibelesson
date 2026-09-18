'use client';

export type LiveControlAccess = {
  url: string;
  token: string;
  expiresAt: string;
  role?: 'teacher' | 'student';
  subject?: string;
};

export type LiveControlState = {
  snapshot: {
    sessionId: string;
    joinCode?: string;
    revision: number;
    status: 'lobby' | 'live' | 'ended';
    activeBlockId: string | null;
    lessonSnapshot: {
      title?: string;
      blocks?: Array<Record<string, unknown>>;
    };
    teams: Array<{ id: string; name: string; sortOrder?: number }>;
    participants: Array<{ id: string; displayName: string; teamId: string | null; teamUpdatedAt?: string | null }>;
    responses: Array<{
      participantId: string;
      blockId: string;
      answer: unknown;
      updatedAt: string;
      submittedAnswer?: unknown;
      submittedAt?: string | null;
    }>;
    teamResponses?: Array<{
      teamId: string;
      blockId: string;
      text: string;
      updatedAt: string;
      submittedText?: string | null;
      submittedAt?: string | null;
      updatedByParticipantId?: string | null;
    }>;
    revealedBlockIds: string[];
    scoreboardRevealed?: boolean;
    timer: unknown;
    updatedAt: string;
  };
  events?: unknown[];
};

function storageKey(sessionId: string, role: 'teacher' | 'student') {
  return `syllonaut-live-control-v1:${role}:${sessionId}`;
}

export function saveLiveControlAccess(sessionId: string, role: 'teacher' | 'student', access: LiveControlAccess | null) {
  if (!access || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId, role), JSON.stringify({ ...access, role }));
  } catch {
    // The primary Vercel/Supabase path remains available.
  }
}

export function getLiveControlAccess(sessionId: string, role: 'teacher' | 'student'): LiveControlAccess | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId, role));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveControlAccess;
    if (!parsed.url || !parsed.token || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(storageKey(sessionId, role));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function postLiveControlEvent(
  sessionId: string,
  role: 'teacher' | 'student',
  type: string,
  payload: unknown,
  operationId: string,
) {
  const access = getLiveControlAccess(sessionId, role);
  if (!access) return false;

  try {
    const response = await fetch(`${access.url}/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${access.token}`,
      },
      body: JSON.stringify({ operationId, type, payload }),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLiveControlState(
  sessionId: string,
  role: 'teacher' | 'student',
  afterRevision?: number,
): Promise<LiveControlState | null> {
  const access = getLiveControlAccess(sessionId, role);
  if (!access) return null;

  try {
    const query = typeof afterRevision === 'number' && afterRevision >= 0
      ? `?after=${encodeURIComponent(String(afterRevision))}`
      : '';
    const response = await fetch(`${access.url}/v1/sessions/${sessionId}/state${query}`, {
      headers: { authorization: `Bearer ${access.token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.json() as LiveControlState;
  } catch {
    return null;
  }
}

export function connectLiveControl(
  sessionId: string,
  role: 'teacher' | 'student',
  onMessage: (message: unknown) => void,
) {
  const access = getLiveControlAccess(sessionId, role);
  if (!access) return null;

  const wsBase = access.url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  const socket = new WebSocket(
    `${wsBase}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(access.token)}`,
  );
  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data as string));
    } catch {
      // Ignore malformed wake-ups; polling/fetch replay remains authoritative.
    }
  };
  return socket;
}
