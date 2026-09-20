import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/lib/legal';
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
      ? 'Terms governing Syllonaut accounts, paid subscriptions, school licences, payments, digital services and consumer rights.'
      : 'Podmínky používání Syllonautu, účtů, placených předplatných, školních licencí, plateb, digitálních služeb a práv spotřebitele.',
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
          <span className={styles.eyebrow}>{ui('Právní podmínky', 'Legal terms')}</span>
          <h1>{ui('Obchodní podmínky služby Syllonaut', 'Syllonaut Terms of Service')}</h1>
          <p>{ui(
            'Tyto podmínky upravují registraci, používání služby, placená předplatná a školní licence Syllonautu.',
            'These terms govern registration, use of the service, paid subscriptions and Syllonaut school licences.'
          )}</p>
          <div className={styles.meta}>{ui(
            `Verze ${TERMS_VERSION} · účinná od 20. 9. 2026`,
            `Version ${TERMS_VERSION} · effective from 20 September 2026`
          )}</div>
        </div>

        <section>
          <h2>{ui('1. Poskytovatel', '1. Provider')}</h2>
          <p><strong>Václav Loubek</strong><br />IČO: 88878431<br />Slepá 868<br />289 24 Milovice – Mladá<br />{ui('Česká republika', 'Czech Republic')}</p>
          <p>{ui(
            'Poskytovatel je podnikající fyzická osoba podle živnostenského zákona a není plátcem DPH. Službu Syllonaut provozuje na doméně syllonaut.com.',
            'The Provider is a Czech sole trader operating under a trade licence and is not registered for Czech VAT. Syllonaut is operated at syllonaut.com.'
          )}</p>
          <p>{ui('Kontaktní e-mail:', 'Contact email:')} <a href="mailto:vaclav@syllonaut.com">vaclav@syllonaut.com</a>.</p>
        </section>

        <section>
          <h2>{ui('2. Služba Syllonaut', '2. The Syllonaut service')}</h2>
          <p>{ui(
            'Syllonaut je webová digitální služba pro přípravu, úpravu, ukládání, sdílení a vedení interaktivních výukových lekcí. Některé funkce používají generativní AI a automatizované hodnocení.',
            'Syllonaut is a web-based digital service for creating, editing, storing, sharing and running interactive lessons. Some features use generative AI and automated assessment.'
          )}</p>
          <p>{ui(
            'Funkce, limity a ceny jednotlivých tarifů jsou popsány v aktuálním Ceníku a v objednávkovém rozhraní. Údaje zobrazené bezprostředně před odesláním objednávky mají pro konkrétní objednávku přednost před obecnými marketingovými popisy.',
            'The current Pricing page and checkout interface describe the features, allowances and prices of each plan. Information shown immediately before an order is submitted takes precedence for that specific order over general marketing descriptions.'
          )}</p>
        </section>

        <section>
          <h2>{ui('3. Účet a registrace', '3. Account and registration')}</h2>
          <ul>
            <li>{ui('Pro učitelské funkce a ukládání vlastních lekcí je vyžadován účet. Student se může do živé lekce připojit bez plnohodnotného účtu.', 'A teacher account is required for teacher features and saving lessons. Students may join a live lesson without a full account.')}</li>
            <li>{ui('Při registraci musí uživatel uvést funkční e-mail, chránit přístupové údaje a odsouhlasit aktuální znění těchto podmínek.', 'On registration, the user must provide a working email address, protect their credentials and accept the current version of these terms.')}</li>
            <li>{ui('Účet je osobní. Sdílení přihlašovacích údajů nebo obcházení omezení počtu zařízení, licencí či tarifů není dovoleno.', 'Accounts are personal. Sharing credentials or circumventing device, licence or plan restrictions is not permitted.')}</li>
            <li>{ui('Dobrovolný marketingový souhlas je oddělený od souhlasu s těmito podmínkami a není podmínkou registrace ani nákupu.', 'Optional marketing consent is separate from acceptance of these terms and is not required for registration or purchase.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('4. Free účet a placené tarify', '4. Free account and paid plans')}</h2>
          <p>{ui(
            'Free účet lze používat bez platební karty v rozsahu aktuálně uvedených bezplatných limitů. Placené tarify Teacher a Teacher Pro jsou určeny jednotlivým uživatelům. Tarify Team, School a Campus jsou určeny zejména školám, týmům a dalším organizacím.',
            'The Free account can be used without a payment card within the currently stated free allowances. Teacher and Teacher Pro are individual paid plans. Team, School and Campus are intended mainly for schools, teams and other organisations.'
          )}</p>
          <p>{ui(
            'AI limity se obnovují podle období uvedeného u tarifu. Nevyužitá kapacita se nepřevádí, není-li výslovně uvedeno jinak. Spuštění a opakované použití již vytvořené lekce samo o sobě placený AI limit nespotřebovává, pokud Ceník nestanoví jinak.',
            'AI allowances renew according to the period stated for the plan. Unused capacity does not roll over unless expressly stated otherwise. Launching and reusing an already-created lesson does not itself consume the paid AI allowance unless the Pricing page states otherwise.'
          )}</p>
        </section>

        <section>
          <h2>{ui('5. Objednávka a uzavření smlouvy', '5. Ordering and contract formation')}</h2>
          <p>{ui(
            'U individuálního tarifu uživatel zvolí tarif, fakturační období a zemi a pokračuje do zabezpečené platební stránky Stripe. Placené funkce jsou aktivovány až po úspěšném potvrzení platby. Smlouva o placeném tarifu vzniká potvrzením úspěšné objednávky a aktivací tarifu.',
            'For an individual plan, the user selects a plan, billing period and country and continues to the secure Stripe checkout. Paid features activate only after successful payment confirmation. The paid-plan contract is formed when the successful order is confirmed and the plan is activated.'
          )}</p>
          <p>{ui(
            'U tarifů Team, School a Campus objednávající vyplní údaje organizace, tarif, fakturační období a způsob platby. U faktury vzniká závazná objednávka jejím odesláním a vystavením faktury; licence se aktivuje až po potvrzení úhrady. U platby kartou se licence aktivuje po potvrzení platby.',
            'For Team, School and Campus, the purchaser enters organisation details, plan, billing period and payment method. For invoice payment, a binding order is created when the order is submitted and the invoice is issued; the licence activates only after payment is confirmed. For card payment, the licence activates after payment confirmation.'
          )}</p>
          <p>{ui(
            'Osoba objednávající za organizaci potvrzuje, že je oprávněna objednávku učinit. Pokud je zákazník spotřebitelem, toto označení ani volba tarifu neomezují jeho kogentní spotřebitelská práva.',
            'A person ordering on behalf of an organisation confirms that they are authorised to place the order. If the customer is legally a consumer, the plan chosen or any business label does not restrict mandatory consumer rights.'
          )}</p>
        </section>

        <section>
          <h2>{ui('6. Cena, platba a doklady', '6. Price, payment and documents')}</h2>
          <ul>
            <li>{ui('Konečná cena, měna a fakturační období jsou zobrazeny před odesláním placené objednávky. Poskytovatel není plátcem DPH.', 'The final price, currency and billing period are shown before a paid order is submitted. The Provider is not registered for Czech VAT.')}</li>
            <li>{ui('Individuální předplatné a kartové školní objednávky mohou být zpracovány prostřednictvím Stripe. Pro některé země může být použit režim, ve kterém platební poskytovatel plní roli merchant of record; objednávkové rozhraní o tom informuje.', 'Individual subscriptions and card-based school orders may be processed through Stripe. For some countries a payment-provider merchant-of-record model may be used; the checkout interface identifies the applicable route.')}</li>
            <li>{ui('Školní objednávka může být uhrazena bankovním převodem podle faktury vystavené Syllonautem. Není-li na faktuře uvedeno jinak, splatnost je 14 dnů.', 'A school order may be paid by bank transfer under an invoice issued by Syllonaut. Unless the invoice states otherwise, payment is due within 14 days.')}</li>
            <li>{ui('Případné bankovní nebo kurzové poplatky účtované zákazníkovou bankou nejsou součástí ceny Syllonautu.', 'Any bank or foreign-exchange fees charged by the customer’s bank are not part of the Syllonaut price.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('7. Obnovování, změna a zrušení placeného tarifu', '7. Renewal, changes and cancellation')}</h2>
          <p>{ui(
            'Kartové předplatné se obnovuje automaticky po zvoleném měsíčním nebo ročním období, pokud uživatel před koncem období nenastaví zrušení, nebo pokud objednávkové rozhraní výslovně nestanoví jinak. Uživatel může individuální předplatné spravovat přes stránku Předplatné a Stripe Customer Portal.',
            'Card subscriptions renew automatically after the selected monthly or annual period unless the user schedules cancellation before the end of the period or the checkout interface expressly states otherwise. Individual subscriptions can be managed from the Subscription page and Stripe Customer Portal.'
          )}</p>
          <p>{ui(
            'Při zrušení na konci období zůstává placený přístup zpravidla aktivní do konce již uhrazeného období. Fakturační školní licence se obnovují manuálně novou objednávkou nebo obnovovací fakturou, není-li u konkrétní objednávky výslovně sjednáno jinak.',
            'When cancellation is scheduled for period end, paid access normally remains active until the end of the already-paid period. Invoice-based school licences renew manually by a new order or renewal invoice unless a specific order expressly states otherwise.'
          )}</p>
          <p>{ui(
            'Změna individuálního tarifu se provede okamžitě nebo k příštímu obnovení podle informace zobrazené před potvrzením změny. Případný poměrný doplatek zpracuje Stripe.',
            'An individual plan change takes effect immediately or at the next renewal as stated before the change is confirmed. Any prorated additional charge is processed by Stripe.'
          )}</p>
        </section>

        <section>
          <h2>{ui('8. Okamžité zpřístupnění a spotřebitelské odstoupení', '8. Immediate access and consumer withdrawal')}</h2>
          <p>{ui(
            'Je-li uživatel spotřebitelem a objednává placenou digitální službu na dálku, má zásadně právo odstoupit od smlouvy ve 14denní lhůtě, pokud zákon nestanoví výjimku.',
            'Where the user is a consumer purchasing a paid digital service at a distance, they generally have a 14-day right of withdrawal unless a statutory exception applies.'
          )}</p>
          <p>{ui(
            'Syllonaut zpřístupňuje placené digitální funkce bezprostředně po potvrzení platby. Před placenou individuální objednávkou proto spotřebitel samostatným aktivním úkonem výslovně žádá o zpřístupnění digitálního plnění před uplynutím 14 dnů a bere na vědomí, že po zahájení takového plnění může v rozsahu stanoveném zákonem právo na odstoupení zaniknout.',
            'Syllonaut makes paid digital features available immediately after payment confirmation. Before an individual paid order, a consumer therefore makes a separate active request for digital performance to begin before the 14-day period ends and acknowledges that, once such performance begins, the right of withdrawal may be lost to the extent provided by law.'
          )}</p>
          <p>{ui(
            'Pokud podmínky pro zákonnou výjimku splněny nejsou, spotřebitelské právo na odstoupení zůstává zachováno. Těmito podmínkami nejsou omezena žádná práva, která podle kogentních právních předpisů omezit nelze.',
            'If the conditions for a statutory exception are not met, the consumer’s withdrawal right remains unaffected. These terms do not restrict any rights that cannot lawfully be restricted.'
          )}</p>
          <h3>{ui('Vzor oznámení o odstoupení', 'Model withdrawal notice')}</h3>
          <p>{ui(
            'Oznámení můžete poslat na vaclav@syllonaut.com. Uveďte například: „Oznamuji, že odstupuji od smlouvy na tarif Syllonaut [tarif], objednaný dne [datum], pro účet [e-mail].“ Doplňte své jméno a datum odeslání.',
            'You can send the notice to vaclav@syllonaut.com. For example: “I hereby give notice that I withdraw from my contract for the Syllonaut [plan], ordered on [date], for the account [email].” Add your name and the date sent.'
          )}</p>
        </section>

        <section>
          <h2>{ui('9. Pravidla používání', '9. Acceptable use')}</h2>
          <p>{ui('Uživatel nesmí službu používat zejména k:', 'The user must not use the service to:')}</p>
          <ul>
            <li>{ui('porušování právních předpisů nebo práv třetích osob;', 'violate applicable law or third-party rights;')}</li>
            <li>{ui('vkládání obsahu, k jehož zpracování nemá potřebná práva;', 'submit content they have no right to process;')}</li>
            <li>{ui('obcházení bezpečnostních, platebních, licenčních nebo AI limitů;', 'circumvent security, payment, licence or AI limits;')}</li>
            <li>{ui('automatizovanému zatěžování služby, pokusům o průnik nebo narušování provozu;', 'automated abusive load, intrusion attempts or disruption of the service;')}</li>
            <li>{ui('vkládání zbytečných citlivých osobních údajů studentů nebo jiných osob.', 'submit unnecessary sensitive personal data about students or other people.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('10. AI výstupy a odpovědnost učitele', '10. AI outputs and teacher responsibility')}</h2>
          <p>{ui(
            'Generativní AI může vytvořit nepřesný, neúplný nebo nevhodný výstup. Syllonaut je podpůrný nástroj, nikoli náhrada odborného úsudku učitele. Uživatel má před použitím ve výuce zkontrolovat věcnou správnost, přiměřenost věku, bezpečnost a vhodnost obsahu.',
            'Generative AI may produce inaccurate, incomplete or unsuitable output. Syllonaut is a support tool, not a substitute for a teacher’s professional judgement. Before classroom use, the user should check factual accuracy, age appropriateness, safety and suitability.'
          )}</p>
          <p>{ui(
            'Automatické AI hodnocení a signály možného použití AI studentem jsou pomocné. Konečné pedagogické rozhodnutí zůstává na učiteli.',
            'Automated AI grading and signals of possible student AI use are assistive. Final pedagogical decisions remain with the teacher.'
          )}</p>
        </section>

        <section>
          <h2>{ui('11. Obsah uživatele a licence k technickému zpracování', '11. User content and technical processing licence')}</h2>
          <p>{ui(
            'Uživatel si ponechává práva ke svým zadáním a dalšímu vlastnímu obsahu. V rozsahu nezbytném pro provoz služby uděluje poskytovateli nevýhradní oprávnění obsah technicky uložit, zpracovat, přenést a zobrazit, včetně zpracování prostřednictvím zapojených dodavatelů.',
            'The user retains rights in their prompts and other original content. To the extent needed to operate the service, the user grants the Provider a non-exclusive right to technically store, process, transmit and display that content, including processing through service providers.'
          )}</p>
          <p>{ui(
            'Pokud uživatel lekci vědomě sdílí nebo vloží do školní knihovny, uděluje příjemcům oprávnění vytvořit a používat kopii pro výukové účely v rozsahu dané funkce. Uživatel nesmí sdílet obsah, k němuž takové oprávnění nemá.',
            'If a user deliberately shares a lesson or adds it to a school library, recipients may create and use a copy for teaching purposes within the scope of that feature. Users must not share content where they lack the necessary rights.'
          )}</p>
        </section>

        <section>
          <h2>{ui('12. Studenti, školy a osobní údaje', '12. Students, schools and personal data')}</h2>
          <p>{ui(
            'Podrobnosti o zpracování osobních údajů jsou uvedeny v samostatných Informacích o ochraně osobních údajů. U živých lekcí má učitel nebo škola používat pouze takové identifikátory studentů, které jsou pro výuku potřebné.',
            'Details of personal-data processing are set out in the separate Privacy Notice. In live lessons, teachers and schools should use only student identifiers needed for teaching.'
          )} <Link href={`/${locale}/gdpr`}>{ui('Ochrana osobních údajů (GDPR)', 'Privacy (GDPR)')}</Link>.</p>
          <p>{ui(
            'Pokud škola určuje účely a prostředky zpracování osobních údajů studentů a Syllonaut pro ni údaje zpracovává, mohou být příslušné povinnosti správce a zpracovatele upraveny samostatnou smlouvou o zpracování osobních údajů.',
            'Where a school determines the purposes and means of processing student personal data and Syllonaut processes data on its behalf, the relevant controller/processor obligations may be covered by a separate data-processing agreement.'
          )}</p>
        </section>

        <section>
          <h2>{ui('13. Dostupnost, údržba a změny služby', '13. Availability, maintenance and service changes')}</h2>
          <p>{ui(
            'Poskytovatel usiluje o průběžnou dostupnost služby, ale nezaručuje nepřetržitý provoz bez výpadků. Může provádět údržbu, bezpečnostní zásahy a technické změny. O plánovaných podstatných omezeních se pokusí informovat přiměřeně předem.',
            'The Provider aims for continuous availability but does not guarantee uninterrupted operation. Maintenance, security interventions and technical changes may be carried out. The Provider will seek to give reasonable advance notice of planned material restrictions.'
          )}</p>
          <p>{ui(
            'Podstatné změny placené digitální služby během trvání smlouvy budou prováděny pouze z oprávněných důvodů, zejména kvůli bezpečnosti, právním povinnostem, interoperabilitě nebo rozvoji služby, a způsobem, který neomezuje zákonná práva uživatele.',
            'Material changes to a paid digital service during a contract will be made only for legitimate reasons, including security, legal obligations, interoperability or service development, and in a way that does not restrict the user’s statutory rights.'
          )}</p>
        </section>

        <section>
          <h2>{ui('14. Vady a reklamace digitální služby', '14. Defects and complaints')}</h2>
          <p>{ui(
            'Poskytovatel odpovídá za vady digitálního obsahu a digitální služby v rozsahu stanoveném právními předpisy. Reklamaci lze uplatnit na vaclav@syllonaut.com; je vhodné uvést účet, popis problému, čas výskytu a požadovaný způsob vyřízení.',
            'The Provider is liable for defects in digital content and digital services to the extent required by applicable law. Complaints may be submitted to vaclav@syllonaut.com; it is helpful to provide the account, problem description, occurrence time and requested remedy.'
          )}</p>
          <p>{ui(
            'Spotřebitelská reklamace digitálního obsahu či služby bude vyřízena bez zbytečného odkladu a v přiměřené době s ohledem na povahu digitálního plnění a jeho účel, jak vyžaduje zákon.',
            'A consumer complaint concerning digital content or a digital service will be handled without undue delay and within a reasonable time in view of the nature and purpose of the digital performance, as required by law.'
          )}</p>
        </section>

        <section>
          <h2>{ui('15. Pozastavení a ukončení účtu', '15. Suspension and termination')}</h2>
          <p>{ui(
            'Při závažném nebo opakovaném porušování těchto podmínek, bezpečnostním incidentu, zneužití služby nebo neuhrazené platbě může poskytovatel přiměřeně omezit dotčené funkce nebo účet. Kde je to rozumně možné, uživatele předem upozorní a umožní nápravu.',
            'For serious or repeated breaches of these terms, a security incident, abuse of the service or unpaid charges, the Provider may proportionately restrict affected features or the account. Where reasonably possible, the user will be warned and given an opportunity to remedy the issue.'
          )}</p>
          <p>{ui(
            'Platební spor, refund nebo prodlení může dočasně pozastavit vznik nových placených AI nákladů, aniž by byly automaticky znepřístupněny již uložené lekce, pokud konkrétní stav služby nevyžaduje jinak.',
            'A payment dispute, refund or overdue payment may temporarily pause new paid AI costs without automatically making saved lessons unavailable, unless the specific service state requires otherwise.'
          )}</p>
        </section>

        <section>
          <h2>{ui('16. Odpovědnost', '16. Liability')}</h2>
          <p>{ui(
            'Nic v těchto podmínkách nevylučuje ani neomezuje odpovědnost, kterou podle závazných právních předpisů nelze vyloučit nebo omezit, zejména zákonná práva spotřebitele z vadného digitálního plnění.',
            'Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited, in particular mandatory consumer rights relating to defective digital performance.'
          )}</p>
          <p>{ui(
            'Uživatel odpovídá za způsob, jakým použije vytvořený obsah ve své výuce, a za to, že má práva a právní základ pro obsah a osobní údaje, které do služby vloží.',
            'The user is responsible for how generated content is used in teaching and for having the necessary rights and legal basis for content and personal data submitted to the service.'
          )}</p>
        </section>

        <section>
          <h2>{ui('17. Mimosoudní řešení spotřebitelských sporů', '17. Alternative consumer dispute resolution')}</h2>
          <p>{ui(
            'Je-li zákazník spotřebitelem a nepodaří se spor vyřešit přímo, je příslušným subjektem mimosoudního řešení spotřebitelských sporů Česká obchodní inspekce, Ústřední inspektorát – oddělení ADR, Štěpánská 796/44, 110 00 Praha 1.',
            'If the customer is a consumer and a dispute cannot be resolved directly, the competent Czech alternative dispute resolution body is the Czech Trade Inspection Authority, Central Inspectorate – ADR Department, Štěpánská 796/44, 110 00 Prague 1.'
          )}</p>
          <p><a href="https://coi.gov.cz/informace-o-adr/" target="_blank" rel="noreferrer">{ui('Informace ČOI o ADR', 'Czech Trade Inspection ADR information')}</a></p>
        </section>

        <section>
          <h2>{ui('18. Rozhodné právo a změny podmínek', '18. Governing law and changes to these terms')}</h2>
          <p>{ui(
            'Smluvní vztah se řídí právem České republiky. Je-li uživatel spotřebitelem s obvyklým bydlištěm v jiném státě, nejsou tím dotčena jeho kogentní práva, která mu poskytuje právo použitelné podle pravidel na ochranu spotřebitele.',
            'The contract is governed by the law of the Czech Republic. If the user is a consumer habitually resident in another country, this does not deprive them of mandatory protections applicable under consumer-conflict rules.'
          )}</p>
          <p>{ui(
            'Poskytovatel může tyto podmínky do budoucna změnit, zejména kvůli právním, bezpečnostním nebo funkčním změnám služby. Podstatnou změnu existujícího placeného vztahu oznámí uživateli přiměřeně před její účinností. Změna podmínek nepůsobí zpětně proti již vzniklým právům uživatele.',
            'The Provider may update these terms for the future, especially because of legal, security or functional changes. A material change affecting an existing paid relationship will be notified reasonably before it takes effect. Updated terms do not retroactively remove rights already acquired by the user.'
          )}</p>
          <p>{ui(
            `Tyto podmínky ve verzi ${TERMS_VERSION} jsou účinné od ${TERMS_EFFECTIVE_DATE === '2026-09-20' ? '20. 9. 2026' : TERMS_EFFECTIVE_DATE}.`,
            `These terms, version ${TERMS_VERSION}, are effective from 20 September 2026.`
          )}</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
