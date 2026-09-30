import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Same mark as app/icon.svg, drawn full-bleed: iOS applies its own corner mask,
// so the rounded rect's transparent corners would render black.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #25283A, #11131B)',
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M47.4 15.8c-5.5-5.3-15.1-6.7-23.3-3.2-8.2 3.6-12.6 10.8-9.8 16.2 2.8 5.3 11.9 6.6 20.4 3 8.5-3.5 13.4-10.7 10.7-16" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" opacity=".62" />
          <path d="M16.1 48.7c4.8 3.7 12.8 4.6 19.6 1.6 8.4-3.7 12.6-11.1 9.6-16.5-2.7-4.8-10.3-6.6-18.1-3.9-8.4 2.8-13.7 9.5-11.9 14.9" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="47.4" cy="15.8" r="4" fill="#7A76FF" stroke="#fff" strokeWidth="1.8" />
        </svg>
      </div>
    ),
    size,
  );
}
