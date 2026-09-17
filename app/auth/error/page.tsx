import Link from 'next/link';
import SyllonautMark from '@/components/SyllonautMark';

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const recoverySessionMissing = reason === 'session';

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href="/" className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <span className="eyebrow">Přihlášení</span>
        <h1>{recoverySessionMissing ? 'Odkaz už není aktivní' : 'Odkaz se nepodařilo ověřit'}</h1>
        <p className="muted-copy">
          {recoverySessionMissing
            ? 'Relace pro změnu hesla vypršela nebo už byla použita. Požádej si znovu o obnovení hesla.'
            : 'Potvrzovací nebo obnovovací odkaz je neplatný, vypršel nebo už byl použit. Spusť registraci či obnovu hesla znovu.'}
        </p>
        <div className="actions">
          <Link href="/new" className="button-link primary">Zpět do Syllonautu</Link>
          <Link href="/" className="button-link secondary">Na úvod</Link>
        </div>
      </section>
    </main>
  );
}
