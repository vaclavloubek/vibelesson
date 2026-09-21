import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import NeonAuthStagingControls from '@/components/NeonAuthStagingControls';
import SyllonautMark from '@/components/SyllonautMark';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Neon Auth staging – Syllonaut',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function NeonAuthStagingPage({ searchParams }: Props) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { token, error } = await searchParams;
  const configured = Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href="/" className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <span className="eyebrow">Preview · Neon Auth</span>
        <h1>Test přihlášení bez Turnstile</h1>
        <p className="muted-copy">
          Tato neveřejná stránka pracuje jen s Neon Auth stagingem. Registrace je vypnutá a produkční Supabase přihlášení se nemění.
        </p>
        {configured ? (
          <NeonAuthStagingControls resetToken={token} resetError={error} />
        ) : (
          <div className="auth-message" role="status">
            Preview zatím nemá kompletní serverové nastavení Neon Auth. Chybí proměnná NEON_AUTH_COOKIE_SECRET.
          </div>
        )}
      </section>
    </main>
  );
}
