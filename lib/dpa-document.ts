import { DPA_EFFECTIVE_DATE, DPA_VERSION } from '@/lib/legal';

export type DpaLocale = 'cs' | 'en';

type DpaTable = {
  headers: [string, string, string];
  rows: Array<[string, string, string]>;
};

type DpaSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: DpaTable;
};

type DpaDocument = {
  eyebrow: string;
  title: string;
  intro: string;
  versionLabel: string;
  sections: DpaSection[];
};

export const DPA_DOCUMENT: Record<DpaLocale, DpaDocument> = {
  cs: {
    eyebrow: 'Ochrana osobních údajů · organizace',
    title: 'Zpracovatelská smlouva (DPA)',
    intro: 'Tato smlouva o zpracování osobních údajů podle čl. 28 GDPR upravuje zpracování osobních údajů, které Syllonaut provádí jménem školy, firmy nebo jiné organizace využívající tarif Team, School nebo Campus.',
    versionLabel: `Verze ${DPA_VERSION} · účinná od ${DPA_EFFECTIVE_DATE}`,
    sections: [
      {
        title: '1. Strany, role a vznik smlouvy',
        paragraphs: [
          'Správcem je škola, firma nebo jiná organizace identifikovaná v objednávce Syllonautu (dále jen „Správce“). Zpracovatelem je Václav Loubek, IČO 88878431, Slepá 868, 289 24 Milovice – Mladá, Česká republika, provozovatel služby Syllonaut (dále jen „Zpracovatel“).',
          'Tato DPA se stává závaznou okamžikem, kdy oprávněná osoba při objednávce tarifu Team, School nebo Campus výslovně přijme aktuální verzi DPA jménem Správce. DPA doplňuje smluvní vztah k používání Syllonautu.',
          'DPA se vztahuje pouze na zpracování osobních údajů, při němž Zpracovatel jedná jménem Správce. U vlastních účelů, zejména fakturace, účetnictví, zabezpečení služby, ochrany právních nároků a evidence smluv, vystupuje provozovatel Syllonautu jako samostatný správce podle Privacy Notice.',
        ],
      },
      {
        title: '2. Předmět, doba, povaha a účel zpracování',
        bullets: [
          'Předmět: provoz a poskytování funkcí Syllonautu pro přípravu, ukládání, vedení a vyhodnocování interaktivní výuky.',
          'Doba: po dobu aktivního smluvního vztahu a následně pouze po dobu nutnou pro bezpečné ukončení, výmaz nebo vrácení dat a zákonné retenční povinnosti.',
          'Povaha a účel: ukládání a zobrazování výukového obsahu, správa živých lekcí, zpracování studentských odpovědí a výsledků, týmové práce, vyhodnocování a AI operace iniciované oprávněným uživatelem Správce.',
          'Kategorie subjektů údajů: zejména žáci, studenti a další účastníci výuky; dále učitelé a pracovníci Správce v rozsahu, v němž jsou jejich údaje součástí obsahu zpracovávaného jménem Správce.',
          'Typy osobních údajů: zobrazované jméno nebo jiné označení účastníka, odpovědi a odevzdaný obsah, týmové zařazení, skóre a výsledky, časy odevzdání, obsah lekcí a podkladů vložený Správcem a nezbytné technické identifikátory relace.',
          'Syllonaut není určen k systematickému zpracování zvláštních kategorií osobních údajů. Správce je nemá do služby vkládat, pokud to není pro jeho legitimní vzdělávací účel nezbytné a nemá pro takové zpracování odpovídající právní základ a ochranná opatření.',
        ],
      },
      {
        title: '3. Pokyny Správce a odpovědnost Správce',
        paragraphs: [
          'Zpracovatel zpracovává osobní údaje pouze na doložené pokyny Správce, ledaže zpracování vyžaduje právo Evropské unie nebo členského státu. Za doložené pokyny se považuje zejména konfigurace služby, akce oprávněných uživatelů Správce a písemné pokyny zaslané na vaclav@syllonaut.com.',
          'Pokud má Zpracovatel za to, že pokyn porušuje GDPR nebo jiný použitelný předpis o ochraně osobních údajů, neprodleně na to Správce upozorní a může provedení dotčeného pokynu pozastavit do vyjasnění.',
          'Správce odpovídá zejména za zákonnost svých pokynů, právní titul zpracování, informační povinnosti vůči subjektům údajů, minimalizaci dat a správu oprávnění svých uživatelů.',
        ],
      },
      {
        title: '4. Důvěrnost',
        paragraphs: [
          'Zpracovatel zajistí, aby osoby oprávněné zpracovávat osobní údaje byly vázány povinností mlčenlivosti nebo odpovídající zákonnou povinností a měly přístup pouze v rozsahu nezbytném pro svou činnost.',
        ],
      },
      {
        title: '5. Technická a organizační opatření',
        bullets: [
          'řízení přístupu pomocí autentizace, rolí, serverových autorizačních kontrol a databázových RLS pravidel tam, kde se používají;',
          'oddělení privilegovaných serverových přístupů od klienta, ochrana secretů a princip nejmenších oprávnění;',
          'náhodné capability tokeny a jejich hashování u citlivých live a studentských cest tam, kde se používají;',
          'šifrovaný přenos přes TLS a šifrování uložených dat poskytované spravovanou infrastrukturou;',
          'rate limiting, ochrana formulářů, bezpečnostní logování, diagnostika a pravidelné bezpečnostní kontroly;',
          'u současných AI inference cest vynucení režimu zero data retention na úrovni Vercel AI Gateway; Syllonaut nepoužívá obsah Správce k trénování vlastních obecných AI modelů;',
          'retenční automatika pro živé lekce: ukončené sessions jsou určeny k automatickému smazání po 12 měsících, opuštěné lobby/live sessions po 30 dnech a krátkodobé editační zámky po 24 hodinách;',
          'opatření dostupnosti a obnovy poskytovaná použitou spravovanou infrastrukturou a průběžné hardening testy aplikace.',
        ],
      },
      {
        title: '6. Pomoc Správci',
        paragraphs: [
          'S ohledem na povahu zpracování bude Zpracovatel Správci přiměřeně nápomocen při vyřizování žádostí subjektů údajů, zabezpečení zpracování, posouzení vlivu na ochranu osobních údajů, předchozí konzultaci s dozorovým úřadem a při plnění oznamovacích povinností při porušení zabezpečení.',
          'Žádosti o tuto součinnost lze zaslat na vaclav@syllonaut.com. Zpracovatel poskytne informace a technickou součinnost v rozsahu, který má k dispozici a který odpovídá povaze poskytované služby. Pokud Zpracovatel obdrží přímo žádost subjektu údajů týkající se dat Správce, předá ji Správci bez zbytečného odkladu a bez jeho pokynu nebude sám rozhodovat o jejím věcném vyřízení, nevyžaduje-li právní předpis jinak.',
        ],
      },
      {
        title: '7. Porušení zabezpečení osobních údajů',
        paragraphs: [
          'Zjistí-li Zpracovatel porušení zabezpečení osobních údajů zpracovávaných jménem Správce, oznámí jej Správci bez zbytečného odkladu. Oznámení bude obsahovat dostupné informace potřebné pro posouzení incidentu, zejména povahu incidentu, dotčené kategorie dat a subjektů údajů, pravděpodobné důsledky a přijatá nebo navržená opatření. Informace mohou být doplňovány postupně, nejsou-li všechny dostupné současně.',
        ],
      },
      {
        title: '8. Další zpracovatelé (subprocesory)',
        paragraphs: [
          'Správce uděluje Zpracovateli obecné písemné oprávnění využívat níže uvedené další zpracovatele. Zpracovatel zajistí, aby jim byly smluvně uloženy povinnosti ochrany osobních údajů odpovídající této DPA v rozsahu jejich zpracování.',
          'O plánovaném přidání nebo nahrazení dalšího zpracovatele, který může zpracovávat data Správce, Zpracovatel informuje nejméně 15 dnů předem prostřednictvím fakturačního e-mailu organizace nebo oznámení ve službě, je-li to rozumně možné. Správce může do 10 dnů vznést odůvodněnou námitku z důvodů ochrany osobních údajů. U naléhavé bezpečnostní nebo zákonné změny může být subprocesor nahrazen dříve; Správce bude informován bez zbytečného odkladu.',
        ],
        table: {
          headers: ['Subprocesor', 'Účel', 'Typicky dotčená data'],
          rows: [
            ['Supabase, Inc. · 970 Toa Payoh North #07-04, Singapore 318992 · privacy@supabase.io', 'Autentizace a databázová infrastruktura', 'účty organizace, lekce, live session data, odpovědi a výsledky'],
            ['Vercel Inc. · 440 N Barranca Ave #4133, Covina, CA 91723, USA · privacy@vercel.com', 'Hosting aplikace, serverový runtime a AI Gateway', 'data požadavků potřebná pro provoz a příslušné AI operace'],
            ['Cloudflare, Inc. · 101 Townsend St., San Francisco, CA 94107, USA · privacyquestions@cloudflare.com', 'Turnstile a live-resilience/control-plane infrastruktura', 'technické a relační údaje potřebné pro ochranu a live provoz'],
            ['Plus Five Five, Inc. (Resend) · 2261 Market Street #5039, San Francisco, CA 94114, USA · privacy@resend.com', 'Transakční e-maily a organizační pozvánky', 'e-mailové adresy příjemců a obsah provozních zpráv'],
            ['OpenAI Ireland Limited · 1st Floor, The Liffey Trust Centre, 117-126 Sheriff Street Upper, Dublin 1, D01 YC43, Ireland · privacy@openai.com', 'Vybrané AI inference operace', 'obsah předaný do konkrétní AI operace, pokud je tato cesta použita'],
            ['Amazon Web Services EMEA SARL · 38 Avenue John F. Kennedy, L-1855 Luxembourg · aws-EU-privacy@amazon.com', 'Amazon Bedrock — vybrané AI inference cesty pro práci s podklady', 'obsah předaný do konkrétní AI operace, pokud je tato cesta použita'],
            ['Microsoft Ireland Operations Limited · One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, D18 P521, Ireland · Attn: Data Protection Officer', 'Azure AI — vybrané AI inference cesty pro práci s podklady', 'obsah předaný do konkrétní AI operace, pokud je tato cesta použita'],
          ],
        },
      },
      {
        title: '9. Předávání mimo EHP',
        paragraphs: [
          'Pokud další zpracovatel zpracovává osobní údaje mimo Evropský hospodářský prostor a nejde o zemi s odpovídající úrovní ochrany, Zpracovatel zajistí použití vhodného mechanismu podle kapitoly V GDPR, například standardních smluvních doložek, a v potřebném rozsahu doplňkových opatření.',
        ],
      },
      {
        title: '10. Výmaz nebo vrácení dat',
        paragraphs: [
          'Po skončení poskytování služeb souvisejících se zpracováním osobních údajů Zpracovatel podle volby Správce osobní údaje zpracovávané jménem Správce vymaže nebo je v přiměřeném běžně použitelném elektronickém formátu vrátí a následně vymaže existující kopie, ledaže další uchování vyžaduje právní předpis. Volbu výmazu nebo vrácení může Správce sdělit na vaclav@syllonaut.com před ukončením služby nebo bez zbytečného odkladu po něm.',
          'Výmaz z technických záloh může probíhat v rámci běžného retenčního cyklu záloh; do té doby nesmějí být taková data znovu použita pro běžné aktivní zpracování. Zákonné záznamy, které Syllonaut uchovává jako samostatný správce, tím nejsou dotčeny.',
        ],
      },
      {
        title: '11. Informace a audit',
        paragraphs: [
          'Zpracovatel poskytne Správci informace nezbytné k doložení plnění povinností podle čl. 28 GDPR a umožní přiměřené audity nebo kontroly prováděné Správcem nebo jím pověřeným auditorem. Přednostně se použije existující bezpečnostní a smluvní dokumentace a vzdálené ověření.',
          'Běžný audit lze požadovat nejvýše jednou za 12 měsíců s přiměřeným předstihem; toto omezení se neuplatní při závažném bezpečnostním incidentu, důvodném podezření na porušení DPA nebo požadavku dozorového úřadu. Audit nesmí nepřiměřeně ohrozit bezpečnost, důvěrnost jiných zákazníků ani provoz služby.',
        ],
      },
      {
        title: '12. Doba trvání a závěrečná ustanovení',
        paragraphs: [
          'Tato DPA trvá po dobu, kdy Zpracovatel zpracovává osobní údaje jménem Správce. Povinnosti, které svou povahou mají trvat i po skončení smlouvy, zejména důvěrnost, výmaz/vrácení dat a doložení zpracování, trvají do jejich splnění.',
          'V otázkách zpracování osobních údajů jménem Správce má tato DPA přednost před obecnými smluvními podmínkami. Ostatní části smluvního vztahu se řídí příslušnými obchodními podmínkami Syllonautu a použitelným právem.',
          'České a anglické znění jsou určeny k vyjádření stejného obsahu. Při neodstranitelném rozporu má přednost české znění, nevyžaduje-li kogentní právo jinak.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'Data protection · organisations',
    title: 'Data Processing Addendum (DPA)',
    intro: 'This Data Processing Addendum under Article 28 GDPR governs personal data that Syllonaut processes on behalf of a school, company or other organisation using the Team, School or Campus plan.',
    versionLabel: `Version ${DPA_VERSION} · effective ${DPA_EFFECTIVE_DATE}`,
    sections: [
      {
        title: '1. Parties, roles and formation',
        paragraphs: [
          'The controller is the school, company or other organisation identified in the Syllonaut order (the “Controller”). The processor is Václav Loubek, Business ID 88878431, Slepá 868, 289 24 Milovice – Mladá, Czech Republic, operator of Syllonaut (the “Processor”).',
          'This DPA becomes binding when an authorised person expressly accepts the current DPA on behalf of the Controller when ordering a Team, School or Campus plan. The DPA supplements the contractual relationship for use of Syllonaut.',
          'This DPA applies only where the Processor processes personal data on behalf of the Controller. For its own purposes, including billing, accounting, service security, legal-claim protection and contractual evidence, the Syllonaut operator acts as an independent controller as described in the Privacy Notice.',
        ],
      },
      {
        title: '2. Subject matter, duration, nature and purpose',
        bullets: [
          'Subject matter: operation and provision of Syllonaut features for preparing, storing, running and evaluating interactive teaching.',
          'Duration: for the active contractual relationship and afterwards only as needed for secure termination, deletion or return of data and applicable legal retention duties.',
          'Nature and purpose: storing and displaying teaching content, operating live lessons, processing student responses and results, team work, evaluation and AI operations initiated by an authorised Controller user.',
          'Categories of data subjects: mainly pupils, students and other lesson participants; also teachers and Controller staff to the extent their personal data is included in content processed on the Controller’s behalf.',
          'Types of personal data: participant display name or other identifier, responses and submitted content, team assignment, scores and results, submission times, lesson/source content entered by the Controller and technical session identifiers required for operation.',
          'Syllonaut is not designed for systematic processing of special categories of personal data. The Controller should not submit such data unless necessary for a legitimate teaching purpose and supported by an appropriate legal basis and safeguards.',
        ],
      },
      {
        title: '3. Controller instructions and responsibilities',
        paragraphs: [
          'The Processor processes personal data only on documented Controller instructions unless Union or Member State law requires otherwise. Documented instructions include service configuration, actions by authorised Controller users and written instructions sent to vaclav@syllonaut.com.',
          'If the Processor believes an instruction infringes the GDPR or other applicable data-protection law, it will inform the Controller immediately and may suspend the affected instruction until the issue is clarified.',
          'The Controller remains responsible for the lawfulness of its instructions, the legal basis for processing, transparency obligations, data minimisation and management of its users’ permissions.',
        ],
      },
      {
        title: '4. Confidentiality',
        paragraphs: [
          'The Processor will ensure that persons authorised to process personal data are bound by confidentiality or an appropriate statutory duty and receive access only to the extent required for their work.',
        ],
      },
      {
        title: '5. Technical and organisational measures',
        bullets: [
          'access control using authentication, roles, server-side authorisation checks and database RLS rules where applicable;',
          'separation of privileged server access from the client, protection of secrets and least-privilege access;',
          'random capability tokens and hashing on sensitive live/student paths where used;',
          'encrypted transport using TLS and managed-infrastructure encryption at rest;',
          'rate limiting, form protection, security logging, diagnostics and recurring security checks;',
          'zero data retention enforced at the Vercel AI Gateway layer for current AI inference paths; Syllonaut does not use Controller content to train its own general-purpose AI models;',
          'live-session retention automation: ended sessions are scheduled for deletion after 12 months, abandoned lobby/live sessions after 30 days and short-lived edit locks after 24 hours;',
          'availability and recovery measures supplied by the managed infrastructure together with ongoing application hardening tests.',
        ],
      },
      {
        title: '6. Assistance to the Controller',
        paragraphs: [
          'Taking account of the nature of processing, the Processor will reasonably assist the Controller with data-subject requests, security obligations, data-protection impact assessments, prior consultation and personal-data-breach obligations.',
          'Requests for such assistance may be sent to vaclav@syllonaut.com. The Processor will provide information and technical assistance available to it and appropriate to the nature of the service. If the Processor receives a data-subject request directly concerning Controller data, it will forward the request to the Controller without undue delay and will not independently decide its substantive outcome without Controller instructions unless applicable law requires otherwise.',
        ],
      },
      {
        title: '7. Personal data breaches',
        paragraphs: [
          'If the Processor becomes aware of a personal data breach affecting data processed on the Controller’s behalf, it will notify the Controller without undue delay. The notice will include available information needed to assess the incident, including its nature, affected categories of data and data subjects, likely consequences and measures taken or proposed. Information may be supplied in phases where it is not all available at the same time.',
        ],
      },
      {
        title: '8. Sub-processors',
        paragraphs: [
          'The Controller gives the Processor general written authorisation to use the sub-processors listed below. The Processor will impose data-protection obligations on them that correspond to this DPA to the extent of their processing.',
          'Where reasonably possible, the Processor will give at least 15 days’ advance notice of an intended addition or replacement of a sub-processor that may process Controller data, using the organisation billing email or an in-service notice. The Controller may object on reasonable data-protection grounds within 10 days. An urgent security or legal replacement may take effect sooner, with notice without undue delay.',
        ],
        table: {
          headers: ['Sub-processor', 'Purpose', 'Typical affected data'],
          rows: [
            ['Supabase, Inc. · 970 Toa Payoh North #07-04, Singapore 318992 · privacy@supabase.io', 'Authentication and database infrastructure', 'organisation accounts, lessons, live-session data, responses and results'],
            ['Vercel Inc. · 440 N Barranca Ave #4133, Covina, CA 91723, USA · privacy@vercel.com', 'Application hosting, server runtime and AI Gateway', 'request data required for operation and the relevant AI operation'],
            ['Cloudflare, Inc. · 101 Townsend St., San Francisco, CA 94107, USA · privacyquestions@cloudflare.com', 'Turnstile and live-resilience/control-plane infrastructure', 'technical and relational data required for protection and live operation'],
            ['Plus Five Five, Inc. (Resend) · 2261 Market Street #5039, San Francisco, CA 94114, USA · privacy@resend.com', 'Transactional email and organisation invitations', 'recipient email addresses and operational message content'],
            ['OpenAI Ireland Limited · 1st Floor, The Liffey Trust Centre, 117-126 Sheriff Street Upper, Dublin 1, D01 YC43, Ireland · privacy@openai.com', 'Selected AI inference operations', 'content supplied to the specific AI operation when that route is used'],
            ['Amazon Web Services EMEA SARL · 38 Avenue John F. Kennedy, L-1855 Luxembourg · aws-EU-privacy@amazon.com', 'Amazon Bedrock — selected AI inference paths for source-material workflows', 'content supplied to the specific AI operation when that route is used'],
            ['Microsoft Ireland Operations Limited · One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, D18 P521, Ireland · Attn: Data Protection Officer', 'Azure AI — selected AI inference paths for source-material workflows', 'content supplied to the specific AI operation when that route is used'],
          ],
        },
      },
      {
        title: '9. International transfers',
        paragraphs: [
          'Where a sub-processor processes personal data outside the European Economic Area and no adequacy decision applies, the Processor will ensure an appropriate Chapter V GDPR transfer mechanism, such as Standard Contractual Clauses, together with supplementary measures where required.',
        ],
      },
      {
        title: '10. Deletion or return of data',
        paragraphs: [
          'After the end of services involving personal-data processing, the Processor will, at the Controller’s choice, delete personal data processed on its behalf or return it in a reasonable commonly used electronic format and then delete existing copies, unless applicable law requires further retention. The Controller may communicate its deletion or return choice to vaclav@syllonaut.com before termination or without undue delay afterwards.',
          'Deletion from technical backups may follow the normal backup-retention cycle; until then the data must not be restored for ordinary active processing. Statutory records that Syllonaut retains as an independent controller are not affected.',
        ],
      },
      {
        title: '11. Information and audits',
        paragraphs: [
          'The Processor will make available the information necessary to demonstrate compliance with Article 28 GDPR and allow reasonable audits or inspections by the Controller or an auditor mandated by it. Existing security and contractual documentation and remote verification should be used first.',
          'A routine audit may be requested no more than once in any 12-month period with reasonable advance notice. This limit does not apply after a serious security incident, where there is reasonable evidence of a DPA breach or where a supervisory authority requires an audit. Audits must not unreasonably compromise security, other customers’ confidentiality or service operation.',
        ],
      },
      {
        title: '12. Term and final provisions',
        paragraphs: [
          'This DPA remains in force while the Processor processes personal data on the Controller’s behalf. Obligations intended by their nature to survive, including confidentiality, deletion/return and demonstrating compliance, continue until fulfilled.',
          'For processing personal data on the Controller’s behalf, this DPA prevails over general contractual terms. Other aspects of the contractual relationship remain governed by the applicable Syllonaut Terms and applicable law.',
          'The Czech and English versions are intended to express the same substance. If an irreconcilable conflict remains, the Czech version prevails unless mandatory law requires otherwise.',
        ],
      },
    ],
  },
};
