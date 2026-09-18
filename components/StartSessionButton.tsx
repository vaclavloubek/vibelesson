'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function StartSessionButton({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      });
      const data = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) throw new Error(data.error || 'Hodinu se nepodařilo odstartovat.');
      trackEvent('live_session_created');
      router.push(`/sessions/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo odstartovat.');
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, display: 'grid', justifyItems: 'end', gap: 8 }}>
      {error ? <div className="error" style={{ maxWidth: 320 }}>{error}</div> : null}
      <button type="button" className="primary" onClick={() => void start()} disabled={busy} style={{ padding: '14px 20px', boxShadow: '0 12px 30px rgba(24,24,23,.18)' }}>{busy ? 'Připravuji start…' : 'Odstartovat hodinu'}</button>
    </div>
  );
}
