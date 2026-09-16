'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LiveBlock from '@/components/LiveBlock';
import TeacherResponses from '@/components/TeacherResponses';
import type { SessionAction, SessionStatus, StudentAnswer } from '@/lib/live';
import type { Lesson } from '@/lib/schema';
import { createClient } from '@/lib/supabase/client';

type Participant = { id: string; displayName: string; joinedAt: string };
type LiveResponse = { participantId: string; displayName: string; answer: StudentAnswer; updatedAt: string };
type TeacherSessionData = {
  id: string;
  lessonId: string | null;
  joinCode: string;
  status: SessionStatus;
  activeBlockId: string | null;
  lessonSnapshot: Lesson;
  realtimeKey: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  participants: Participant[];
  responses: LiveResponse[];
};

export default function TeacherSession({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<TeacherSessionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
      const data = await response.json() as { session?: TeacherSessionData; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error || 'Hodinu se nepodařilo načíst.');
      setSession(data.session);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hodinu se nepodařilo načíst.');
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session?.joinCode) return;
    setJoinUrl(`${window.location.origin}/join/${session.joinCode}`);
  }, [session?.joinCode]);

  useEffect(() => {
    if (!session?.realtimeKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${session.realtimeKey}`)
      .on('broadcast', { event: 'invalidate' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.realtimeKey, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function act(action: SessionAction['action']) {
    if (busy) return;
    if (action === 'end' && !window.confirm('Opravdu ukončit hodinu? Studenti už se znovu nepřipojí.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Stav hodiny se nepodařilo změnit.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stav hodiny se nepodařilo změnit.');
    } finally {
      setBusy(false);
    }
  }

  const activeIndex = useMemo(() => {
    if (!session?.activeBlockId) return -1;
    return session.lessonSnapshot.blocks.findIndex((block) => block.id === session.activeBlockId);
  }, [session]);
  const activeBlock = activeIndex >= 0 && session ? session.lessonSnapshot.blocks[activeIndex] : null;

  return (
    <main className="shell" style={{ maxWidth: 1100 }}>
      <header className="brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><span className="brand-mark">E</span><strong>EduPilot</strong></Link><span className="beta">LIVE</span></div>
        <nav className="main-nav"><Link href="/lessons">Moje lekce</Link></nav>
        <p className="brand-tagline">Řízení živé hodiny</p>
      </header>

      {error ? <div className="error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {!session ? <div className="panel"><p className="muted-copy">Načítám hodinu…</p></div> : null}

      {session?.status === 'lobby' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <span className="eyebrow">Lobby</span>
            <h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1>
            <p className="muted-copy">Studenti se mohou připojit i po zahájení hodiny. Kód přestane fungovat až po jejím ukončení.</p>
            <div style={{ margin: '24px 0 10px', fontSize: 46, fontWeight: 900, letterSpacing: '.12em' }}>{session.joinCode}</div>
            <p className="muted-copy" style={{ wordBreak: 'break-all' }}>{joinUrl || `/join/${session.joinCode}`}</p>
            <div className="actions"><button className="primary" disabled={busy} onClick={() => void act('start')}>{busy ? 'Zahajuji…' : 'Zahájit hodinu'}</button></div>
          </section>
          <section className="panel">
            <span className="eyebrow">Připojení studenti</span>
            <h2>{session.participants.length}</h2>
            {session.participants.length ? <div className="items">{session.participants.map((participant) => <div className="item" key={participant.id}>{participant.displayName}</div>)}</div> : <p className="muted-copy">Zatím nikdo.</p>}
          </section>
        </div>
      ) : null}

      {session?.status === 'live' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div><span className="eyebrow">Živá hodina</span><h1 style={{ marginBottom: 8 }}>{session.lessonSnapshot.title}</h1><p className="muted-copy">Blok {activeIndex + 1} z {session.lessonSnapshot.blocks.length} · {session.participants.length} studentů</p></div>
              <div className="actions" style={{ marginTop: 0 }}><button className="secondary" disabled={busy || activeIndex <= 0} onClick={() => void act('previous')}>← Předchozí</button><button className="primary" disabled={busy || activeIndex >= session.lessonSnapshot.blocks.length - 1} onClick={() => void act('next')}>Další →</button><button className="secondary" disabled={busy} onClick={() => void act('end')}>Ukončit hodinu</button></div>
            </div>
          </section>
          {activeBlock ? <LiveBlock block={activeBlock} teacherMode /> : <div className="error">Aktuální blok se nepodařilo najít ve snapshotu.</div>}
          {activeBlock ? <TeacherResponses block={activeBlock} responses={session.responses ?? []} participantCount={session.participants.length} /> : null}
          <section className="panel"><span className="eyebrow">Připojení studenti</span><p className="muted-copy">{session.participants.map((participant) => participant.displayName).join(', ') || 'Zatím nikdo.'}</p></section>
        </div>
      ) : null}

      {session?.status === 'ended' ? (
        <section className="panel">
          <span className="eyebrow">Hodina ukončena</span>
          <h1>{session.lessonSnapshot.title}</h1>
          <p className="muted-copy">Session je uzavřená. Připojilo se {session.participants.length} studentů.</p>
          <div className="actions"><Link href={`/lessons/${session.lessonId}`} className="primary button-link">Zpět k lekci</Link><Link href="/lessons" className="secondary button-link">Moje lekce</Link></div>
        </section>
      ) : null}
    </main>
  );
}
