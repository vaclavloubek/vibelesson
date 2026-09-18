const DB_NAME = 'syllonaut-live-v1';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const SNAPSHOT_STORE = 'snapshots';
const DRAFT_STORE = 'drafts';
const SNAPSHOT_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export const LIVE_OUTBOX_SYNCED_EVENT = 'syllonaut-live-outbox-synced';
export const LIVE_OUTBOX_FAILED_EVENT = 'syllonaut-live-outbox-failed';

type StoredEnvelope<T> = {
  id: string;
  value: T;
  savedAt: number;
};

export type LiveOutboxRecord = {
  id: string;
  sessionId: string;
  kind: 'student-response';
  url: string;
  method: 'POST';
  body: unknown;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
};

const flushes = new Map<string, Promise<{ synced: number; failed: number; pending: number }>>();

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });
}

async function readAll<T>(storeName: string) {
  const db = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed.'));
    });
  } finally {
    db.close();
  }
}

async function readOne<T>(storeName: string, id: string) {
  const db = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed.'));
    });
  } finally {
    db.close();
  }
}

async function putOne(storeName: string, value: unknown) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
    });
  } finally {
    db.close();
  }
}

async function deleteOne(storeName: string, id: string) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted.'));
    });
  } finally {
    db.close();
  }
}

export async function cacheLiveSnapshot<T>(id: string, value: T) {
  await putOne(SNAPSHOT_STORE, { id, value, savedAt: Date.now() } satisfies StoredEnvelope<T>);
}

export async function loadLiveSnapshot<T>(id: string, maxAgeMs = SNAPSHOT_MAX_AGE_MS) {
  const record = await readOne<StoredEnvelope<T>>(SNAPSHOT_STORE, id);
  if (!record) return null;
  if (Date.now() - record.savedAt > maxAgeMs) {
    await deleteOne(SNAPSHOT_STORE, id);
    return null;
  }
  return record.value;
}

export async function saveLiveDraft<T>(id: string, value: T) {
  await putOne(DRAFT_STORE, { id, value, savedAt: Date.now() } satisfies StoredEnvelope<T>);
}

export async function loadLiveDraft<T>(id: string, maxAgeMs = DRAFT_MAX_AGE_MS) {
  const record = await readOne<StoredEnvelope<T>>(DRAFT_STORE, id);
  if (!record) return null;
  if (Date.now() - record.savedAt > maxAgeMs) {
    await deleteOne(DRAFT_STORE, id);
    return null;
  }
  return record.value;
}

export async function deleteLiveDraft(id: string) {
  await deleteOne(DRAFT_STORE, id);
}

export async function queueLiveRequest(input: Omit<LiveOutboxRecord, 'createdAt' | 'attempts' | 'lastAttemptAt'>) {
  const existing = await readOne<LiveOutboxRecord>(OUTBOX_STORE, input.id);
  const record: LiveOutboxRecord = {
    ...input,
    createdAt: existing?.createdAt ?? Date.now(),
    attempts: existing?.attempts ?? 0,
    lastAttemptAt: existing?.lastAttemptAt ?? null,
  };
  await putOne(OUTBOX_STORE, record);
}

export async function removeLiveOutbox(id: string) {
  await deleteOne(OUTBOX_STORE, id);
}

function dispatch(name: string, detail: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function fetchWithTimeout(record: LiveOutboxRecord) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(record.url, {
      method: record.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record.body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function flushSession(sessionId: string) {
  const records = (await readAll<LiveOutboxRecord>(OUTBOX_STORE))
    .filter((record) => record.sessionId === sessionId)
    .sort((left, right) => left.createdAt - right.createdAt);

  let synced = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const response = await fetchWithTimeout(record);
      if (response.ok) {
        await deleteOne(OUTBOX_STORE, record.id);
        synced += 1;
        dispatch(LIVE_OUTBOX_SYNCED_EVENT, { id: record.id, sessionId });
        continue;
      }

      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (retryable) {
        await putOne(OUTBOX_STORE, {
          ...record,
          attempts: record.attempts + 1,
          lastAttemptAt: Date.now(),
        });
        break;
      }

      await deleteOne(OUTBOX_STORE, record.id);
      failed += 1;
      dispatch(LIVE_OUTBOX_FAILED_EVENT, { id: record.id, sessionId, status: response.status });
    } catch {
      await putOne(OUTBOX_STORE, {
        ...record,
        attempts: record.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      break;
    }
  }

  const pending = (await readAll<LiveOutboxRecord>(OUTBOX_STORE)).filter((record) => record.sessionId === sessionId).length;
  return { synced, failed, pending };
}

export async function flushLiveOutbox(sessionId: string) {
  const existing = flushes.get(sessionId);
  if (existing) return existing;
  const promise = flushSession(sessionId).finally(() => flushes.delete(sessionId));
  flushes.set(sessionId, promise);
  return promise;
}
