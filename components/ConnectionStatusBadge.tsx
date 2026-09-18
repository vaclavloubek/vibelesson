'use client';

import { useUiLocale } from '@/components/LocaleProvider';

export type StudentConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'restored';

const COLORS: Record<StudentConnectionStatus, string> = {
  connecting: 'var(--amber)',
  connected: 'var(--success)',
  reconnecting: 'var(--amber)',
  restored: 'var(--success)',
};

export default function ConnectionStatusBadge({ status }: { status: StudentConnectionStatus }) {
  const english = useUiLocale() === 'en';
  const labels: Record<StudentConnectionStatus, string> = english ? {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    restored: 'Connected again',
  } : {
    connecting: 'Navazuji spojení…',
    connected: 'Připojeno',
    reconnecting: 'Obnovuji spojení…',
    restored: 'Připojeno znovu',
  };

  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        marginLeft: 'auto',
        padding: '6px 9px',
        border: '1px solid var(--line)',
        borderRadius: 999,
        background: 'var(--panel-soft)',
        color: 'var(--muted)',
        fontSize: 12,
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS[status], flex: '0 0 7px' }}
      />
      {labels[status]}
    </span>
  );
}
