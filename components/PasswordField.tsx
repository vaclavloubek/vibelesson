'use client';

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';

type Props = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  required?: boolean;
};

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const english = useUiLocale() === 'en';
  const toggleLabel = revealed
    ? (english ? 'Hide password' : 'Skrýt heslo')
    : (english ? 'Show password' : 'Zobrazit heslo');

  return (
    <label>
      {label}
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          style={{ paddingRight: 46 }}
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={toggleLabel}
          aria-pressed={revealed}
          title={toggleLabel}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 34,
            height: 34,
            minHeight: 34,
            padding: 0,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--muted)',
          }}
        >
          {revealed ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M10.7 6.2A10.6 10.6 0 0 1 12 6c5.2 0 8.6 4.4 9.5 5.8a.4.4 0 0 1 0 .4 14.5 14.5 0 0 1-3.2 3.6M6.1 6.1A14.3 14.3 0 0 0 2.5 11.8a.4.4 0 0 0 0 .4C3.4 13.6 6.8 18 12 18c1 0 2-.2 2.8-.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.5 11.8a.4.4 0 0 0 0 .4C3.4 13.6 6.8 18 12 18s8.6-4.4 9.5-5.8a.4.4 0 0 0 0-.4C20.6 10.4 17.2 6 12 6S3.4 10.4 2.5 11.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </button>
      </span>
    </label>
  );
}
