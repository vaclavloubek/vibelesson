'use client';

export type StudentConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'restored';

const STATUS_META: Record<StudentConnectionStatus, { label: string; color: string }> = {
  connecting: { label: 'Navazuji spojení…', color: 'var(--amber)' },
  connected: { label: 'Připojeno', color: 'var(--success)' },
  reconnecting: { label: 'Obnovuji spojení…', color: 'var(--amber)' },
  restored: { label: 'Připojeno znovu', color: 'var(--success)' },
};

export default function ConnectionStatusBadge({ status }: { status: StudentConnectionStatus }) {
  const meta = STATUS_META[status];
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
        style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flex: '0 0 7px' }}
      />
      {meta.label}
    </span>
  );
}
