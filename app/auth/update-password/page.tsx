import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';
import UpdatePasswordForm from '@/components/UpdatePasswordForm';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/auth/error?reason=session');
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
        <UpdatePasswordForm />
      </section>
    </main>
  );
}
