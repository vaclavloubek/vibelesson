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
type SaveOutcome = 'saved' | 'retry' | 'blocked';
type StoredDraft = { text: string; baseServerText: string; savedAt: number };

const SAVE_DEBOUNCE_MS = 800;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;
const STATUS_POLL_MS = 5000;
const HEARTBEAT_MS = 15_000;

function retryDelay(attempt: number) {
  const exponent = Math.max(0, Math.min(attempt - 1, 4));
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** exponent));
}

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
  const draftKey = `syllonaut-team-draft-v1:${sessionId}:${block.id}:${teamName}`;
  const [text, setText] = useState(serverText);
  const [lock, setLockState] = useState<LockInfo>(null);
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);

  const lockRef = useRef<LockInfo>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const latestTextRef = useRef(serverText);
  const lastSavedTextRef = useRef(serverText);
  const debounceRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<SaveOutcome> | null>(null);
  const claimPromiseRef = useRef<Promise<boolean> | null>(null);
  const retryAttemptRef = useRef(0);
  const draftHydratedRef = useRef(false);
  const draftConflictRef = useRef(false);

  const setLock = useCallback((next: LockInfo) => {
    lockRef.current = next;
    setLockState(next);
  }, []);

  const setDraftConflictState = useCallback((next: boolean) => {
    draftConflictRef.current = next;
    setDraftConflict(next);
  }, []);

  const clearDraft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(draftKey);
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }
  }, [draftKey]);

  const persistDraft = useCallback((value: string) => {
    try {
      const draft: StoredDraft = {
        text: value,
        baseServerText: lastSavedTextRef.current,
        savedAt: Date.now(),
      };
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Autosave to the server remains the primary persistence path.
    }
  }, [draftKey]);

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
    retryAttemptRef.current = 0;
    setText(saved);
    setSaveState('idle');
    setDraftRecovered(false);
    setDraftConflictState(false);
    clearDraft();
    setError(message ?? '');
  }, [clearDraft, setDraftConflictState]);

  const ensureLock = useCallback(async () => {
    if (lockRef.current?.mine) return true;
    if (claimPromiseRef.current) return claimPromiseRef.current;

    const promise = (async () => {
      try {
        const result = await request('claim');
        setLock(result.lock ?? null);
        if (!result.responseOk) {
          setError(result.error || 'Týmový editor se nepodařilo zamknout. Neuložený text zůstává v této kartě.');
          return false;
        }
        if (!result.acquired) {
          const holder = result.lock?.holderDisplayName ?? 'jiný člen týmu';
          setError(dirtyRef.current
            ? `Odpověď právě upravuje ${holder}. Tvůj neuložený text zůstává v této kartě.`
            : `Odpověď právě upravuje ${holder}.`);
          return false;
        }
        setError('');
        return true;
      } catch {
        setError('Týmový editor se nepodařilo zamknout. Neuložený text zůstává v této kartě.');
        return false;
      } finally {
        claimPromiseRef.current = null;
      }
    })();

    claimPromiseRef.current = promise;
    return promise;
  }, [request, setLock]);

  const releaseLock = useCallback(async () => {
    if (!lockRef.current?.mine) return;
    try {
      const result = await request('release');
      if (result.responseOk) setLock(null);
    } catch {
      // Expiring server lock is the fallback if release cannot reach the server.
    }
  }, [request, setLock]);

  const saveNow = useCallback(async (): Promise<SaveOutcome> => {
    if (!dirtyRef.current) return 'saved';
    if (savePromiseRef.current) return savePromiseRef.current;

    const operation = (async (): Promise<SaveOutcome> => {
      if (draftConflictRef.current) {
        setError('Obnovený text se liší od poslední týmové verze. Nejdřív zvol, kterou verzi chceš použít.');
        return 'blocked';
      }

      const value = latestTextRef.current.trim();
      if (!value) {
        setError('Společná týmová odpověď nemůže zůstat prázdná.');
        return 'blocked';
      }

      const acquired = await ensureLock();
      if (!acquired) {
        setSaveState('dirty');
        return 'retry';
      }

      setSaveState('saving');
      setError('');
      try {
        const result = await request('save', value);
        if (result.lock !== undefined) setLock(result.lock ?? null);
        if (!result.responseOk) {
          setSaveState('dirty');
          if (result.status === 409 && result.lock && !result.lock.mine) {
            setError(`Odpověď právě upravuje ${result.lock.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`);
            return 'retry';
          }

          setError(result.error || 'Týmovou odpověď se nepodařilo uložit.');
          return result.status === 408 || result.status === 429 || result.status >= 500 ? 'retry' : 'blocked';
        }

        lastSavedTextRef.current = value;
        retryAttemptRef.current = 0;
        clearDraft();
        setDraftRecovered(false);
        setDraftConflictState(false);
        if (latestTextRef.current.trim() === value) {
          dirtyRef.current = false;
          setSaveState('saved');
        } else {
          persistDraft(latestTextRef.current);
          setSaveState('dirty');
        }
        onSaved();
        return 'saved';
      } catch {
        setError('Spojení se při ukládání přerušilo. Text zůstává v této kartě a Syllonaut zkusí uložení znovu.');
        setSaveState('dirty');
        return 'retry';
      }
    })();

    savePromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      savePromiseRef.current = null;
    }
  }, [clearDraft, ensureLock, onSaved, persistDraft, request, setDraftConflictState, setLock]);

  const scheduleSave = useCallback((delayMs?: number) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const delay = delayMs ?? (retryAttemptRef.current > 0 ? retryDelay(retryAttemptRef.current) : SAVE_DEBOUNCE_MS);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void saveNow().then((outcome) => {
        if (outcome === 'saved') {
          retryAttemptRef.current = 0;
          if (dirtyRef.current && latestTextRef.current.trim() && focusedRef.current) scheduleSave();
          return;
        }
        if (outcome === 'retry' && dirtyRef.current && latestTextRef.current.trim() && focusedRef.current) {
          retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 10);
          scheduleSave(retryDelay(retryAttemptRef.current));
        }
      });
    }, delay);
  }, [saveNow]);

  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;

    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      if (typeof parsed.text !== 'string' || typeof parsed.baseServerText !== 'string' || parsed.text.length > 4000) {
        clearDraft();
        return;
      }
      if (parsed.text === serverText) {
        clearDraft();
        return;
      }

      latestTextRef.current = parsed.text;
      dirtyRef.current = true;
      setText(parsed.text);
      setSaveState('dirty');
      setDraftRecovered(true);
      const conflict = parsed.baseServerText !== serverText;
      setDraftConflictState(conflict);
      if (conflict) {
        setError('Mezitím se změnila týmová odpověď na serveru. Obnovený text proto neuložíme bez tvého rozhodnutí.');
      }
    } catch {
      clearDraft();
    }
  }, [clearDraft, draftKey, serverText, setDraftConflictState]);

  useEffect(() => {
    lastSavedTextRef.current = serverText;
    if (!dirtyRef.current && !focusedRef.current) {
      latestTextRef.current = serverText;
      setText(serverText);
      setSaveState('idle');
      setDraftRecovered(false);
      setDraftConflictState(false);
      clearDraft();
    }
  }, [clearDraft, serverText, setDraftConflictState]);

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
          setError(`Odpověď právě upravuje ${next.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`);
        } else if ((!next || next.mine) && previous && !previous.mine) {
          if (!draftConflictRef.current) setError('');
          if (dirtyRef.current && focusedRef.current && !draftConflictRef.current) scheduleSave();
        }
      } catch {
        // Polling is only a fallback; the server lock still protects writes.
      }
    }

    void syncLock();
    const timer = window.setInterval(() => { void syncLock(); }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [request, scheduleSave, setLock]);

  useEffect(() => {
    if (!focused || !lock?.mine) return;
    const timer = window.setInterval(() => {
      void request('heartbeat').then((result) => {
        if (result.lock !== undefined) setLock(result.lock ?? null);
        if (result.responseOk && result.acquired === false && result.lock && !result.lock.mine) {
          setError(dirtyRef.current
            ? `Editor převzal ${result.lock.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`
            : `Editor převzal ${result.lock.holderDisplayName}.`);
        }
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [focused, lock?.mine, request, setLock]);

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
    const acquired = await ensureLock();
    if (acquired && dirtyRef.current && !draftConflictRef.current) {
      scheduleSave();
    } else if (!acquired && dirtyRef.current && !draftConflictRef.current) {
      retryAttemptRef.current = Math.max(1, retryAttemptRef.current);
      scheduleSave(retryDelay(retryAttemptRef.current));
    }
  }

  async function handleBlur() {
    focusedRef.current = false;
    setFocused(false);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (savePromiseRef.current) await savePromiseRef.current;
    if (dirtyRef.current && !draftConflictRef.current) await saveNow();
    await releaseLock();
  }

  function handleChange(value: string) {
    if (lockRef.current && !lockRef.current.mine) return;

    latestTextRef.current = value;
    const changed = value !== lastSavedTextRef.current;
    dirtyRef.current = changed;
    setText(value);
    setDraftRecovered(false);
    setDraftConflictState(false);

    if (!changed) {
      retryAttemptRef.current = 0;
      clearDraft();
      setSaveState('idle');
      setError('');
      return;
    }

    persistDraft(value);
    setSaveState('dirty');
    setError('');
    scheduleSave();
  }

  async function useRecoveredDraft() {
    setDraftConflictState(false);
    setDraftRecovered(false);
    setError('');
    persistDraft(latestTextRef.current);
    const acquired = await ensureLock();
    if (acquired) scheduleSave();
  }

  let statusText = 'Klikni do pole a začni psát. Změny se ukládají automaticky.';
  if (lockedByOther && dirtyRef.current) statusText = `Upravuje ${lock!.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`;
  else if (lockedByOther) statusText = `Upravuje ${lock!.holderDisplayName}. Pole se po uvolnění zpřístupní.`;
  else if (draftConflict) statusText = 'Obnovený text čeká na tvoje rozhodnutí.';
  else if (draftRecovered) statusText = 'Obnovili jsme neuložený text z této karty. Po kliknutí do pole se znovu uloží.';
  else if (saveState === 'saving') statusText = 'Ukládám…';
  else if (saveState === 'dirty') statusText = 'Změny se uloží automaticky; při výpadku se další pokusy postupně zpomalí.';
  else if (saveState === 'saved') statusText = 'Uloženo.';
  else if (focused && lock?.mine) statusText = 'Upravuješ ty · automatické ukládání je aktivní.';

  return (
    <section className="panel">
      <span className="eyebrow">Společná odpověď · {teamName}</span>
      <p className="muted-copy" style={{ marginTop: 8 }}>Toto pole sdílí celý tým. V jednu chvíli ho upravuje jeden člen; ostatní vidí poslední uloženou verzi.</p>
      {draftConflict ? (
        <div className="reveal" style={{ marginTop: 12 }}>
          <strong>Našli jsme neuložený text z doby před obnovením stránky.</strong>
          <p style={{ marginBottom: 10 }}>Mezitím se ale změnila týmová odpověď na serveru. Vyber, kterou verzi chceš použít; nic nepřepíšeme automaticky.</p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="secondary" type="button" onClick={() => { void useRecoveredDraft(); }}>Použít obnovený text</button>
            <button className="secondary" type="button" onClick={() => resetToServer()}>Použít poslední týmovou verzi</button>
          </div>
        </div>
      ) : draftRecovered ? (
        <div className="reveal" style={{ marginTop: 12 }}>
          Obnovili jsme neuložený text z této karty. Neztratil se při refreshi ani během výpadku spojení.
        </div>
      ) : null}
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
        disabled={lockedByOther || draftConflict}
        style={{ marginTop: 12 }}
      />
      <p className="muted-copy" style={{ marginTop: 8, marginBottom: 0 }}>{statusText}</p>
      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
