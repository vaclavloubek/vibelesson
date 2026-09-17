'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicLessonBlock } from '@/lib/live';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  teamName: string;
  response: { text: string; updatedByParticipantId: string | null } | null;
  onSaved: () => void;
};

type LockInfo = {
  mine: boolean;
  holderParticipantId: string;
  holderDisplayName: string;
  expiresAt: string;
} | null;

type TeamEditResult = {
  ok?: boolean;
  acquired?: boolean;
  lock?: LockInfo;
  text?: string;
  error?: string;
};

type RequestResult = TeamEditResult & { responseOk: boolean; status: number };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function TeamTaskResponseInput({ sessionId, block, teamName, response, onSaved }: Props) {
  const serverText = response?.text ?? '';
  const [text, setText] = useState(serverText);
  const [lock, setLockState] = useState<LockInfo>(null);
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  const lockRef = useRef<LockInfo>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const latestTextRef = useRef(serverText);
  const lastSavedTextRef = useRef(serverText);
  const debounceRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const claimPromiseRef = useRef<Promise<boolean> | null>(null);

  const setLock = useCallback((next: LockInfo) => {
    lockRef.current = next;
    setLockState(next);
  }, []);

  const request = useCallback(async (action: 'status' | 'claim' | 'heartbeat' | 'save' | 'release', value?: string): Promise<RequestResult> => {
    const result = await fetchWithTimeout(`/api/student/sessions/${sessionId}/team-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, blockId: block.id, ...(action === 'save' ? { text: value } : {}) }),
      cache: 'no-store',
    }, action === 'save' ? 10_000 : 5_000);
    const data = await result.json() as TeamEditResult;
    return { ...data, responseOk: result.ok, status: result.status };
  }, [block.id, sessionId]);

  const resetToServer = useCallback((message?: string) => {
    const saved = lastSavedTextRef.current;
    latestTextRef.current = saved;
    dirtyRef.current = false;
    setText(saved);
    setSaveState('idle');
    if (message) setError(message);
  }, []);

  const ensureLock = useCallback(async () => {
    if (lockRef.current?.mine) return true;
    if (claimPromiseRef.current) return claimPromiseRef.current;

    const promise = (async () => {
      try {
        const result = await request('claim');
        setLock(result.lock ?? null);
        if (!result.responseOk) {
          setError(result.error || 'Týmový editor se nepodařilo zamknout.');
          return false;
        }
        if (!result.acquired) {
          const holder = result.lock?.holderDisplayName ?? 'jiný člen týmu';
          resetToServer(`Odpověď právě upravuje ${holder}.`);
          return false;
        }
        setError('');
        return true;
      } catch {
        setError('Týmový editor se nepodařilo zamknout.');
        return false;
      } finally {
        claimPromiseRef.current = null;
      }
    })();

    claimPromiseRef.current = promise;
    return promise;
  }, [request, resetToServer, setLock]);

  const releaseLock = useCallback(async () => {
    if (!lockRef.current?.mine) return;
    try {
      const result = await request('release');
      if (result.responseOk) setLock(null);
    } catch {
      // Expiring server lock is the fallback if release cannot reach the server.
    }
  }, [request, setLock]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    if (savePromiseRef.current) return savePromiseRef.current;

    const operation = (async () => {
      const value = latestTextRef.current.trim();
      if (!value) {
        setError('Společná týmová odpověď nemůže zůstat prázdná.');
        return false;
      }

      const acquired = await ensureLock();
      if (!acquired) return false;

      setSaveState('saving');
      setError('');
      try {
        const result = await request('save', value);
        if (result.lock !== undefined) setLock(result.lock ?? null);
        if (!result.responseOk) {
          if (result.status === 409 && result.lock && !result.lock.mine) {
            resetToServer(`Odpověď právě upravuje ${result.lock.holderDisplayName}.`);
          } else {
            setError(result.error || 'Týmovou odpověď se nepodařilo uložit.');
            setSaveState('dirty');
          }
          return false;
        }

        lastSavedTextRef.current = value;
        if (latestTextRef.current.trim() === value) {
          dirtyRef.current = false;
          setSaveState('saved');
        } else {
          setSaveState('dirty');
        }
        onSaved();
        return true;
      } catch {
        setError('Spojení se při ukládání přerušilo. Změnu zkusím uložit znovu.');
        setSaveState('dirty');
        return false;
      }
    })();

    savePromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      savePromiseRef.current = null;
    }
  }, [ensureLock, onSaved, request, resetToServer, setLock]);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void saveNow().then(() => {
        if (dirtyRef.current && latestTextRef.current.trim() && focusedRef.current) scheduleSave();
      });
    }, 800);
  }, [saveNow]);

  useEffect(() => {
    lastSavedTextRef.current = serverText;
    if (!dirtyRef.current && !focusedRef.current) {
      latestTextRef.current = serverText;
      setText(serverText);
      setSaveState('idle');
    }
  }, [serverText]);

  useEffect(() => {
    let cancelled = false;

    async function syncLock() {
      try {
        const result = await request('status');
        if (cancelled || !result.responseOk) return;
        const previous = lockRef.current;
        const next = result.lock ?? null;
        setLock(next);
        if (next && !next.mine && dirtyRef.current) {
          resetToServer(`Odpověď právě upravuje ${next.holderDisplayName}.`);
        } else if ((!next || next.mine) && previous && !previous.mine) {
          setError('');
        }
      } catch {
        // Polling is only a fallback; the server lock still protects writes.
      }
    }

    void syncLock();
    const timer = window.setInterval(() => { void syncLock(); }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [request, resetToServer, setLock]);

  useEffect(() => {
    if (!focused || !lock?.mine) return;
    const timer = window.setInterval(() => {
      void request('heartbeat').then((result) => {
        if (result.lock !== undefined) setLock(result.lock ?? null);
        if (result.responseOk && result.acquired === false && result.lock && !result.lock.mine) {
          focusedRef.current = false;
          setFocused(false);
          resetToServer(`Editor převzal ${result.lock.holderDisplayName}.`);
        }
      }).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [focused, lock?.mine, request, resetToServer, setLock]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      if (lockRef.current?.mine) {
        void fetch(`/api/student/sessions/${sessionId}/team-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release', blockId: block.id }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [block.id, sessionId]);

  const lockedByOther = Boolean(lock && !lock.mine);

  async function handleFocus() {
    focusedRef.current = true;
    setFocused(true);
    await ensureLock();
  }

  async function handleBlur() {
    focusedRef.current = false;
    setFocused(false);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (savePromiseRef.current) await savePromiseRef.current;
    if (dirtyRef.current) {
      const saved = await saveNow();
      if (!saved && !latestTextRef.current.trim()) resetToServer();
    }
    await releaseLock();
  }

  function handleChange(value: string) {
    if (lockRef.current && !lockRef.current.mine) return;
    latestTextRef.current = value;
    dirtyRef.current = true;
    setText(value);
    setSaveState('dirty');
    setError('');
    void ensureLock().then((acquired) => {
      if (acquired) scheduleSave();
    });
  }

  let statusText = 'Klikni do pole a začni psát. Změny se ukládají automaticky.';
  if (lockedByOther) statusText = `Upravuje ${lock!.holderDisplayName}. Pole se po uvolnění zpřístupní.`;
  else if (saveState === 'saving') statusText = 'Ukládám…';
  else if (saveState === 'dirty') statusText = 'Změny se za chvíli uloží automaticky…';
  else if (saveState === 'saved') statusText = 'Uloženo.';
  else if (focused && lock?.mine) statusText = 'Upravuješ ty · automatické ukládání je aktivní.';

  return (
    <section className="panel">
      <span className="eyebrow">Společná odpověď · {teamName}</span>
      <p className="muted-copy" style={{ marginTop: 8 }}>Toto pole sdílí celý tým. V jednu chvíli ho upravuje jeden člen; ostatní vidí poslední uloženou verzi.</p>
      {lockedByOther ? (
        <div className="reveal" style={{ marginTop: 12 }}>
          Právě upravuje <strong>{lock!.holderDisplayName}</strong>. Můžeš odpověď číst, editor se uvolní automaticky.
        </div>
      ) : null}
      <textarea
        value={text}
        onFocus={() => { void handleFocus(); }}
        onBlur={() => { void handleBlur(); }}
        onChange={(event) => handleChange(event.target.value)}
        maxLength={4000}
        rows={7}
        placeholder="Zapište společný výstup týmu…"
        disabled={lockedByOther}
        style={{ marginTop: 12 }}
      />
      <p className="muted-copy" style={{ marginTop: 8, marginBottom: 0 }}>{statusText}</p>
      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
