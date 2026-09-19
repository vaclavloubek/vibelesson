'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

export default function ImportSharedLessonButton({ token, autoImport = false }: { token: string; autoImport?: boolean }) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoImportStartedRef = useRef(false);

  async function importLesson() {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/lesson-shares/${token}/import`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await response.json() as { lessonId?: string; error?: string };

      if (response.status === 401) {
        window.location.assign(`/s/${token}?signin=1&import=1`);
        return;
      }

      if (!response.ok || !data.lessonId) {
        throw new Error(localizedApiError(data.error, locale, 'Kopii lekce se nepodařilo uložit.', 'The lesson copy could not be saved.'));
      }

      router.replace(`/lessons/${data.lessonId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Kopii lekce se nepodařilo uložit.', 'The lesson copy could not be saved.'));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoImport || autoImportStartedRef.current) return;
    autoImportStartedRef.current = true;
    void importLesson();
  }, [autoImport]);

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <button type="button" className="primary" onClick={() => void importLesson()} disabled={busy}>
        {busy ? ui('Ukládám kopii…', 'Saving a copy…') : ui('Uložit kopii do mých lekcí', 'Save a copy to my lessons')}
      </button>
      {error ? <div className="error" role="alert">{error}</div> : null}
    </div>
  );
}
