import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { DPA_VERSION, TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/lib/legal';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import {
  TERMS_ACCOUNT_DELETION_CLAUSE,
  TERMS_AI_SCORING_PURPOSE_CLAUSE,
  TERMS_ONLINE_WITHDRAWAL_NOTICE,
  TERMS_COMPLAINT_CLAUSE,
  TERMS_PLAN_PRICING_CLAUSE,
  TERMS_SERVICE_CHANGE_CLAUSE,
  TERMS_TECHNICAL_REQUIREMENTS_CLAUSE,
  TERMS_WITHDRAWAL_CLAUSE,
} from '@/lib/terms-content';
import { WITHDRAWAL_FORM_COPY } from '@/lib/withdrawal-form';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Terms of Service — Syllonaut' : 'Obchodní podmínky — Syllonaut',
    description: english
      ? 'Terms governing Syllonaut accounts, subscriptions, payments, use of AI features and consumer rights.'
      : 'Podmínky používání Syllonautu, účtů, předplatného, plateb, AI funkcí a práva spotřebitelů.',
    alternates: {
      canonical: `/${locale}/terms`,
      languages: { cs: '/cs/terms', en: '/en/terms', 'x-default': '/en/terms' },
    },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const withdrawalForm = WITHDRAWAL_FORM_COPY[locale];
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
          <span className={styles.eyebrow}>{ui('Právní informace', 'Legal')}</span>
          <h1>{ui('Obchodní podmínky', 'Terms of Service')}</h1>
          <p>{ui(
            'Tyto podmínky upravují používání služby Syllonaut, bezplatné účty i placené tarify pro jednotlivce a organizace.',
            'These Terms govern use of Syllonaut, including Free accounts and paid plans for individuals and organizations.'
          )}</p>
          <div className={styles.meta}>{ui(
            `Verze ${TERMS_VERSION} · účinná od 23. 9. 2026`,
            `Version ${TERMS_VERSION} · effective 23 September 2026`
          )}</div>
        </div>

        <section>
          <h2>{ui('1. Poskytovatel služby', '1. Service provider')}</h2>
          <p><strong>{PROVIDER_CONTACT.legalName}</strong><br />{ui('IČO', 'Business ID')}: {PROVIDER_CONTACT.businessId}<br />{PROVIDER_CONTACT.addressLine1}<br />{PROVIDER_CONTACT.postalCity}<br />{ui(PROVIDER_CONTACT.countryCs, PROVIDER_CONTACT.countryEn)}</p>
          <p>
            {ui('Telefon:', 'Phone:')} <a href={PROVIDER_CONTACT.phoneHref}>{PROVIDER_CONTACT.phoneDisplay}</a><br />
            {ui('E-mail:', 'Email:')} <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a><br />
            {ui('Web:', 'Website:')} <strong>{PROVIDER_CONTACT.website}</strong>
          </p>
          <p>{ui(
            'Tyto obchodní podmínky tvoří součást smlouvy mezi poskytovatelem a uživatelem služby Syllonaut.',
            'These Terms form part of the contract between the provider and each Syllonaut user.'
          )}</p>
        </section>

        <section>
          <h2>{ui('2. Služba a vznik smlouvy', '2. Service and formation of the contract')}</h2>
          <p>{ui(
            'Syllonaut je online služba pro přípravu, úpravu, vedení a vyhodnocování interaktivních lekcí s využitím AI. Smlouva k Free účtu vzniká dokončením registrace po odsouhlasení těchto podmínek. U placeného tarifu vzniká placený smluvní vztah dokončením objednávky; aktivace placených oprávnění nastává podle zvoleného způsobu platby po potvrzení platby.',
            'Syllonaut is an online service for preparing, refining, running and evaluating interactive lessons with AI. The Free-account contract is formed when registration is completed after accepting these Terms. A paid contract is formed when the paid order is completed; paid entitlements activate according to the selected payment method after payment is confirmed.'
          )}</p>
          <p>{ui(
            'Jedná-li osoba za školu, firmu nebo jinou organizaci, potvrzuje, že je oprávněna organizaci zavázat. U školních tarifů je vlastníkem organizace účet, který objednávku vytvořil, dokud nedojde k platnému převodu role.',
            'A person acting for a school, company or other organization confirms that they are authorized to bind that organization. For school plans, the account creating the order is the organization owner until the role is validly transferred.'
          )}</p>
          <p>{ui(
            'Pokud organizace používá Syllonaut ke zpracování osobních údajů studentů nebo pracovníků a Syllonaut v tomto rozsahu vystupuje jako zpracovatel, je součástí smlouvy také samostatná zpracovatelská smlouva (DPA). Organizace ji při objednávce výslovně přijímá vedle těchto VOP.',
            'Where an organisation uses Syllonaut to process personal data of students or staff and Syllonaut acts as processor for that processing, the separate Data Processing Agreement (DPA) also forms part of the contract. The organisation expressly accepts it alongside these Terms when placing the order.'
          )} <Link href={`/${locale}/dpa`}>{ui(`DPA verze ${DPA_VERSION}`, `DPA version ${DPA_VERSION}`)}</Link>.</p>
          <p>{TERMS_TECHNICAL_REQUIREMENTS_CLAUSE[english ? 'en' : 'cs']}</p>
        </section>

        <section>
          <h2>{ui('3. Účet a bezpečnost', '3. Account and security')}</h2>
          <ul>
            <li>{ui('Uživatel uvádí pravdivé údaje a chrání své přihlašovací údaje.', 'Users must provide accurate information and protect their sign-in credentials.')}</li>
            <li>{ui('Účet je určen konkrétnímu uživateli; obcházení limitů sdílením účtu nebo jiným technickým způsobem není dovoleno.', 'An account is assigned to a specific user; bypassing limits by account sharing or other technical means is not permitted.')}</li>
            <li>{ui('Studenti se k živé lekci mohou připojit bez plnohodnotného účtu. Za přiměřené a zákonné použití Syllonautu ve výuce odpovídá učitel nebo organizace, která výuku vede.', 'Students may join a live lesson without a full account. The teacher or organization running the lesson is responsible for appropriate and lawful classroom use of Syllonaut.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('4. AI funkce a obsah', '4. AI features and content')}</h2>
          <p>{ui(
            'Výstupy AI mohou obsahovat nepřesnosti nebo nevhodné návrhy. Učitel musí před použitím ve výuce zkontrolovat věcnou správnost, přiměřenost věku, bezpečnost a vhodnost obsahu. Syllonaut nenahrazuje odborný úsudek učitele.',
            'AI outputs may contain inaccuracies or unsuitable suggestions. Before classroom use, the teacher must review factual accuracy, age appropriateness, safety and suitability. Syllonaut does not replace professional teacher judgment.'
          )}</p>
          <p>{TERMS_AI_SCORING_PURPOSE_CLAUSE[english ? 'en' : 'cs']}</p>
          <p>{ui(
            'Uživatel zůstává odpovědný za obsah, který do služby vloží, a musí mít právo jej používat. Poskytovateli uděluje pouze takové oprávnění k technickému zpracování obsahu, které je nutné pro provoz služby a vyžádané AI operace.',
            'Users remain responsible for content they submit and must have the right to use it. They grant the provider only the rights needed to technically process that content to operate the service and perform requested AI operations.'
          )}</p>
          <p>{ui('Podrobnosti o zpracování osobních údajů a AI dodavatelích jsou v', 'Details about personal-data processing and AI providers are in the')} <Link href={`/${locale}/gdpr`}>{ui('zásadách ochrany osobních údajů', 'Privacy Notice')}</Link>.</p>
        </section>

        <section>
          <h2>{ui('5. Tarify, ceny a AI limity', '5. Plans, prices and AI allowances')}</h2>
          <p>{english ? TERMS_PLAN_PRICING_CLAUSE.en : TERMS_PLAN_PRICING_CLAUSE.cs}</p>
          <p>{ui(
            'AI limity se vztahují na operace uvedené u daného tarifu. Nevyčerpané měsíční kvóty se nepřevádějí, není-li výslovně uvedeno jinak. Poskytovatel může zavést přiměřené technické a bezpečnostní limity bránící zneužití služby.',
            'AI allowances apply to the operations listed for the relevant plan. Unused monthly allowances do not roll over unless expressly stated otherwise. The provider may apply reasonable technical and security limits to prevent abuse.'
          )}</p>
        </section>

        <section>
          <h2>{ui('6. Platby, obnovení a zrušení předplatného', '6. Payments, renewals and cancellation')}</h2>
          <p>{ui(
            'Individuální placené tarify hrazené kartou se obnovují automaticky po zvoleném měsíčním nebo ročním období, dokud uživatel automatické obnovení nezruší. Správa předplatného, faktur a zrušení je dostupná v části Předplatné a prostřednictvím zákaznického portálu Stripe.',
            'Individual paid plans purchased by card renew automatically for the selected monthly or annual billing period until automatic renewal is cancelled. Subscription, invoices and cancellation can be managed in the Subscription area and through the Stripe customer portal.'
          )}</p>
          <p>{ui(
            'U školních tarifů se režim obnovení řídí zvoleným způsobem platby. Kartové předplatné se může obnovovat automaticky; objednávky na fakturu se obnovují až novou objednávkou nebo fakturou. Zrušení automatického obnovení neukončuje již zaplacené období.',
            'For school plans, renewal depends on the selected payment method. Card subscriptions may renew automatically; invoice-based plans renew only through a new order or invoice. Cancelling automatic renewal does not end a period that has already been paid for.'
          )}</p>
          <p>{ui(
            'Pokud platba není potvrzena, je po splatnosti, je vrácena nebo je předmětem sporu, může Syllonaut dočasně omezit nové placené AI operace nebo po uplynutí oznámené lhůty pozastavit placená oprávnění. Existující obsah je zachován v rozsahu popsaném v aplikaci.',
            'If payment is unconfirmed, overdue, refunded or disputed, Syllonaut may temporarily restrict new paid AI operations or suspend paid entitlements after the stated grace period. Existing content remains available to the extent described in the application.'
          )}</p>
        </section>

        <section>
          <h2>{ui('7. Spotřebitelé: právo odstoupit do 14 dnů', '7. Consumers: 14-day withdrawal right')}</h2>
          <p>{ui(
            'Jste-li spotřebitel, můžete od smlouvy uzavřené na dálku zpravidla odstoupit do 14 dnů od jejího uzavření bez uvedení důvodu. Odstoupení stačí v této lhůtě odeslat na vaclav@syllonaut.com jednoznačným prohlášením.',
            'If you are a consumer, you generally have 14 days from conclusion of a distance contract to withdraw without giving a reason. It is sufficient to send an unequivocal withdrawal statement within that period to vaclav@syllonaut.com.'
          )}</p>
          <p>{ui(
            TERMS_WITHDRAWAL_CLAUSE.cs,
            TERMS_WITHDRAWAL_CLAUSE.en
          )}</p>
          <p>{TERMS_ONLINE_WITHDRAWAL_NOTICE[english ? 'en' : 'cs']} {ui(
            'Tato funkce je určena spotřebitelům s individuální placenou smlouvou a je dostupná po celou 14denní lhůtu. Odstoupení e-mailem nebo poštou zůstává možné.',
            'This function is intended for consumers with an individual paid contract and is available throughout the 14-day period. Withdrawal by email or post remains available.',
          )}</p>
          <h3>{withdrawalForm.title}</h3>
          <p>{withdrawalForm.instruction}</p>
          <p><strong>{withdrawalForm.addressee}:</strong><br />{PROVIDER_CONTACT.legalName}<br />{PROVIDER_CONTACT.addressLine1}<br />{PROVIDER_CONTACT.postalCity}<br />{ui(PROVIDER_CONTACT.countryCs, PROVIDER_CONTACT.countryEn)}<br />{ui('E-mail', 'Email')}: {PROVIDER_CONTACT.email}</p>
          <p>{withdrawalForm.statement}</p>
          <ul>
            <li>{withdrawalForm.ordered}</li><li>{withdrawalForm.names}</li><li>{withdrawalForm.address}</li><li>{withdrawalForm.signature}</li><li>{withdrawalForm.date}</li>
          </ul>
          <p>{withdrawalForm.note} <Link href={`/${locale}/withdrawal`}>{ui('Formulář k vytištění a online postup', 'Printable form and online process')}</Link>.</p>
          <p>{ui(
            'Toto právo se vztahuje pouze na spotřebitele. Práva spotřebitele, která nelze smluvně omezit, zůstávají těmito podmínkami nedotčena.',
            'This right applies only to consumers. Statutory consumer rights that cannot be contractually restricted remain unaffected by these Terms.'
          )}</p>
        </section>

        <section>
          <h2>{ui('8. Vady, reklamace a dostupnost služby', '8. Defects, complaints and service availability')}</h2>
          {TERMS_COMPLAINT_CLAUSE[english ? 'en' : 'cs'].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p>{ui(
            'Syllonaut je průběžně vyvíjená online služba. Krátkodobé výpadky mohou nastat kvůli údržbě, bezpečnosti nebo závislosti na externích poskytovatelích. Poskytovatel bude usilovat o rozumnou dostupnost a nápravu závažných poruch, negarantuje však nepřetržitý provoz bez výpadku.',
            'Syllonaut is an online service under continuous development. Temporary interruptions may occur for maintenance, security or because of external providers. The provider will use reasonable efforts to maintain availability and remedy material failures but does not guarantee uninterrupted operation.'
          )}</p>
        </section>

        <section>
          <h2>{ui('9. Zakázané použití', '9. Prohibited use')}</h2>
          <p>{ui('Syllonaut nesmí být používán zejména k:', 'Syllonaut must not be used to:')}</p>
          <ul>
            <li>{ui('protiprávnímu jednání nebo porušování práv třetích osob;', 'engage in unlawful activity or infringe third-party rights;')}</li>
            <li>{ui('nahrávání škodlivého kódu, útokům na službu, obcházení zabezpečení, kvót nebo platebních omezení;', 'upload malicious code, attack the service, or circumvent security, quotas or payment restrictions;')}</li>
            <li>{ui('neoprávněnému získávání cizích účtů, dat nebo studentských odpovědí;', 'obtain other users’ accounts, data or student responses without authorization;')}</li>
            <li>{ui('automatizovanému hromadnému využívání mimo funkce, které Syllonaut výslovně poskytuje.', 'conduct automated bulk use outside features expressly provided by Syllonaut.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('10. Změny služby a podmínek', '10. Changes to the service and Terms')}</h2>
          {TERMS_SERVICE_CHANGE_CLAUSE[english ? 'en' : 'cs'].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{ui('11. Ukončení účtu', '11. Account termination')}</h2>
          {TERMS_ACCOUNT_DELETION_CLAUSE[english ? 'en' : 'cs'].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p>{ui(
            'Poskytovatel může účet nebo jeho funkce omezit při závažném či opakovaném porušování těchto podmínek, zneužití služby nebo z bezpečnostních důvodů. Pokud to situace dovoluje, uživatele předem upozorní.',
            'The provider may restrict an account or its features for serious or repeated breaches of these Terms, abuse of the service or security reasons. Where circumstances allow, the user will be notified in advance.'
          )}</p>
        </section>

        <section>
          <h2>{ui('12. Odpovědnost', '12. Liability')}</h2>
          <p>{ui(
            'Nic v těchto podmínkách nevylučuje ani neomezuje odpovědnost nebo práva, která podle použitelného práva vyloučit či omezit nelze. Uživatel bere na vědomí zejména povahu AI výstupů podle článku 4 a odpovídá za vlastní rozhodnutí, jak je použije ve výuce.',
            'Nothing in these Terms excludes or limits liability or rights that cannot be excluded or limited under applicable law. In particular, users acknowledge the nature of AI outputs described in section 4 and remain responsible for their own decisions about classroom use.'
          )}</p>
        </section>

        <section>
          <h2>{ui('13. Rozhodné právo a spotřebitelské spory', '13. Governing law and consumer disputes')}</h2>
          <p>{ui(
            'Smluvní vztah se řídí právem České republiky. Jste-li spotřebitel s bydlištěm v jiné zemi, nejsou tím dotčena kogentní práva, která vám poskytuje právo země vašeho obvyklého bydliště.',
            'The contract is governed by the laws of the Czech Republic. If you are a consumer resident in another country, this does not deprive you of mandatory protections granted by the law of your habitual residence.'
          )}</p>
          <p>{ui(
            'Případný spor se nejprve pokusíme vyřešit dohodou. Spotřebitel může podat návrh na mimosoudní řešení spotřebitelského sporu u České obchodní inspekce (ČOI), Štěpánská 567/15, 120 00 Praha 2; informace a elektronický postup jsou na webu ČOI.',
            'We will first try to resolve any dispute by agreement. A consumer may submit a dispute for out-of-court resolution to the Czech Trade Inspection Authority (ČOI), Štěpánská 567/15, 120 00 Prague 2; information and the electronic procedure are available on the ČOI website.'
          )} <a href="https://coi.gov.cz/informace-o-adr/" target="_blank" rel="noreferrer">coi.gov.cz</a>.</p>
        </section>

        <section>
          <h2>{ui('14. Ochrana osobních údajů a závěrečná ustanovení', '14. Privacy and final provisions')}</h2>
          <p>{ui('Zpracování osobních údajů upravuje samostatná', 'Personal-data processing is described in the separate')} <Link href={`/${locale}/gdpr`}>{ui('stránka Ochrana osobních údajů (GDPR)', 'Privacy Notice')}</Link>.</p>
          <p>{ui(
            'Pro organizace Team / School / Campus je v rozsahu zpracování osobních údajů jménem organizace závaznou součástí smlouvy také',
            'For Team / School / Campus organisations, processing of personal data on the organisation’s behalf is additionally governed by the binding'
          )} <Link href={`/${locale}/dpa`}>{ui('zpracovatelskou smlouvou (DPA)', 'Data Processing Agreement (DPA)')}</Link>.</p>
          <p>{ui(
            `Aktuální verze těchto podmínek je ${TERMS_VERSION} a je účinná od ${new Intl.DateTimeFormat('cs-CZ').format(new Date(TERMS_EFFECTIVE_DATE + 'T12:00:00Z'))}. U konkrétní objednávky se uchovává verze podmínek odsouhlasená při objednání.`,
            `The current version of these Terms is ${TERMS_VERSION}, effective from 23 September 2026. For a specific order, the version accepted when the order was placed is retained.`
          )}</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
