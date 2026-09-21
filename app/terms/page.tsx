import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { TERMS_VERSION } from '@/lib/legal';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Terms and Conditions — Syllonaut' : 'Obchodní podmínky — Syllonaut',
    description: english
      ? 'Terms and Conditions for using Syllonaut, including subscriptions, payments, cancellation and consumer rights.'
      : 'Obchodní podmínky služby Syllonaut včetně předplatného, plateb, ukončení a práv spotřebitele.',
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
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}>
          <SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span>
        </Link>
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
          <span className={styles.eyebrow}>{ui('Právní informace', 'Legal information')}</span>
          <h1>{ui('Obchodní podmínky', 'Terms and Conditions')}</h1>
          <p>{ui(
            'Tyto podmínky upravují používání Syllonautu, bezplatné i placené tarify, školní licence, platby, ukončení služby a práva uživatelů.',
            'These Terms govern use of Syllonaut, free and paid plans, school licences, payments, termination and user rights.'
          )}</p>
          <div className={styles.meta}>{ui('Verze 1.0 · účinná od 21. 9. 2026', 'Version 1.0 · effective from 21 September 2026')} {' · '} {TERMS_VERSION}</div>
        </div>

        <section>
          <h2>{ui('1. Poskytovatel', '1. Provider')}</h2>
          <p><strong>Václav Loubek</strong><br />{ui('IČO', 'Business ID')}: 88878431<br />Slepá 868<br />289 24 Milovice – Mladá<br />{ui('Česká republika', 'Czech Republic')}</p>
          <p>{ui('Služba', 'The service')} <strong>Syllonaut</strong> {ui('je provozována na doméně', 'is operated at')} <strong>syllonaut.com</strong>. {ui('Kontaktní e-mail:', 'Contact email:')} <a href="mailto:vaclav@syllonaut.com">vaclav@syllonaut.com</a>.</p>
        </section>

        <section>
          <h2>{ui('2. Rozsah podmínek a základní pojmy', '2. Scope and key terms')}</h2>
          <p>{ui(
            'Podmínky se vztahují na bezplatný účet Free, individuální placené tarify Teacher a Teacher Pro a organizační tarify Team, School a Campus. Konkrétní rozsah funkcí, limity a aktuální cena jsou vždy uvedeny v Ceníku a v objednávkovém kroku před odesláním objednávky.',
            'These Terms apply to the Free account, individual paid Teacher and Teacher Pro plans, and Team, School and Campus organisation plans. The current feature set, allowances and price are always shown in Pricing and in the order flow before an order is submitted.'
          )}</p>
          <p>{ui(
            'Spotřebitelem je pouze fyzická osoba, která smlouvu uzavírá mimo rámec své podnikatelské činnosti nebo samostatného výkonu povolání. Uživatel jednající za školu, firmu nebo jinou organizaci potvrzuje, že je oprávněn objednávku jejím jménem učinit.',
            'A consumer is an individual entering into the contract outside their business or independent professional activity. A user ordering for a school, company or other organisation confirms that they are authorised to place the order on its behalf.'
          )}</p>
        </section>

        <section>
          <h2>{ui('3. Účet a uzavření smlouvy', '3. Account and contract formation')}</h2>
          <ul>
            <li>{ui('Free účet vzniká dokončením registrace po odsouhlasení těchto podmínek.', 'A Free account is created when registration is completed after these Terms are accepted.')}</li>
            <li>{ui('Placený individuální tarif se objednává přes Ceník a Stripe Checkout. Placené oprávnění se aktivuje až po potvrzení platby.', 'An individual paid plan is ordered through Pricing and Stripe Checkout. Paid entitlement activates only after payment is confirmed.')}</li>
            <li>{ui('Školní nebo týmová licence se objednává v administračním toku školy; podle zvoleného způsobu platby se použije karta nebo faktura/bankovní převod. Licence se aktivuje po potvrzené úhradě.', 'A school or team licence is ordered in the school administration flow; depending on the selected payment method, payment is by card or invoice/bank transfer. The licence activates after payment is confirmed.')}</li>
            <li>{ui('Uživatel odpovídá za správnost registračních a fakturačních údajů a za ochranu přístupových údajů ke svému účtu.', 'The user is responsible for the accuracy of registration and billing details and for safeguarding account credentials.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('4. Povaha digitální služby', '4. Nature of the digital service')}</h2>
          <p>{ui(
            'Syllonaut je online digitální služba pro přípravu, úpravu, vedení a vyhodnocování interaktivní výuky. Některé funkce využívají generativní AI. Výstupy AI mohou obsahovat nepřesnosti nebo nevhodné návrhy; před použitím ve výuce je musí učitel odborně posoudit a případně upravit.',
            'Syllonaut is an online digital service for preparing, editing, running and evaluating interactive teaching. Some features use generative AI. AI output may contain inaccuracies or unsuitable suggestions; teachers must review it professionally and edit it where needed before classroom use.'
          )}</p>
          <p>{ui(
            'Služba se průběžně vyvíjí. Poskytovatel může nasazovat bezpečnostní, technické a funkční aktualizace. Změny nesmí omezit zákonná práva spotřebitele a podstatné změny placené služby budou komunikovány přiměřeným způsobem.',
            'The service evolves continuously. The Provider may deploy security, technical and functional updates. Changes do not limit mandatory consumer rights, and material changes to a paid service will be communicated in an appropriate manner.'
          )}</p>
        </section>

        <section>
          <h2>{ui('5. Tarify, ceny a fakturace', '5. Plans, prices and billing')}</h2>
          <ul>
            <li>{ui('Cena, měna, fakturační období a hlavní parametry tarifu jsou zobrazeny před objednáním. Rozhodující je cena potvrzená v konkrétní objednávce.', 'The price, currency, billing period and main plan parameters are displayed before ordering. The price confirmed in the specific order is controlling.')}</li>
            <li>{ui('U měsíčních a ročních předplatných hrazených kartou může docházet k automatickému obnovení, pokud objednávkový tok uvádí automatické obnovení. Uživatel může budoucí obnovení vypnout v dostupné správě předplatného; zrušení neukončí již zaplacené období předčasně.', 'Monthly and annual card subscriptions may renew automatically where the order flow states automatic renewal. The user can disable future renewal in the available subscription management; cancellation does not end an already paid period early.')}</li>
            <li>{ui('Školní licence hrazené na fakturu se obnovují novou objednávkou nebo obnovovací fakturou; nové období se aktivuje až po potvrzené úhradě, pokud není výslovně dohodnuto jinak.', 'School licences paid by invoice renew through a new order or renewal invoice; the new period activates only after confirmed payment unless expressly agreed otherwise.')}</li>
            <li>{ui('Při neúspěšné, opožděné, vrácené nebo reklamované platbě může Syllonaut omezit nové placené AI operace nebo placené funkce v rozsahu popsaném ve službě, dokud se stav platby nevyřeší.', 'If a payment fails, is overdue, refunded or disputed, Syllonaut may restrict new paid AI operations or paid features as described in the service until the billing issue is resolved.')}</li>
          </ul>
        </section>

        <section>
          <h2>{ui('6. Limity a férové používání', '6. Allowances and fair use')}</h2>
          <p>{ui(
            'Jednotlivé tarify mohou obsahovat měsíční limity nové AI tvorby, AI úprav, počtu uživatelů nebo dalších funkcí. Aktuální limity jsou součástí Ceníku. Pokusy o obcházení limitů, automatizované zneužívání, sdílení účtů v rozporu s tarifem nebo zásahy do zabezpečení služby jsou zakázány.',
            'Plans may include monthly limits for new AI generation, AI edits, user seats or other features. Current allowances are part of Pricing. Attempts to circumvent limits, automated abuse, account sharing contrary to the plan, or interference with service security are prohibited.'
          )}</p>
        </section>

        <section>
          <h2>{ui('7. Obsah uživatele a oprávnění k jeho zpracování', '7. User content and permission to process it')}</h2>
          <p>{ui(
            'Uživatel si zachovává práva k obsahu, který do Syllonautu vloží, pokud mu tato práva náleží. Poskytovateli uděluje pouze takové nevýhradní oprávnění ke zpracování obsahu, které je nezbytné pro poskytování, zabezpečení a technický provoz služby.',
            'Users retain rights in content they submit to Syllonaut where they own those rights. They grant the Provider only the non-exclusive permission to process that content that is necessary to provide, secure and operate the service.'
          )}</p>
          <p>{ui(
            'Uživatel smí do služby vkládat jen obsah, k němuž má potřebná práva, a nesmí službu používat k protiprávnímu obsahu, narušování práv třetích osob nebo k obcházení bezpečnostních pravidel.',
            'Users may submit only content for which they have the necessary rights and must not use the service for unlawful content, infringement of third-party rights or circumvention of security controls.'
          )}</p>
        </section>

        <section>
          <h2>{ui('8. Výukové materiály vytvořené pomocí Syllonautu', '8. Teaching materials created with Syllonaut')}</h2>
          <p>{ui(
            'V rozsahu, v jakém to umožňují práva třetích osob a právní režim AI výstupů, může uživatel vytvořené lekce a pracovní materiály používat, upravovat, tisknout a sdílet pro vlastní výuku a v rámci své organizace podle funkcí svého tarifu. Tím nejsou převáděna práva k softwaru, značce, zdrojovému kódu ani designu Syllonautu.',
            'To the extent permitted by third-party rights and the legal status of AI output, users may use, edit, print and share generated lessons and teaching materials for their own teaching and within their organisation according to their plan features. This does not transfer rights in the Syllonaut software, brand, source code or design.'
          )}</p>
        </section>

        <section>
          <h2>{ui('9. Studenti, školy a osobní údaje', '9. Students, schools and personal data')}</h2>
          <p>{ui(
            'Student se může k živé lekci připojit bez plnohodnotného účtu. Učitel nebo škola musí zadávat a požadovat pouze údaje, které jsou pro konkrétní výukový účel nezbytné. Citlivé osobní údaje studentů nemají být do zadání, podkladů ani AI funkcí vkládány, pokud to není nezbytné a právně pokryté.',
            'Students may join a live lesson without a full account. Teachers and schools must enter and request only data necessary for the specific teaching purpose. Sensitive student personal data should not be submitted in prompts, source materials or AI features unless necessary and legally covered.'
          )}</p>
          <p>{ui('Podrobnosti o zpracování osobních údajů jsou v dokumentu', 'Details of personal-data processing are in the')}{' '}
            <Link href={`/${locale}/gdpr`}>{ui('Ochrana osobních údajů (GDPR)', 'Privacy Notice (GDPR)')}</Link>.{' '}
            {ui('Pokud škola vystupuje jako správce a Syllonaut jako zpracovatel, mohou být příslušné povinnosti upraveny samostatnou zpracovatelskou smlouvou.', 'Where a school acts as controller and Syllonaut as processor, the relevant obligations may be governed by a separate data processing agreement.')}
          </p>
        </section>

        <section>
          <h2>{ui('10. Dostupnost, údržba a beta provoz', '10. Availability, maintenance and beta operation')}</h2>
          <p>{ui(
            'Poskytovatel usiluje o spolehlivý provoz, ale negarantuje nepřetržitou dostupnost bez výpadků. Služba může být krátkodobě omezena kvůli údržbě, bezpečnostnímu zásahu, výpadku dodavatele infrastruktury nebo jiné technické příčině. V době označení BETA mohou být některé funkce dále upravovány.',
            'The Provider aims for reliable operation but does not guarantee uninterrupted availability. The service may be temporarily limited for maintenance, security response, infrastructure-provider outages or other technical causes. While marked BETA, some features may continue to change.'
          )}</p>
        </section>

        <section>
          <h2>{ui('11. Práva z vadného plnění', '11. Defects and conformity')}</h2>
          <p>{ui(
            'Práva uživatele z vadného plnění a u spotřebitele také zákonná práva vztahující se k digitálnímu obsahu a službám digitálního obsahu nejsou těmito podmínkami omezena. Vadu nebo problém lze oznámit na vaclav@syllonaut.com s popisem problému a údaji potřebnými k dohledání účtu či objednávky.',
            'These Terms do not limit statutory rights relating to defective performance, including consumer rights for digital content and digital-content services. A defect or problem can be reported to vaclav@syllonaut.com with a description and the information needed to identify the account or order.'
          )}</p>
        </section>

        <section>
          <h2>{ui('12. Odstoupení spotřebitele do 14 dnů', '12. Consumer withdrawal within 14 days')}</h2>
          <p>{ui(
            'Je-li uživatel spotřebitelem a smlouva byla uzavřena na dálku, má v případech stanovených zákonem právo odstoupit od smlouvy ve lhůtě 14 dnů od jejího uzavření. Před nákupem placeného individuálního tarifu Syllonaut vyžaduje výslovnou žádost o zpřístupnění digitální služby bez čekání na uplynutí této lhůty a upozornění na zákonné důsledky takového zahájení plnění.',
            'Where the user is a consumer and the contract was concluded at a distance, the consumer has a statutory right to withdraw within 14 days from conclusion where the law provides. Before purchasing an individual paid plan, Syllonaut requires an express request to make the digital service available without waiting for that period to expire and gives notice of the statutory consequences of beginning performance.'
          )}</p>
          <p>{ui(
            'Pokud spotřebitel požádá o zahájení plnění v průběhu lhůty pro odstoupení, může v případech stanovených zákonem vzniknout povinnost uhradit poměrnou část již poskytnutého plnění; u plnění, u něhož zákon při splnění stanovených podmínek spojuje se zahájením nebo úplným poskytnutím zánik práva na odstoupení, spotřebitel tuto skutečnost bere výslovně na vědomí v objednávkovém kroku. Zákonná práva spotřebitele nelze těmito podmínkami zkrátit.',
            'If a consumer asks for performance to begin during the withdrawal period, the law may require payment for the proportion already supplied; where the law provides that the right of withdrawal is lost after commencement or complete performance subject to statutory conditions, the consumer expressly acknowledges that fact in the order flow. These Terms do not reduce mandatory consumer rights.'
          )}</p>
          <p>{ui(
            'Odstoupení lze odeslat e-mailem na vaclav@syllonaut.com. Stačí jednoznačně uvést, že od smlouvy odstupujete, a připojit údaje umožňující identifikovat účet nebo objednávku. Není nutné uvádět důvod.',
            'Withdrawal may be sent by email to vaclav@syllonaut.com. It is sufficient to clearly state that you are withdrawing and provide information allowing the account or order to be identified. No reason is required.'
          )}</p>
        </section>

        <section>
          <h2>{ui('13. Vzorové oznámení o odstoupení', '13. Model withdrawal notice')}</h2>
          <p>{ui('Tento vzor je možné, ale není povinné použít:', 'This model may be used but is not mandatory:')}</p>
          <div className={styles.notice}>
            <strong>{ui('Odstoupení od smlouvy', 'Withdrawal from contract')}</strong>
            <p>{ui('Adresát: Václav Loubek, Slepá 868, 289 24 Milovice – Mladá, vaclav@syllonaut.com', 'To: Václav Loubek, Slepá 868, 289 24 Milovice – Mladá, Czech Republic, vaclav@syllonaut.com')}<br /><br />
            {ui('Oznamuji, že odstupuji od smlouvy o poskytování služby Syllonaut.', 'I hereby give notice that I withdraw from my contract for the Syllonaut service.')}<br />
            {ui('E-mail účtu / číslo objednávky:', 'Account email / order number:')} ____________________<br />
            {ui('Datum uzavření smlouvy:', 'Date of contract:')} ____________________<br />
            {ui('Jméno spotřebitele:', 'Consumer name:')} ____________________<br />
            {ui('Datum:', 'Date:')} ____________________</p>
          </div>
        </section>

        <section>
          <h2>{ui('14. Ukončení účtu a předplatného', '14. Account and subscription termination')}</h2>
          <p>{ui(
            'Uživatel může ukončit budoucí obnovování placeného předplatného prostřednictvím dostupné správy předplatného nebo kontaktováním podpory. Poskytovatel může účet nebo placené funkce omezit či ukončit při závažném porušení těchto podmínek, zneužívání služby, bezpečnostním riziku nebo neuhrazené platbě; pokud to situace umožňuje, uživatele předem upozorní.',
            'Users may stop future renewal of a paid subscription through the available subscription management or by contacting support. The Provider may restrict or terminate an account or paid features for material breach of these Terms, service abuse, security risk or unpaid amounts; where circumstances allow, the user will be notified in advance.'
          )}</p>
        </section>

        <section>
          <h2>{ui('15. Odpovědnost', '15. Liability')}</h2>
          <p>{ui(
            'Syllonaut je podpůrný nástroj pro učitele, nikoli náhrada odborného pedagogického úsudku. Poskytovatel neodpovídá za rozhodnutí učitele učiněná pouze na základě AI výstupu ani za obsah vložený uživatelem. Tím nejsou dotčena práva a nároky, které podle kogentních právních předpisů nelze vyloučit nebo omezit.',
            'Syllonaut is a support tool for teachers, not a replacement for professional educational judgement. The Provider is not responsible for teacher decisions made solely on AI output or for content submitted by users. This does not affect rights or claims that cannot be excluded or limited under mandatory law.'
          )}</p>
        </section>

        <section>
          <h2>{ui('16. Stížnosti a mimosoudní řešení sporů', '16. Complaints and alternative dispute resolution')}</h2>
          <p>{ui(
            'Stížnost lze nejprve zaslat na vaclav@syllonaut.com. Je-li zákazník spotřebitelem a spor se nepodaří vyřešit dohodou, může se obrátit na Českou obchodní inspekci (ČOI), která je příslušným subjektem mimosoudního řešení spotřebitelských sporů.',
            'A complaint can first be sent to vaclav@syllonaut.com. If the customer is a consumer and the dispute cannot be resolved by agreement, the consumer may contact the Czech Trade Inspection Authority (ČOI), the competent Czech alternative dispute resolution body.'
          )}</p>
          <p><a href="https://coi.gov.cz/mimosoudni-reseni-spotrebitelskych-sporu-adr/" target="_blank" rel="noreferrer">{ui('Informace ČOI o mimosoudním řešení spotřebitelských sporů', 'ČOI information on alternative dispute resolution')}</a></p>
        </section>

        <section>
          <h2>{ui('17. Rozhodné právo a závěrečná ustanovení', '17. Governing law and final provisions')}</h2>
          <p>{ui(
            'Právní vztahy se řídí právem České republiky. U spotřebitele tím nejsou dotčena kogentní práva, která mu poskytuje právo státu jeho obvyklého bydliště, pokud se podle příslušných předpisů použijí.',
            'The contractual relationship is governed by Czech law. For consumers, this choice does not deprive them of mandatory protections of the law of their habitual residence where applicable.'
          )}</p>
          <p>{ui(
            'Poskytovatel může podmínky změnit zejména při změně služby, ceny, právních požadavků nebo bezpečnostních pravidel. Nová verze se použije na smlouvy uzavřené po její účinnosti; u existujících dlouhodobých vztahů bude podstatná změna oznámena předem a použije se jen v rozsahu dovoleném právem nebo dohodou.',
            'The Provider may amend these Terms, particularly due to service, pricing, legal or security changes. A new version applies to contracts concluded after its effective date; for existing continuing relationships, material changes will be communicated in advance and apply only to the extent permitted by law or agreement.'
          )}</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
