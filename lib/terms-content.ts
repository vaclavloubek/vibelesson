export const TERMS_PLAN_PRICING_CLAUSE = {
  cs: 'Aktuální obsah tarifů, jejich ceny, měna, fakturační období a limity jsou uvedeny v Ceníku a znovu v objednávkovém procesu před vznikem povinnosti platit. Tyto údaje mají být vzájemně konzistentní. Potvrzení objednávky, faktura ani jiný následný platební doklad již sjednané podmínky jednostranně nemění. Pokud se u spotřebitele předsmluvní údaje liší a jejich změna nebyla před uzavřením smlouvy výslovně sjednána způsobem vyžadovaným zákonem, použije se údaj pro spotřebitele příznivější.',
  en: 'Current plan features, prices, currency, billing period and allowances are shown on the Pricing page and again in the ordering flow before the user incurs an obligation to pay. These details are intended to be consistent. An order confirmation, invoice or other later payment document does not unilaterally change the terms already agreed. If pre-contract information presented to a consumer differs and the change was not expressly agreed before the contract was concluded in the manner required by law, the information more favourable to the consumer applies.',
} as const;

// Terms 1.13, article 6: a full refund of the current period ends an
// individual subscription (except a refunded duplicate payment).
export const TERMS_FULL_REFUND_CLAUSE = {
  cs: 'Vrátí-li Syllonaut na žádost uživatele celou platbu za aktuální období individuálního předplatného, předplatné tím končí ke dni vrácení platby a účet přejde na tarif Free; další platba se již neúčtuje. To neplatí pro vrácení duplicitní platby za totéž období, kdy předplatné pokračuje beze změny.',
  en: 'If Syllonaut refunds, at the user\'s request, the full payment for the current period of an individual subscription, the subscription ends on the date of the refund and the account moves to the Free plan; no further payment is charged. This does not apply to a refund of a duplicate payment for the same period, in which case the subscription continues unchanged.',
} as const;

export const TERMS_WITHDRAWAL_CLAUSE = {
  cs: 'Požádáte-li výslovně o zahájení služby před uplynutím lhůty pro odstoupení a byli jste předem poučeni o poměrné úhradě, při následném spotřebitelském odstoupení se úhrada vypočte z celkové sjednané ceny zaplaceného období podle poměru skutečně uplynulé doby poskytování služby do doručení odstoupení k délce tohoto období. Počítá se skutečný čas, nikoli každý započatý den; u ročního tarifu je základem celé roční období. Poměrná úhrada se zaokrouhluje dolů na nejmenší měnovou jednotku. Počet AI operací ani vyčerpání kvóty výši úhrady nebo vratky nezvyšují. Bez doložené výslovné žádosti nebo předchozího poučení poměrnou úhradu nepožadujeme. Zbytek zaplacené ceny vrátíme stejným platebním prostředkem, se zohledněním již vrácených částek. Případná změna tarifu se posuzuje podle doložených sjednaných cen, plateb a časových období, nikoli podle aktuálního ceníku. Zákonná práva spotřebitele zůstávají zachována.',
  en: 'If you expressly request that the service start before the withdrawal period expires and were informed in advance about the proportionate charge, upon consumer withdrawal the charge is calculated from the total agreed price of the paid period in proportion to the actual time the service was supplied until receipt of the withdrawal notice, divided by the length of that paid period. Actual elapsed time is used, without charging each started day; an annual plan uses the full annual period. The retained charge is rounded down to the smallest currency unit. AI operations and exhausted allowances do not increase the charge or reduce the refund. Without evidence of the express request or prior information, no proportionate charge is retained. The remaining paid price is returned using the original payment method, taking previous refunds into account. Any plan change is assessed using the documented agreed prices, payments and time periods, rather than the current price list. Statutory consumer rights remain unaffected.',
} as const;

export const TERMS_SERVICE_CHANGE_CLAUSE = {
  cs: [
    'Syllonaut může průběžně měnit digitální službu nad rámec změn nezbytných k zachování její bezvadnosti pouze bez dodatečných nákladů pro uživatele a ze spravedlivého důvodu. Takovým důvodem může být zejména bezpečnost, splnění právní povinnosti, zachování technické kompatibility, významná změna dodavatele nebo infrastruktury, přizpůsobení počtu uživatelů nebo prokazatelné zlepšení služby.',
    'Změny se před uplatněním klasifikují jako nezbytné bezpečnostní či opravné aktualizace, příznivé nebo jen nevýznamné změny, anebo změny zhoršující přístup ke službě či její užívání nikoli jen nevýznamně. U poslední skupiny Syllonaut přednostně zachová sjednanou verzi nejméně do konce již zaplaceného období a, je-li to bezpečné a technicky možné, umožní její další používání bez dodatečných nákladů.',
    'Nelze-li původní bezvadnou verzi bezpečně a technicky zachovat, dostane spotřebitel v přiměřené době před účinností změny, standardně alespoň 30 dnů předem, jasné oznámení e-mailem na trvalém nosiči. Oznámení uvede povahu a spravedlivý důvod změny, konkrétní dopad, okamžik účinnosti a právo závazek bez postihu vypovědět. Toto právo lze uplatnit do 30 dnů od doručení oznámení nebo od provedení změny, podle toho, co nastane později. Při ukončení se bez poplatku vrátí nevyužitá část předem zaplaceného období původním platebním prostředkem, není-li výslovně dohodnuto jinak bez nákladů pro spotřebitele.',
    'Právo ukončit smlouvu a spravovat vypnutí obnovení zůstává dostupné bez přijetí nových podmínek. Vyžaduje-li samotná změna smlouvy nový souhlas, Syllonaut si jej vyžádá dříve, než bude změna pro daného uživatele závazná.',
  ],
  en: [
    'Syllonaut may modify the digital service beyond changes necessary to keep it in conformity only without additional cost to the user and for a valid reason. Valid reasons may include security, compliance with legal obligations, maintaining technical compatibility, a material supplier or infrastructure change, adapting to increased user numbers, or a demonstrable service improvement.',
    'Before release, changes are classified as necessary security or conformity updates, beneficial or only minor changes, or changes that negatively affect access to or use of the service in more than a minor way. For the last category, Syllonaut will by default preserve the agreed version at least until the end of the already-paid period and, where safe and technically possible, allow continued use of the unchanged conforming version without additional cost.',
    'Where the original conforming version cannot safely and technically be maintained, a consumer will receive clear notice by email on a durable medium reasonably in advance, ordinarily at least 30 days before the change takes effect. The notice will state the nature and valid reason for the change, its specific impact, its effective time, and the right to terminate without penalty. That right may be exercised within 30 days after receipt of the notice or implementation of the change, whichever is later. On termination, the unused part of a prepaid period will be reimbursed without a fee using the original payment method unless the consumer expressly agrees otherwise without incurring costs.',
    'The right to terminate and to turn off renewal remains available without accepting new Terms. Where the contractual change itself requires renewed consent, Syllonaut will request it before the change becomes binding on the relevant user.',
  ],
} as const;

// LEGAL-016: account deletion never leaves a paid renewal running.
export const TERMS_ACCOUNT_DELETION_CLAUSE = {
  cs: [
    'Uživatel může přestat službu používat a požádat o zrušení účtu. Má-li účet aktivní placený tarif s automatickým obnovením, Syllonaut před zrušením účtu automatické obnovení sám ukončí, takže po zrušení účtu již nedojde k další platbě; uživatel je nemusí předem rušit sám. Zrušení účtu Syllonaut potvrdí e-mailem.',
    'Před zrušením účtu Syllonaut uživatele upozorní, že zrušením účtu zanikne přístup i ke zbývající části již zaplaceného období, a nabídne mu možnost ponechat účet do konce tohoto období. Tím nejsou dotčena zákonná práva spotřebitele, zejména právo odstoupit od smlouvy podle článku 7 a práva podle článku 10.',
    'Je-li uživatel vlastníkem školní organizace, zrušení jeho účtu samo neukončuje licenci organizace. Syllonaut před zrušením účtu zajistí předání vlastnictví organizace jinému správci, nebo na žádost organizace ukončí automatické obnovení školní licence.',
  ],
  en: [
    'A user may stop using the service and request account deletion. If the account has an active paid plan with automatic renewal, Syllonaut itself ends automatic renewal before deleting the account, so no further payment is taken after deletion; the user does not need to cancel it first. Syllonaut confirms the deletion by email.',
    'Before deleting the account, Syllonaut informs the user that deletion also ends access to any remaining part of an already paid period and offers to keep the account until the end of that period. This does not affect statutory consumer rights, in particular the right of withdrawal under section 7 and the rights under section 10.',
    'If the user owns a school organisation, deleting their account does not by itself end the organisation licence. Before deleting the account, Syllonaut arranges the transfer of organisation ownership to another administrator or, at the organisation’s request, ends automatic renewal of the school licence.',
  ],
} as const;

// LEGAL-017: evidenced complaint process with written receipt and resolution.
export const TERMS_COMPLAINT_CLAUSE = {
  cs: [
    'Pokud služba neodpovídá smlouvě nebo nefunguje, může uživatel uplatnit reklamaci online na stránce Reklamace (syllonaut.com/cs/complaint), e-mailem na vaclav@syllonaut.com nebo poštou na adresu poskytovatele. V reklamaci popište vadu, použitý účet, okolnosti chyby a požadovaný způsob vyřízení, bez zbytečných osobních údajů studentů.',
    'Syllonaut uživateli bezodkladně písemně potvrdí, kdy reklamaci uplatnil, co je jejím obsahem a jaký způsob vyřízení požaduje. Reklamaci vyřídí bez zbytečného odkladu, nejpozději do 30 dnů od jejího uplatnění, a písemně potvrdí datum a způsob vyřízení; zamítnutí písemně odůvodní. Zákonná práva z vadného plnění a zvláštní práva spotřebitelů k digitálním službám zůstávají zachována.',
  ],
  en: [
    'If the service does not conform to the contract or fails to work, a user may submit a complaint online on the Complaint page (syllonaut.com/en/complaint), by email to vaclav@syllonaut.com or by post to the provider address. Describe the defect, the account used, the circumstances and the requested remedy, without unnecessary student personal data.',
    'Syllonaut promptly confirms in writing when the complaint was submitted, what it contains and which remedy is requested. It resolves the complaint without undue delay and no later than 30 days after submission, and confirms the date and manner of resolution in writing; a rejection is justified in writing. Statutory rights relating to defective performance and consumer rights for digital services remain unaffected.',
  ],
} as const;

// LEGAL-018: technical requirements are pre-contractual information and part of the contract.
export const TERMS_TECHNICAL_REQUIREMENTS_CLAUSE = {
  cs: 'Služba se používá ve webovém prohlížeči. Technické požadavky na funkčnost, kompatibilitu a interoperabilitu (podporované prohlížeče a zařízení, cookies a úložiště prohlížeče, připojení k internetu a formáty souborů) jsou uvedeny na stránce Technické požadavky (syllonaut.com/cs/requirements) a u individuální placené objednávky jsou také součástí potvrzení smluvních informací. Nesoulad služby způsobený výlučně tím, že digitální prostředí uživatele těmto požadavkům neodpovídá, není vadou služby, byl-li uživatel o požadavcích jasně informován před uzavřením smlouvy. Požadavky lze změnit pouze postupem podle článku 10.',
  en: 'The service is used in a web browser. Technical requirements for functionality, compatibility and interoperability (supported browsers and devices, cookies and browser storage, internet connection and file formats) are set out on the Technical requirements page (syllonaut.com/en/requirements) and, for an individual paid order, also form part of the contract information confirmation. A lack of conformity caused solely by the user’s digital environment not meeting these requirements is not a defect of the service, provided the user was clearly informed of the requirements before the contract was concluded. The requirements may be changed only under section 10.',
} as const;

// LEGAL-020: statutory online-withdrawal notice, worded per point 4 of the
// model instructions in nařízení vlády 29/2023 Sb. as amended by 66/2026 Sb.
export const TERMS_ONLINE_WITHDRAWAL_NOTICE = {
  cs: 'Můžete rovněž odstoupit od smlouvy online na syllonaut.com/cs/subscription (po přihlášení v části Předplatné tlačítkem „Odstoupit od smlouvy“ a následně „Potvrdit odstoupení od smlouvy“; cestu najdete také na syllonaut.com/cs/withdrawal). Využijete-li této možnosti, bez zbytečného odkladu Vám potvrdíme přijetí prohlášení o odstoupení od smlouvy v textové podobě (například prostřednictvím elektronické pošty), včetně jeho obsahu a data a času jeho odeslání.',
  en: 'You may also withdraw from the contract online at syllonaut.com/en/subscription (after signing in, in Subscription using “Withdraw from contract” and then “Confirm withdrawal from contract”; the route is also shown at syllonaut.com/en/withdrawal). If you use this option, we will confirm receipt of your withdrawal statement without undue delay in text form (for example by email), including its content and the date and time it was sent.',
} as const;

// LEGAL-021: intended purpose of AI point suggestions (EU AI Act classification).
export const TERMS_AI_SCORING_PURPOSE_CLAUSE = {
  cs: 'AI bodování otevřených, týmových a exit-ticket odpovědí je určeno pro herní a formativní zpětnou vazbu v rámci jedné živé lekce. Body navržené AI jsou pouze návrhem: do skóre a pořadí se započítají až poté, co je učitel potvrdí nebo upraví, a o bodech vždy rozhoduje učitel. Funkce není určena k úřednímu hodnocení studentů (například ke klasifikaci, známkování nebo vysvědčení) ani k rozhodování o přijetí, zařazení či postupu ve vzdělávání; takové rozhodnutí musí učitel učinit vlastním posouzením. Upozornění na možné využití AI ve studentských odpovědích je pouze signálem pro učitele, nikoli důkazem, a body nemění.',
  en: 'AI scoring of open, team and exit-ticket responses is intended for game-based and formative feedback within a single live lesson. Points suggested by AI are only a suggestion: they count toward the score and ranking only after the teacher confirms or adjusts them, and the teacher always decides the points. The feature is not intended for official assessment of students (such as grades, marks or report cards) or for decisions on admission, placement or progression in education; any such decision must be made by the teacher on their own judgement. The alert about possible AI use in student responses is only a signal for the teacher, not proof, and does not change points.',
} as const;

// LEGAL-022: who may hold a teacher account.
export const TERMS_ACCOUNT_ELIGIBILITY_CLAUSE = {
  cs: 'Účet učitele (Free, Teacher, Teacher Pro i účet člena organizace) si může založit a používat pouze osoba, které je alespoň 18 let. Studenti se k živým lekcím připojují bez vlastního účtu přes kód nebo odkaz od učitele.',
  en: 'A teacher account (Free, Teacher, Teacher Pro or an organisation member account) may only be created and used by a person aged 18 or over. Students join live lessons without their own account using a code or link from the teacher.',
} as const;

// LEGAL-022: the DPA also covers individual accounts used to process student data in teaching.
export const TERMS_DPA_SCOPE_CLAUSE = {
  cs: 'Pokud učitel s individuálním účtem (Free, Teacher nebo Teacher Pro) používá Syllonaut ke zpracování osobních údajů studentů při výuce, vystupuje Syllonaut v tomto rozsahu jako zpracovatel a vztahuje se na toto zpracování zpracovatelská smlouva (DPA), která je součástí smlouvy uzavřené přijetím těchto VOP. Správcem je učitel, nebo škola či jiná organizace, pro kterou učitel výuku vede.',
  en: 'Where a teacher with an individual account (Free, Teacher or Teacher Pro) uses Syllonaut to process students’ personal data in teaching, Syllonaut acts as processor for that processing and the Data Processing Agreement (DPA) applies to it as part of the contract concluded by accepting these Terms. The controller is the teacher, or the school or other organisation for which the teacher teaches.',
} as const;

// Terms 1.12 article 5a (prepared, LEGAL-023): one-time AI grading suggestion
// packs for individual Teacher Pro. Rendered only when
// TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE is true (lib/legal.ts).
export const TERMS_AI_GRADING_TOPUP_CLAUSE = {
  titleCs: '5a. Dokupované balíčky návrhů hodnocení od AI',
  titleEn: '5a. Additional AI grading suggestion packs',
  cs: [
    'Uživatel s aktivním individuálním předplatným Teacher Pro si může dokoupit jednorázový balíček návrhů hodnocení od AI. Balíčky nejsou dostupné v tarifech Free a Teacher, pro členy školních organizací ani po dobu, kdy jsou AI funkce účtu omezené podle článku 6 (platba po splatnosti, vrácená nebo reklamovaná platba). Balíček se neobnovuje a každý nákup je samostatná jednorázová objednávka.',
    'Počet návrhů v balíčku, jeho cena a měna jsou uvedeny v Ceníku a znovu v objednávce před zaplacením. Cena v CZK je konečná, poskytovatel není plátcem DPH. U plateb v EUR a USD může platební zprostředkovatel připočíst daň podle země zákazníka; konečnou částku uvidíte před potvrzením platby.',
    'Balíček je platný 12 měsíců od potvrzení platby, a to i napříč obdobími tarifu. Návrhy, které do konce platnosti nevyčerpáte, bez náhrady zanikají.',
    'Nejprve se čerpá limit návrhů hodnocení zahrnutý v tarifu Teacher Pro pro aktuální období. Dokoupené návrhy se čerpají až po jeho vyčerpání; máte-li více balíčků, čerpá se nejdříve ten, jehož platnost skončí nejdříve. Návrh se započítá při zahájení AI hodnocení odpovědi. Pokud se návrh nepodaří vytvořit, započtení se vrací.',
    'Dokoupené návrhy lze čerpat jen při aktivním tarifu Teacher Pro. Skončí-li předplatné Teacher Pro nebo přejdete-li na jiný tarif, nevyčerpané návrhy se zmrazí a můžete je znovu čerpat po obnovení Teacher Pro, nejdéle do konce jejich platnosti. Za zmrazené ani propadlé návrhy se cena nevrací, nestanoví-li zákon jinak.',
    'Balíček je digitální obsah, který se zpřístupní ihned po potvrzení platby. Jste-li spotřebitel, před objednáním výslovně žádáte o okamžité zpřístupnění a berete na vědomí, že jím ztrácíte právo od smlouvy o balíčku odstoupit. Potvrzení objednávky včetně tohoto souhlasu obdržíte na trvalém nosiči. Toto ustanovení se netýká předplatného Teacher Pro, u něhož se odstoupení řídí článkem 7.',
    'Bude-li platba za balíček vrácena nebo napadena u banky či platební sítě (spor), nevyčerpané návrhy z tohoto balíčku zanikají. Při sporu se navíc dočasně omezí AI funkce účtu podle článku 6, a to do vyřešení sporu. Tím nejsou dotčena práva z vadného plnění podle článku 8.',
  ],
  en: [
    'A user with an active individual Teacher Pro subscription may buy a one-time pack of AI grading suggestions. Packs are not available on the Free and Teacher plans, to members of school organisations, or while the account’s AI features are restricted under section 6 (overdue, refunded or disputed payment). A pack does not renew; each purchase is a separate one-time order.',
    'The number of suggestions in a pack, its price and currency are shown on the Pricing page and again in the order before payment. The CZK price is final; the provider is not a VAT payer. For payments in EUR and USD, the payment intermediary may add tax according to the customer’s country; you will see the final amount before confirming the payment.',
    'A pack is valid for 12 months from payment confirmation, across plan allowance periods. Suggestions not used by the end of the validity period expire without compensation.',
    'The grading suggestion allowance included in the Teacher Pro plan for the current period is used first. Purchased suggestions are used only after it is exhausted; if you hold several packs, the one that expires first is used first. A suggestion is counted when AI grading of a response starts. If the suggestion cannot be produced, it is returned.',
    'Purchased suggestions can be used only while the Teacher Pro plan is active. If the Teacher Pro subscription ends or you move to another plan, unused suggestions are frozen and can be used again once Teacher Pro is restored, until the end of their validity at the latest. No price is refunded for frozen or expired suggestions unless the law provides otherwise.',
    'A pack is digital content made available immediately after payment confirmation. If you are a consumer, before ordering you expressly request immediate access and acknowledge that you thereby lose the right to withdraw from the pack purchase. You will receive the order confirmation, including this consent, on a durable medium. This provision does not apply to the Teacher Pro subscription, where withdrawal is governed by section 7.',
    'If the payment for a pack is refunded or disputed with a bank or payment network, unused suggestions from that pack expire. In the case of a dispute, the account’s AI features are also temporarily restricted under section 6 until the dispute is resolved. This does not affect rights arising from defective performance under section 8.',
  ],
} as const;

// Checkout consents for a pack (Terms 1.12 article 5a).
export const AI_GRADING_TOPUP_CONSENT = {
  immediateDelivery: {
    cs: 'Výslovně žádám o okamžité zpřístupnění dokoupených návrhů hodnocení od AI hned po zaplacení.',
    en: 'I expressly request immediate access to the purchased AI grading suggestions right after payment.',
  },
  withdrawalLoss: {
    cs: 'Beru na vědomí, že okamžitým zpřístupněním ztrácím právo od nákupu balíčku odstoupit.',
    en: 'I acknowledge that with immediate access I lose the right to withdraw from the pack purchase.',
  },
} as const;
