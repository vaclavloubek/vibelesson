import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';
import UpdatePasswordForm from '@/components/UpdatePasswordForm';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const neon = getDatabaseBackend() === 'neon';
  let token: string | undefined;
  let error: string | undefined;
  if (neon) {
    assertApprovedNeonCutover();
    ({ token, error } = await searchParams);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect('/auth/error?reason=session');
  }

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href={`/${locale}`} className="brand-home">
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>
      </div>
      <section className="panel join-card">
        <UpdatePasswordForm neonToken={neon ? token : undefined} neonError={neon ? error : undefined} />
      </section>
    </main>
  );
}
