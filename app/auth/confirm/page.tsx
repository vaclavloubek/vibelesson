import type { Metadata } from 'next';
import Link from 'next/link';
import SyllonautMark from '@/components/SyllonautMark';

type Props = {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
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
  const { token_hash: tokenHash, type } = await searchParams;
  const validRequest = Boolean(tokenHash) && isSupportedType(type);
  const recovery = type === 'recovery';

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href="/" className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <span className="eyebrow">{recovery ? 'Obnovení přístupu' : 'Potvrzení účtu'}</span>
        <h1>{validRequest ? (recovery ? 'Pokračovat k novému heslu' : 'Dokončit registraci') : 'Odkaz není platný'}</h1>
        {validRequest ? (
          <>
            <p className="muted-copy">
              {recovery
                ? 'Potvrď pokračování. Potom si nastavíš nové heslo.'
                : 'Potvrď vytvoření účtu. Potom tě přesměrujeme do tvých lekcí.'}
            </p>
            <form action="/auth/confirm/verify" method="post">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <button type="submit" className="primary">
                {recovery ? 'Pokračovat' : 'Potvrdit účet'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="muted-copy">Potvrzovací odkaz je neúplný nebo poškozený. Spusť registraci či obnovu hesla znovu.</p>
            <div className="actions">
              <Link href="/new" className="button-link primary">Zpět do Syllonautu</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
