'use client';

import { useEffect, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';

export default function LandingBackToTop() {
  const [visible, setVisible] = useState(false);
  const locale = useUiLocale();
  const english = locale === 'en';

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * 0.7);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function goTop() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={goTop}
      aria-label={english ? 'Back to top' : 'Zpět nahoru'}
      tabIndex={visible ? 0 : -1}
      style={{
        position: 'fixed',
        right: 22,
        bottom: 22,
        zIndex: 30,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 42,
        padding: '6px 11px 6px 6px',
        border: '1px solid rgba(216,215,210,.96)',
        borderRadius: 999,
        background: 'rgba(246,245,241,.84)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 10px 30px rgba(21,23,33,.10)',
        color: '#686b74',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.01em',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity .18s ease, transform .18s ease, background .16s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid #d8d7d2',
          borderRadius: '50%',
          background: 'rgba(255,255,255,.78)',
          color: '#5b57e8',
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        ↑
      </span>
      <span>{english ? 'Top' : 'Nahoru'}</span>
    </button>
  );
}
