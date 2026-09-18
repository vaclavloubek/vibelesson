import Link from 'next/link';
import { headers } from 'next/headers';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const { reason } = await searchParams;
  const recoverySessionMissing = reason === 'session';

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href={`/${locale}`} className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <span className="eyebrow">{english ? 'Sign-in' : 'Přihlášení'}</span>
        <h1>
          {recoverySessionMissing
            ? (english ? 'This link is no longer active' : 'Odkaz už není aktivní')
            : (english ? 'The link could not be verified' : 'Odkaz se nepodařilo ověřit')}
        </h1>
        <p className="muted-copy">
          {recoverySessionMissing
            ? (english
                ? 'The password-change session expired or has already been used. Request password recovery again.'
                : 'Relace pro změnu hesla vypršela nebo už byla použita. Požádej si znovu o obnovení hesla.')
            : (english
                ? 'The confirmation or recovery link is invalid, expired or has already been used. Start registration or password recovery again.'
                : 'Potvrzovací nebo obnovovací odkaz je neplatný, vypršel nebo už byl použit. Spusť registraci či obnovu hesla znovu.')}
        </p>
        <div className="actions">
          <Link href="/new" className="button-link primary">{english ? 'Back to Syllonaut' : 'Zpět do Syllonautu'}</Link>
          <Link href={`/${locale}`} className="button-link secondary">{english ? 'Home' : 'Na úvod'}</Link>
        </div>
      </section>
    </main>
  );
}
