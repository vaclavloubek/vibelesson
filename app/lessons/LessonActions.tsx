'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

type Props = {
  lessonId: string;
  title: string;
  onMove?: () => void;
  moveDisabled?: boolean;
  licenseLocked?: boolean;
};

export default function LessonActions({ lessonId, title, onMove, moveDisabled = false, licenseLocked = false }: Props) {
  const router = useRouter();
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function renameLesson() {
    const nextTitle = window.prompt(ui('Nový název lekce:', 'New lesson title:'), title)?.trim();
    if (!nextTitle || nextTitle === title) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Přejmenování selhalo.', 'Renaming failed.'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Přejmenování selhalo.', 'Renaming failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateLesson() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.lessonId) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Duplikace selhala.', 'Duplication failed.'));
      trackEvent('lesson_duplicated');
      router.push(`/lessons/${data.lessonId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Duplikace selhala.', 'Duplication failed.'));
      setBusy(false);
    }
  }

  function moveLesson() {
    detailsRef.current?.removeAttribute('open');
    onMove?.();
  }

  async function deleteLesson() {
    if (!window.confirm(english
      ? `Delete lesson “${title}”? This action cannot currently be undone.`
      : `Opravdu smazat lekci „${title}“? Tuto akci zatím nelze vrátit.`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Smazání selhalo.', 'Deletion failed.'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Smazání selhalo.', 'Deletion failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lesson-actions-wrap" aria-busy={busy}>
      <details className="lesson-actions" ref={detailsRef}>
        <summary aria-label={english ? `Actions for lesson ${title}` : `Akce pro lekci ${title}`}>•••</summary>
        <div className="lesson-actions-menu">
          {!licenseLocked ? <button type="button" onClick={renameLesson} disabled={busy}>{ui('Přejmenovat', 'Rename')}</button> : null}
          {!licenseLocked ? <button type="button" onClick={duplicateLesson} disabled={busy}>{ui('Duplikovat', 'Duplicate')}</button> : null}
          {onMove && !licenseLocked ? <button type="button" onClick={moveLesson} disabled={busy || moveDisabled}>{ui('Přesunout do…', 'Move to…')}</button> : null}
          <button type="button" className="danger-action" onClick={deleteLesson} disabled={busy}>{ui('Smazat', 'Delete')}</button>
        </div>
      </details>
      {error ? <span className="lesson-action-error" role="alert">{error}</span> : null}
    </div>
  );
}
