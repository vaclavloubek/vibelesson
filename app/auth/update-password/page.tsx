import Link from 'next/link';
import { redirect } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';
import UpdatePasswordForm from '@/components/UpdatePasswordForm';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/auth/error?reason=session');
  }

  return (
    <main className="shell join-shell">
      <div className="brand">
        <Link href="/" className="brand-home">
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
