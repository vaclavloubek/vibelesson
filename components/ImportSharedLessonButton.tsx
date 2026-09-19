'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';

const IMPORT_INTENT_STORAGE_KEY = 'syllonaut_pending_share_import_v1';
const IMPORT_ANALYTICS_STORAGE_PREFIX = 'syllonaut_shared_lesson_imported_v1:';
const IMPORT_INTENT_TTL_MS = 5 * 60 * 1000;

type StoredImportIntent = {
  token: string;
  createdAt: number;
};

function rememberImportIntent(token: string) {
  try {
    const intent: StoredImportIntent = { token, createdAt: Date.now() };
    window.sessionStorage.setItem(IMPORT_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Session storage is a resilience aid. The URL intent remains the fallback.
  }
}

function clearImportIntent(token: string) {
  try {
    const raw = window.sessionStorage.getItem(IMPORT_INTENT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredImportIntent>;
    if (parsed.token === token) window.sessionStorage.removeItem(IMPORT_INTENT_STORAGE_KEY);
  } catch {
    window.sessionStorage.removeItem(IMPORT_INTENT_STORAGE_KEY);
  }
}

function markSuccessfulImportAnalytics(token: string) {
  const storageKey = IMPORT_ANALYTICS_STORAGE_PREFIX + token;
  try {
    if (window.sessionStorage.getItem(storageKey) === '1') return;
  } catch {
    // Analytics deduplication is best-effort and must never affect lesson import.
  }

  const sent = trackEvent('shared_lesson_imported');
  if (!sent) return;

  try {
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // The event was sent; blocked storage only disables browser-side deduplication.
  }
}

function hasRecentImportIntent(token: string) {
  try {
    const raw = window.sessionStorage.getItem(IMPORT_INTENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredImportIntent>;
    const valid = parsed.token === token
      && typeof parsed.createdAt === 'number'
      && Date.now() - parsed.createdAt >= 0
      && Date.now() - parsed.createdAt <= IMPORT_INTENT_TTL_MS;
    if (!valid) window.sessionStorage.removeItem(IMPORT_INTENT_STORAGE_KEY);
    return valid;
  } catch {
    window.sessionStorage.removeItem(IMPORT_INTENT_STORAGE_KEY);
    return false;
  }
}

export default function ImportSharedLessonButton({
  token,
  importRequested = false,
  serverAuthenticated = false,
}: {
  token: string;
  importRequested?: boolean;
  serverAuthenticated?: boolean;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const importInFlightRef = useRef(false);
  const resumedImportRef = useRef(false);

  const importLesson = useCallback(async (resumeAfterAuth = false) => {
    if (importInFlightRef.current) return;

    if (!resumeAfterAuth) {
      rememberImportIntent(token);
      trackEvent('shared_lesson_import_started');
    }

    importInFlightRef.current = true;
    setBusy(true);
    setError('');
    setStatus(resumeAfterAuth
      ? (english ? 'Finishing sign-in and saving your copy…' : 'Dokončuji přihlášení a ukládám kopii…')
      : '');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      const response = await fetch(`/api/lesson-shares/${token}/import`, {
        method: 'POST',
        cache: 'no-store',
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      });
      const data = await response.json() as { lessonId?: string; error?: string };

      if (response.status === 401) {
        importInFlightRef.current = false;
        setBusy(false);

        if (resumeAfterAuth) {
          resumedImportRef.current = false;
          return;
        }

        window.location.assign(`/s/${token}?signin=1&import=1`);
        return;
      }

      if (!response.ok || !data.lessonId) {
        clearImportIntent(token);
        throw new Error(localizedApiError(
          data.error,
          locale,
          'Kopii lekce se nepodařilo uložit.',
          'The lesson copy could not be saved.',
        ));
      }

      clearImportIntent(token);
      markSuccessfulImportAnalytics(token);
      setStatus('');
      router.replace(`/lessons/${data.lessonId}`);
    } catch (err) {
      importInFlightRef.current = false;
      setBusy(false);
      setStatus('');
      setError(err instanceof Error
        ? err.message
        : (english ? 'The lesson copy could not be saved.' : 'Kopii lekce se nepodařilo uložit.'));
    }
  }, [english, locale, router, supabase, token]);

  useEffect(() => {
    const shouldResume = importRequested || hasRecentImportIntent(token);
    if (!shouldResume) return;

    rememberImportIntent(token);
    let mounted = true;
    let checking = false;

    function resumeImport() {
      if (!mounted || resumedImportRef.current) return;
      resumedImportRef.current = true;
      window.setTimeout(() => {
        if (mounted) void importLesson(true);
      }, 0);
    }

    async function checkAuthenticatedUser() {
      if (!mounted || checking || resumedImportRef.current) return;
      checking = true;
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) resumeImport();
      } finally {
        checking = false;
      }
    }

    if (serverAuthenticated) {
      resumeImport();
    } else {
      void checkAuthenticatedUser();
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) resumeImport();
    });

    let attempts = 0;
    const interval = window.setInterval(() => {
      if (!mounted || resumedImportRef.current) {
        window.clearInterval(interval);
        return;
      }
      attempts += 1;
      if (attempts > 25) {
        window.clearInterval(interval);
        return;
      }
      void checkAuthenticatedUser();
    }, 400);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      listener.subscription.unsubscribe();
    };
  }, [importLesson, importRequested, serverAuthenticated, supabase, token]);

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <button type="button" className="primary" onClick={() => void importLesson(false)} disabled={busy}>
        {busy
          ? (english ? 'Saving a copy…' : 'Ukládám kopii…')
          : (english ? 'Save a copy to my lessons' : 'Uložit kopii do mých lekcí')}
      </button>
      {status ? <div role="status" aria-live="polite">{status}</div> : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
    </div>
  );
}
