'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { signalSyllonautGuideAction } from '@/lib/onboarding-guide';

export default function StartSessionButton({ lessonId, userId }: { lessonId: string; userId: string }) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    setActiveSessionId(null);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      });
      const data = await response.json() as { sessionId?: string; activeSessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) {
        if (response.status === 409 && data.activeSessionId) {
          setActiveSessionId(data.activeSessionId);
          setError(ui('Na tomto účtu už běží jiná hodina.', 'Another live lesson is already running on this account.'));
          setBusy(false);
          return;
        }
        throw new Error(english ? 'The lesson could not be started.' : (data.error || 'Hodinu se nepodařilo odstartovat.'));
      }
      trackEvent('live_session_created');
      signalSyllonautGuideAction(userId, 'session-created');
      router.push(`/sessions/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Hodinu se nepodařilo odstartovat.', 'The lesson could not be started.'));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, display: 'grid', justifyItems: 'end', gap: 8 }}>
      {error ? <div className="error" style={{ maxWidth: 320 }}>{error}</div> : null}
      {activeSessionId ? (
        <button type="button" className="secondary" onClick={() => router.push(`/sessions/${activeSessionId}`)}>
          {ui('Otevřít rozběhnutou hodinu', 'Open the active lesson')}
        </button>
      ) : null}
      <button type="button" className="primary" data-tour="lesson-start" onClick={() => void start()} disabled={busy} style={{ padding: '14px 20px', boxShadow: '0 12px 30px rgba(24,24,23,.18)' }}>{busy ? ui('Připravuji start…', 'Preparing lesson…') : ui('Odstartovat hodinu', 'Start lesson')}</button>
    </div>
  );
}
