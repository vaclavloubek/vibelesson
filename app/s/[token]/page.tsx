import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ImportSharedLessonButton from '@/components/ImportSharedLessonButton';
import LessonPreview from '@/components/LessonPreview';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import SharedLessonAuthControls from '@/components/SharedLessonAuthControls';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { LessonSchema } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';
import styles from './SharedLessonPage.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sdílená lekce — Syllonaut',
  description: 'Náhled lekce sdílené v Syllonautu.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ signin?: string | string[]; import?: string | string[] }>;
};

const SHARE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export default async function SharedLessonPage({ params, searchParams }: Props) {
  const [{ token }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  if (!SHARE_TOKEN_PATTERN.test(token)) notFound();

  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_lesson_share', { p_token: token });

  if (error) {
    console.error('load public lesson share failed', { code: error.code });
    notFound();
  }

  const parsed = LessonSchema.safeParse(data);
  if (!parsed.success) notFound();

  const { data: authData } = await supabase.auth.getUser();
  const signin = query.signin === '1' || (Array.isArray(query.signin) && query.signin.includes('1'));
  const importRequested = query.import === '1' || (Array.isArray(query.import) && query.import.includes('1'));
  const serverAuthenticated = Boolean(authData.user);

  return (
    <main className={`shell ${styles.shell}`}>
      <header className="brand">
        <div className="brand-identity">
          <Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link>
          <span className="beta">BETA</span>
        </div>
        <nav className="main-nav" aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
        </nav>
        <div className="brand-side">
          <LocaleSwitcher />
          <SharedLessonAuthControls
            initialOpen={signin}
            token={token}
            importRequested={importRequested}
          />
          <Link href="/new" className="primary button-link app-header-cta">{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
        </div>
      </header>

      <section className={`panel ${styles.hero}`}>
        <span className="eyebrow">{ui('Sdílená lekce', 'Shared lesson')}</span>
        <h1 lang={parsed.data.language} dir={parsed.data.language ? 'auto' : undefined}>{parsed.data.title}</h1>
        <p>{ui(
          'Prohlížíte si neměnný náhled verze, kterou s vámi sdílel kolega. Výsledky studentů, kódy živých hodin a historie úprav nejsou součástí odkazu.',
          'You are viewing an immutable preview shared by a colleague. Student results, live lesson codes and edit history are not included.',
        )}</p>
        <div className={styles.copyNote}>
          <strong>{ui('Kopie bude patřit vašemu účtu.', 'The copy will belong to your account.')}</strong>
          <span>{ui(
            'Po uložení ji můžete upravit a spustit. Změny se nepromítnou zpět autorovi.',
            'After saving, you can edit and run it. Your changes will not affect the author’s lesson.',
          )}</span>
        </div>
        <ImportSharedLessonButton
          token={token}
          importRequested={importRequested}
          serverAuthenticated={serverAuthenticated}
        />
      </section>

      <section className={styles.previewWrap} aria-label={ui('Náhled sdílené lekce', 'Shared lesson preview')}>
        <LessonPreview lesson={parsed.data} mode="shared" />
      </section>

      <SiteFooter />
    </main>
  );
}
