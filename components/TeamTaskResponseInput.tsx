'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PublicLessonBlock } from '@/lib/live';
import { postLiveControlEvent } from '@/lib/live-control-client';
import { cacheLiveDraft, deleteCachedLiveDraft, getCachedLiveDraft } from '@/lib/live-offline';
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import { isUnchangedScaffold } from '@/lib/answer-scaffold';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  teamName: string;
  teamId: string;
  response: { text: string; updatedByParticipantId: string | null; submitted?: boolean; submittedText?: string | null; submittedAt?: string | null } | null;
  connectionRestored: boolean;
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
  submitted?: boolean;
  queuedForEvaluation?: boolean;
  lock?: LockInfo;
  text?: string;
  error?: string;
};

type RequestResult = TeamEditResult & { responseOk: boolean; status: number };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';
type SaveOutcome = 'saved' | 'retry' | 'blocked';
type StoredDraft = { text: string; baseServerText: string; savedAt: number };
type TeamEditAction = 'status' | 'claim' | 'heartbeat' | 'save' | 'submit' | 'release';

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

export default function TeamTaskResponseInput({ sessionId, block, teamName, teamId, response, connectionRestored, onSaved }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const serverText = response?.text ?? '';
  const serverSubmitted = Boolean(response?.submitted || (response?.submittedAt && response.submittedText === response.text));
  const draftKey = `syllonaut-team-draft-v1:${sessionId}:${block.id}:${teamName}`;
  const statusId = `team-response-status-${block.id}`;
  const [text, setText] = useState(serverText);
  const [lock, setLockState] = useState<LockInfo>(null);
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(serverSubmitted);
  const [submitUnconfirmed, setSubmitUnconfirmed] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');

  const lockRef = useRef<LockInfo>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const latestTextRef = useRef(serverText);
  const lastSavedTextRef = useRef(serverText);
  const debounceRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<SaveOutcome> | null>(null);
  const claimPromiseRef = useRef<Promise<boolean> | null>(null);
  const releasePromiseRef = useRef<Promise<void> | null>(null);
  const submittingRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const draftHydratedRef = useRef(false);
  const draftConflictRef = useRef(false);
  const primaryUnavailableRef = useRef(false);
  const submissionTrackedRef = useRef(false);
  const answerFieldRef = useRef<HTMLTextAreaElement>(null);
  const scaffoldHeadingId = useId();
  const scaffold = block.answerScaffold?.trim() ?? '';

  function trackTeamSubmission() {
    if (submissionTrackedRef.current) return;
    submissionTrackedRef.current = true;
    trackEvent('activity_response_submitted', {
      activity_type: 'team_task',
      activity_mode: 'team',
    });
  }

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
      void deleteCachedLiveDraft(draftKey);
    } catch {
      void deleteCachedLiveDraft(draftKey);
      // Storage can be unavailable in hardened/private browser modes.
    }
  }, [draftKey]);

  const persistDraft = useCallback((value: string) => {
    const draft: StoredDraft = {
      text: value,
      baseServerText: lastSavedTextRef.current,
      savedAt: Date.now(),
    };
    void cacheLiveDraft(draftKey, draft);
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // IndexedDB remains the durable local fallback if sessionStorage is unavailable.
    }
  }, [draftKey]);

  const request = useCallback(async (action: TeamEditAction, value?: string): Promise<RequestResult> => {
    const carriesText = action === 'save' || action === 'submit';
    const result = await fetchWithTimeout(`/api/student/sessions/${sessionId}/team-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, blockId: block.id, ...(carriesText ? { text: value } : {}) }),
      cache: 'no-store',
    }, carriesText ? 10_000 : 5_000);
    const data = await result.json() as TeamEditResult;
    primaryUnavailableRef.current = result.status === 408 || result.status === 429 || result.status >= 500;
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
    setSubmitted(serverSubmitted);
    clearDraft();
    setError(message ?? '');
  }, [clearDraft, serverSubmitted, setDraftConflictState]);

  const ensureLock = useCallback(async () => {
    if (lockRef.current?.mine) return true;
    if (claimPromiseRef.current) return claimPromiseRef.current;

    const promise = (async () => {
      try {
        const result = await request('claim');
        setLock(result.lock ?? null);
        if (!result.responseOk) {
          setError(localizedApiError(result.error, english ? 'en' : 'cs', 'Týmový editor se nepodařilo zamknout. Neuložený text zůstává v této kartě.', 'The team editor could not be locked. Unsaved text stays in this tab.'));
          return false;
        }
        if (!result.acquired) {
          const holder = result.lock?.holderDisplayName ?? ui('jiný člen týmu', 'another team member');
          setError(dirtyRef.current
            ? (english ? `${holder} is editing the answer. Your unsaved text stays in this tab.` : `Odpověď právě upravuje ${holder}. Tvůj neuložený text zůstává v této kartě.`)
            : (english ? `${holder} is editing the answer.` : `Odpověď právě upravuje ${holder}.`));
          return false;
        }
        setError('');
        return true;
      } catch {
        primaryUnavailableRef.current = true;
        setError(ui('Primární týmový editor je dočasně nedostupný. Text zůstává zachovaný a Syllonaut použije záložní live vrstvu.', 'The primary team editor is temporarily unavailable. Your text remains preserved and Syllonaut will use the fallback live layer.'));
        return false;
      } finally {
        claimPromiseRef.current = null;
      }
    })();

    claimPromiseRef.current = promise;
    return promise;
  }, [request, setLock]);

  // A release racing a submit would delete the lock the submit just claimed,
  // and the database rejects the submitted write. While a submit runs the
  // lock is kept; submitAnswer releases it afterwards if the field is blurred.
  const releaseLock = useCallback(async () => {
    if (!lockRef.current?.mine || submittingRef.current) return;
    if (releasePromiseRef.current) return releasePromiseRef.current;
    const promise = (async () => {
      try {
        const result = await request('release');
        if (result.responseOk) setLock(null);
      } catch {
        // Expiring server lock is the fallback if release cannot reach the server.
      } finally {
        releasePromiseRef.current = null;
      }
    })();
    releasePromiseRef.current = promise;
    return promise;
  }, [request, setLock]);

  const saveNow = useCallback(async (): Promise<SaveOutcome> => {
    if (!dirtyRef.current) return 'saved';
    if (savePromiseRef.current) return savePromiseRef.current;

    const operation = (async (): Promise<SaveOutcome> => {
      if (draftConflictRef.current) {
        setError(ui('Obnovený text se liší od poslední týmové verze. Nejdřív zvol, kterou verzi chceš použít.', 'The recovered text differs from the latest team version. Choose which version you want to use first.'));
        return 'blocked';
      }

      const value = latestTextRef.current.trim();
      if (!value) {
        setError(ui('Společná týmová odpověď nemůže zůstat prázdná.', 'The shared team answer cannot be empty.'));
        return 'blocked';
      }

      const acquired = await ensureLock();
      if (!acquired) {
        if (primaryUnavailableRef.current) {
          const operationId = crypto.randomUUID();
          const fallbackSaved = await postLiveControlEvent(
            sessionId,
            'student',
            'student.team_response',
            { teamId, blockId: block.id, text: value, submitted: false, source: 'fallback' },
            operationId,
          );
          if (fallbackSaved) {
            lastSavedTextRef.current = value;
            dirtyRef.current = false;
            setSaveState('saved');
            setError(ui('Primární spojení je dočasně nedostupné. Koncept je uložený v záložní live vrstvě.', 'The primary connection is temporarily unavailable. The draft is saved in the fallback live layer.'));
            clearDraft();
            return 'saved';
          }
        }
        setSaveState('dirty');
        return 'retry';
      }

      setSaveState('saving');
      setError('');
      try {
        const operationId = crypto.randomUUID();
        const result = await request('save', value);
        if (result.lock !== undefined) setLock(result.lock ?? null);
        if (!result.responseOk) {
          setSaveState('dirty');
          if (result.status === 409 && result.lock && !result.lock.mine) {
            setError(english
              ? `${result.lock.holderDisplayName} is editing the answer. Your unsaved text stays in this tab.`
              : `Odpověď právě upravuje ${result.lock.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`);
            return 'retry';
          }

          setError(localizedApiError(result.error, english ? 'en' : 'cs', 'Týmovou odpověď se nepodařilo uložit.', 'The team answer could not be saved.'));
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
        void postLiveControlEvent(
          sessionId,
          'student',
          'student.team_response',
          { teamId, blockId: block.id, text: value, submitted: false, source: 'primary' },
          operationId,
        );
        onSaved();
        return 'saved';
      } catch {
        primaryUnavailableRef.current = true;
        const operationId = crypto.randomUUID();
        const fallbackSaved = await postLiveControlEvent(
          sessionId,
          'student',
          'student.team_response',
          { teamId, blockId: block.id, text: value, submitted: false, source: 'fallback' },
          operationId,
        );
        if (fallbackSaved) {
          lastSavedTextRef.current = value;
          dirtyRef.current = false;
          setSaveState('saved');
          setError(ui('Spojení se Supabase je přerušené. Koncept je uložený v záložní live vrstvě.', 'The Supabase connection is interrupted. The draft is saved in the fallback live layer.'));
          clearDraft();
          return 'saved';
        }
        setError(ui('Spojení se při ukládání přerušilo. Text zůstává v tomto zařízení a Syllonaut zkusí uložení znovu.', 'The connection was interrupted while saving. The text stays on this device and Syllonaut will retry automatically.'));
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
      if (!raw) {
        void getCachedLiveDraft<StoredDraft>(draftKey).then((parsed) => {
          if (!parsed || typeof parsed.text !== 'string' || typeof parsed.baseServerText !== 'string' || parsed.text.length > 4000) return;
          if (parsed.text === serverText) {
            clearDraft();
            return;
          }

          latestTextRef.current = parsed.text;
          dirtyRef.current = true;
          setText(parsed.text);
          setSaveState('dirty');
          setDraftRecovered(true);
          setSubmitted(false);
          const conflict = parsed.baseServerText !== serverText;
          setDraftConflictState(conflict);
          if (conflict) {
            setError(ui('Mezitím se změnila týmová odpověď na serveru. Obnovený text proto neuložíme bez tvého rozhodnutí.', 'The team answer changed on the server in the meantime. The recovered text will not be saved until you choose which version to use.'));
          }
        });
        return;
      }
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
      setSubmitted(false);
      const conflict = parsed.baseServerText !== serverText;
      setDraftConflictState(conflict);
      if (conflict) {
        setError(ui('Mezitím se změnila týmová odpověď na serveru. Obnovený text proto neuložíme bez tvého rozhodnutí.', 'The team answer changed on the server in the meantime. The recovered text will not be saved until you choose which version to use.'));
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
      setSubmitted(serverSubmitted);
      clearDraft();
    }

    if (serverSubmitted) {
      setSubmitUnconfirmed(false);
      setRecoveryNotice('');
      setError('');
      setSubmitted(true);
    }
  }, [clearDraft, serverSubmitted, serverText, setDraftConflictState]);

  useEffect(() => {
    if (!connectionRestored || !submitUnconfirmed || serverSubmitted) return;
    setRecoveryNotice('');
    setError(ui('Spojení je zpět, ale odevzdání se zatím nepotvrdilo. Text je bezpečně uložený jako koncept. Klepni znovu na „Odevzdat týmovou odpověď“ — nic nemusíš psát znovu.', 'The connection is back, but submission has not been confirmed yet. Your text is safely saved as a draft. Tap “Submit team answer” again — you do not need to type anything again.'));
  }, [connectionRestored, serverSubmitted, submitUnconfirmed]);

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
          setError(english
            ? `${next.holderDisplayName} is editing the answer. Your unsaved text stays in this tab.`
            : `Odpověď právě upravuje ${next.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`);
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
            ? (english ? `${result.lock.holderDisplayName} took over the editor. Your unsaved text stays in this tab.` : `Editor převzal ${result.lock.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`)
            : (english ? `${result.lock.holderDisplayName} took over the editor.` : `Editor převzal ${result.lock.holderDisplayName}.`));
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
    // A running submit sends the current text and releases the lock itself
    // once it is done (see submitAnswer).
    if (submittingRef.current) return;

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
    setSubmitted(false);

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

  async function submitAnswer() {
    if (submittingRef.current || submitting || draftConflictRef.current || lockedByOther) return;
    const value = latestTextRef.current.trim();
    if (!value) {
      setError(ui('Společná týmová odpověď nemůže zůstat prázdná.', 'The shared team answer cannot be empty.'));
      return;
    }
    if (isUnchangedScaffold(value, scaffold)) {
      setError(ui('Doplň osnovu vlastními slovy.', 'Complete the outline in your own words.'));
      return;
    }

    // Set synchronously on click: the blur that the click caused must not
    // release the lock while the submit is on its way.
    submittingRef.current = true;
    try {
      await submitClaimedAnswer(value);
    } finally {
      submittingRef.current = false;
      if (!focusedRef.current) void releaseLock();
    }
  }

  async function submitClaimedAnswer(value: string) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (savePromiseRef.current) await savePromiseRef.current;
    if (releasePromiseRef.current) await releasePromiseRef.current;

    setSubmitting(true);
    setError('');
    setRecoveryNotice('');
    try {
      const operationId = crypto.randomUUID();
      const result = await request('submit', value);
      if (result.lock !== undefined) setLock(result.lock ?? null);
      if (!result.responseOk || !result.submitted) {
        setError(localizedApiError(result.error, english ? 'en' : 'cs', 'Týmovou odpověď se nepodařilo odevzdat.', 'The team answer could not be submitted.'));
        return;
      }

      latestTextRef.current = value;
      lastSavedTextRef.current = value;
      dirtyRef.current = false;
      retryAttemptRef.current = 0;
      setText(value);
      setSaveState('saved');
      setDraftRecovered(false);
      setDraftConflictState(false);
      clearDraft();
      setSubmitted(true);
      trackTeamSubmission();
      setSubmitUnconfirmed(false);
      setRecoveryNotice('');
      void postLiveControlEvent(
        sessionId,
        'student',
        'student.team_response',
        { teamId, blockId: block.id, text: value, submitted: true, source: 'primary' },
        operationId,
      );
      onSaved();
    } catch {
      primaryUnavailableRef.current = true;
      const operationId = crypto.randomUUID();
      const fallbackSaved = await postLiveControlEvent(
        sessionId,
        'student',
        'student.team_response',
        { teamId, blockId: block.id, text: value, submitted: true, source: 'fallback' },
        operationId,
      );
      if (fallbackSaved) {
        latestTextRef.current = value;
        lastSavedTextRef.current = value;
        dirtyRef.current = false;
        setSaveState('saved');
        setSubmitted(true);
        trackTeamSubmission();
        setSubmitUnconfirmed(false);
        clearDraft();
        setError('');
        setRecoveryNotice(ui('Odpověď převzala záložní live vrstva. Syllonaut ji po obnovení hlavního spojení automaticky dosynchronizuje.', 'The fallback live layer accepted the answer. Syllonaut will automatically resynchronise it when the primary connection returns.'));
      } else {
        setSubmitted(false);
        setSubmitUnconfirmed(true);
        setRecoveryNotice('');
        setError(ui('Spojení se při odevzdání přerušilo. Text je bezpečně uložený jako koncept. Není potřeba nic psát znovu. Syllonaut po obnovení spojení zkontroluje, zda odevzdání proběhlo; pokud ne, stačí klepnout znovu na „Odevzdat týmovou odpověď“.', 'The connection was interrupted during submission. Your text is safely stored as a draft, so you do not need to type it again. When the connection returns, Syllonaut will check whether submission succeeded; if not, simply tap “Submit team answer” again.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Inserts the outline only into an empty shared field and then saves it the
  // same way as typing (focus claims the team lock, autosave stores a draft).
  function insertScaffold() {
    if (!scaffold || latestTextRef.current.trim() || lockedByOther || draftConflictRef.current || submitting) return;
    handleChange(scaffold);
    window.requestAnimationFrame(() => {
      const field = answerFieldRef.current;
      if (!field) return;
      field.focus();
      const firstLineEnd = scaffold.indexOf('\n');
      const caret = firstLineEnd >= 0 ? firstLineEnd : scaffold.length;
      field.setSelectionRange(caret, caret);
    });
  }

  async function useRecoveredDraft() {
    setDraftConflictState(false);
    setDraftRecovered(false);
    setSubmitted(false);
    setSubmitUnconfirmed(false);
    setRecoveryNotice('');
    setError('');
    persistDraft(latestTextRef.current);
    const acquired = await ensureLock();
    if (acquired) scheduleSave();
  }

  let statusText = ui('Klikni do pole a začni psát. Změny se ukládají automaticky jako koncept.', 'Click into the field and start typing. Changes are saved automatically as a draft.');
  if (lockedByOther && dirtyRef.current) statusText = english ? `${lock!.holderDisplayName} is editing. Your unsaved text stays in this tab.` : `Upravuje ${lock!.holderDisplayName}. Tvůj neuložený text zůstává v této kartě.`;
  else if (lockedByOther) statusText = english ? `${lock!.holderDisplayName} is editing. The field will become available when they release it.` : `Upravuje ${lock!.holderDisplayName}. Pole se po uvolnění zpřístupní.`;
  else if (draftConflict) statusText = ui('Obnovený text čeká na tvoje rozhodnutí.', 'The recovered text is waiting for your decision.');
  else if (draftRecovered) statusText = ui('Obnovili jsme neuložený text z této karty. Po kliknutí do pole se znovu uloží.', 'We recovered unsaved text from this tab. It will be saved again when you focus the field.');
  else if (submitting) statusText = ui('Odevzdávám týmovou odpověď…', 'Submitting team answer…');
  else if (submitted) statusText = ui('Odpověď je odevzdaná. Další změny se budou znovu ukládat jen jako koncept, dokud ji znovu neodevzdáte.', 'The answer has been submitted. Further changes will be saved only as a draft until you submit again.');
  else if (saveState === 'saving') statusText = ui('Ukládám koncept…', 'Saving draft…');
  else if (saveState === 'dirty') statusText = ui('Změny se uloží automaticky jako koncept; při výpadku se další pokusy postupně zpomalí.', 'Changes will be saved automatically as a draft; retries slow down gradually during an outage.');
  else if (saveState === 'saved') statusText = ui('Koncept je uložený. Pro hodnocení ho ještě odevzdejte.', 'The draft is saved. Submit it when you want it to be graded.');
  else if (focused && lock?.mine) statusText = ui('Upravuješ ty · automatické ukládání konceptu je aktivní.', 'You are editing · automatic draft saving is active.');

  return (
    <section className="panel" aria-busy={submitting || saveState === 'saving'}>
      <span className="eyebrow">{ui('Společná odpověď', 'Shared answer')} · {teamName}</span>
      <p className="muted-copy" style={{ marginTop: 8 }}>{ui('Toto pole sdílí celý tým. V jednu chvíli ho upravuje jeden člen; ostatní vidí poslední uloženou verzi.', 'The whole team shares this field. One member edits at a time; everyone else sees the latest saved version.')}</p>
      {draftConflict ? (
        <div className="reveal" role="alert" style={{ marginTop: 12 }}>
          <strong>{ui('Našli jsme neuložený text z doby před obnovením stránky.', 'We found unsaved text from before the page was reloaded.')}</strong>
          <p style={{ marginBottom: 10 }}>{ui('Mezitím se ale změnila týmová odpověď na serveru. Vyber, kterou verzi chceš použít; nic nepřepíšeme automaticky.', 'The team answer changed on the server in the meantime. Choose which version you want to use; nothing will be overwritten automatically.')}</p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="secondary" type="button" onClick={() => { void useRecoveredDraft(); }}>{ui('Použít obnovený text', 'Use recovered text')}</button>
            <button className="secondary" type="button" onClick={() => resetToServer()}>{ui('Použít poslední týmovou verzi', 'Use latest team version')}</button>
          </div>
        </div>
      ) : draftRecovered ? (
        <div className="reveal" role="status" style={{ marginTop: 12 }}>
          {ui('Obnovili jsme neuložený text z této karty. Neztratil se při refreshi ani během výpadku spojení.', 'We recovered unsaved text from this tab. It was preserved through the reload and connection outage.')}
        </div>
      ) : null}
      {lockedByOther ? (
        <div className="reveal" role="status" style={{ marginTop: 12 }}>
          {ui('Právě upravuje', 'Currently editing:')} <strong>{lock!.holderDisplayName}</strong>. {ui('Můžeš odpověď číst, editor se uvolní automaticky.', 'You can read the answer; the editor will unlock automatically.')}
        </div>
      ) : null}
      {scaffold ? (
        <div className="reveal" role="group" aria-labelledby={scaffoldHeadingId} style={{ marginTop: 12 }}>
          <strong id={scaffoldHeadingId}>{ui('Může ti pomoct tato osnova', 'This outline may help you')}</strong>
          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 10px' }}>{scaffold}</p>
          <button type="button" className="secondary" disabled={lockedByOther || draftConflict || submitting || Boolean(text.trim())} onClick={insertScaffold}>
            {ui('Vložit osnovu do odpovědi', 'Insert the outline into the answer')}
          </button>
          {text.trim() ? <p className="muted-copy" style={{ margin: '6px 0 0' }}>{ui('Osnovu lze vložit jen do prázdného pole.', 'The outline can only be inserted into an empty field.')}</p> : null}
        </div>
      ) : null}
      <label style={{ marginTop: 12 }}>
        {ui('Společná týmová odpověď', 'Shared team answer')}
        <textarea
          ref={answerFieldRef}
          value={text}
          onFocus={() => { void handleFocus(); }}
          onBlur={() => { void handleBlur(); }}
          onChange={(event) => handleChange(event.target.value)}
          maxLength={4000}
          rows={7}
          placeholder={ui('Zapište společný výstup týmu…', 'Write the team’s shared response…')}
          disabled={lockedByOther || draftConflict || submitting}
          aria-describedby={statusId}
        />
      </label>
      <p id={statusId} className="muted-copy" role="status" aria-live="polite" aria-atomic="true" style={{ marginTop: 8, marginBottom: 0 }}>{statusText}</p>
      <div className="actions" style={{ marginTop: 12 }}>
        <button
          className="primary"
          type="button"
          disabled={lockedByOther || draftConflict || submitting || !text.trim() || submitted}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { void submitAnswer(); }}
        >
          {submitting ? ui('Odevzdávám…', 'Submitting…') : submitted ? ui('Odevzdáno', 'Submitted') : ui('Odevzdat týmovou odpověď', 'Submit team answer')}
        </button>
      </div>
      <p className="muted-copy" style={{ marginTop: 8, marginBottom: 0 }}>{ui('Automatické ukládání ukládá pouze koncept. AI hodnocení se může spustit až po odevzdání.', 'Automatic saving stores only a draft. AI grading can start only after submission.')}</p>
      {recoveryNotice ? <div className="reveal" role="status" aria-live="polite" style={{ marginTop: 10 }}>{recoveryNotice}</div> : null}
      {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
