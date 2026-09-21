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
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import landing from '@/components/LandingPage.module.css';
import styles from './GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Privacy (GDPR) — Syllonaut' : 'Ochrana osobních údajů (GDPR) — Syllonaut',
    description: english
      ? 'How Syllonaut processes personal data, Terms acceptance and paid-contract evidence, cookies, account data, live lesson data, contact enquiries and marketing consent.'
      : 'Jak Syllonaut zpracovává osobní údaje, záznamy o přijetí obchodních podmínek a placených smlouvách, cookies, údaje z účtů, živých lekcí a marketingových souhlasů.',
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
          <div className={styles.meta}>{ui('Verze 1.5 · účinná od 21. 9. 2026', 'Version 1.5 · effective from 21 September 2026')}</div>
        </div>

        <section>
          <h2>{ui('1. Správce osobních údajů', '1. Data controller')}</h2>
          <p><strong>{PROVIDER_CONTACT.legalName}</strong><br />{ui('IČO', 'Business ID')}: {PROVIDER_CONTACT.businessId}<br />{PROVIDER_CONTACT.addressLine1}<br />{PROVIDER_CONTACT.postalCity}<br />{ui(PROVIDER_CONTACT.countryCs, PROVIDER_CONTACT.countryEn)}</p>
          <p>{ui('Správce provozuje službu Syllonaut na doméně', 'The controller operates Syllonaut at')} <strong>{PROVIDER_CONTACT.website}</strong>. {ui('Pro dotazy k ochraně soukromí nás můžete kontaktovat na', 'For privacy-related questions, contact')} <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a> {ui('nebo telefonu', 'or by phone at')} <a href={PROVIDER_CONTACT.phoneHref}>{PROVIDER_CONTACT.phoneDisplay}</a>.</p>
        </section>

        <section>
          <h2>{ui('2. Jaké údaje zpracováváme', '2. Data we process')}</h2>
          <ul>
            <li><strong>{ui('Účet učitele:', 'Teacher account:')}</strong> {ui('e-mailová adresa, technický identifikátor účtu, údaje o oprávněních a využití AI limitů.', 'email address, technical account identifier, entitlement data and AI usage-limit data.')}</li>
            <li><strong>{ui('Lekce a práce učitele:', 'Lessons and teacher work:')}</strong> {ui('zadání, vytvořené lekce, úpravy, názvy složek a další uložený obsah.', 'briefs, generated lessons, edits, folder names and other saved content.')}</li>
            <li><strong>{ui('Podklady pro tvorbu lekce:', 'Lesson source materials:')}</strong> {ui('text extrahovaný v prohlížeči. Originální soubor neopouští zařízení a extrahovaný text se v Syllonautu trvale neukládá.', 'text extracted in the browser. The original file does not leave the device and the extracted text is not permanently stored by Syllonaut.')}</li>
            <li><strong>{ui('Živé lekce:', 'Live lessons:')}</strong> {ui('zobrazované jméno studenta, odpovědi, týmové zařazení, výsledky, časy odevzdání a související provozní údaje.', 'student display name, responses, team assignment, results, submission times and related operational data.')}</li>
            <li><strong>{ui('Bezpečnost a provoz:', 'Security and operations:')}</strong> {ui('technické údaje nutné pro přihlášení, ochranu proti zneužití, diagnostiku chyb a zabezpečení.', 'technical data needed for sign-in, abuse prevention, error diagnostics and security.')}</li>
            <li><strong>{ui('Souhlas s obchodními podmínkami:', 'Terms acceptance:')}</strong> {ui('technický identifikátor účtu, verze podmínek / acceptance key a serverový čas přijetí. Do auditního záznamu nekopírujeme e-mail ani jiný přímý identifikátor.', 'technical account identifier, Terms version / acceptance key and server acceptance time. The audit record does not duplicate the email address or another direct identifier.')}</li>
            <li><strong>{ui('Přijetí DPA organizací:', 'Organisation DPA acceptance:')}</strong> {ui('u objednávky Team / School / Campus evidujeme aktivní verzi / acceptance key DPA, serverový čas přijetí a technický identifikátor účtu osoby, která DPA jménem organizace přijala.', 'for Team / School / Campus orders we record the active DPA version / acceptance key, server acceptance time and the technical account identifier of the person who accepted the DPA on behalf of the organisation.')}</li>
            <li><strong>{ui('Potvrzení placené individuální smlouvy:', 'Paid individual contract evidence:')}</strong> {ui('technický identifikátor účtu, tarif, fakturační období, cena a měna, verze / acceptance key obchodních podmínek, jazyk dokumentu, záznam výslovné žádosti o okamžité zahájení služby, neměnný HTML snapshot smluvních informací a vzorového formuláře pro odstoupení, kontrolní hash, serverový čas a technickou vazbu na Stripe Checkout. Do tohoto archivního snapshotu nekopírujeme e-mailovou adresu.', 'technical account identifier, plan, billing period, price and currency, Terms version / acceptance key, document language, the express request for immediate start of service, an immutable HTML snapshot of the contract information and model withdrawal form, integrity hash, server timestamp and technical Stripe Checkout link. The email address is not duplicated in this archived snapshot.')}</li>
            <li><strong>{ui('Online odstoupení od smlouvy:', 'Online contract withdrawal:')}</strong> {ui('jméno spotřebitele, elektronický kontakt pro potvrzení, identifikátor smluvního snapshotu, tarif a období, přesný obsah podání, serverové datum a čas, kontrolní hash, stav doručení potvrzovacího e-mailu a technické identifikátory navazujícího refund procesu.', 'consumer name, electronic contact for confirmation, contract-snapshot identifier, plan and period, exact submission content, server date and time, integrity hash, confirmation-email delivery status and technical identifiers of the related refund process.')}</li>
            <li><strong>{ui('Marketingový e-mailový souhlas:', 'Marketing email consent:')}</strong> {ui('zda jste se přihlásili k novinkám, případovým studiím a nabídkám, datum souhlasu a verze textu.', 'whether you opted in to news, case studies and offers, the consent date and the version of the consent text.')}</li>
            <li><strong>{ui('Kontaktní formulář:', 'Contact form:')}</strong> {ui('e-mailová adresa a text dotazu, který nám odešlete. Pro ochranu formuláře ukládáme po omezenou dobu pouze pseudonymizované hashe technických identifikátorů pro rate-limit, nikoli jejich čitelnou podobu.', 'the email address and message you submit. To protect the form, we temporarily retain only pseudonymised hashes of technical identifiers for rate limiting, not their readable form.')}</li>
            <li><strong>{ui('Analytika:', 'Analytics:')}</strong> {ui('až po souhlasu mohou být pomocí Google Analytics 4 zpracovávány údaje o návštěvě a používání webu v rozsahu konkrétního nastavení GA4.', 'only after consent, Google Analytics 4 may process website visit and usage data within the configured GA4 scope.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('3. Účely a právní základy', '3. Purposes and legal bases')}</h2>
          <div className={styles.tableWrap}><table><thead><tr><th>{ui('Účel', 'Purpose')}</th><th>{ui('Právní základ', 'Legal basis')}</th></tr></thead><tbody>
            <tr><td>{ui('Registrace, přihlášení, ukládání lekcí a poskytování funkcí služby', 'Registration, sign-in, lesson storage and provision of service features')}</td><td>{ui('Plnění smlouvy nebo kroky na žádost uživatele před jejím uzavřením (čl. 6 odst. 1 písm. b GDPR)', 'Performance of a contract or steps taken at the user’s request before entering into a contract (Art. 6(1)(b) GDPR)')}</td></tr>
            <tr><td>{ui('Evidence přijetí obchodních podmínek, obsahu placené smlouvy a ochrana právních nároků', 'Recording acceptance of the Terms, paid-contract content and protecting legal claims')}</td><td>{ui('Plnění smlouvy a oprávněný zájem na doložení vzniku a obsahu smluvního vztahu a na určení, výkonu nebo obhajobě právních nároků (čl. 6 odst. 1 písm. b a f GDPR)', 'Performance of the contract and legitimate interest in evidencing the formation and content of the contractual relationship and in establishing, exercising or defending legal claims (Art. 6(1)(b) and (f) GDPR)')}</td></tr>
            <tr><td>{ui('Přijetí odstoupení, potvrzení spotřebiteli, ukončení smlouvy a vypořádání platby', 'Receiving a withdrawal, confirming it to the consumer, terminating the contract and settling payment')}</td><td>{ui('Plnění smlouvy a zákonných povinností v oblasti ochrany spotřebitele a oprávněný zájem na doložení průběhu vypořádání (čl. 6 odst. 1 písm. b, c a f GDPR)', 'Performance of the contract, compliance with consumer-protection legal obligations and legitimate interest in evidencing the settlement process (Art. 6(1)(b), (c) and (f) GDPR)')}</td></tr>
            <tr><td>{ui('Evidence přijetí zpracovatelské smlouvy (DPA) organizací', 'Recording an organisation’s acceptance of the Data Processing Agreement (DPA)')}</td><td>{ui('Plnění smlouvy a oprávněný zájem na doložení závazné úpravy vztahu správce–zpracovatel podle čl. 28 GDPR a na ochraně právních nároků (čl. 6 odst. 1 písm. b a f GDPR)', 'Performance of the contract and legitimate interest in evidencing the binding controller–processor arrangement under Art. 28 GDPR and protecting legal claims (Art. 6(1)(b) and (f) GDPR)')}</td></tr>
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
          <p>{ui(
            'U tarifů Team / School / Campus je v rozsahu, v němž organizace určuje účely a prostředky zpracování osobních údajů studentů nebo pracovníků a používá k tomu Syllonaut, organizace správcem a Syllonaut zpracovatelem. Tento vztah upravuje závazná zpracovatelská smlouva (DPA), kterou oprávněný zástupce organizace výslovně přijímá při objednávce. U zpracování pro vlastní účely Syllonautu – zejména fakturace, účetnictví, zabezpečení, prevence podvodů a smluvní evidence – je Syllonaut samostatným správcem.',
            'For Team / School / Campus plans, where the organisation determines the purposes and means of processing student or staff personal data and uses Syllonaut for that processing, the organisation is the controller and Syllonaut is the processor. This relationship is governed by a binding Data Processing Agreement (DPA), expressly accepted by an authorised representative when the organisation places the order. For Syllonaut’s own purposes – in particular billing, accounting, security, fraud prevention and contract evidence – Syllonaut acts as an independent controller.'
          )} <Link href={`/${locale}/dpa`}>{ui('Aktuální DPA', 'Current DPA')}</Link>.</p>
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
          <p>{ui(
            'Aktuální seznam dalších zpracovatelů relevantních pro organizace, jejich účel, rozsah dat a pravidla změn je součástí',
            'The current list of sub-processors relevant to organisations, their purposes, data scope and change procedure is included in the'
          )} <Link href={`/${locale}/dpa`}>{ui('zpracovatelské smlouvy (DPA)', 'Data Processing Agreement (DPA)')}</Link>.</p>
        </section>

        <section>
          <h2>{ui('9. Doba uchování', '9. Retention periods')}</h2>
          <ul>
            <li>{ui('Údaje účtu a uložené lekce uchováváme po dobu aktivního účtu nebo do jejich smazání, pokud právní povinnost nevyžaduje delší uchování.', 'Account data and saved lessons are retained while the account is active or until deletion, unless a legal obligation requires longer retention.')}</li>
            <li>{ui('Ukončené živé sessions jsou určeny k automatickému smazání po 12 měsících.', 'Ended live sessions are scheduled for automatic deletion after 12 months.')}</li>
            <li>{ui('Opuštěné session ve stavu lobby/live jsou určeny k automatickému smazání po 30 dnech.', 'Abandoned sessions left in lobby/live state are scheduled for automatic deletion after 30 days.')}</li>
            <li>{ui('Krátkodobé editační zámky se čistí po 24 hodinách.', 'Short-lived editing locks are cleared after 24 hours.')}</li>
            <li>{ui('Volbu cookies uchováváme nejvýše 180 dnů.', 'Cookie choices are retained for no more than 180 days.')}</li>
            <li>{ui('Auditní záznam přijetí obchodních podmínek (ID účtu, verze / acceptance key a serverový čas) můžeme uchovat i po zrušení účtu po dobu, kdy je to přiměřeně nutné k doložení smluvního vztahu nebo k určení, výkonu či obhajobě právních nároků; poté jej smažeme nebo anonymizujeme.', 'A Terms acceptance audit record (account ID, version / acceptance key and server timestamp) may be retained after account deletion for as long as reasonably necessary to evidence the contractual relationship or to establish, exercise or defend legal claims; it is then deleted or anonymised.')}</li>
            <li>{ui('Záznam přijetí DPA organizací (verze / acceptance key, serverový čas a ID účtu přijímající osoby) můžeme uchovat po dobu přiměřeně nutnou k doložení závazné zpracovatelské smlouvy a k určení, výkonu či obhajobě právních nároků; poté jej smažeme nebo anonymizujeme, pokud další uchování nevyžaduje zákon.', 'An organisation DPA acceptance record (version / acceptance key, server timestamp and accepting account ID) may be retained for as long as reasonably necessary to evidence the binding processing agreement and to establish, exercise or defend legal claims; it is then deleted or anonymised unless further retention is legally required.')}</li>
            <li>{ui('Neměnný snapshot placené individuální smlouvy (ID účtu, tarif, cena, fakturační období, odsouhlasená verze podmínek, žádost o okamžité zahájení, smluvní HTML dokument, vzorový formulář, hash a technická vazba na checkout) můžeme rovněž uchovat i po zrušení účtu pouze po dobu přiměřeně nutnou k doložení obsahu smlouvy, splnění zákonných povinností nebo k určení, výkonu či obhajobě právních nároků; poté jej smažeme nebo anonymizujeme v rozsahu, v němž to účel dovoluje.', 'An immutable paid individual contract snapshot (account ID, plan, price, billing period, accepted Terms version, immediate-start request, contract HTML document, model withdrawal form, integrity hash and technical checkout link) may likewise be retained after account deletion only for as long as reasonably necessary to evidence the contract content, comply with legal obligations or establish, exercise or defend legal claims; it is then deleted or anonymised to the extent the purpose allows.')}</li>
            <li>{ui('Neměnný záznam odstoupení a související vypořádání uchováváme pouze po dobu přiměřeně nutnou k doložení přijetí a obsahu podání, splnění spotřebitelských a účetních povinností a k určení, výkonu či obhajobě právních nároků; poté údaje smažeme nebo anonymizujeme v rozsahu, v němž to účel dovoluje.', 'The immutable withdrawal record and related settlement are retained only for as long as reasonably necessary to evidence receipt and content of the submission, comply with consumer and accounting obligations, and establish, exercise or defend legal claims; the data is then deleted or anonymised to the extent the purpose allows.')}</li>
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
