import { DPA_EFFECTIVE_DATE, DPA_VERSION } from '@/lib/legal';

export type DpaLocale = 'cs' | 'en';

export type DpaSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type DpaSubprocessor = {
  provider: string;
  legalEntity: string;
  address: string;
  contact: string;
  purpose: string;
  dataScope: string;
  transfer: string;
};

// TODO(owner): set the date when the read-only Supabase backup will be
// deleted (ISO yyyy-mm-dd). Until then the DPA states it is kept until deletion.
const SUPABASE_BACKUP_DELETION_DATE: string | null = null;

function formatDpaDate(isoDate: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(isoDate + 'T12:00:00Z'));
}

export function getDpaDocument(locale: DpaLocale) {
  const english = locale === 'en';
  const supabaseBackupUntil = SUPABASE_BACKUP_DELETION_DATE
    ? formatDpaDate(SUPABASE_BACKUP_DELETION_DATE, english)
    : null;

  const subprocessors: DpaSubprocessor[] = english ? [
    {
      provider: 'Neon (Databricks)',
      legalEntity: 'Databricks, Inc. (parent company of Neon, LLC)',
      address: '160 Spear Street, Suite 1300, San Francisco, CA 94105, United States',
      contact: 'privacy@databricks.com',
      purpose: 'Production PostgreSQL database, authentication (Neon Auth) and Data API.',
      dataScope: 'Teacher/admin account and sign-in data, organisation membership data, lesson/session data, student display names, responses, results and related metadata stored in Syllonaut.',
      transfer: 'The production project is hosted in the EU (AWS eu-central-1, Frankfurt). Any access from outside the EEA is covered by the Standard Contractual Clauses in the Databricks Data Processing Addendum.',
    },
    {
      provider: 'Supabase',
      legalEntity: 'Supabase, Inc.',
      address: '970 Toa Payoh North #07-04, Singapore 318992',
      contact: 'privacy@supabase.io',
      purpose: supabaseBackupUntil
        ? 'Read-only backup of the former database until ' + supabaseBackupUntil + '. No new data is written to it.'
        : 'Read-only backup of the former database until the backup is deleted. No new data is written to it.',
      dataScope: 'Data stored in Syllonaut up to the move to Neon on 23 September 2026: teacher/admin account data, organisation membership data, lesson/session data, student display names, responses, results and related metadata.',
      transfer: 'The backup is hosted in the EU (eu-west-1). Any other processing by the provider must be covered by the provider’s applicable GDPR transfer safeguards.',
    },
    {
      provider: 'Vercel',
      legalEntity: 'Vercel Inc.',
      address: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
      contact: 'privacy@vercel.com',
      purpose: 'Application hosting, serverless execution, delivery infrastructure and AI Gateway.',
      dataScope: 'Application requests, technical metadata and content that must pass through the application or AI Gateway to perform the controller-requested operation.',
      transfer: 'Where processing occurs outside the EEA, Syllonaut relies on an applicable Chapter V GDPR transfer mechanism.',
    },
    {
      provider: 'Cloudflare',
      legalEntity: 'Cloudflare, Inc.',
      address: '101 Townsend St., San Francisco, CA 94107, United States',
      contact: 'Data Protection Officer · privacyquestions@cloudflare.com',
      purpose: 'Turnstile bot protection on the sign-in and registration forms, and Workers / Durable Objects for real-time control of live lessons.',
      dataScope: 'Turnstile: technical request, browser and anti-abuse signals; lesson content and student answers are not supplied to Turnstile. Live control: student display names, the lesson content shown to students, student and team responses and live-session state. Live-control data is deleted automatically 7 days after the session’s last activity.',
      transfer: 'Live-control Durable Objects run and store data only in the Cloudflare EU jurisdiction. The stateless entry Worker handles requests in the nearest Cloudflare data centre, and Cloudflare logs the object identifier outside the EU for billing and debugging; any processing outside the EEA is covered by the provider’s applicable Chapter V GDPR transfer safeguards.',
    },
    {
      provider: 'Resend',
      legalEntity: 'Plus Five Five, Inc.',
      address: '2261 Market Street #5039, San Francisco, CA 94114, United States',
      contact: 'Resend Security · privacy@resend.com',
      purpose: 'Transactional emails, organisation invitations and service notifications.',
      dataScope: 'Teacher/admin email addresses and the content of the relevant operational email. Student answers are not intentionally sent through Resend.',
      transfer: 'Where processing occurs outside the EEA, the provider’s applicable GDPR transfer safeguards are used.',
    },
    {
      provider: 'OpenAI',
      legalEntity: 'OpenAI Ireland Limited',
      address: '1st Floor, The Liffey Trust Centre, 117–126 Sheriff Street Upper, Dublin 1, D01 YC43, Ireland',
      contact: 'privacy@openai.com',
      purpose: 'AI lesson generation/revision and AI evaluation/grading on routes that use OpenAI.',
      dataScope: 'Prompts, lesson text and, where the controller uses AI grading, the student response and grading context needed for that operation.',
      transfer: 'Current Syllonaut AI routes enforce zero data retention at the Vercel AI Gateway layer. Any transfer outside the EEA must be covered by an applicable Chapter V GDPR mechanism.',
    },
    {
      provider: 'Amazon Web Services (Bedrock)',
      legalEntity: 'Amazon Web Services EMEA SARL',
      address: '38 Avenue John F. Kennedy, L-1855 Luxembourg',
      contact: 'Data Protection Officer · aws-EU-privacy@amazon.com',
      purpose: 'AI processing for supported generation flows using source materials when selected by Syllonaut routing.',
      dataScope: 'Prompt and extracted source text needed for the requested AI operation.',
      transfer: 'Processing is used only through the configured Syllonaut route and must remain covered by applicable GDPR transfer safeguards.',
    },
    {
      provider: 'Microsoft Azure',
      legalEntity: 'Microsoft Ireland Operations Limited',
      address: 'One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, Ireland',
      contact: 'Data Protection Officer',
      purpose: 'AI processing for supported generation flows using source materials when selected by Syllonaut routing.',
      dataScope: 'Prompt and extracted source text needed for the requested AI operation.',
      transfer: 'Processing is used only through the configured Syllonaut route and must remain covered by applicable GDPR transfer safeguards.',
    },
  ] : [
    {
      provider: 'Neon (Databricks)',
      legalEntity: 'Databricks, Inc. (mateřská společnost Neon, LLC)',
      address: '160 Spear Street, Suite 1300, San Francisco, CA 94105, United States',
      contact: 'privacy@databricks.com',
      purpose: 'Produkční PostgreSQL databáze, autentizace (Neon Auth) a Data API.',
      dataScope: 'Údaje účtů učitelů/adminů a přihlašovací údaje, členství organizace, data lekcí a sessions, zobrazovaná jména studentů, odpovědi, výsledky a související metadata ukládaná v Syllonautu.',
      transfer: 'Produkční projekt je hostován v EU (AWS eu-central-1, Frankfurt). Případný přístup mimo EHP kryjí standardní smluvní doložky v Data Processing Addendum společnosti Databricks.',
    },
    {
      provider: 'Supabase',
      legalEntity: 'Supabase, Inc.',
      address: '970 Toa Payoh North #07-04, Singapore 318992',
      contact: 'privacy@supabase.io',
      purpose: supabaseBackupUntil
        ? 'Záloha dřívější databáze jen pro čtení do ' + supabaseBackupUntil + '. Nová data se do ní nezapisují.'
        : 'Záloha dřívější databáze jen pro čtení do jejího smazání. Nová data se do ní nezapisují.',
      dataScope: 'Data uložená v Syllonautu do přechodu na Neon 23. 9. 2026: údaje účtů učitelů/adminů, členství organizace, data lekcí a sessions, zobrazovaná jména studentů, odpovědi, výsledky a související metadata.',
      transfer: 'Záloha je hostována v EU (eu-west-1). Případné další zpracování dodavatelem musí být kryto odpovídajícími zárukami pro předávání podle GDPR.',
    },
    {
      provider: 'Vercel',
      legalEntity: 'Vercel Inc.',
      address: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
      contact: 'privacy@vercel.com',
      purpose: 'Hosting aplikace, serverless běh, doručovací infrastruktura a AI Gateway.',
      dataScope: 'Aplikační požadavky, technická metadata a obsah, který musí projít aplikací nebo AI Gateway k provedení operace vyžádané správcem.',
      transfer: 'Pokud zpracování probíhá mimo EHP, Syllonaut používá použitelný mechanismus předávání podle kapitoly V GDPR.',
    },
    {
      provider: 'Cloudflare',
      legalEntity: 'Cloudflare, Inc.',
      address: '101 Townsend St., San Francisco, CA 94107, United States',
      contact: 'Data Protection Officer · privacyquestions@cloudflare.com',
      purpose: 'Turnstile – ochrana formulářů přihlášení a registrace proti robotům – a Workers / Durable Objects pro řízení živých lekcí v reálném čase.',
      dataScope: 'Turnstile: technické údaje o požadavku, prohlížeči a signály proti zneužití; obsah lekcí a studentské odpovědi se do Turnstile nepředávají. Živé řízení: zobrazovaná jména studentů, obsah lekce zobrazený studentům, odpovědi studentů a týmů a stav živé hodiny. Data živého řízení se automaticky mažou 7 dní po poslední aktivitě hodiny.',
      transfer: 'Durable Objects pro živé řízení běží a ukládají data jen v jurisdikci EU společnosti Cloudflare. Bezstavový vstupní Worker vyřizuje požadavky v nejbližším datovém centru Cloudflare a identifikátor objektu Cloudflare loguje i mimo EU pro účely fakturace a ladění; případné zpracování mimo EHP kryjí odpovídající záruky dodavatele podle kapitoly V GDPR.',
    },
    {
      provider: 'Resend',
      legalEntity: 'Plus Five Five, Inc.',
      address: '2261 Market Street #5039, San Francisco, CA 94114, United States',
      contact: 'Resend Security · privacy@resend.com',
      purpose: 'Transakční e-maily, pozvánky do organizace a provozní notifikace.',
      dataScope: 'E-mailové adresy učitelů/adminů a obsah příslušného provozního e-mailu. Studentské odpovědi nejsou přes Resend záměrně odesílány.',
      transfer: 'Pokud zpracování probíhá mimo EHP, použijí se odpovídající záruky dodavatele podle GDPR.',
    },
    {
      provider: 'OpenAI',
      legalEntity: 'OpenAI Ireland Limited',
      address: '1st Floor, The Liffey Trust Centre, 117–126 Sheriff Street Upper, Dublin 1, D01 YC43, Ireland',
      contact: 'privacy@openai.com',
      purpose: 'AI tvorba/úpravy lekcí a AI hodnocení na cestách, které používají OpenAI.',
      dataScope: 'Prompty, text lekce a při využití AI hodnocení také studentská odpověď a hodnoticí kontext nutný pro danou operaci.',
      transfer: 'Současné AI cesty Syllonautu vynucují na úrovni Vercel AI Gateway zero data retention. Případné předání mimo EHP musí být kryto použitelným mechanismem podle kapitoly V GDPR.',
    },
    {
      provider: 'Amazon Web Services (Bedrock)',
      legalEntity: 'Amazon Web Services EMEA SARL',
      address: '38 Avenue John F. Kennedy, L-1855 Luxembourg',
      contact: 'Data Protection Officer · aws-EU-privacy@amazon.com',
      purpose: 'AI zpracování u podporovaných cest generování s podklady, pokud tuto cestu vybere routing Syllonautu.',
      dataScope: 'Prompt a extrahovaný text podkladů potřebný pro vyžádanou AI operaci.',
      transfer: 'Zpracování probíhá pouze přes nakonfigurovanou cestu Syllonautu a musí zůstat kryto odpovídajícími zárukami podle GDPR.',
    },
    {
      provider: 'Microsoft Azure',
      legalEntity: 'Microsoft Ireland Operations Limited',
      address: 'One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, Ireland',
      contact: 'Data Protection Officer',
      purpose: 'AI zpracování u podporovaných cest generování s podklady, pokud tuto cestu vybere routing Syllonautu.',
      dataScope: 'Prompt a extrahovaný text podkladů potřebný pro vyžádanou AI operaci.',
      transfer: 'Zpracování probíhá pouze přes nakonfigurovanou cestu Syllonautu a musí zůstat kryto odpovídajícími zárukami podle GDPR.',
    },
  ];

  const sections: DpaSection[] = english ? [
    {
      heading: '1. Parties, role and incorporation into the service contract',
      paragraphs: [
        'The controller is the school, company or other organisation identified in the Syllonaut organisation order, or a teacher with an individual Free, Teacher or Teacher Pro account who uses Syllonaut to process students’ personal data in teaching (or the school or organisation for which that teacher teaches) (“Controller”). The processor is Václav Loubek, Business ID 88878431, Slepá 868, 289 24 Milovice – Mladá, Czech Republic (“Processor” or “Syllonaut”).',
        'This Data Processing Agreement (“DPA”) forms part of the Syllonaut service contract when an authorised representative of the Controller expressly accepts the DPA in the organisation ordering flow. For individual accounts it forms part of the contract concluded by accepting the Terms (Terms section 2). It applies only to processing performed by Syllonaut on behalf of the Controller.',
        'Where Syllonaut determines its own purposes and means of processing, in particular for its own billing, accounting, fraud prevention, service security, legal claims and contract evidence, Syllonaut acts as an independent controller and that processing is governed by the Privacy Notice rather than this DPA.',
      ],
    },
    {
      heading: '2. Subject matter, duration, nature and purpose of processing',
      paragraphs: [
        'Syllonaut processes personal data on behalf of the Controller to provide, secure and support the organisation or individual teacher account, lesson authoring and sharing, live classroom sessions, student participation, responses and results, teacher administration and, where enabled and requested, AI-assisted lesson operations and AI evaluation.',
        'Processing lasts for the duration of the organisation or individual service relationship and for the limited period needed to return or delete Controller Data after termination, unless Union or Member State law requires continued storage.',
      ],
    },
    {
      heading: '3. Data subjects and categories of personal data',
      bullets: [
        'Data subjects: teachers, organisation owners/administrators, invited staff and students/participants joining live lessons of the Controller.',
        'Account and administration data: name where provided, email address, account identifiers, role, organisation membership and invitation data.',
        'Student/live lesson data: display name, responses, team assignment, results, submission timestamps and session/participation metadata.',
        'Teaching content: lesson text, teacher instructions, source text extracted from uploaded materials and other content supplied by authorised users where it contains personal data.',
        'Technical and security data: request/session identifiers, device/security signals and audit metadata needed to operate and protect the service.',
        'Special-category or highly sensitive personal data are not required for Syllonaut’s normal operation. The Controller must not submit such data unless it has determined that doing so is necessary, lawful and appropriately safeguarded.',
      ],
    },
    {
      heading: '4. Documented instructions and limits on use',
      paragraphs: [
        'The Processor shall process Controller Data only on documented instructions from the Controller, including this DPA, the Terms, organisation settings, actions performed by authorised organisation users and documented support requests. If Union or Member State law requires other processing, the Processor will inform the Controller before processing unless the law prohibits that notice.',
        'The Processor shall not use Controller Data for unrelated advertising, profiling or its own model training. Current Syllonaut AI inference routes enforce zero data retention at the Vercel AI Gateway layer.',
        'If the Processor believes an instruction infringes the GDPR or other applicable Union or Member State data-protection law, it shall inform the Controller without undue delay.',
      ],
    },
    {
      heading: '5. Confidentiality, access control and technical and organisational measures',
      bullets: [
        'Access to organisation and student data is restricted to authorised users and server-side service paths according to role and scope.',
        'Persons authorised by the Processor to handle Controller Data are subject to confidentiality obligations or an appropriate statutory duty of confidentiality.',
        'Database access is protected by server-side authorisation, row-level security and least-privilege grants where applicable; privileged internal tables are not intentionally exposed to ordinary clients.',
        'Secrets and service credentials are kept out of client-side code and source control; sensitive server operations use dedicated server credentials.',
        'Transport uses HTTPS/TLS. Capability and invitation tokens use cryptographically strong random values and/or stored hashes where implemented.',
        'Operational analytics are designed not to receive lesson prompts, lesson text, student answers, student names or other content/PII payloads.',
        'Retention jobs and product rules limit storage of live-session data; ended live sessions are scheduled for deletion after 12 months and abandoned lobby/live sessions after 30 days unless an earlier deletion instruction applies. Real-time live-control copies (Cloudflare Durable Objects) are deleted automatically 7 days after the session’s last activity.',
        'Current AI routes use zero-data-retention configuration and Syllonaut applies input/content separation so student or source text is treated as untrusted content, not as authority to alter system instructions.',
      ],
    },
    {
      heading: '6. Sub-processors and changes to the list',
      paragraphs: [
        'The Controller gives general prior authorisation for the Processor to use the sub-processors listed below. The Processor shall impose data-protection obligations on each sub-processor that are no less protective for the relevant processing than the obligations applicable to the Processor under this DPA.',
        'For a planned addition or replacement of a sub-processor that may materially affect Controller Data, the Processor will provide notice at least 15 days in advance where reasonably practicable. The Controller may object within 10 days on reasonable documented data-protection grounds. The parties will seek a practical resolution; if none is reasonably available, the Controller may terminate the affected processing/service without being forced to continue processing through the objected sub-processor.',
        'Where an urgent security, availability or legal requirement makes advance notice impracticable, the Processor may make the change first and notify the Controller without undue delay.',
      ],
    },
    {
      heading: '7. Assistance with data-subject rights, DPIAs and supervisory authorities',
      paragraphs: [
        'Taking into account the nature of the processing, the Processor shall provide reasonable assistance through appropriate technical and organisational measures so the Controller can respond to requests for access, rectification, erasure, restriction, portability or objection where applicable.',
        'The Processor shall provide reasonable information and assistance for data-protection impact assessments and prior consultation with a supervisory authority where the requested assistance relates to processing carried out by Syllonaut on behalf of the Controller.',
        'If Syllonaut directly receives a request relating to Controller Data, it will not independently decide the request on the Controller’s behalf unless legally required; where appropriate it will direct the requester to the Controller or notify the Controller.',
      ],
    },
    {
      heading: '8. Personal-data breaches',
      paragraphs: [
        'The Processor shall notify the Controller without undue delay after becoming aware of a personal-data breach affecting Controller Data. The notice will include the information reasonably available to Syllonaut about the nature of the breach, affected categories of data/data subjects, likely consequences and measures taken or proposed to address the breach. Information may be provided in phases where it is not available at the same time.',
        'The Processor shall reasonably cooperate with the Controller in investigating, containing and documenting the incident and in meeting the Controller’s notification obligations.',
      ],
    },
    {
      heading: '9. Return and deletion of Controller Data',
      paragraphs: [
        'During the service term, the Controller may use available product features or contact vaclav@syllonaut.com to request deletion or a reasonable export/return of Controller Data.',
        'On termination of the organisation service, the Controller may request return of available Controller Data in a reasonably usable format. Unless return is requested or Union/Member State law requires continued storage, the Processor will delete personal data processed solely on behalf of the Controller after the service relationship ends and the operational wind-down needed to complete that deletion.',
        'This clause does not require deletion of data that Syllonaut must retain in its separate role as controller, such as invoices, payment records, security evidence or contract/acceptance evidence, which is governed by the Privacy Notice and applicable law.',
      ],
    },
    {
      heading: '10. Demonstrating compliance and audits',
      paragraphs: [
        'The Processor shall make available the information reasonably necessary to demonstrate compliance with Article 28 GDPR and this DPA. The Controller may request a reasonable audit or inspection relevant to Controller Data, subject to appropriate confidentiality and security controls.',
        'Unless required by a supervisory authority, a material incident or credible evidence of non-compliance, audits should ordinarily be limited to once in any 12-month period, be notified reasonably in advance and avoid unnecessary disruption or exposure of other customers’ data.',
      ],
    },
    {
      heading: '11. International transfers, precedence and contact',
      paragraphs: [
        'The Processor shall not transfer Controller Data outside the EEA unless the transfer is permitted under Chapter V GDPR, for example because an adequacy decision applies or appropriate safeguards such as standard contractual clauses are in place.',
        'If this DPA conflicts with the Terms on an issue specifically concerning processing of Controller Data on behalf of the Controller, this DPA prevails for that issue. Mandatory GDPR obligations remain unaffected.',
        'Data-protection and DPA notices may be sent to vaclav@syllonaut.com. The current DPA version is ' + DPA_VERSION + ', effective from ' + DPA_EFFECTIVE_DATE + '.',
      ],
    },
  ] : [
    {
      heading: '1. Strany, role a začlenění do smlouvy o službě',
      paragraphs: [
        'Správcem je škola, firma nebo jiná organizace uvedená v objednávce organizace Syllonaut, nebo učitel s individuálním účtem Free, Teacher či Teacher Pro, který Syllonaut používá ke zpracování osobních údajů studentů při výuce (případně škola či organizace, pro kterou učitel výuku vede) („Správce“). Zpracovatelem je Václav Loubek, IČO 88878431, Slepá 868, 289 24 Milovice – Mladá, Česká republika („Zpracovatel“ nebo „Syllonaut“).',
        'Tato smlouva o zpracování osobních údajů („DPA“) tvoří součást smlouvy o službě Syllonaut okamžikem, kdy ji oprávněný zástupce Správce výslovně přijme v objednávkovém procesu organizace. U individuálních účtů je součástí smlouvy uzavřené přijetím VOP (čl. 2 VOP). Použije se pouze na zpracování, které Syllonaut provádí jménem Správce.',
        'Pokud Syllonaut určuje vlastní účely a prostředky zpracování, zejména pro vlastní fakturaci a účetnictví, prevenci podvodů, zabezpečení služby, právní nároky a doložení smluv, vystupuje jako samostatný správce a takové zpracování se řídí Privacy Notice, nikoli touto DPA.',
      ],
    },
    {
      heading: '2. Předmět, doba, povaha a účel zpracování',
      paragraphs: [
        'Syllonaut zpracovává osobní údaje jménem Správce za účelem poskytování, zabezpečení a podpory účtu organizace nebo individuálního účtu učitele, tvorby a sdílení lekcí, živých výukových sessions, zapojení studentů, odpovědí a výsledků, správy učitelů a – pokud je funkce zapnuta a Správcem vyžádána – AI operací nad lekcemi a AI hodnocení.',
        'Zpracování trvá po dobu smluvního vztahu organizace nebo individuálního účtu a po omezenou dobu nezbytnou k vrácení nebo výmazu dat Správce po ukončení, ledaže právo EU nebo členského státu vyžaduje další uchování.',
      ],
    },
    {
      heading: '3. Kategorie subjektů údajů a osobních údajů',
      bullets: [
        'Subjekty údajů: učitelé, vlastníci a administrátoři organizace, pozvaní pracovníci a studenti/účastníci připojení k živým lekcím Správce.',
        'Účetní a administrační údaje: jméno, je-li uvedeno, e-mailová adresa, identifikátory účtu, role, členství v organizaci a údaje o pozvánkách.',
        'Studentská a live data: zobrazované jméno, odpovědi, týmové zařazení, výsledky, časy odevzdání a metadata session/účasti.',
        'Výukový obsah: text lekcí, instrukce učitele, extrahovaný text podkladů a další obsah vložený oprávněnými uživateli, pokud obsahuje osobní údaje.',
        'Technická a bezpečnostní data: identifikátory požadavků/sessions, bezpečnostní a device signály a auditní metadata nutná pro provoz a ochranu služby.',
        'Zvláštní kategorie nebo vysoce citlivé osobní údaje nejsou pro běžný provoz Syllonautu vyžadovány. Správce je nesmí vkládat, pokud předem neurčil, že je takové zpracování nezbytné, zákonné a odpovídajícím způsobem zabezpečené.',
      ],
    },
    {
      heading: '4. Dokumentované pokyny a omezení použití',
      paragraphs: [
        'Zpracovatel zpracovává data Správce pouze na základě dokumentovaných pokynů Správce, mezi které patří tato DPA, VOP, nastavení organizace, akce oprávněných uživatelů organizace a dokumentované požadavky podpory. Vyžaduje-li jiné zpracování právo EU nebo členského státu, Zpracovatel o tom Správce před zpracováním informuje, pokud takové oznámení právní předpis nezakazuje.',
        'Zpracovatel nepoužije data Správce pro nesouvisející reklamu, profilování ani vlastní trénování modelů. Současné AI inference cesty Syllonautu vynucují na úrovni Vercel AI Gateway zero data retention.',
        'Pokud se Zpracovatel domnívá, že pokyn porušuje GDPR nebo jiné použitelné právo EU či členského státu v oblasti ochrany údajů, informuje o tom Správce bez zbytečného odkladu.',
      ],
    },
    {
      heading: '5. Důvěrnost, řízení přístupu a technická a organizační opatření',
      bullets: [
        'Přístup k datům organizace a studentů je omezen na oprávněné uživatele a serverové cesty podle role a rozsahu oprávnění.',
        'Osoby, které Zpracovatel oprávní k nakládání s daty Správce, jsou vázány povinností mlčenlivosti nebo odpovídající zákonnou povinností mlčenlivosti.',
        'Databázový přístup chrání serverová autorizace, RLS a princip nejmenších oprávnění tam, kde je relevantní; privilegované interní tabulky nejsou záměrně zpřístupněny běžným klientům.',
        'Secrets a servisní credentials nejsou ukládány do klientského kódu ani do repozitáře; citlivé serverové operace používají vyhrazená serverová oprávnění.',
        'Přenos probíhá přes HTTPS/TLS. Capability a invitační tokeny používají kryptograficky silné náhodné hodnoty a/nebo ukládané hashe tam, kde je to implementováno.',
        'Provozní analytika je navržena tak, aby nedostávala prompty lekcí, text lekcí, studentské odpovědi, jména studentů ani jiné obsahové/PII payloady.',
        'Retenční úlohy a produktová pravidla omezují uchování live dat; ukončené sessions jsou standardně plánovány ke smazání po 12 měsících a opuštěné lobby/live sessions po 30 dnech, pokud se neuplatní dřívější pokyn k výmazu. Kopie pro živé řízení v reálném čase (Cloudflare Durable Objects) se automaticky mažou 7 dní po poslední aktivitě hodiny.',
        'Současné AI cesty používají zero-data-retention konfiguraci a Syllonaut odděluje nedůvěryhodný studentský/podkladový obsah od systémových instrukcí.',
      ],
    },
    {
      heading: '6. Další zpracovatelé a změny seznamu',
      paragraphs: [
        'Správce uděluje obecné předchozí povolení k využití dalších zpracovatelů uvedených níže. Zpracovatel každého dalšího zpracovatele zaváže povinnostmi v oblasti ochrany údajů, které jsou pro příslušné zpracování nejméně stejně ochranné jako povinnosti Zpracovatele podle této DPA.',
        'Při plánovaném přidání nebo nahrazení dalšího zpracovatele, které může podstatně ovlivnit data Správce, poskytne Zpracovatel oznámení alespoň 15 dnů předem, je-li to rozumně možné. Správce může do 10 dnů vznést námitku založenou na rozumných a doložených důvodech ochrany osobních údajů. Strany se pokusí nalézt praktické řešení; není-li rozumně dostupné, může Správce ukončit dotčené zpracování/službu, aniž by byl nucen pokračovat ve zpracování prostřednictvím namítaného subprocesoru.',
        'Pokud naléhavý bezpečnostní, dostupnostní nebo právní důvod znemožňuje oznámení předem, může Zpracovatel změnu provést a informuje Správce bez zbytečného odkladu.',
      ],
    },
    {
      heading: '7. Součinnost při právech subjektů, DPIA a vůči dozorovému úřadu',
      paragraphs: [
        'S přihlédnutím k povaze zpracování poskytne Zpracovatel přiměřenou součinnost prostřednictvím vhodných technických a organizačních opatření, aby Správce mohl reagovat na žádosti o přístup, opravu, výmaz, omezení, přenositelnost nebo námitku, pokud se dané právo použije.',
        'Zpracovatel poskytne přiměřené informace a součinnost pro posouzení vlivu na ochranu osobních údajů a předchozí konzultaci s dozorovým úřadem, pokud se požadovaná součinnost týká zpracování, které Syllonaut provádí jménem Správce.',
        'Obdrží-li Syllonaut přímo žádost týkající se dat Správce, nebude o ní samostatně rozhodovat jménem Správce, pokud to nevyžaduje zákon; podle okolností žadatele odkáže na Správce nebo Správce informuje.',
      ],
    },
    {
      heading: '8. Porušení zabezpečení osobních údajů',
      paragraphs: [
        'Zpracovatel oznámí Správci bez zbytečného odkladu poté, co se dozví o porušení zabezpečení osobních údajů, které se týká dat Správce. Oznámení bude obsahovat informace, které má Syllonaut rozumně k dispozici, zejména povahu incidentu, dotčené kategorie údajů/subjektů, pravděpodobné důsledky a přijatá nebo navržená opatření. Nejsou-li všechny informace dostupné současně, mohou být doplňovány postupně.',
        'Zpracovatel bude se Správcem přiměřeně spolupracovat při vyšetření, omezení dopadů a dokumentaci incidentu a při plnění oznamovacích povinností Správce.',
      ],
    },
    {
      heading: '9. Vrácení a výmaz dat Správce',
      paragraphs: [
        'Během trvání služby může Správce využít dostupné produktové funkce nebo kontaktovat vaclav@syllonaut.com s požadavkem na výmaz nebo přiměřený export/vrácení dat Správce.',
        'Při ukončení služby organizace může Správce požádat o vrácení dostupných dat Správce v rozumně použitelném formátu. Není-li vrácení požadováno a právo EU nebo členského státu nevyžaduje další uchování, Zpracovatel po skončení vztahu a po provozním vypořádání nutném k dokončení výmazu smaže osobní údaje zpracovávané výhradně jménem Správce.',
        'Tento článek nevyžaduje smazání údajů, které musí Syllonaut uchovávat ve své samostatné roli správce, například faktur, platebních záznamů, bezpečnostních důkazů nebo smluvní evidence; jejich zpracování se řídí Privacy Notice a použitelným právem.',
      ],
    },
    {
      heading: '10. Doložení souladu a audity',
      paragraphs: [
        'Zpracovatel zpřístupní informace přiměřeně nutné k doložení souladu s čl. 28 GDPR a touto DPA. Správce může požádat o přiměřený audit nebo kontrolu relevantní k datům Správce, při zachování odpovídající důvěrnosti a bezpečnosti.',
        'Nevyžaduje-li audit dozorový úřad, závažný incident nebo věrohodné indicie nesouladu, měl by být běžně omezen na jeden audit během 12 měsíců, oznámen s rozumným předstihem a proveden tak, aby zbytečně nenarušoval provoz ani neodhaloval data jiných zákazníků.',
      ],
    },
    {
      heading: '11. Mezinárodní předávání, přednost DPA a kontakt',
      paragraphs: [
        'Zpracovatel nepředá data Správce mimo EHP, pokud předání není dovoleno podle kapitoly V GDPR, například na základě rozhodnutí o odpovídající ochraně nebo vhodných záruk, jako jsou standardní smluvní doložky.',
        'Pokud je tato DPA v rozporu s VOP v otázce, která se konkrétně týká zpracování dat Správce jménem Správce, má pro tuto otázku přednost DPA. Kogentní povinnosti podle GDPR zůstávají nedotčeny.',
        'Oznámení týkající se ochrany údajů a DPA lze zasílat na vaclav@syllonaut.com. Aktuální verze DPA je ' + DPA_VERSION + ' s účinností od ' + DPA_EFFECTIVE_DATE + '.',
      ],
    },
  ];

  return {
    title: english ? 'Data Processing Agreement' : 'Smlouva o zpracování osobních údajů',
    shortTitle: english ? 'DPA' : 'DPA',
    intro: english
      ? 'This DPA governs processing of personal data by Syllonaut on behalf of schools, companies and other organisations using Team, School or Campus plans, and on behalf of teachers with individual Free, Teacher or Teacher Pro accounts who use Syllonaut to process students’ personal data in teaching.'
      : 'Tato DPA upravuje zpracování osobních údajů, které Syllonaut provádí jménem škol, firem a dalších organizací využívajících tarify Team, School nebo Campus a jménem učitelů s individuálním účtem Free, Teacher nebo Teacher Pro, kteří Syllonaut používají ke zpracování osobních údajů studentů při výuce.',
    version: DPA_VERSION,
    effectiveDate: DPA_EFFECTIVE_DATE,
    sections,
    subprocessors,
  };
}
