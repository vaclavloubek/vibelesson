'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';

export default function JoinQrCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
      <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid var(--line)', lineHeight: 0 }}>
        <QRCode
          value={value}
          size={184}
          level="M"
          title="QR kód pro připojení ke Syllonaut hodině"
          style={{ width: 184, maxWidth: '100%', height: 'auto' }}
        />
      </div>
      <button className="secondary" type="button" onClick={() => void copyLink()}>
        {copied ? 'Odkaz zkopírován' : 'Kopírovat odkaz'}
      </button>
    </div>
  );
}
