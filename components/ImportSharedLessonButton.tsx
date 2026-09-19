'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';

export default function ImportSharedLessonButton({
  token,
  importRequested = false,
}: {
  token: string;
  importRequested?: boolean;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const importInFlightRef = useRef(false);
  const resumedImportRef = useRef(false);

  const importLesson = useCallback(async (resumeAfterAuth = false) => {
    if (importInFlightRef.current) return;

    importInFlightRef.current = true;
    setBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/lesson-shares/${token}/import`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await response.json() as { lessonId?: string; error?: string };

      if (response.status === 401) {
        importInFlightRef.current = false;
        setBusy(false);

        if (resumeAfterAuth) {
          resumedImportRef.current = false;
          setError(english
            ? 'Sign-in is still being completed. Please try again.'
            : 'Přihlášení se ještě dokončuje. Zkuste to prosím znovu.');
          return;
        }

        window.location.assign(`/s/${token}?signin=1&import=1`);
        return;
      }

      if (!response.ok || !data.lessonId) {
        throw new Error(localizedApiError(
          data.error,
          locale,
          'Kopii lekce se nepodařilo uložit.',
          'The lesson copy could not be saved.',
        ));
      }

      router.replace(`/lessons/${data.lessonId}`);
    } catch (err) {
      importInFlightRef.current = false;
      setBusy(false);
      setError(err instanceof Error
        ? err.message
        : (english ? 'The lesson copy could not be saved.' : 'Kopii lekce se nepodařilo uložit.'));
    }
  }, [english, locale, router, token]);

  useEffect(() => {
    if (!importRequested) return;

    let mounted = true;

    function resumeImport() {
      if (!mounted || resumedImportRef.current) return;
      resumedImportRef.current = true;
      window.setTimeout(() => {
        if (mounted) void importLesson(true);
      }, 0);
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) resumeImport();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) resumeImport();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [importLesson, importRequested, supabase]);

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <button type="button" className="primary" onClick={() => void importLesson(false)} disabled={busy}>
        {busy
          ? (english ? 'Saving a copy…' : 'Ukládám kopii…')
          : (english ? 'Save a copy to my lessons' : 'Uložit kopii do mých lekcí')}
      </button>
      {error ? <div className="error" role="alert">{error}</div> : null}
    </div>
  );
}
