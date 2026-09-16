'use client';

import { useEffect, useState } from 'react';
import type { LiveTimerState } from '@/lib/live';

type Props = {
  timer: LiveTimerState;
  label?: string;
};

function formatSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function LiveTimer({ timer, label = 'Čas' }: Props) {
  const [remaining, setRemaining] = useState(timer.remainingSeconds);

  useEffect(() => {
    const receivedAt = Date.now();
    const update = () => {
      if (timer.status !== 'running') {
        setRemaining(timer.remainingSeconds);
        return;
      }
      const elapsedSeconds = (Date.now() - receivedAt) / 1000;
      setRemaining(Math.max(0, timer.remainingSeconds - elapsedSeconds));
    };

    update();
    if (timer.status !== 'running') return;
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [timer.remainingSeconds, timer.status, timer.syncedAt]);

  const finished = remaining <= 0;
  const statusText = finished
    ? 'Čas vypršel'
    : timer.status === 'running'
      ? 'Odpočet běží'
      : timer.status === 'paused'
        ? 'Odpočet je pozastavený'
        : 'Čeká na spuštění';

  return (
    <section className="panel" style={{ textAlign: 'center' }}>
      <span className="eyebrow">{label}</span>
      <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-.04em', margin: '8px 0 4px' }}>{formatSeconds(remaining)}</div>
      <p className="muted-copy" style={{ marginBottom: 0 }}>{statusText}</p>
    </section>
  );
}
