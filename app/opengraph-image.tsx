import { ImageResponse } from 'next/og';

export const alt = 'Syllonaut — AI navigátor pro interaktivní výuku';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#F6F5F1',
          color: '#151721',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            right: -60,
            top: -70,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(91,87,232,.16), rgba(72,120,255,.13), rgba(87,205,187,.16))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 90,
            top: 115,
            width: 340,
            height: 300,
            border: '3px solid rgba(91,87,232,.55)',
            borderLeftColor: 'transparent',
            borderBottomColor: 'rgba(87,205,187,.55)',
            borderRadius: '50%',
            transform: 'rotate(-16deg)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 192,
            top: 186,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#5B57E8',
            boxShadow: '0 0 0 9px rgba(91,87,232,.10)',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '68px 72px', width: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 34 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                background: '#151721',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="38" height="38" viewBox="0 0 36 36" fill="none">
                <path d="M27.8 8.3c-3.1-3-8.5-3.8-13.1-1.8-4.6 2-7.1 6.1-5.5 9.1 1.6 3 6.7 3.7 11.5 1.7 4.8-2 7.5-6 6-9" stroke="#F6F5F1" strokeWidth="2.1" strokeLinecap="round" />
                <path d="M10.2 27.4c2.7 2.1 7.2 2.6 11 .9 4.7-2.1 7.1-6.3 5.4-9.3-1.5-2.7-5.8-3.7-10.2-2.2-4.7 1.6-7.7 5.4-6.7 8.4" stroke="#F6F5F1" strokeWidth="2.1" strokeLinecap="round" />
                <circle cx="27.8" cy="8.3" r="2.2" fill="#57CDBB" />
              </svg>
            </div>
            <div style={{ fontSize: 30, fontWeight: 750 }}>Syllonaut</div>
          </div>

          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: 1.5, color: '#5B57E8', textTransform: 'uppercase', marginBottom: 20 }}>
            AI navigátor pro interaktivní výuku
          </div>
          <div style={{ fontSize: 62, lineHeight: 1.04, fontWeight: 800, letterSpacing: -2.5, maxWidth: 720 }}>
            Z nápadu do živé interaktivní hodiny.
          </div>
          <div style={{ marginTop: 28, fontSize: 25, lineHeight: 1.45, color: '#686B74', maxWidth: 670 }}>
            Připravte lekci, upravte ji přirozeným jazykem a rovnou ji veďte se studenty.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
