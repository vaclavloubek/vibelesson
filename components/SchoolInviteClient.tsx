'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthControls from '@/components/AuthControls';
import SyllonautMark from '@/components/SyllonautMark';
import styles from './SchoolAdmin.module.css';

export default function SchoolInviteClient({
  locale,
  token,
  initialUser,
}: {
  locale: 'cs' | 'en';
  token: string;
  initialUser: { id: string; email: string | null } | null;
}) {
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'accepting' | 'accepted' | 'error'>(
    initialUser ? 'accepting' : 'idle',
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (initialUser && token && state === 'idle') {
      setState('accepting');
    }
  }, [initialUser, state, token]);

  useEffect(() => {
    if (!initialUser || !token || state !== 'accepting') return;

    void (async () => {
      const response = await fetch('/api/organizations/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };

      if (response.ok) {
        setState('accepted');
        router.replace('/school');
        return;
      }

      setState('error');
      setMessage(
        payload.error === 'invitation_email_mismatch'
          ? ui(
            'Pozvánka je určená pro jinou e-mailovou adresu.',
            'This invitation is for a different email address.',
          )
          : payload.error === 'invitation_expired'
            ? ui('Platnost pozvánky vypršela.', 'This invitation has expired.')
            : ui('Pozvánku se nepodařilo přijmout.', 'The invitation could not be accepted.'),
      );
    })();
  }, [initialUser, state, token, english]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={'/' + locale} className={styles.brand}>
            <SyllonautMark />
            <span>Syllonaut</span>
          </Link>
          {!initialUser && token ? (
            <div className={styles.topActions}>
              <AuthControls
                onAuthChange={(user) => { if (user) router.refresh(); }}
                initialOpen
                initialMode="signin"
                signupRedirectPath={'/school/invite?token=' + encodeURIComponent(token)}
              />
            </div>
          ) : null}
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Školní licence', 'School licence')}</span>
          <h1>{ui('Pozvánka do školního Syllonautu', 'Invitation to your school Syllonaut')}</h1>
        </section>

        <section className={styles.card + ' ' + styles.wide}>
          {!token ? (
            <div className={styles.error}>
              {ui('Odkaz na pozvánku není platný.', 'The invitation link is invalid.')}
            </div>
          ) : null}

          {token && !initialUser ? (
            <>
              <h2>
                {ui(
                  'Přihlaste se stejným e-mailem, na který přišla pozvánka',
                  'Sign in with the same email address that received the invitation',
                )}
              </h2>
              <p>
                {ui(
                  'Přihlášení najdete vpravo nahoře. Po přihlášení se pozvánka ověří a přijme automaticky.',
                  'Sign in from the top right. After sign-in, the invitation will be verified and accepted automatically.',
                )}
              </p>
            </>
          ) : null}

          {state === 'accepting' ? (
            <p>{ui('Přijímám pozvánku…', 'Accepting invitation…')}</p>
          ) : null}

          {state === 'accepted' ? (
            <div className={styles.success}>
              {ui(
                'Hotovo. Účet je připojený ke školní organizaci.',
                'Done. Your account is connected to the school organization.',
              )}
              <div style={{ marginTop: 14 }}>
                <Link className={styles.back} href="/school">
                  {ui('Otevřít Moji školu →', 'Open My school →')}
                </Link>
              </div>
            </div>
          ) : null}

          {state === 'error' ? <div className={styles.error}>{message}</div> : null}
        </section>
      </div>
    </main>
  );
}
