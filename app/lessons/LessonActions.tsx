'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type Props = {
  lessonId: string;
  title: string;
  onMove?: () => void;
  moveDisabled?: boolean;
};

export default function LessonActions({ lessonId, title, onMove, moveDisabled = false }: Props) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function renameLesson() {
    const nextTitle = window.prompt('Nový název lekce:', title)?.trim();
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
      if (!res.ok) throw new Error(data.error || 'Přejmenování selhalo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přejmenování selhalo.');
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
      if (!res.ok || !data.lessonId) throw new Error(data.error || 'Duplikace selhala.');
      trackEvent('lesson_duplicated');
      router.push(`/lessons/${data.lessonId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplikace selhala.');
      setBusy(false);
    }
  }

  function moveLesson() {
    detailsRef.current?.removeAttribute('open');
    onMove?.();
  }

  async function deleteLesson() {
    if (!window.confirm(`Opravdu smazat lekci „${title}“? Tuto akci zatím nelze vrátit.`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Smazání selhalo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání selhalo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lesson-actions-wrap" aria-busy={busy}>
      <details className="lesson-actions" ref={detailsRef}>
        <summary aria-label={`Akce pro lekci ${title}`}>•••</summary>
        <div className="lesson-actions-menu">
          <button type="button" onClick={renameLesson} disabled={busy}>Přejmenovat</button>
          <button type="button" onClick={duplicateLesson} disabled={busy}>Duplikovat</button>
          {onMove ? <button type="button" onClick={moveLesson} disabled={busy || moveDisabled}>Přesunout do…</button> : null}
          <button type="button" className="danger-action" onClick={deleteLesson} disabled={busy}>Smazat</button>
        </div>
      </details>
      {error ? <span className="lesson-action-error" role="alert">{error}</span> : null}
    </div>
  );
}
