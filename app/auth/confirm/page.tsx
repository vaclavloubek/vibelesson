import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

type Props = {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
};

type SupportedEmailType = 'email' | 'signup' | 'recovery';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function isSupportedType(value: string | undefined): value is SupportedEmailType {
  return value === 'email' || value === 'signup' || value === 'recovery';
}

export default async function ConfirmAuthPage({ searchParams }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const { token_hash: tokenHash, type, next } = await searchParams;
  const validRequest = Boolean(tokenHash) && isSupportedType(type);
  const recovery = type === 'recovery';

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href={`/${locale}`} className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <span className="eyebrow">{recovery ? (english ? 'Account recovery' : 'Obnovení přístupu') : (english ? 'Account confirmation' : 'Potvrzení účtu')}</span>
        <h1>
          {validRequest
            ? recovery
              ? (english ? 'Continue to a new password' : 'Pokračovat k novému heslu')
              : (english ? 'Complete registration' : 'Dokončit registraci')
            : (english ? 'This link is not valid' : 'Odkaz není platný')}
        </h1>
        {validRequest ? (
          <>
            <p className="muted-copy">
              {recovery
                ? (english ? 'Confirm that you want to continue. Then you can set a new password.' : 'Potvrď pokračování. Potom si nastavíš nové heslo.')
                : (english ? 'Confirm account creation. Then we will take you to your lessons.' : 'Potvrď vytvoření účtu. Potom tě přesměrujeme do tvých lekcí.')}
            </p>
            <form action="/auth/confirm/verify" method="post">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <button type="submit" className="primary">
                {recovery ? (english ? 'Continue' : 'Pokračovat') : (english ? 'Confirm account' : 'Potvrdit účet')}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="muted-copy">
              {english
                ? 'The confirmation link is incomplete or damaged. Start registration or password recovery again.'
                : 'Potvrzovací odkaz je neúplný nebo poškozený. Spusť registraci či obnovu hesla znovu.'}
            </p>
            <div className="actions">
              <Link href="/new" className="button-link primary">{english ? 'Back to Syllonaut' : 'Zpět do Syllonautu'}</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
