'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import LiveBlock from '@/components/LiveBlock';
import type { PublicLessonBlock, SessionStatus } from '@/lib/live';
import { createClient } from '@/lib/supabase/client';

type StudentState = {
  sessionId: string;
  status: SessionStatus;
  title: string;
  participantDisplayName: string;
  activeBlock: PublicLessonBlock | null;
  activeBlockIndex: number | null;
  totalBlocks: number;
  realtimeKey: string;
};

export default function StudentSession({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<StudentState | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await response.json() as StudentState & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');
      setState(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!state?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${state.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [state?.realtimeKey, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="shell" style={{ maxWidth: 680 }}>
      <header className="brand" style={{ marginBottom: 18 }}>
        <div className="brand-identity"><Link href="/" className="brand-home"><span className="brand-mark">E</span><strong>EduPilot</strong></Link><span className="beta">STUDENT</span></div>
      </header>

      {error ? <div className="error"><p style={{ marginTop: 0 }}>{error}</p><Link href="/join" className="secondary button-link">Připojit se znovu</Link></div> : null}
      {!state && !error ? <div className="panel"><p className="muted-copy">Připojuji k hodině…</p></div> : null}

      {state?.status === 'lobby' ? (
        <section className="panel" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Čekárna</span>
          <h1>{state.title}</h1>
          <p className="muted-copy">Jsi připojen jako <strong>{state.participantDisplayName}</strong>. Čekáme, až učitel hodinu zahájí.</p>
        </section>
      ) : null}

      {state?.status === 'live' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel">
            <span className="eyebrow">{state.participantDisplayName}</span>
            <h1 style={{ marginBottom: 8 }}>{state.title}</h1>
            <p className="muted-copy">Blok {(state.activeBlockIndex ?? 0) + 1} z {state.totalBlocks}</p>
          </section>
          {state.activeBlock ? <LiveBlock block={state.activeBlock} /> : <div className="error">Čekám na aktivní blok…</div>}
        </div>
      ) : null}

      {state?.status === 'ended' ? (
        <section className="panel" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Hotovo</span>
          <h1>Hodina skončila</h1>
          <p className="muted-copy">Díky za účast, {state.participantDisplayName}.</p>
        </section>
      ) : null}
    </main>
  );
}
