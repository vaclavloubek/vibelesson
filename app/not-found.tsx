import Link from 'next/link';
import { headers } from 'next/headers';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import styles from './not-found.module.css';

const copy = {
  cs: {
    brandHome: 'Syllonaut – domů',
    eyebrow: '404 · mimo kurz',
    title: 'Vaše lekce doletěla do prázdného vesmíru.',
    body: 'Tady žádná trasa nevede. Odkaz mohl vypršet, být odvolán, nebo jste zabloudili o pár světelných let vedle.',
    primary: 'Zpět na Syllonaut',
    secondary: 'Moje lekce',
    coordinate: 'Souřadnice nenalezeny',
  },
  en: {
    brandHome: 'Syllonaut – home',
    eyebrow: '404 · off course',
    title: 'Your lesson drifted into empty space.',
    body: 'There is no route here. The link may have expired, been revoked, or you may be a few light-years off course.',
    primary: 'Back to Syllonaut',
    secondary: 'My lessons',
    coordinate: 'Coordinates not found',
  },
} as const;

export default async function NotFound() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'en';
  const text = copy[locale];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href={`/${locale}`} className={styles.brand} aria-label={text.brandHome}>
          <SyllonautMark />
          <strong>Syllonaut</strong>
        </Link>

        <section className={styles.card} aria-labelledby="not-found-title">
          <div className={styles.copy}>
            <span className={styles.eyebrow}>{text.eyebrow}</span>
            <h1 id="not-found-title">{text.title}</h1>
            <p>{text.body}</p>

            <div className={styles.actions}>
              <Link href={`/${locale}`} className="button-link primary">
                {text.primary}
              </Link>
              <Link href="/lessons" className="button-link secondary">
                {text.secondary}
              </Link>
            </div>
          </div>

          <div className={styles.visual} aria-hidden="true">
            <span className={styles.starOne} />
            <span className={styles.starTwo} />
            <span className={styles.starThree} />
            <span className={styles.orbitOuter} />
            <span className={styles.orbitInner} />
            <div className={styles.craft}>
              <SyllonautMark className={styles.largeMark} />
            </div>
            <strong className={styles.code}>404</strong>
            <span className={styles.coordinate}>{text.coordinate}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
