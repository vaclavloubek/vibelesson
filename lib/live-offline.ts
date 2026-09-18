'use client';

const DB_NAME = 'syllonaut-live-v1';
const DB_VERSION = 1;
const STATE_STORE = 'states';
const OUTBOX_STORE = 'outbox';

export type LiveOutboxOperation = {
  id: string;
  sessionId: string;
  kind: 'student-response';
  url: string;
  method: 'POST';
  body: unknown;
  createdAt: number;
  attempts: number;
};

type CachedState = {
  sessionId: string;
  value: unknown;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE, { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheLiveState(sessionId: string, value: unknown) {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).put({ sessionId, value, updatedAt: Date.now() } satisfies CachedState);
  } catch {
    // Offline cache is a resilience layer; failure must never break the live lesson.
  }
}

export async function getCachedLiveState<T>(sessionId: string): Promise<T | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const tx = db.transaction(STATE_STORE, 'readonly');
    const row = await requestResult(tx.objectStore(STATE_STORE).get(sessionId)) as CachedState | undefined;
    return (row?.value as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function enqueueLiveOperation(operation: Omit<LiveOutboxOperation, 'attempts'>) {
  try {
    const db = await openDb();
    if (!db) return false;
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).put({ ...operation, attempts: 0 } satisfies LiveOutboxOperation);
    return true;
  } catch {
    return false;
  }
}

export async function flushLiveOutbox(sessionId?: string) {
  try {
    const db = await openDb();
    if (!db || typeof navigator !== 'undefined' && navigator.onLine === false) return { flushed: 0, pending: 0 };

    const readTx = db.transaction(OUTBOX_STORE, 'readonly');
    const rows = await requestResult(readTx.objectStore(OUTBOX_STORE).getAll()) as LiveOutboxOperation[];
    const queue = rows
      .filter((row) => !sessionId || row.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);

    let flushed = 0;
    for (const operation of queue) {
      try {
        const response = await fetch(operation.url, {
          method: operation.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operation.body),
          cache: 'no-store',
        });
        if (!response.ok) {
          // 409 is intentionally retained: the teacher may have advanced while this
          // client was offline. Reconciliation can decide whether the operation is
          // still admissible without silently losing the student's work.
          const terminalClientError = [400, 401, 403, 404, 410, 422].includes(response.status);
          if (terminalClientError) {
            const deleteTx = db.transaction(OUTBOX_STORE, 'readwrite');
            deleteTx.objectStore(OUTBOX_STORE).delete(operation.id);
          }
          continue;
        }

        const deleteTx = db.transaction(OUTBOX_STORE, 'readwrite');
        deleteTx.objectStore(OUTBOX_STORE).delete(operation.id);
        flushed += 1;
      } catch {
        break;
      }
    }

    const verifyTx = db.transaction(OUTBOX_STORE, 'readonly');
    const remaining = await requestResult(verifyTx.objectStore(OUTBOX_STORE).getAll()) as LiveOutboxOperation[];
    return { flushed, pending: remaining.filter((row) => !sessionId || row.sessionId === sessionId).length };
  } catch {
    return { flushed: 0, pending: 0 };
  }
}
