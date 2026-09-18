import type { Metadata } from 'next';
import Link from 'next/link';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import MarketingEmailPreferences from '@/components/MarketingEmailPreferences';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import landing from '@/components/LandingPage.module.css';
import styles from './GdprPage.module.css';

export const metadata: Metadata = {
  title: 'Ochrana osobních údajů (GDPR) — Syllonaut',
  description: 'Jak Syllonaut zpracovává osobní údaje, cookies, údaje z účtů, živých lekcí a marketingových souhlasů.',
  alternates: { canonical: '/gdpr' },
  robots: { index: true, follow: true },
};

export default function GdprPage() {
  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href="/" className={landing.brand} aria-label="Syllonaut – domů"><SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span></Link>
        <nav className={landing.nav} aria-label="Hlavní navigace"><Link href="/#jak-to-funguje">Jak to funguje</Link><Link href="/pricing">Ceník</Link></nav>
        <div className={landing.headerActions}><Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }}>Připravit hodinu</Link><HeaderMobileNav signedIn={false} current="home" /></div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Ochrana soukromí</span>
          <h1>Ochrana osobních údajů (GDPR)</h1>
          <p>Tato stránka popisuje, jaké osobní údaje Syllonaut zpracovává, proč je potřebuje, jak dlouho je uchovává a jaká máte práva.</p>
          <div className={styles.meta}>Verze 1.0 · účinná od 18. 9. 2026</div>
        </div>

        <aside className={styles.notice} aria-label="Důležitá informace ke kontaktním údajům správce">
          <strong>Kontaktní e-mail pro ochranu soukromí ještě připravujeme.</strong>
          <p>Poštovní identifikace správce je uvedena níže. Kontaktní e-mail doplníme, jakmile bude pro doménu syllonaut.com skutečně zprovozněný.</p>
        </aside>

        <section>
          <h2>1. Správce osobních údajů</h2>
          <p><strong>Václav Loubek</strong><br />Slepá 868<br />289 23 Milovice<br />Česká republika</p>
          <p>Správce provozuje službu Syllonaut na doméně <strong>syllonaut.com</strong>. Kontaktní e-mail pro ochranu soukromí doplníme po jeho zprovoznění.</p>
        </section>

        <section>
          <h2>2. Jaké údaje zpracováváme</h2>
          <ul>
            <li><strong>Účet učitele:</strong> e-mailová adresa, technický identifikátor účtu, údaje o oprávněních a využití AI limitů.</li>
            <li><strong>Lekce a práce učitele:</strong> zadání, vytvořené lekce, úpravy, názvy složek a další uložený obsah.</li>
            <li><strong>Podklady pro tvorbu lekce:</strong> text extrahovaný v prohlížeči. Originální soubor neopouští zařízení a extrahovaný text se v Syllonautu trvale neukládá.</li>
            <li><strong>Živé lekce:</strong> zobrazované jméno studenta, odpovědi, týmové zařazení, výsledky, časy odevzdání a související provozní údaje.</li>
            <li><strong>Bezpečnost a provoz:</strong> technické údaje nutné pro přihlášení, ochranu proti zneužití, diagnostiku chyb a zabezpečení.</li>
            <li><strong>Marketingový e-mailový souhlas:</strong> zda jste se přihlásili k novinkám, případovým studiím a nabídkám, datum souhlasu a verze textu.</li>
            <li><strong>Analytika:</strong> až po souhlasu mohou být pomocí Google Analytics 4 zpracovávány údaje o návštěvě a používání webu v rozsahu konkrétního nastavení GA4.</li>
          </ul>
        </section>

        <section>
          <h2>3. Účely a právní základy</h2>
          <div className={styles.tableWrap}><table><thead><tr><th>Účel</th><th>Právní základ</th></tr></thead><tbody>
            <tr><td>Registrace, přihlášení, ukládání lekcí a poskytování funkcí služby</td><td>Plnění smlouvy nebo kroky na žádost uživatele před jejím uzavřením (čl. 6 odst. 1 písm. b GDPR)</td></tr>
            <tr><td>Zabezpečení služby, prevence zneužití a technická diagnostika</td><td>Oprávněný zájem na bezpečném a spolehlivém provozu (čl. 6 odst. 1 písm. f GDPR)</td></tr>
            <tr><td>Plnění zákonných povinností</td><td>Právní povinnost (čl. 6 odst. 1 písm. c GDPR)</td></tr>
            <tr><td>Analytika webu pomocí GA4</td><td>Souhlas (čl. 6 odst. 1 písm. a GDPR); bez souhlasu se GA4 nenačte</td></tr>
            <tr><td>Novinky, případové studie a akční nabídky e-mailem</td><td>Dobrovolný souhlas; registrace není tímto souhlasem podmíněna</td></tr>
          </tbody></table></div>
        </section>

        <section>
          <h2>4. Marketingové e-maily</h2>
          <p>Při registraci můžete samostatně a dobrovolně souhlasit se zasíláním novinek, případových studií a akčních nabídek. Pole není předem zaškrtnuté. Souhlas lze kdykoli odvolat; každý marketingový e-mail musí obsahovat jednoduchou možnost odhlášení. Odvolání souhlasu nemá vliv na používání účtu ani na provozní e-maily související se službou.</p>
          <MarketingEmailPreferences />
        </section>

        <section>
          <h2>5. Cookies a Google Analytics 4</h2>
          <p>Nezbytné cookies používáme pro přihlášení, bezpečnost, ochranu proti zneužití a uložení vaší volby cookies. Analytické cookies jsou ve výchozím stavu vypnuté a odmítnutí analytiky neomezuje používání služby.</p>
          <div className={styles.tableWrap}><table><thead><tr><th>Technologie</th><th>Účel</th><th>Doba</th></tr></thead><tbody>
            <tr><td><code>syllonaut_cookie_consent_v1</code></td><td>Uložení vaší volby cookies; nezbytné.</td><td>Nejvýše 180 dnů.</td></tr>
            <tr><td>Supabase autentizační cookies (<code>sb-…-auth-token</code>, případně rozdělené do více cookies)</td><td>Přihlášení a bezpečné obnovení relace; nezbytné.</td><td>Po dobu relace podle nastavení autentizace, nejdéle do odhlášení nebo expirace příslušných tokenů.</td></tr>
            <tr><td>Cloudflare Turnstile</td><td>Ochrana registračních a přihlašovacích formulářů proti zneužití; může používat technické identifikátory nutné pro bezpečnost.</td><td>Podle bezpečnostní relace a nastavení poskytovatele.</td></tr>
            <tr><td><code>_ga</code>, <code>_ga_*</code></td><td>Google Analytics 4 — měření návštěvnosti a používání služby; pouze po souhlasu.</td><td>V konfiguraci Syllonautu přibližně 13 měsíců.</td></tr>
          </tbody></table></div>
          <p>Google Analytics 4 se načte pouze po aktivním souhlasu a pouze tehdy, když je v produkční konfiguraci nastaveno měření. V této verzi GA4 nepovolujeme reklamní signály ani personalizaci reklamy. Pokud později přidáme remarketing, Google Ads nebo jiný marketingový tracking, aktualizujeme tyto informace a v případě potřeby si vyžádáme nový souhlas.</p>
          <p>Volbu lze kdykoli změnit přes odkaz <strong>Nastavení cookies</strong> v patičce. Při odvolání analytického souhlasu Syllonaut další měření zablokuje a pokusí se odstranit existující GA cookies na doméně Syllonautu.</p>
        </section>

        <section><h2>6. AI a nahrané podklady</h2><p>AI pracuje s textem potřebným k vytvoření, úpravě nebo vyhodnocení lekce. Pro současné AI cesty je na úrovni Vercel AI Gateway vynucen režim zero data retention. U podporovaných podkladů probíhá extrakce textu v prohlížeči; originální soubor není odesílán na server Syllonautu a extrahovaný text se trvale neukládá jako souborový archiv.</p><p>Do zadání ani podkladů nevkládejte osobní údaje, které nejsou pro výuku nezbytné, zejména citlivé údaje studentů.</p></section>

        <section><h2>7. Studenti a školní použití</h2><p>Student pro připojení k živé lekci nepotřebuje plnohodnotný účet. Zadává zobrazované jméno a během výuky může odesílat odpovědi. Učitel by měl požadovat jen takové označení studenta, které je pro konkrétní hodinu potřebné.</p><p>U budoucích školních účtů může být správcem osobních údajů škola a Syllonaut jejím zpracovatelem. Konkrétní role a smluvní podmínky budou před komerčním školním nasazením upraveny samostatně.</p></section>

        <section><h2>8. Dodavatelé</h2><ul>
          <li><strong>Supabase</strong> — autentizace a databázová infrastruktura.</li>
          <li><strong>Vercel</strong> — hosting aplikace a AI Gateway.</li>
          <li><strong>Cloudflare</strong> — Turnstile pro ochranu formulářů.</li>
          <li><strong>Resend</strong> — transakční e-maily a do budoucna marketingové rozesílky podle uděleného souhlasu.</li>
          <li><strong>Poskytovatelé AI modelů</strong> — jen v rozsahu potřebném pro konkrétní AI operaci.</li>
          <li><strong>Google</strong> — Google Analytics 4, až po aktivaci a pouze po souhlasu s analytikou.</li>
        </ul><p>Pokud konkrétní dodavatel předává osobní údaje mimo Evropský hospodářský prostor, musí být použito odpovídající právní zajištění podle GDPR.</p></section>

        <section><h2>9. Doba uchování</h2><ul>
          <li>Údaje účtu a uložené lekce uchováváme po dobu aktivního účtu nebo do jejich smazání, pokud právní povinnost nevyžaduje delší uchování.</li>
          <li>Ukončené živé sessions jsou určeny k automatickému smazání po 12 měsících.</li>
          <li>Opuštěné session ve stavu lobby/live jsou určeny k automatickému smazání po 30 dnech.</li>
          <li>Krátkodobé editační zámky se čistí po 24 hodinách.</li>
          <li>Volbu cookies uchováváme nejvýše 180 dnů.</li>
          <li>Záznam o marketingovém souhlasu můžeme po odvolání v omezeném rozsahu uchovat, pokud je to nutné k doložení respektování vaší volby a zákonných povinností.</li>
        </ul></section>

        <section><h2>10. Vaše práva</h2><p>Podle okolností máte právo na přístup, opravu, výmaz, omezení zpracování, přenositelnost a námitku. Souhlas s analytikou nebo marketingovými e-maily můžete kdykoli odvolat; odvolání nemá zpětný vliv na zákonnost předchozího zpracování.</p><p>Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů. Aktuální kontakty najdete na <a href="https://uoou.gov.cz/" target="_blank" rel="noreferrer">webu ÚOOÚ</a>.</p></section>

        <section><h2>11. Změny těchto informací</h2><p>Tuto stránku budeme aktualizovat, pokud se změní způsob zpracování, zapojení dodavatelé nebo právní požadavky. U podstatných změn, které vyžadují nový souhlas, si souhlas vyžádáme znovu.</p></section>
      </article>
      <SiteFooter />
    </main>
  );
}
