import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import MarketingEmailPreferences from '@/components/MarketingEmailPreferences';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from './GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Privacy (GDPR) — Syllonaut' : 'Ochrana osobních údajů (GDPR) — Syllonaut',
    description: english
      ? 'How Syllonaut processes personal data, cookies, account data, live lesson data, contact enquiries and marketing consent.'
      : 'Jak Syllonaut zpracovává osobní údaje, cookies, údaje z účtů, živých lekcí a marketingových souhlasů.',
    alternates: {
      canonical: `/${locale}/gdpr`,
      languages: {
        cs: '/cs/gdpr',
        en: '/en/gdpr',
        'x-default': '/en/gdpr',
      },
    },
    robots: { index: true, follow: true },
  };
}

export default async function GdprPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const accountUser = userId ? {
    id: userId,
    email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown>
      : {},
  } : null;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}><SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span></Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
          {accountUser ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          {accountUser ? <PublicHeaderAccountMenu user={accountUser} /> : null}
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
          <HeaderMobileNav signedIn={Boolean(accountUser)} current="home" />
        </div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Ochrana soukromí', 'Privacy')}</span>
          <h1>{ui('Ochrana osobních údajů (GDPR)', 'Privacy and personal data (GDPR)')}</h1>
          <p>{ui(
            'Tato stránka popisuje, jaké osobní údaje Syllonaut zpracovává, proč je potřebuje, jak dlouho je uchovává a jaká máte práva.',
            'This page explains which personal data Syllonaut processes, why it is needed, how long it is retained and what rights you have.'
          )}</p>
          <div className={styles.meta}>{ui('Verze 1.1 · účinná od 20. 9. 2026', 'Version 1.1 · effective from 20 September 2026')}</div>
        </div>

        <section>
          <h2>{ui('1. Správce osobních údajů', '1. Data controller')}</h2>
          <p><strong>Václav Loubek</strong><br />Slepá 868<br />289 23 Milovice<br />{ui('Česká republika', 'Czech Republic')}</p>
          <p>{ui('Správce provozuje službu Syllonaut na doméně', 'The controller operates Syllonaut at')} <strong>syllonaut.com</strong>. {ui('Pro dotazy k ochraně soukromí nás můžete kontaktovat na', 'For privacy-related questions, contact')} <a href="mailto:vaclav@syllonaut.com">vaclav@syllonaut.com</a>.</p>
        </section>

        <section>
          <h2>{ui('2. Jaké údaje zpracováváme', '2. Data we process')}</h2>
          <ul>
            <li><strong>{ui('Účet učitele:', 'Teacher account:')}</strong> {ui('e-mailová adresa, technický identifikátor účtu, údaje o oprávněních a využití AI limitů.', 'email address, technical account identifier, entitlement data and AI usage-limit data.')}</li>
            <li><strong>{ui('Lekce a práce učitele:', 'Lessons and teacher work:')}</strong> {ui('zadání, vytvořené lekce, úpravy, názvy složek a další uložený obsah.', 'briefs, generated lessons, edits, folder names and other saved content.')}</li>
            <li><strong>{ui('Podklady pro tvorbu lekce:', 'Lesson source materials:')}</strong> {ui('text extrahovaný v prohlížeči. Originální soubor neopouští zařízení a extrahovaný text se v Syllonautu trvale neukládá.', 'text extracted in the browser. The original file does not leave the device and the extracted text is not permanently stored by Syllonaut.')}</li>
            <li><strong>{ui('Živé lekce:', 'Live lessons:')}</strong> {ui('zobrazované jméno studenta, odpovědi, týmové zařazení, výsledky, časy odevzdání a související provozní údaje.', 'student display name, responses, team assignment, results, submission times and related operational data.')}</li>
            <li><strong>{ui('Bezpečnost a provoz:', 'Security and operations:')}</strong> {ui('technické údaje nutné pro přihlášení, ochranu proti zneužití, diagnostiku chyb a zabezpečení.', 'technical data needed for sign-in, abuse prevention, error diagnostics and security.')}</li>
            <li><strong>{ui('Kontaktní dotazy:', 'Contact enquiries:')}</strong> {ui('e-mailová adresa a text zprávy, které odešlete přes kontaktní formulář. Pro ochranu formuláře ukládáme nejvýše 30 dnů pouze pseudonymní HMAC otisky klienta a e-mailu, nikoli samotnou IP adresu.', 'email address and message text submitted through the contact form. To protect the form, we retain only pseudonymous HMAC hashes of the client and email for up to 30 days, not the raw IP address.')}</li>
            <li><strong>{ui('Marketingový e-mailový souhlas:', 'Marketing email consent:')}</strong> {ui('zda jste se přihlásili k novinkám, případovým studiím a nabídkám, datum souhlasu a verze textu.', 'whether you opted in to news, case studies and offers, the consent date and the version of the consent text.')}</li>
            <li><strong>{ui('Kontaktní formulář:', 'Contact form:')}</strong> {ui('e-mailová adresa a text dotazu, který nám odešlete. Pro ochranu formuláře ukládáme po omezenou dobu pouze pseudonymizované hashe technických identifikátorů pro rate-limit, nikoli jejich čitelnou podobu.', 'the email address and message you submit. To protect the form, we temporarily retain only pseudonymised hashes of technical identifiers for rate limiting, not their readable form.')}</li>
            <li><strong>{ui('Analytika:', 'Analytics:')}</strong> {ui('až po souhlasu mohou být pomocí Google Analytics 4 zpracovávány údaje o návštěvě a používání webu v rozsahu konkrétního nastavení GA4.', 'only after consent, Google Analytics 4 may process website visit and usage data within the configured GA4 scope.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('3. Účely a právní základy', '3. Purposes and legal bases')}</h2>
          <div className={styles.tableWrap}><table><thead><tr><th>{ui('Účel', 'Purpose')}</th><th>{ui('Právní základ', 'Legal basis')}</th></tr></thead><tbody>
            <tr><td>{ui('Registrace, přihlášení, ukládání lekcí a poskytování funkcí služby', 'Registration, sign-in, lesson storage and provision of service features')}</td><td>{ui('Plnění smlouvy nebo kroky na žádost uživatele před jejím uzavřením (čl. 6 odst. 1 písm. b GDPR)', 'Performance of a contract or steps taken at the user’s request before entering into a contract (Art. 6(1)(b) GDPR)')}</td></tr>
            <tr><td>{ui('Vyřízení dotazu odeslaného kontaktním formulářem', 'Handling an enquiry submitted through the contact form')}</td><td>{ui('Kroky na žádost uživatele před uzavřením smlouvy nebo oprávněný zájem na komunikaci s uživateli podle povahy dotazu (čl. 6 odst. 1 písm. b nebo f GDPR)', 'Steps taken at the user’s request before entering into a contract, or legitimate interest in communicating with users depending on the nature of the enquiry (Art. 6(1)(b) or (f) GDPR)')}</td></tr>
            <tr><td>{ui('Zabezpečení služby, prevence zneužití a technická diagnostika', 'Service security, abuse prevention and technical diagnostics')}</td><td>{ui('Oprávněný zájem na bezpečném a spolehlivém provozu (čl. 6 odst. 1 písm. f GDPR)', 'Legitimate interest in secure and reliable operation (Art. 6(1)(f) GDPR)')}</td></tr>
            <tr><td>{ui('Plnění zákonných povinností', 'Compliance with legal obligations')}</td><td>{ui('Právní povinnost (čl. 6 odst. 1 písm. c GDPR)', 'Legal obligation (Art. 6(1)(c) GDPR)')}</td></tr>
            <tr><td>{ui('Analytika webu pomocí GA4', 'Website analytics using GA4')}</td><td>{ui('Souhlas (čl. 6 odst. 1 písm. a GDPR); bez souhlasu se GA4 nenačte', 'Consent (Art. 6(1)(a) GDPR); GA4 does not load without consent')}</td></tr>
            <tr><td>{ui('Novinky, případové studie a akční nabídky e-mailem', 'News, case studies and promotional offers by email')}</td><td>{ui('Dobrovolný souhlas; registrace není tímto souhlasem podmíněna', 'Voluntary consent; registration is not conditional on this consent')}</td></tr>
            <tr><td>{ui('Vyřízení dotazu odeslaného kontaktním formulářem', 'Handling an enquiry submitted through the contact form')}</td><td>{ui('Kroky na žádost uživatele před uzavřením smlouvy, pokud se dotaz týká nákupu či spolupráce, jinak oprávněný zájem na odpovědi na přijatý dotaz', 'Steps taken at the user’s request before entering into a contract where the enquiry concerns purchase or cooperation; otherwise legitimate interest in responding to an incoming enquiry')}</td></tr>
          </tbody></table></div>
        </section>

        <section>
          <h2>{ui('4. Marketingové e-maily', '4. Marketing emails')}</h2>
          <p>{ui(
            'Při registraci můžete samostatně a dobrovolně souhlasit se zasíláním novinek, případových studií a akčních nabídek. Pole není předem zaškrtnuté. Souhlas lze kdykoli odvolat; každý marketingový e-mail musí obsahovat jednoduchou možnost odhlášení. Odvolání souhlasu nemá vliv na používání účtu ani na provozní e-maily související se službou.',
            'During registration you can separately and voluntarily consent to receiving news, case studies and promotional offers. The checkbox is not preselected. Consent can be withdrawn at any time; every marketing email must provide a simple unsubscribe option. Withdrawing consent does not affect use of your account or operational emails related to the service.'
          )}</p>
          <MarketingEmailPreferences />
        </section>

        <section>
          <h2>{ui('5. Cookies a Google Analytics 4', '5. Cookies and Google Analytics 4')}</h2>
          <p>{ui('Nezbytné cookies používáme pro přihlášení, bezpečnost, ochranu proti zneužití a uložení vaší volby cookies. Analytické cookies jsou ve výchozím stavu vypnuté a odmítnutí analytiky neomezuje používání služby.', 'We use essential cookies for sign-in, security, abuse prevention and storing your cookie choice. Analytics cookies are disabled by default, and refusing analytics does not restrict use of the service.')}</p>
          <div className={styles.tableWrap}><table><thead><tr><th>{ui('Technologie', 'Technology')}</th><th>{ui('Účel', 'Purpose')}</th><th>{ui('Doba', 'Duration')}</th></tr></thead><tbody>
            <tr><td><code>syllonaut_cookie_consent_v1</code></td><td>{ui('Uložení vaší volby cookies; nezbytné.', 'Stores your cookie choice; essential.')}</td><td>{ui('Nejvýše 180 dnů.', 'Up to 180 days.')}</td></tr>
            <tr><td>Supabase {ui('autentizační cookies', 'authentication cookies')} (<code>sb-…-auth-token</code>, {ui('případně rozdělené do více cookies', 'possibly split across multiple cookies')})</td><td>{ui('Přihlášení a bezpečné obnovení relace; nezbytné.', 'Sign-in and secure session restoration; essential.')}</td><td>{ui('Po dobu relace podle nastavení autentizace, nejdéle do odhlášení nebo expirace příslušných tokenů.', 'For the authentication session, at most until sign-out or expiry of the relevant tokens.')}</td></tr>
            <tr><td>Cloudflare Turnstile</td><td>{ui('Ochrana registračních a přihlašovacích formulářů proti zneužití; může používat technické identifikátory nutné pro bezpečnost.', 'Protects registration and sign-in forms from abuse; may use technical identifiers required for security.')}</td><td>{ui('Podle bezpečnostní relace a nastavení poskytovatele.', 'According to the security session and provider settings.')}</td></tr>
            <tr><td><code>_ga</code>, <code>_ga_*</code></td><td>Google Analytics 4 — {ui('měření návštěvnosti a používání služby; pouze po souhlasu.', 'measurement of traffic and service usage; only after consent.')}</td><td>{ui('V konfiguraci Syllonautu přibližně 13 měsíců.', 'Approximately 13 months in Syllonaut’s configuration.')}</td></tr>
          </tbody></table></div>
          <p>{ui('Google Analytics 4 se načte pouze po aktivním souhlasu a pouze tehdy, když je v produkční konfiguraci nastaveno měření. V této verzi GA4 nepovolujeme reklamní signály ani personalizaci reklamy. Pokud později přidáme remarketing, Google Ads nebo jiný marketingový tracking, aktualizujeme tyto informace a v případě potřeby si vyžádáme nový souhlas.', 'Google Analytics 4 loads only after active consent and only when measurement is configured in production. In this version, GA4 advertising signals and ad personalisation are disabled. If remarketing, Google Ads or other marketing tracking is added later, these notices will be updated and new consent will be requested where required.')}</p>
          <p>{ui('Volbu lze kdykoli změnit přes odkaz', 'You can change your choice at any time using the')} <strong>{ui('Nastavení cookies', 'Cookie settings')}</strong> {ui('v patičce. Při odvolání analytického souhlasu Syllonaut další měření zablokuje a pokusí se odstranit existující GA cookies na doméně Syllonautu.', 'link in the footer. When analytics consent is withdrawn, Syllonaut blocks further measurement and attempts to remove existing GA cookies on the Syllonaut domain.')}</p>
        </section>

        <section>
          <h2>{ui('6. AI a nahrané podklady', '6. AI and uploaded source materials')}</h2>
          <p>{ui('AI pracuje s textem potřebným k vytvoření, úpravě nebo vyhodnocení lekce. Pro současné AI cesty je na úrovni Vercel AI Gateway vynucen režim zero data retention. U podporovaných podkladů probíhá extrakce textu v prohlížeči; originální soubor není odesílán na server Syllonautu a extrahovaný text se trvale neukládá jako souborový archiv.', 'AI processes text needed to create, edit or evaluate a lesson. Current AI paths enforce zero data retention at the Vercel AI Gateway level. For supported source materials, text extraction happens in the browser; the original file is not sent to the Syllonaut server and extracted text is not permanently stored as a file archive.')}</p>
          <p>{ui('Do zadání ani podkladů nevkládejte osobní údaje, které nejsou pro výuku nezbytné, zejména citlivé údaje studentů.', 'Do not include personal data that is unnecessary for teaching in briefs or source materials, especially sensitive student data.')}</p>
        </section>

        <section>
          <h2>{ui('7. Studenti a školní použití', '7. Students and school use')}</h2>
          <p>{ui('Student pro připojení k živé lekci nepotřebuje plnohodnotný účet. Zadává zobrazované jméno a během výuky může odesílat odpovědi. Učitel by měl požadovat jen takové označení studenta, které je pro konkrétní hodinu potřebné.', 'A student does not need a full account to join a live lesson. They enter a display name and may submit responses during the lesson. Teachers should request only the student identifier needed for the specific lesson.')}</p>
          <p>{ui('U budoucích školních účtů může být správcem osobních údajů škola a Syllonaut jejím zpracovatelem. Konkrétní role a smluvní podmínky budou před komerčním školním nasazením upraveny samostatně.', 'For future school accounts, the school may act as data controller and Syllonaut as its processor. Specific roles and contractual terms will be addressed separately before commercial school deployment.')}</p>
        </section>

        <section>
          <h2>{ui('8. Dodavatelé', '8. Service providers')}</h2>
          <ul>
            <li><strong>Supabase</strong> — {ui('autentizace a databázová infrastruktura.', 'authentication and database infrastructure.')}</li>
            <li><strong>Vercel</strong> — {ui('hosting aplikace a AI Gateway.', 'application hosting and AI Gateway.')}</li>
            <li><strong>Cloudflare</strong> — Turnstile {ui('pro ochranu formulářů.', 'for form protection.')}</li>
            <li><strong>Resend</strong> — {ui('transakční e-maily, marketingové rozesílky podle uděleného souhlasu a doručení zpráv z kontaktního formuláře.', 'transactional emails, marketing mailings based on granted consent and delivery of contact-form enquiries.')}</li>
            <li><strong>{ui('Poskytovatelé AI modelů', 'AI model providers')}</strong> — {ui('jen v rozsahu potřebném pro konkrétní AI operaci.', 'only to the extent needed for the specific AI operation.')}</li>
            <li><strong>Google</strong> — Google Analytics 4, {ui('až po aktivaci a pouze po souhlasu s analytikou.', 'once activated and only after analytics consent.')}</li>
          </ul>
          <p>{ui('Pokud konkrétní dodavatel předává osobní údaje mimo Evropský hospodářský prostor, musí být použito odpovídající právní zajištění podle GDPR.', 'Where a provider transfers personal data outside the European Economic Area, appropriate GDPR transfer safeguards must be used.')}</p>
        </section>

        <section>
          <h2>{ui('9. Doba uchování', '9. Retention periods')}</h2>
          <ul>
            <li>{ui('Údaje účtu a uložené lekce uchováváme po dobu aktivního účtu nebo do jejich smazání, pokud právní povinnost nevyžaduje delší uchování.', 'Account data and saved lessons are retained while the account is active or until deletion, unless a legal obligation requires longer retention.')}</li>
            <li>{ui('Ukončené živé sessions jsou určeny k automatickému smazání po 12 měsících.', 'Ended live sessions are scheduled for automatic deletion after 12 months.')}</li>
            <li>{ui('Opuštěné session ve stavu lobby/live jsou určeny k automatickému smazání po 30 dnech.', 'Abandoned sessions left in lobby/live state are scheduled for automatic deletion after 30 days.')}</li>
            <li>{ui('Krátkodobé editační zámky se čistí po 24 hodinách.', 'Short-lived editing locks are cleared after 24 hours.')}</li>
            <li>{ui('Volbu cookies uchováváme nejvýše 180 dnů.', 'Cookie choices are retained for no more than 180 days.')}</li>
            <li>{ui('Kontaktní dotazy uchováváme po dobu nezbytnou k jejich vyřízení a případné navazující komunikaci. Pseudonymní záznamy používané pouze pro rate-limit formuláře se průběžně mažou po 30 dnech.', 'Contact enquiries are retained for as long as needed to handle them and any related follow-up communication. Pseudonymous records used only for form rate limiting are continuously deleted after 30 days.')}</li>
            <li>{ui('Záznam o marketingovém souhlasu můžeme po odvolání v omezeném rozsahu uchovat, pokud je to nutné k doložení respektování vaší volby a zákonných povinností.', 'After withdrawal, a limited record of marketing consent may be retained where necessary to demonstrate that your choice and legal obligations were respected.')}</li>
            <li>{ui('Obsah dotazu z kontaktního formuláře uchováváme po dobu nutnou k vyřízení a případné navazující komunikaci; pokud nevznikne smluvní vztah ani jiný důvod k delšímu uchování, zprávu standardně nepotřebujeme déle než 12 měsíců. Pseudonymizované záznamy rate-limitu se průběžně mažou po 30 dnech.', 'Contact-form messages are retained for the time needed to respond and handle related follow-up; if no contractual relationship or other reason for longer retention arises, we generally do not need the message for more than 12 months. Pseudonymised rate-limit records are continuously deleted after 30 days.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('10. Vaše práva', '10. Your rights')}</h2>
          <p>{ui('Podle okolností máte právo na přístup, opravu, výmaz, omezení zpracování, přenositelnost a námitku. Souhlas s analytikou nebo marketingovými e-maily můžete kdykoli odvolat; odvolání nemá zpětný vliv na zákonnost předchozího zpracování.', 'Depending on the circumstances, you have rights of access, rectification, erasure, restriction, data portability and objection. You can withdraw consent to analytics or marketing emails at any time; withdrawal does not retrospectively affect the lawfulness of prior processing.')}</p>
          <p>{ui('Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů. Aktuální kontakty najdete na', 'You also have the right to lodge a complaint with the Czech Office for Personal Data Protection. Current contact details are available on the')} <a href="https://uoou.gov.cz/" target="_blank" rel="noreferrer">{ui('webu ÚOOÚ', 'authority website')}</a>.</p>
        </section>

        <section>
          <h2>{ui('11. Změny těchto informací', '11. Changes to this notice')}</h2>
          <p>{ui('Tuto stránku budeme aktualizovat, pokud se změní způsob zpracování, zapojení dodavatelé nebo právní požadavky. U podstatných změn, které vyžadují nový souhlas, si souhlas vyžádáme znovu.', 'This page will be updated if processing practices, service providers or legal requirements change. If a material change requires new consent, consent will be requested again.')}</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
