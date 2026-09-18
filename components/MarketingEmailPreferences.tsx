'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './MarketingEmailPreferences.module.css';

export default function MarketingEmailPreferences() {
  const supabase = useMemo(() => createClient(), []);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadPreference(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('marketing_email_consent')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('load marketing consent failed', error);
      setMessage('Nastavení se nepodařilo načíst.');
      return;
    }

    setEnabled(Boolean(data?.marketing_email_consent));
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const user = data.user;
      setSignedIn(Boolean(user));
      if (user) void loadPreference(user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setSignedIn(Boolean(user));
      setMessage('');
      if (user) void loadPreference(user.id);
      else setEnabled(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function updatePreference(next: boolean) {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('set_marketing_email_consent', { p_granted: next });
    setBusy(false);

    if (error) {
      console.error('update marketing consent failed', error);
      setMessage('Změnu se nepodařilo uložit. Zkuste to prosím znovu.');
      return;
    }

    setEnabled(next);
    setMessage(next
      ? 'Souhlas se zasíláním marketingových e-mailů je aktivní.'
      : 'Marketingové e-maily jsou odhlášené.');
  }

  if (signedIn === null) {
    return <p className={styles.status}>Načítám vaše nastavení…</p>;
  }

  if (!signedIn) {
    return <p className={styles.status}>Pro změnu marketingového souhlasu se nejdřív přihlaste ke svému účtu.</p>;
  }

  return (
    <div className={styles.card}>
      <div>
        <strong>Marketingové e-maily</strong>
        <p>Novinky, případové studie a akční nabídky. Změna nemá vliv na účet ani na provozní e-maily.</p>
      </div>
      <label className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void updatePreference(event.target.checked)}
        />
        <span>{enabled ? 'Povoleno' : 'Nepovoleno'}</span>
      </label>
      {message ? <p className={styles.message} role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
