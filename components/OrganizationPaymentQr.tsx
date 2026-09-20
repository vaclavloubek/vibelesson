'use client';

import QRCode from 'react-qr-code';

export default function OrganizationPaymentQr({
  value,
  size = 180,
}: {
  value: string;
  size?: number;
}) {
  return (
    <div style={{ background: '#fff', padding: 12, display: 'inline-flex' }}>
      <QRCode
        value={value}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  );
}
