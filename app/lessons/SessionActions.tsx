'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';

type Props = {
  sessionId: string;
  title: string;
};

export default function SessionActions({ sessionId, title }: Props) {
  const router = useRouter();
  const english = useUiLocale() === 'en';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function deleteSession() {
    const confirmed = window.confirm(
      english
        ? `Delete the results for “${title}”? Participant names, responses, team outputs and grading will also be permanently deleted.`
        : `Opravdu smazat výsledky hodiny „${title}“? Nenávratně se smažou i jména účastníků, jejich odpovědi, týmové výstupy a hodnocení.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/delete`, { method: 'DELETE' });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error || english ? 'Deletion failed.' : 'Smazání selhalo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : english ? 'Deletion failed.' : 'Smazání selhalo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lesson-actions-wrap">
      <details className="lesson-actions">
        <summary aria-label={english ? `Actions for lesson results ${title}` : `Akce pro výsledky hodiny ${title}`}>•••</summary>
        <div className="lesson-actions-menu">
          <button type="button" className="danger-action" onClick={deleteSession} disabled={busy}>{english ? 'Delete results' : 'Smazat výsledky'}</button>
        </div>
      </details>
      {error ? <span className="lesson-action-error">{error}</span> : null}
    </div>
  );
}
