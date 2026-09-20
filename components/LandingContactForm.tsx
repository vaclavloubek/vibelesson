'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { trackEvent } from '@/lib/analytics';
import styles from './LandingContactForm.module.css';

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

const copy = {
  cs: {
    eyebrow: 'Spojení s řídicím střediskem',
    title: 'Zůstala vám otázka mimo radar?',
    body: 'Pošlete nám signál. Stačí e-mail a pár slov k tomu, co potřebujete zjistit — ozveme se zpátky.',
    emailStep: '01 · Kontakt',
    emailLabel: 'Váš e-mail',
    emailPlaceholder: 'vy@skola.cz',
    messageStep: '02 · Dotaz',
    messageLabel: 'Na co se chcete zeptat?',
    messagePlaceholder: 'Třeba k použití ve škole, tarifům nebo tomu, co Syllonaut umí…',
    submit: 'Odeslat signál',
    sending: 'Odesílám signál…',
    success: 'Signál dorazil. Ozveme se na uvedený e-mail.',
    error: 'Signál se nepodařilo odeslat. Zkuste to prosím znovu.',
    rateLimited: 'Těch signálů přiletělo několik za sebou. Zkuste to prosím za pár minut.',
    privacyPrefix: 'E-mail a text dotazu použijeme jen k vyřízení zprávy.',
    privacyLink: 'Ochrana osobních údajů',
  },
  en: {
    eyebrow: 'Mission control link',
    title: 'Is there still a question beyond the radar?',
    body: 'Send us a signal. An email and a few words about what you need are enough — we will get back to you.',
    emailStep: '01 · Contact',
    emailLabel: 'Your email',
    emailPlaceholder: 'you@school.org',
    messageStep: '02 · Question',
    messageLabel: 'What would you like to ask?',
    messagePlaceholder: 'For example about school use, plans or what Syllonaut can do…',
    submit: 'Send the signal',
    sending: 'Sending signal…',
    success: 'Signal received. We will reply to the email you provided.',
    error: 'The signal could not be sent. Please try again.',
    rateLimited: 'Several signals arrived in quick succession. Please try again in a few minutes.',
    privacyPrefix: 'We use your email and message only to handle your enquiry.',
    privacyLink: 'Privacy notice',
  },
} as const;

export default function LandingContactForm() {
  const locale = useUiLocale();
  const t = copy[locale];
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState('');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [state, setState] = useState<SubmitState>('idle');
  const [feedback, setFeedback] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;

    setState('sending');
    setFeedback('');

    try {
      const response = await fetch('/api/contact-inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          email,
          message,
          company,
          startedAt,
        }),
      });

      if (!response.ok) {
        setState('error');
        setFeedback(response.status === 429 ? t.rateLimited : t.error);
        trackEvent('contact_inquiry_submit', { result: response.status === 429 ? 'rate_limited' : 'error' });
        return;
      }

      setEmail('');
      setMessage('');
      setCompany('');
      setStartedAt(Date.now());
      setState('success');
      setFeedback(t.success);
      trackEvent('contact_inquiry_submit', { result: 'success' });
    } catch {
      setState('error');
      setFeedback(t.error);
      trackEvent('contact_inquiry_submit', { result: 'error' });
    }
  }

  return (
    <section className={styles.section} id="kontakt" aria-labelledby="contact-title">
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{t.eyebrow}</span>
        <h2 id="contact-title">{t.title}</h2>
        <p>{t.body}</p>
        <div className={styles.signalLine} aria-hidden="true">
          <span />
          <i />
          <span />
        </div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <span className={styles.step}>{t.emailStep}</span>
          <label htmlFor="contact-email">{t.emailLabel}</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            placeholder={t.emailPlaceholder}
            onChange={(event) => setEmail(event.target.value)}
            disabled={state === 'sending'}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.step}>{t.messageStep}</span>
          <label htmlFor="contact-message">{t.messageLabel}</label>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            minLength={10}
            maxLength={3000}
            required
            value={message}
            placeholder={t.messagePlaceholder}
            onChange={(event) => setMessage(event.target.value)}
            disabled={state === 'sending'}
          />
          <span className={styles.counter} aria-hidden="true">{message.length} / 3000</span>
        </div>

        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" disabled={state === 'sending'}>
            <span>{state === 'sending' ? t.sending : t.submit}</span>
            <span aria-hidden="true">→</span>
          </button>
          <p>
            {t.privacyPrefix}{' '}
            <Link href={`/${locale}/gdpr`}>{t.privacyLink}</Link>.
          </p>
        </div>

        {feedback ? (
          <p
            className={state === 'success' ? styles.success : styles.error}
            role={state === 'success' ? 'status' : 'alert'}
            aria-live="polite"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
