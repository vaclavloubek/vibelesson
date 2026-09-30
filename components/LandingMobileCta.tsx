'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import landing from './LandingPage.module.css';
import styles from './LandingMobileCta.module.css';

// The bar steps aside whenever another "prepare a lesson" route is on screen:
// the hero CTA, the closing CTA section and the contact form.
const COMPETING_TARGET_IDS = ['hero-cta', 'pripravit-hodinu', 'kontakt'];

export default function LandingMobileCta({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const targets = COMPETING_TARGET_IDS
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!targets.length || typeof IntersectionObserver === 'undefined') return;

    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setVisible(onScreen.size === 0);
    });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${styles.bar} ${visible ? styles.visible : ''}`} aria-hidden={visible ? undefined : 'true'}>
      <Link
        href="/new"
        className={`${landing.primaryCta} ${styles.cta}`}
        tabIndex={visible ? undefined : -1}
        onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'mobile_sticky' })}
      >
        {label}
      </Link>
    </div>
  );
}
