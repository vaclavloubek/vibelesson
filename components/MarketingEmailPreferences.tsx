'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './MarketingEmailPreferences.module.css';

export default function MarketingEmailPreferences() {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
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
      setMessage(ui('Nastavení se nepodařilo načíst.', 'The setting could not be loaded.'));
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
  }, [english, supabase]);

  async function updatePreference(next: boolean) {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('set_marketing_email_consent', { p_granted: next });
    setBusy(false);

    if (error) {
      console.error('update marketing consent failed', error);
      setMessage(ui('Změnu se nepodařilo uložit. Zkuste to prosím znovu.', 'The change could not be saved. Please try again.'));
      return;
    }

    setEnabled(next);
    setMessage(next
      ? ui('Souhlas se zasíláním marketingových e-mailů je aktivní.', 'Marketing email consent is active.')
      : ui('Marketingové e-maily jsou odhlášené.', 'Marketing emails are disabled.'));
  }

  if (signedIn === null) {
    return <p className={styles.status}>{ui('Načítám vaše nastavení…', 'Loading your settings…')}</p>;
  }

  if (!signedIn) {
    return <p className={styles.status}>{ui('Pro změnu marketingového souhlasu se nejdřív přihlaste ke svému účtu.', 'Sign in to your account to change marketing consent.')}</p>;
  }

  return (
    <div className={styles.card}>
      <div>
        <strong>{ui('Marketingové e-maily', 'Marketing emails')}</strong>
        <p>{ui('Novinky, případové studie a akční nabídky. Změna nemá vliv na účet ani na provozní e-maily.', 'News, case studies and promotional offers. This setting does not affect your account or operational emails.')}</p>
      </div>
      <label className={styles.control}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void updatePreference(event.target.checked)}
        />
        <span>{enabled ? ui('Povoleno', 'Enabled') : ui('Nepovoleno', 'Disabled')}</span>
      </label>
      {message ? <p className={styles.message} role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
