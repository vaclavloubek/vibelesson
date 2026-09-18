'use client';

import { useEffect, useRef, useState } from 'react';
import VisuallyHidden from '@/components/VisuallyHidden';
import { useUiLocale } from '@/components/LocaleProvider';
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

function milestoneMessage(seconds: number, label: string, english: boolean) {
  if (seconds === 60) return english ? `${resolvedLabel}: one minute remaining.` : `${resolvedLabel}: zbývá jedna minuta.`;
  if (seconds === 30) return english ? `${resolvedLabel}: 30 seconds remaining.` : `${resolvedLabel}: zbývá 30 sekund.`;
  if (seconds === 10) return english ? `${resolvedLabel}: 10 seconds remaining.` : `${resolvedLabel}: zbývá 10 sekund.`;
  return english ? `${resolvedLabel}: time is up.` : `${resolvedLabel}: čas vypršel.`;
}

export default function LiveTimer({ timer, label }: Props) {
  const english = useUiLocale() === 'en';
  const resolvedLabel = label ?? (english ? 'Time' : 'Čas');
  const [remaining, setRemaining] = useState(timer.remainingSeconds);
  const [announcement, setAnnouncement] = useState('');
  const previousSecondsRef = useRef(Math.max(0, Math.ceil(timer.remainingSeconds)));

  useEffect(() => {
    previousSecondsRef.current = Math.max(0, Math.ceil(timer.remainingSeconds));
    setAnnouncement('');
  }, [timer.syncedAt]);

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

  useEffect(() => {
    const currentSeconds = Math.max(0, Math.ceil(remaining));
    const previousSeconds = previousSecondsRef.current;
    const crossed = [60, 30, 10, 0].find((milestone) => previousSeconds > milestone && currentSeconds <= milestone);
    if (crossed !== undefined) setAnnouncement(milestoneMessage(crossed, resolvedLabel, english));
    previousSecondsRef.current = currentSeconds;
  }, [english, remaining, resolvedLabel]);

  const finished = remaining <= 0;
  const statusText = finished
    ? (english ? 'Time is up' : 'Čas vypršel')
    : timer.status === 'running'
      ? (english ? 'Countdown running' : 'Odpočet běží')
      : timer.status === 'paused'
        ? (english ? 'Countdown paused' : 'Odpočet je pozastavený')
        : (english ? 'Waiting to start' : 'Čeká na spuštění');

  return (
    <section className="panel" style={{ textAlign: 'center' }} aria-label={resolvedLabel}>
      <span className="eyebrow">{resolvedLabel}</span>
      <div
        role="timer"
        aria-label={`${resolvedLabel}: ${formatSeconds(remaining)}. ${statusText}.`}
        style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-.04em', margin: '8px 0 4px' }}
      >
        {formatSeconds(remaining)}
      </div>
      <p className="muted-copy" style={{ marginBottom: 0 }}>{statusText}</p>
      <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{announcement}</span></VisuallyHidden>
    </section>
  );
}
