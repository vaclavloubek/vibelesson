Warning: truncated output (original token count: 55648)
Total output lines: 2031

# Syllonaut — projektový stav

Aktualizováno: 2026-09-21 — interní verze **0.9.92** uzavírá **LEGAL-012** schválenou variantou C: aktuální zákonný vzorový formulář je ve VOP, na veřejné tisknutelné stránce i v neměnném smluvním snapshotu; spotřebitel může během lhůty odstoupit také online ze správy předplatného a dostane trvalé e-mailové potvrzení. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.30.

**Aktuální produktová verze: 0.9.30** — Syllonaut má české a anglické UI, regionální výchozí volbu jazyka a oddělený jazyk generované lekce. **Sdílení lekcí je produkčně dokončené a E2E ověřené:** autor vytváří odvolatelný read-only snapshot, příjemce musí pro uložení a spuštění použít vlastní účet a dostane samostatnou kopii. Share link je záměrně přenositelný a počítá se s ním i pro veřejné ukázkové lekce a akviziční distribuci. Free účet generuje nové lekce pouze v aktivním jazyce UI a při AI revizích nesmí změnit hlavní jazyk existující lekce nebo bloku. Teacher, Teacher Pro a budoucí Team/School/Campus mají benefit **Lekce v libovolném jazyce**, včetně automatické detekce jazyka zadání, explicitní volby dalšího jazyka a změny jazyka při AI revizi. Entitlement je vynucený serverově.

### Zákonný formulář a online odstoupení 0.9.92 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-012** schválenou variantou C: sdílený CZ/EN zdroj obsahuje strukturu aktuálního vzorového formuláře podle nařízení vlády č. 29/2023 Sb. v aktuálním znění;
- veřejné stránky `/cs/withdrawal` a `/en/withdrawal` poskytují tisknutelný formulář, adresáta a zachovávají možnost odeslání e-mailem nebo poštou; stejný zdroj používají VOP a příloha nového neměnného individuálního smluvního snapshotu;
- část Předplatné zobrazuje kartu odstoupení každému přihlášenému uživateli; tlačítko **„Odstoupit od smlouvy“** je aktivní pouze u konkrétní individuální placené smlouvy během její 14denní lhůty a druhý krok používá **„Potvrdit odstoupení od smlouvy“**;
- online podání v jedné databázové transakci ukládá přesný obsah, jméno, elektronický kontakt, smluvní snapshot, tarif, serverové datum a čas, autora a SHA-256; právní záznam je append-only a opakované odeslání je idempotentní;
- potvrzení na trvalém nosiči obsahuje obsah podání, datum, čas, ID potvrzení a hash, používá idempotentní Resend klíč a při dočasném selhání dovoluje bezpečné opakování bez ztráty již přijatého odstoupení;
- záznam navazuje na stávající kontrolovaný workflow z **LEGAL-008** pro přípravu časového výpočtu, bezpečný Stripe refund a zrušení předplatného; AI spotřeba výši refundu nemění;
- VOP jsou **1.5** a `TERMS_ACCEPTANCE_KEY = 2026-09-21-v6`; nové registrace a objednávky ukládají v6, zatímco v5 a v4 zůstávají dostatečné pro běžný přístup stávajících uživatelů;
- produkční migrace **add_online_withdrawal_legal_012** vytvořila dvě soukromé RLS tabulky bez přímých práv; všechny čtyři nové RPC jsou `security definer`, mají prázdný `search_path` a jsou pouze pro `service_role`. Security Advisor nepřidal nový warning;
- PR **#281** prošel full check/build, Security headers, Accessibility i Vercel Preview; produkční merge commit **0462f22e** má Vercel **success**.

### Veřejný telefon poskytovatele 0.9.91 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-011** schválenou variantou C: stávající telefon **+420 733 377 199** je zveřejněný jako funkční přímý kontakt s odkazem `tel:+420733377199`;
- jeden sdílený zdroj identity poskytovatele zásobuje VOP, Privacy Notice, veřejný kontaktní blok, patičku, individuální checkout a školní objednávku, takže se kontaktní údaje mezi povrchy nerozcházejí;
- nové individuální smluvní snapshoty obsahují telefon v objednávkovém souhrnu, plném znění VOP i vzorovém formuláři pro odstoupení; nové školní objednávky ho ukládají do billing snapshotu vedle právní akceptace;
- VOP jsou **1.4** a `TERMS_ACCEPTANCE_KEY = 2026-09-21-v5`; nové registrace a objednávky používají v5, zatímco přijetí v4 zůstává dostačující pro běžný přístup stávajících uživatelů, protože změna pouze doplňuje povinný kontaktní údaj;
- produkční migrace **update_terms_1_4_legal_011** zachovala v1–v4, přidala mapování v5 a ponechala obě versioned Terms RPC pouze pro `service_role` s prázdným `search_path`; Security Advisor nepřidal pro změnu žádný nový warning;
- nový regresní test hlídá přesné zobrazení, E.164 hodnotu, klikací `tel:` odkaz, všechny předsmluvní povrchy, smluvní evidenci a kompatibilní Terms rollout;
- PR **#279** prošel full check/build, Security headers, Accessibility i Vercel Preview; produkční merge commit **69eb5033** má Vercel **success**.

### Řízené změny průběžné digitální služby 0.9.90 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-010** schválenou hybridní variantou C;
- autoritativní policy `hybrid-v1` rozlišuje bezpečnostní/opravné, příznivé či nevýznamné a podstatně nepříznivé změny; každá release evidence ukládá platný důvod, konkrétní CZ/EN dopad, cílové tarify, datum účinnosti a SHA-256 obsahu;
- podstatně nepříznivá změna přednostně zachová bezpečnou původní verzi nejméně do konce již zaplaceného období bez příplatku; pokud to bezpečně a technicky nejde, server vyžaduje nejméně 30 celých dnů před účinností;
- bilingvní oznámení se doručuje e-mailem se stabilní idempotencí a ukládá hash adresy, hash celého oznámení, ID poskytovatele, čas odeslání a zákonnou lhůtu počítanou 30 dnů od pozdějšího z oznámení nebo účinnosti;
- spotřebitel může z Předplatného po výslovném potvrzení ukončit službu i bez přijetí nových VOP; žádost, výpočet, Stripe refund a okamžité zrušení subscription používají neměnnou evidenci a execution lease;
- refund vrací nevyužitou část skutečně zaplaceného aktuálního období původní Stripe platbou, se zaokrouhlením retained částky dolů a se započtením dřívějších refundů; změna tarifu nebo neobvyklá historie se zastaví k individuální kontrole;
- VOP a neměnný smluvní snapshot sdílejí totožnou CZ/EN klauzuli; VOP jsou **1.3** a `TERMS_ACCEPTANCE_KEY = 2026-09-21-v4`, starší v1–v3 zůstávají podporované a historická evidence se nepřepisuje;
- produkční Supabase migrace **add_service_change_workflow** a **update_terms_1_3_legal_010** jsou aplikované; tři nové privátní tabulky mají RLS bez přímých grantů a všech 12 RPC je pouze pro `service_role` s prázdným `search_path`;
- regresní testy pokrývají apply/grandfather/durable-notice strategii, 30denní minimum, měsíční i roční/leap období, ukončení ve stejném okamžiku, zaokrouhlení, dřívější refund, explicitní potvrzení a změnu tarifu; provozní postup je v **SERVICE_CHANGE_RUNBOOK.md**;
- PR **#276** prošel full check/build, Security headers, Accessibility a Vercel Preview; produkční merge commit **c83b0ba9** má Vercel **success**. V produkční evidenci při ověření zůstalo **0 releases / 0 deliveries / 0 terminations** a nevznikl žádný e-mail, refund ani zrušení předplatného;
- Security Advisor nepřidal nový privileged warning; tři nové privátní tabulky jsou pouze očekávané INFO `rls_enabled_no_policy`;
- veřejně zobrazovaná verze dashboardu zůstává **0.9.30**.


### Přesné označení AI integrity signalizace 0.9.89 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-009** schválenou variantou A;
- původní claim „Ochrana proti nepovolenému využití AI ve studentských odpovědích“ / “Protection against unauthorized AI use in student responses” je nahrazen přesným benefitem „Upozornění na možné využití AI ve studentských odpovědích“ / “Alerts about possible AI use in student responses”;
- Teacher Pro, School a Campus používají společný CZ/EN zdroj textu `lib/ai-integrity-copy.ts`;
- Ceník viditelně vysvětluje, že jde o AI/heuristický signál pro kontrolu učitelem, nikoli důkaz, a že body se automaticky nemění; konečné posouzení zůstává na učiteli;
- regresní kontrola hlídá přesný společný text pro všechny tři oprávněné tarify, viditelné vysvětlení limitů signálu a zakazuje návrat původního slibu ochrany;
- změna nezasahuje do databáze, Supabase RLS, oprávnění ani scoring workflow;
- lokálně prošly hlavní kontroly, produkční build a accessibility kontrola; PR **#274** prošel Security headers, Accessibility a Vercel Preview. Produkční merge commit **78af1248** má Vercel **success**;
- veřejně zobrazovaná verze dashboardu zůstává **0.9.30**.


### Poměrná úhrada při odstoupení 0.9.88 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-008**;
- autoritativní metoda `time-pro-rata-v1` počítá zadrženou částku jako jediné zaokrouhlení dolů: původní sjednaná cena v nejmenších měnových jednotkách × skutečně poskytnutý čas / skutečná délka zaplaceného období; zbytek se vrací;
- AI spotřeba nevstupuje do částky a může sloužit pouze oddělenému fraud monitoringu;
- včasnost odstoupení se ověřuje podle doloženého času odeslání, zatímco výpočet poskytnuté služby končí časem doručení poskytovateli; oba časy a SHA-256 původního oznámení jsou neměnnou evidencí;
- výpočet používá původní smluvní snapshot, Checkout Session, počáteční fakturu, PaymentIntent, Charge a serverový aktivační záznam. Upgrade, další platba, schedule, pending update, cenový rozpor nebo chybějící evidence zastaví automatizaci k individuálnímu posouzení;
- refund běží proti původní Stripe platbě se stabilním idempotency key, nejprve vyhledá již existující refund a používá service-only execution lease; stav refundu se znovu načítá a smiřuje také ze signed webhooku;
- původní paralelně nasazené mutační RPC bez důkazu oznámení a lease jsou odebrané `service_role`; nový zápis, výpočet, claim, refund reconciliation, cancellation a failure workflow jsou dostupné pouze `service_role`;
- VOP, checkout a neměnný smluvní snapshot sdílejí CZ/EN metodiku; VOP jsou **1.2** a `TERMS_ACCEPTANCE_KEY = 2026-09-21-v3`, přičemž v1/v2 zůstávají během rollout kompatibility podporované a historická evidence se nepřepisuje;
- produkční Supabase migrace **20260921092334_add_withdrawal_refund_evidence** a **20260921092346_update_terms_1_2_legal_008** jsou aplikované. Obě privátní tabulky mají RLS bez přímých grantů; Security Advisor nepřidal nový WARN ani nové privileged-RPC upozornění, pouze očekávané INFO `rls_enabled_no_policy` pro novou privátní receipt tabulku;
- regresní testy pokrývají měsíční i roční/leap období, odstoupení ve stejný den, přesné zaokrouhlení, nulový retained amount bez výslovné žádosti/poučení, předchozí refund, nezávislost na AI spotřebě, změnu tarifu, retry recovery, včasné odeslání s pozdějším doručením, neměnnost důkazů, granty, RLS a Terms v1/v2/v3;
- PR **#272** prošel full check/build, Security headers, Accessibility, Vercel Preview a izolovaným PostgreSQL testem; produkční merge commit **73aab962** má Vercel **success**. V produkční evidenci při ověření zůstalo **0 receipts / 0 requests** a žádný živý refund ani syntetický nákup nebyl proveden;
- veřejně zobrazovaná verze dashboardu zůstává **0.9.30**.


### Konzistence nabídky a smlouvy 0.9.87 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-007**;
- VOP jsou povýšeny na **1.1** s **TERMS_ACCEPTANCE_KEY = 2026-09-21-v2**; změna se promítá do registrace, placených checkoutů, školních objednávek, re-consentu i neměnného individuálního smluvního snapshotu;
- čl. 5 už nepoužívá jednostrannou prioritní klauzuli pro pozdější doklad; výslovně říká, že Ceník a objednávkové údaje mají být konzistentní, pozdější potvrzení/faktura sjednané podmínky jednostranně nemění a u spotřebitele se při neodsouhlaseném rozporu použije příznivější předsmluvní údaj;
- text této klauzule má jeden autoritativní zdroj **lib/terms-content.ts**, který používá veřejná stránka VOP i archivní smluvní snapshot;
- Terms rollout proběhl bezpečně ve třech DB krocích: **20260921071533_update_terms_1_1_legal_007**, kompatibilitní guard **20260921072059_restore_terms_1_0_rollout_guard** a finální backward-compatible vrstva **20260921072159_add_versioned_terms_acceptance_rpcs**. Produkční signup trigger umí auditovat v1 i v2 podle skutečně odeslaného key a nový web používá service-only RPC s explicitním `TERMS_ACCEPTANCE_KEY`; historické acceptance eventy se nemění ani nemažou;
- staré v1 RPC zůstává jen kvůli rollout kompatibilitě předchozího buildu; 0.9.87 používá verzované RPC `has_terms_acceptance_for_service` / `record_terms_reconsent_for_service` s explicitním key. Všechny tyto RPC zůstávají pouze pro **service_role** a Security Advisor nepřidal nový anon/authenticated privileged-function warning;
- individuální Pricing, checkoutový očekávaný amount a smluvní snapshot používají **lib/individual-billing-catalog.ts**;
- Team / School / Campus Pricing nově čte ceny, seat limity a měsíční lesson/revision kvóty z **lib/organization-billing-catalog.ts** místo vlastních čísel;
- školní order backend používá stejný organizační katalog pro amount_minor;
- aktivační e-mail potvrzuje cenu a období přímo z neměnného contract snapshotu a AI kvóty ze stejného individuálního katalogu jako Pricing;
- nový regresní kontrakt **scripts/verify-offer-contract-consistency.mjs** je součástí hlavního npm run check a hlídá cenu v display/minor units, období, kvóty, renewal text i source wiring napříč Pricing → checkout → snapshot → e-mail;
- databázový billing_prices katalog mapuje plan/period/currency na Stripe Price ID, ale neukládá částku; částková konzistence se proto hlídá v autoritativních aplikačních katalozích a Stripe mapping samostatně podle plan/period/currency;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.


### LEGAL-006 enforcement hardening 0.9.86 — 2026-09-21

- uzavřený LEGAL-006 byl po serverovém bypass auditu ještě zpřísněn bez změny VOP nebo DB schématu;
- Bearer-token cesta importu sdílené lekce už nemůže obejít společný cookie/auth helper: před importem samostatně ověřuje autoritativní append-only Terms audit a při chybě failuje stavem 428;
- GET `/api/sessions/<id>/live-control` je výslovně považován za chráněnou pracovní akci, protože mintuje teacher/presenter capability pro externí live-control plane; bez aktuálních VOP se capability nevydá;
- nový individuální Stripe checkout vyžaduje vedle svého checkoutového checkboxu také existenci serverového current-Terms auditu a legacy účet je veden na `/terms/accept`;
- endpoint změny individuálního tarifu už není plošně gateovaný podle HTTP POST: akce `change` vyžaduje current Terms, zatímco `cancel_scheduled_change` zůstává dostupná bez nového souhlasu, aby uživatel mohl zrušit budoucí závazek;
- Ceník, import sdílené lekce a správa předplatného zpracují `428 terms_reconsent_required` přesměrováním do existujícího bezpečného re-consent flow;
- `normalizeTermsReturnTo` nově bezpečně povoluje také Pricing a `/subscription` jako návratový cíl;
- regresní `scripts/verify-terms.mjs` výslovně hlídá všechny tři nalezené bypass hranice i zachování cancellation výjimky;
- veřejně zobrazovaná verze dashboardu zůstává **0.9.30**.

### Jednorázový re-consent aktuálních VOP 0.9.85 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-006**;
- produkční kontrola před implementací potvrdila **3 Auth účty, 0/3** s aktuálním registračním acceptance metadata a **0/3** se serverovým auditem `2026-09-21-v1`; žádný z těchto účtů není administrativně označen jako souhlasící — audit vznikne až po skutečném výslovném přijetí uživatelem;
- nová stránka **/terms/accept** (CZ/EN) používá nezaškrtnutý checkbox a přesný `TERMS_ACCEPTANCE_KEY`; po přijetí se uživatel bezpečně vrátí pouze na povolenou interní pracovní cestu;
- zápis používá existující append-only tabulku **private.terms_acceptance_events** se zdrojem `reconsent`; nevzniká nová auditní tabulka ani vazba, která by se smazala spolu s Auth účtem;
- dvě úzké RPC funkce `has_current_terms_acceptance_for_service` a `record_current_terms_reconsent_for_service` jsou `SECURITY DEFINER` s prázdným `search_path`, mají odebraný execute pro `PUBLIC` / `anon` / `authenticated` a grant pouze `service_role`;
- serverový `proxy.ts` u skutečných produktových mutací odstraní případný klientem podvržený interní marker a znovu ho nastaví pouze podle autoritativní cesty + HTTP metody; společný auth helper pak proti append-only auditu fail-closed rozhodne, zda mutaci pustí;
- page-level gate je na tvorbě nové lekce, knihovně, editoru lekce, worksheetu, teacher session a presenteru; guest `/new` zůstává beze změny;
- read-only náhled sdílené lekce zůstává dostupný, ale import kopie vyžaduje aktuální VOP; po přihlášení se stejně gateuje i přijetí školní pozvánky;
- `/school` zůstává přístupný kvůli fakturám a ukončení licence, ale zobrazuje re-consent banner a chráněné správní akce přesměruje na VOP;
- bez re-consentu je nadále možné číst právní dokumenty, otevřít faktury, provést platbu existujícího závazku a **vypnout** automatické obnovení; naopak nové renewal objednávky, opětovné zapnutí automatického obnovení a změna individuálního tarifu aktuální VOP vyžadují;
- DB migrace: **20260921063215_add_terms_reconsent_rpcs**;
- regresní kontrakt je rozšířen v **scripts/verify-terms.mjs** a hlídá server-only RPC, anti-spoof marker, page gate, billing/cancellation výjimky i speciální school/share flow;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.


### Zpracovatelská smlouva organizací 0.9.84 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-005**;
- nový autoritativní zdroj **lib/dpa-document.ts** obsahuje českou a anglickou DPA verze **1.1**, účinnou od 21. 9. 2026, pro Team / School / Campus;
- veřejné routy **/cs/dpa** a **/en/dpa** zobrazují stejný verzovaný dokument; `/dpa` používá locale gateway a DPA je trvale dostupná i z patičky;
- DPA konkretizuje čl. 28 GDPR: role správce/zpracovatele, předmět a dobu zpracování, kategorie subjektů a údajů, dokumentované pokyny, důvěrnost, technická a organizační opatření, subprocessory, incidenty, práva subjektů, DPIA/úřady, výmaz/vrácení, audity a mezinárodní předávání;
- aktuální seznam relevantních subprocesorů v DPA zahrnuje **Supabase, Vercel, Cloudflare, Resend, OpenAI, AWS Bedrock a Microsoft Azure**; vedle účelu, rozsahu dat a transfer režimu je u každého nově snadno dostupná i **právní entita, poštovní adresa a privacy/DPO kontakt**;
- změny subprocesorů používají obecné předchozí povolení s oznámením plánované materiální změny standardně alespoň **15 dnů** předem a možností námitky Správce do **10 dnů** z doložených důvodů ochrany údajů;
- školní objednávka má samostatný checkbox pro VOP/oprávnění objednat a samostatný checkbox pro DPA; finální objednávkové tlačítko je aktivní až po obou souhlasech;
- klient posílá `dpaAccepted=true` a sdílený **DPA_ACCEPTANCE_KEY = 2026-09-21-dpa-v2**; server oba údaje fail-closed validuje přes Zod a přímé API volání bez aktuální DPA odmítne;
- `organization_orders.billing_snapshot.legalAcceptance` ukládá samostatně `dpaVersion`, `dpaAcceptedAt` a `dpaAcceptedByUserId` vedle evidence VOP;
- Privacy Notice je povýšena na **1.4**: už nepopisuje školní účty jako budoucí, rozlišuje organizaci jako správce a Syllonaut jako zpracovatele pro školní data a samostatnou roli Syllonautu jako správce pro vlastní billing/security/legal účely;
- VOP výslovně inkorporují DPA do smlouvy organizace v rozsahu zpracování prováděného jménem organizace;
- produkční kontrola před změnou potvrdila, že zatím neexistuje žádná reálná live školní objednávka; jediná organizace je interní testovací Campus bez objednávky, takže není nutný zpětný DPA re-consent zákazníků;
- regresní kontrakt **scripts/verify-dpa.mjs** je součástí hlavního `npm run check`;
- změna nepřidává novou databázovou tabulku ani RPC; využívá existující serverový order snapshot a nezvětšuje veřejnou DB attack surface;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Neměnné potvrzení individuální smlouvy 0.9.82 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-004**;
- před vrácením Stripe Checkout URL server vytvoří konkrétní smluvní snapshot: tarif, cenu a měnu, fakturační období, zvolenou fakturační zemi, automatické obnovení, výslovnou žádost o okamžité zahájení služby, verzi / acceptance key VOP a celé znění přijaté verze VOP;
- snapshot obsahuje samostatný **vzorový formulář pro odstoupení** v jazyce checkoutu a vlastní SHA-256 kontrolní hash;
- archivní záznam záměrně neduplikuje e-mail zákazníka; používá technické ID účtu a právní / smluvní metadata;
- snapshot i jeho vazba na konkrétní Stripe Checkout Session jsou v `private` schématu, mají RLS bez klientských policies a jsou append-only; servisní create/read RPC jsou dostupná pouze `service_role`; evidence není navázaná FK na `auth.users`, aby smazání účtu samo nevymazalo smluvní důkaz;
- checkout failuje zavřeně: pokud se po vytvoření Stripe Session nepodaří snapshot atomicky uložit a svázat s jejím ID, aplikace zákazníkovi platební URL nevrátí;
- snapshot ID se zapisuje do metadata Checkout Session i Stripe Subscription; LIVE webhook jej při dokončeném checkoutu ověřuje společně s uživatelem, customerem, subscription a billing route;
- při aktivačním e-mailu se archivovaný obsah znovu ověří SHA-256 hashem a kontroluje se shoda tarifu i Checkout Session;
- aktivační e-mail nově shrnuje cenu, období, automatické obnovení a verzi VOP a přikládá dvě samostatné HTML přílohy: **neměnné smluvní informace + VOP** a **vzorový formulář pro odstoupení**;
- doručovací ledger uchovává `contract_snapshot_id`, takže lze doložit, která přesná archivní verze byla k dané aktivaci použita;
- Privacy Notice je povýšena na **1.3** a výslovně popisuje obsah, účel a retention archivního smluvního snapshotu;
- produkční migrace: **20260921045117_add_individual_contract_snapshots** a **20260921045911_atomically_link_individual_contract_snapshot**;
- transakční DB test ověřil create → read roundtrip i blokaci UPDATE append-only triggerem; po rollbacku zůstalo v produkci **0** testovacích snapshotů;
- Security Advisor nepřidal nový WARN; dvě nové privátní tabulky se zobrazují pouze jako očekávané INFO `rls_enabled_no_policy`, protože klient k nim záměrně nemá policy ani grant;
- regresní kontrakty jsou doplněné v **scripts/verify-stripe-checkout.mjs**, **scripts/verify-billing-lifecycle-email.mjs** a **scripts/verify-terms.mjs**;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Veřejné a měřitelné AI hodnocení 0.9.81 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-003**;
- zákaznické kvóty AI hodnocení jsou **Teacher Pro 60**, **School 300** a **Campus 750** za quota období;
- `lib/individual-billing-catalog.ts` obsahuje sdílený customer-facing zdroj těchto hodnot pro aplikaci;
- produkční `billing_plans.monthly_ai_grading_count_limit` používá stejné hodnoty, takže nejde jen o marketingový text;
- Teacher Pro grading používá stejné **billing-anchored quota window** jako generování a AI úpravy; School/Campus zůstávají na UTC kalendářním měsíci;
- `get_ai_quota()` nově vrací `grading_used`, `grading_limit`, `grading_remaining`, `grading_unlimited` a `grading_enabled`;
- účtové menu zobrazuje zbývající počet AI hodnocení; stránka **Předplatné** u Teacher Pro zobrazuje stejný stav i datum obnovy;
- Ceník uvádí konkrétní počet AI hodnocení u Teacher Pro / School / Campus a vysvětluje, že grading má vlastní kvótu oddělenou od tvorby lekcí a AI úprav;
- aktivační e-mail Teacher Pro potvrzuje i konkrétních **60 AI hodnocení za období**;
- interní dolarový guard už není skrytým zákaznickým limitem: nouzové stropy jsou **$12 / $60 / $150** a in-flight reservation **$0,10**, tedy dvojnásobná nákladová rezerva proti zveřejněné kvótě při $0,10 za hodnocení;
- nový `private.ai_grading_budget_requests` ledger zatím nemá dokončený placený záznam, ale historické `response_evaluations` obsahují **65 skutečných cost vzorků** na `openai/gpt-5.6-sol`: průměr **$0,01426648**, p95 **$0,02611340** a maximum **$0,03398000**; nouzový cost guard je proto proti dosud naměřeným nákladům výrazně nad zákaznickou kvótou;
- produkční migrace: **20260921042019_publish_ai_grading_allowances**;
- Security Advisor po změně nepřidal nový warning;
- regresní kontrakty: **scripts/verify-ai-grading-budget.mjs** + **scripts/verify-billing-lifecycle-email.mjs**;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Přesné obnovení AI kvót 0.9.80 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-002**;
- Ceník už netvrdí, že všechny tarify resetují AI limity každý kalendářní měsíc;
- **Free** a sdílené **Team / School / Campus** kvóty jsou nadále UTC-kalendářní a veřejně jsou takto popsány;
- **Teacher / Teacher Pro** používají skutečný Stripe billing anchor; měsíční předplatné resetuje kvótu s fakturačním cyklem a roční předplatné používá 12 měsíčních podoken odvozených od data začátku ročního období;
- stávající `public.get_ai_quota()` byl zpětně kompatibilně rozšířen o `quota_window_start`, `quota_window_end` a `quota_source`; nevznikl nový trvalý veřejný RPC endpoint;
- účtové menu vedle zbývajícího počtu AI lekcí / úprav zobrazuje **konkrétní datum další obnovy** a zda jde o kalendářní měsíc nebo fakturační cyklus; unlimited admin účtu se falešný reset nezobrazuje;
- stránka **Předplatné** u Teacher / Teacher Pro zobrazuje stejné autoritativní datum příští obnovy AI limitu;
- produkční migrace: **20260921040552_add_ai_quota_window_metadata** a následná konsolidace **20260921040634_expose_ai_quota_window_on_primary_rpc**; dočasný `get_ai_quota_v2()` byl po konsolidaci odstraněn;
- Security Advisor po konsolidaci zůstal na předchozím počtu privileged-RPC upozornění; nevznikla nová trvalá `SECURITY DEFINER` surface;
- `scripts/verify-billing-anchored-ai-quotas.mjs` nově hlídá backendový zdroj okna, veřejný Pricing text i zobrazení resetu v účtu a předplatném;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Ukončení připravené hodiny bez spuštění 0.9.79 — 2026-09-21

- startovní zóna live hodiny nově vždy nabízí sekundární akci **Ukončit bez spuštění** / **End without starting**;
- akce používá existující serverový `end` přechod, takže nevzniká paralelní typ session ani nový speciální endpoint;
- v lobby má ukončení vlastní potvrzovací text, který výslovně upozorňuje, že připojovací kód přestane fungovat a případní připojení studenti se už do této session nevrátí;
- tlačítko je dostupné i tehdy, když týmová lekce ještě čeká na vytvoření týmů;
- ukončení z lobby se nezapočítává do analytiky jako `live_session_ended`; tento event zůstává vyhrazený skutečně zahájeným live hodinám;
- po ukončení se používá stejný stav `ended` a stejný návrat k lekci jako po běžném ukončení hodiny;
- regresní kontrakt je doplněný v **scripts/verify-live-resilience.mjs**;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Sjednocení kvót Pricing ↔ aktivační e-mail 0.9.78 — 2026-09-21

- uzavřen právní auditní bod **LEGAL-001**;
- `lib/individual-billing-catalog.ts` nově obsahuje sdílený `INDIVIDUAL_PLAN_ALLOWANCES` pro individuální placené tarify;
- český i anglický Pricing skládá číselné AI kvóty Teacher / Teacher Pro z tohoto katalogu místo vlastních čísel;
- transakční aktivační e-mail po úspěšné Stripe platbě dostává stejnou kvótu z katalogu přes serverovou billing vrstvu;
- aktuální hodnoty jsou **Teacher 10 nových AI lekcí + 20 AI úprav / měsíc** a **Teacher Pro 25 + 40**;
- odstraněny zastaralé potvrzované hodnoty **Teacher 25 + 100** a **Teacher Pro 60 + 250**;
- `scripts/verify-billing-lifecycle-email.mjs` regresně hlídá sdílený zdroj i zákaz návratu starých hodnot;
- databázové entitlementy, ceny ani fakturační období se touto opravou nemění;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Přirozená editace počtu týmů 0.9.77 — 2026-09-21

- pole **Počet týmů** už při každém stisku okamžitě neclampuje hodnotu na minimum 2;
- předvyplněnou hodnotu lze celou smazat, pole zůstane prázdné a učitel může bez boje zadat nové číslo;
- klient akceptuje pro vytvoření týmů pouze celé číslo **2–12**; při prázdné nebo neplatné hodnotě je tlačítko **Vytvořit týmy** deaktivované;
- serverový `TeamCreateSchema` dál nezávisle vynucuje celé číslo 2–12, takže bezpečnostní hranice se nemění;
- regresní kontrakt v **scripts/verify-collaboration-mode.mjs** nově hlídá, že se nevrátí okamžité přepisování prázdné hodnoty na minimum;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Právní / ČOI launch audit před 1.0 — 2026-09-21

**Stav: OPEN.** Audit byl proveden z pohledu přísného spotřebitelského právníka / kontrolora proti aktuálním VOP, Ceníku, checkoutům, billing e-mailům, skutečným backendovým limitům a GDPR stránce. Níže uvedené body nejsou považovány za uzavřené pouhou existencí VOP; musí se odstranit rozpor mezi veřejnou nabídkou, potvrzením objednávky a skutečným plněním.\n\n#### Blokátory 1.0

- **[LEGAL-001 — RESOLVED 0.9.78] Aktivační e-mail potvrzoval zastaralé a vyšší AI kvóty.** Opraveno: `INDIVIDUAL_PLAN_ALLOWANCES` v `lib/individual-billing-catalog.ts` je společný zdroj pro Pricing i transakční aktivační e-mail. Teacher se potvrzuje jako **10 nových AI lekcí + 20 AI úprav / měsíc**, Teacher Pro jako **25 + 40**. Regresní kontrola vykreslí oba tarify ze sdílených hodnot a zakazuje návrat starých textů **25/100** a **60/250**.
- **[LEGAL-002 — RESOLVED 0.9.80] Ceník nepravdivě tvrdil, že všechny AI limity se obnovují každý kalendářní měsíc.** Opraveno: Free a sdílené Team / School / Campus kvóty jsou veřejně popsány jako kalendářní; Teacher / Teacher Pro jako kvóty podle fakturačního cyklu, u ročního předplatného po měsíčních intervalech od data začátku předplatného. `get_ai_quota()` nyní vrací i autoritativní `quota_window_start`, `quota_window_end` a `quota_source`; přesné datum další obnovy se zobrazuje v účtovém menu a na stránce Předplatné. Regresní test zakazuje návrat původního plošného tvrzení.
- **[LEGAL-003 — RESOLVED 0.9.81] AI grading měl skryté safety stropy, které mohly změnit slíbenou funkci na ruční review.** Opraveno: zákaznická kvóta je nově explicitní a serverově vynucená — **Teacher Pro 60**, **School 300** a **Campus 750 AI hodnocení za quota období**. Teacher Pro používá stejné billing-anchored okno jako ostatní individuální AI kvóty; School/Campus kalendářní měsíc. Ceník, účet a Teacher Pro aktivační e-mail používají stejné hodnoty. Interní cost guard zůstává pouze nouzovou pojistkou s výraznou rezervou (**$12 / $60 / $150**, reservation $0,10), nikoli zákaznickým limitem. Produkce zatím nemá dokončené placené grading cost záznamy, takže hodnoty nejsou vydávány za empirické p95.
- **[LEGAL-004 — RESOLVED 0.9.82] Po individuálním elektronickém nákupu chyběla neměnná kopie smluvních informací a VOP v textové podobě.** Opraveno: checkout před vydáním Stripe URL archivuje append-only snapshot konkrétní nabídky a VOP včetně ceny, tarifu, období, obnovování a žádosti o okamžité zahájení služby; snapshot je svázaný s konkrétní Stripe Checkout Session a chráněný SHA-256 hashem. Po aktivaci se stejný archivní obsah posílá jako HTML příloha spolu s odděleným vzorovým formulářem pro odstoupení a doručovací ledger uchovává `contract_snapshot_id`. Privacy Notice 1.3 tento právní záznam a jeho retention výslovně popisuje.
- **[LEGAL-005 — RESOLVED 0.9.83] GDPR/DPA vrstva neodpovídala spuštěným Team / School / Campus účtům.** Opraveno: organizace nyní výslovně přijímá verzovanou DPA 1.0 vedle VOP; server vyžaduje aktuální `DPA_ACCEPTANCE_KEY` a ukládá verzi, serverový čas a ID přijímajícího účtu do order snapshotu. Privacy Notice 1.4 popisuje skutečné role controller/processor a odkazuje na veřejnou DPA s konkrétními kategoriemi údajů, TOMs, subprocessory, incidenty, asistencí, mazáním/vrácením a audity.

#### Vysoká právní / smluvní rizika

- **[LEGAL-006 — RESOLVED 0.9.85] Starší účty neměly doložené přijetí aktuálních VOP.** Opraveno: přihlášený účet bez append-only evidence aktuálního key je před další tvorbou, editací, live výukou nebo správou organizace veden na explicitní `/terms/accept`; server zároveň blokuje relevantní mutace i při přímém API volání. Přijetí se zapisuje serverovým časem do `private.terms_acceptance_events` se zdrojem `reconsent`. Billingové doklady a skutečné ukončení/omezení renewal zůstávají dostupné bez nuceného přijetí nové verze.
- **[LEGAL-007 — RESOLVED 0.9.87] Čl. 5 VOP se pokoušel při rozporu dát přednost údajům těsně před objednávkou a následnému platebnímu dokladu.** Opraveno: pozdější potvrzení/faktura už nemůže jednostranně přepsat sjednané podmínky; veřejné VOP a archivní snapshot sdílejí totožnou klauzuli. Pricing a backend jsou navíc regresně svázané se sdílenými cenovými a kvótovými katalogy a nový test hlídá cestu nabídka → checkout → snapshot → aktivační e-mail.
- **[LEGAL-008 — RESOLVED 0.9.88] Není definovaná obhajitelná metodika poměrné úhrady při spotřebitelském odstoupení po okamžitém zahájení služby.** Vyřešeno čistým časovým poměrem z původní sjednané ceny a skutečné délky období, se zaokrouhlením zadržené částky dolů ve prospěch spotřebitele. AI spotřeba částku nemění. Neměnná evidence rozlišuje čas odeslání pro zachování lhůty a čas doručení pro výpočet; bezpečný Stripe refund je vázaný na původní platbu a chráněný proti souběhu a duplicitě.
- **[LEGAL-009 — RESOLVED 0.9.89] Claim „Ochrana proti nepovolenému využití AI ve studentských odpovědích“ byl silnější než skutečný produkt.** Ceník nyní pro Teacher Pro, School a Campus používá sdílený CZ/EN benefit **„Upozornění na možné využití AI ve studentských odpovědích“** / **“Alerts about possible AI use in student responses”** a viditelně uvádí, že jde o AI/heuristický signál pro kontrolu učitelem, nikoli důkaz; body se automaticky nemění. Regresní test zakazuje návrat původního slibu ochrany.
- **[LEGAL-010 — RESOLVED 0.9.90] VOP řešily změny průběžné digitální služby příliš obecně.** Schválená hybridní varianta C nyní vynucuje doložený důvod, klasifikaci a datum účinnosti; u podstatně nepříznivé změny přednostně zachová bezpečnou původní verzi do konce zaplaceného období, jinak vyžaduje trvalé oznámení alespoň 30 dnů předem a nabízí spotřebiteli ukončení bez postihu s vrácením nevyužité předplacené části.
- **[LEGAL-011 — RESOLVED 0.9.91] VOP neuváděly telefonní číslo poskytovatele.** Funkční přímý kontakt **+420 733 377 199** je nyní ze sdíleného zdroje uveden ve VOP, předsmluvních checkout údajích, veřejném kontaktu a nových individuálních i školních smluvních snapshotech; odkaz používá normalizované `tel:+420733377199`.
- **[LEGAL-012 — RESOLVED 0.9.92] VOP obsahovaly vlastní zkrácený vzor odstoupení, nikoli zjevně zákonný vzorový formulář podle aktuální české úpravy.** Aktuální vzor je nyní sdílený mezi VOP, veřejnou tisknutelnou stránkou a neměnnou přílohou smluvního potvrzení. Spotřebitel může ve 14denní lhůtě odstoupit také online ze správy předplatného; systém atomicky uloží přesný obsah a serverový čas a bezodkladně odešle trvalé e-mailové potvrzení.
- **[LEGAL-013] Absolutní marketingové „bez omezení“ koliduje s bezpečnostními omezeními zařízení a dalšími guardy.** Placené účty mají např. trusted-device limit **3 aktivní zařízení / 5 nových za 30 dní**. **Náprava:** používat přesný claim **„opakované spouštění hotových lekcí bez čerpání AI limitu“**, nikoli obecné „bez omezení“.

#### Střední / provozní rizika

- **[LEGAL-014] Školní objednávka neukazuje konkrétní cenu bezprostředně u finálního tlačítka.** Formulář ukazuje tarif, počet učitelů a AI kvóty, ale finální souhrn před **Objednat s povinností platby** nemá cenu, měnu, celkové období a renewal mode. **Náprava:** přidat pevný order summary přímo nad tlačítko pro fakturu i kartu.
- **[LEGAL-015] U školní fakturační objednávky lze deklarovat cizí školu bez silnějšího ověření oprávnění.** Checkbox o oprávnění pomáhá smluvně, ale IČO je volitelné a technicky se neověřuje oprávnění osoby jednat. **Náprava:** pro fakturační B2B objednávky vyžadovat identifikaci organizace; pro vyšší tarify zvážit verifikaci billing e-mailu/domény nebo ruční kontrolu.
- **[LEGAL-016] Smazání účtu a zrušení předplatného jsou ve VOP oddělené.** Scénář, kdy je účet smazaný, ale Stripe dál obnovuje placenou službu, je UX i právně obtížně obhajitelný. **Náprava:** account deletion flow musí aktivní renewal explicitně ukončit nebo uživatele nepustit ke smazání bez bezpečného billing vypořádání.
- **[LEGAL-017] Reklamace je popsaná jen jako e-mail na podporu.** Chybí explicitní automatizovaný proces potvrzení přijetí reklamace a doložitelné evidence výsledku. **Náprava:** přidat reklamační workflow / šablonu transakčního potvrzení, stav a archivaci.
- **[LEGAL-018] Technické požadavky / kompatibilita nejsou dostatečně shrnuté před nákupem.** **Náprava:** veřejná sekce s podporovanými moderními browsery, JavaScriptem/cookies, připojením, relevantními mobilními omezeními a další funkční interoperabilitou.
- **[LEGAL-019] Mezinárodní prodej v EUR/USD otevírá daňový/OSS risk.** Samotná věta „nejsme plátci DPH“ není dlouhodobá univerzální odpověď pro přeshraniční B2C digitální služby. **Náprava:** před větší zahraniční akvizicí ověřit s českým daňovým poradcem konkrétní Stripe / Merchant-of-Record model, obratové prahy, místo plnění a případný OSS režim.

#### Budoucí regulatorní body, které nesmí zapadnout

- **[LEGAL-020] Online odstoupení od 1. 1. 2027.** Česká úprava zavádí pro spotřebitelské distanční smlouvy uzavírané přes online rozhraní povinnou snadno dostupnou online funkci pro odstoupení, včetně potvrzení odstoupení. **Termín:** implementovat a otestovat před 1. 1. 2027; samotný e-mail nebude dostačující jako jediná cesta.
- **[LEGAL-021] AI Act classification.** AI grading výsledků učení a integrity signalizace ve vzdělávání se musí formálně klasifikovat vůči AI Act / Annex III. Současný produkt nesmí předpokládat, že marketingové označení „asistent učitele“ automaticky znamená výjimku. **Náprava:** samostatný AI Act classification assessment, dokumentace intended purpose, human oversight a případných high-risk povinností v dostatečném předstihu před relevantní účinností.

#### Rozhodnutí pro release

- body **LEGAL-001 až LEGAL-005** jsou v tomto auditu vedené jako **blokátory 1.0**;
- body **LEGAL-009 až LEGAL-013** mají být řešeny před nebo současně s 1.0, pokud mají přímý dopad na aktivní zákaznický flow;
- body **LEGAL-014 až LEGAL-019** jsou hardening před širší komercializací;
- body **LEGAL-020 až LEGAL-021** mají vlastní regulatorní termín / assessment a nesmí být ztraceny v běžném backlogu;
- po opravách provést nový **legal offer-vs-contract-vs-runtime audit**: Homepage → Pricing → Signup → Checkout → Stripe → potvrzovací e-mail → Subscription/School UI → VOP → GDPR → skutečné DB/backend entitlementy.

### Intuitivní start týmové hodiny 0.9.76 — 2026-09-21

- při týmové lekci bez vytvořených týmů už horní startovní zóna neukazuje jen nenápadné upozornění a deaktivovaný start;
- místo toho zobrazuje výrazný dvoukrokový postup **1. Vytvořit týmy → 2. Odstartovat hodinu**, takže důvod blokace i další akce jsou zřejmé bez rolování níž;
- kliknutí na **Vytvořit týmy** plynule posune učitele k týmovému panelu a zaměří pole **Počet týmů**;
- po vytvoření alespoň dvou týmů se prerequisite blok skryje a zobrazí se běžné aktivní tlačítko **Odstartovat hodinu**;
- mobilní rozložení skládá instrukci a oba kroky pod sebe / přes celou dostupnou šířku;
- regresní kontrakt je součástí **scripts/verify-collaboration-mode.mjs**;
- serverový guard z 0.9.64 zůstává beze změny: týmovou hodinu nelze spustit bez alespoň dvou týmů;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Viewport-safe scroll levého authoring panelu 0.9.75 — 2026-09-21

- desktopový levý panel s tvorbou a AI úpravami lekce dál používá vlastní scroll, ale jeho maximální výška se už nepočítá, jako by panel začínal u horní hrany okna;
- dostupná výška se dynamicky odvozuje od skutečné pozice panelu ve viewportu a od spodního okraje aktuálního `visualViewport`, takže poslední tlačítko / editor lze dorolovat přímo v levém sloupci bez nutnosti posouvat celou stránku;
- výpočet se obnovuje při scrollu stránky, resize a změnách `visualViewport`; změny přihlášení, billing banneru nebo recovery banneru znovu přepočítají výšku panelu;
- na šířkách do 900 px zůstává záměrně standardní stránkové rolování bez vnořeného scrollu;
- regresní kontrakt: **scripts/verify-lesson-workspace-scroll.mjs**;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Serverový audit registračního souhlasu 0.9.74 — 2026-09-21

- produkční Supabase má novou privátní tabulku **private.terms_acceptance_events** pro audit souhlasu při registraci Free účtu;
- audit ukládá pouze technické ID účtu, verzi podmínek, aktivní acceptance key, zdroj `signup` a **serverový čas**; e-mail ani jiný přímý identifikátor se do záznamu nekopíruje;
- `private.handle_new_user()` zapíše audit pouze tehdy, když signup metadata obsahují explicitní `terms_accepted=true` a přesně aktuální key **2026-09-21-v1**; jiné způsoby vytvoření účtu bez tohoto metadata registraci nezablokují;
- tabulka má RLS, nulové granty pro `public` / `anon` / `authenticated` a append-only trigger blokující UPDATE/DELETE; uživatel tedy nemůže později auditní stopu měnit přes Auth metadata ani Data API;
- tabulka záměrně nemá cascade FK na `auth.users`, aby se smluvní důkaz automaticky nesmazal spolu s účtem; GDPR notice 1.2 nově tuto omezenou retenční potřebu výslovně popisuje;
- produkční migrace: **20260921033344_add_terms_acceptance_audit**;
- regresní kontrakt **scripts/verify-terms.mjs** kontroluje databázový audit, privacy notice i shodu aktivního acceptance key;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Obchodní podmínky a objednávkové souhlasy 0.9.73 — 2026-09-21

- nová veřejná lokalizovaná stránka **/cs/terms** / **/en/terms** obsahuje obchodní podmínky Syllonautu pro Free, individuální i školní tarify, včetně AI, plateb, obnovení, reklamací, odstoupení spotřebitele a ADR;
- patička na hlavních veřejných stránkách trvale odkazuje na Obchodní podmínky vedle GDPR a nastavení cookies;
- registrace Free účtu vyžaduje nezaškrtnutý souhlas s obchodními podmínkami, zachovává oddělený dobrovolný marketingový souhlas a ukládá verzi + čas přijetí do auth metadata;
- současně opravena zastaralá registrační informace Free tarifu z 5/20 na aktuální **3 nové AI lekce + 10 AI úprav / měsíc**;
- individuální Teacher / Teacher Pro checkout vyžaduje samostatný souhlas s podmínkami a samostatnou výslovnou žádost o okamžité zahájení služby před uplynutím 14denní lhůty; server obě potvrzení fail-closed validuje a zapisuje verzi souhlasu do Stripe Checkout / subscription metadata;
- školní Team / School / Campus objednávka vyžaduje souhlas s podmínkami na klientu i serveru; verze, serverový čas přijetí a ID účtu objednatele se ukládají do billing snapshotu objednávky;
- objednávková tlačítka byla zpřesněna tak, aby jednoznačně signalizovala povinnost platby;
- regresní kontrakt: **scripts/verify-terms.mjs** + rozšířený Stripe checkout verifier;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Landing wordcloud 0.9.72 — 2026-09-20

- sekce **Stavebnice aktivit** nově využívá volný horní prostor pro živý wordcloud renderovaný přímo na stránce, bez bitmapového obrázku;
- **Syllonaut** je centrální, největší a nejtučnější prvek; okolní pojmy popisují produkt jako celek (AI, interaktivní výuka, živá hodina, úspora času, zapojení, spolupráce, příprava, AI úpravy, studenti, učitel, zpětná vazba, reflexe, mobily a hodnocení);
- vizuál používá jen střídmou fialovou paletu Syllonautu a jemné orbitální linky/body, aby ladil s existujícím kosmickým motivem;
- cloud je čistě dekorativní pro asistivní technologie (`aria-hidden`) a nezměnil informační hierarchii ani ovládání stránky;
- desktop zachovává dvousloupcový claim + activity chips pod wordcloudem; mobil cloud zjednodušuje a skrývá méně důležité výrazy, aby zůstal čitelný.

### Viewport-safe přihlašovací panel 0.9.71 — 2026-09-20

- společný `AuthControls` nově ukotvuje dialog horizontálně podle skutečné levé hrany triggeru a omezuje jej hranami viewportu;
- vertikálně se dialog otevře pod tlačítkem, pokud se vejde; jinak se automaticky překlápí nad tlačítko;
- pokud je formulář vyšší než dostupný viewport, dostane vlastní scroll a zůstane celý dosažitelný;
- pozice se přepočítává při page/nested scrollu, resize, změně `visualViewport` a změně výšky obsahu přes `ResizeObserver`;
- odstraněna byla landing-only mobilní výjimka, aby School, School invite, shared lesson, landing, Pricing a lesson workspace používaly stejnou logiku;
- `verify-header-account-menu.mjs` nově regresně hlídá i školní a share scénáře a zákaz lokální positioning výjimky;
- veřejně zobrazovaná verze zůstává 0.9.30.

### Stabilní desktopové rozložení týmových polí 0.9.70 — 2026-09-20

- při zapnutí týmových aktivit se na desktopu pole **Velikost týmu** řadí až za **Tón**, takže existující pole nemění pozici;
- díky dvousloupcovému gridu se velikost týmu zobrazí vizuálně pod volbou týmových aktivit;
- na mobilu se CSS pořadí resetuje a zachovává intuitivní sekvenci **volba týmových aktivit → velikost týmu → tón**;
- změna používá samostatný layout hook `team-size-field`; DOM pořadí zůstává mobilně přirozené;
- regresní kontrola `verify-collaboration-mode.mjs` hlídá desktopové i mobilní pořadí.

### Srozumitelnější volba týmových aktivit 0.9.69 — 2026-09-20

- formulář už nepoužívá označení **„Režim práce: Jednotlivci / Týmy“**, které mohlo naznačovat, že týmová volba znamená výhradně týmové úkoly;
- nová otázka zní **„Má lekce obsahovat týmové aktivity?“**;
- volby jsou **„Ne, pouze individuální“** a **„Ano, kombinovat individuální a týmové“**;
- anglická varianta používá **“Should the lesson include team activities?”**, **“No, individual only”** a **“Yes, combine individual and team activities”**;
- náhled lekce stejnou logiku komunikuje jako **„Pouze individuální aktivity“** nebo **„Individuální + týmové aktivity“**;
- jde pouze o UX/copy změnu; datový model, AI pravidla, live týmový workflow a serverové guardy 0.9.64 zůstávají beze změny;
- regresní kontrola `verify-collaboration-mode.mjs` novou formulaci chrání.

### Zaokrouhlení měsíčního ekvivalentu ročních cen 0.9.68 — 2026-09-20

- přepočet roční ceny na měsíc se v Ceníku u individuálních i školních tarifů zaokrouhluje nejvýše na **dvě desetinná místa**;
- pravidlo platí jednotně pro **CZK, EUR i USD** a pro českou i anglickou variantu Ceníku;
- příklady školních tarifů: **8 900 Kč/rok → ≈ 741,67 Kč/měsíc**, **23 900 Kč/rok → ≈ 1 991,67 Kč/měsíc**, **59 900 Kč/rok → ≈ 4 991,67 Kč/měsíc**;
- změna je pouze prezentační: nemění katalogové ceny, Stripe billing ani fakturační logiku;
- implementace: PR **#231**, produkční commit `a7503aca`.

### Zvýraznění AI integrity ochrany v Ceníku 0.9.67 — 2026-09-20

- Teacher Pro, School a Campus mají hned pod AI hodnocením nový samostatný zvýrazněný benefit **„Ochrana proti nepovolenému využití AI ve studentských odpovědích“**;
- anglická varianta používá **„Protection against unauthorized AI use in student responses“**;
- benefit se zobrazuje pouze u tarifů s AI gradingem a používá stejný zvýrazňovací styl jako ostatní prémiové funkce;
- žádná změna gradingu, entitlementů ani studentského workflow.

### Učitelské potvrzení AI integrity alertu 0.9.66 — 2026-09-20

- `high` podezření dál funguje pouze jako signál ke kontrole a **nikdy samo nenastavuje 0 bodů**;
- učitel může po zobrazení konkrétních signálů explicitně zvolit **„Potvrdit nepovolené využití AI → 0 bodů“**;
- před nastavením nuly proběhne ještě explicitní potvrzení učitele; zápis používá existující autentizovaný teacher review endpoint;
- **automatická kontrolní otázka studentovi je záměrně vyloučená**; studentův live flow se tímto hardeningem nemění;
- regresní kontrola hlídá jak teacher-zero akci, tak nepřítomnost student challenge route/componentu.

### AI integrity alert při AI hodnocení 0.9.65 — 2026-09-20

- AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí vrací vedle bodů a grading confidence samostatný integrity signál `none / low / high`;
- integrity signál je pouze upozornění na textové vzorce typické pro generovaný AI text, nikoli důkaz podvodu, a **nikdy automaticky nemění body**;
- `high` se po modelovém výstupu aplikačně přijme jen u odpovědi dlouhé alespoň 280 znaků a při nejméně dvou konkrétních signálech; jinak se sníží na `low`;
- pouze `high` přesune výsledek do `needs_review` a zobrazí učiteli výrazný alert s konkrétními důvody; konečné hodnocení zůstává na učiteli;
- přímý i server-driven grading ukládají signalizaci přes nové kompatibilní RPC `finish_response_evaluation_v2` / `finish_grading_job_v2`;
- produkční migrace: `20260920180324_add_ai_integrity_alert`;
- český i anglický Ceník komunikuje AI grading s detekcí podezřelého využití AI pouze u Teacher Pro, School a Campus; Team zůstává bez AI gradingu;
- regresní kontrakt: `scripts/verify-ai-integrity-alert.mjs`.

### Explicitní režim práce lekce 0.9.64 — 2026-09-20

- tvorba nové lekce má explicitní volbu **Jednotlivci / Týmy**; velikost týmu se zadává pouze v týmovém režimu;
- `collaborationMode` se ukládá do Lesson JSON a API `/api/generate` jej validuje serverově;
- individuální generování i AI revize failují uzavřeně, pokud by vznikl `team_task`; po prvním porušení se AI jednou automaticky opraví;
- týmový režim vyžaduje alespoň jeden `team_task`, aby volba nebyla pouze kosmetická;
- live teacher UI se řídí explicitním režimem: u jednotlivců se týmový panel nevykreslí, u týmů nelze hodinu spustit bez alespoň dvou vytvořených týmů;
- starší lekce bez `collaborationMode` používají kompatibilní fallback: `team_task` => týmy, jinak jednotlivci;
- regresní kontrakt: `scripts/verify-collaboration-mode.mjs`.

Produkční release 0.8:

`45fe128e05bc9007ef9a927d70562d6d4c80ac77` — **Release Syllonaut 0.8 live resilience**.

Produkční stav 0.8 je potvrzený ve všech třech hlavních vrstvách: Vercel aplikace je nasazená, Supabase migration `20260918114341` je aplikovaná a Cloudflare Worker `syllonaut-live-control` byl ručně nasazen přes Wrangler; aktuální ověřený Worker Version ID je `3044c41b-c0b4-443b-81e5-57fabb0d4419`, `workerVersion=0.8.14`, `protocolVersion=2`. Server-driven AI grading se po releasu reálně ověřil na dvou pending evaluacích z beta hodiny: obě doběhly bez browser-driven pumpy. Bezpečnostní audit má 15 remediovaných/uzavřených nálezů; SEC-002 a SEC-007 jsou vědomě přijaté výjimky / odložená rizika.

## 1. Produkt a zdroj pravdy

**Syllonaut — Od nápadu k odučené hodině. S AI.**

Produktová kategorie: **AI navigátor pro interaktivní výuku.** Hlavní positioning není „AI generátor materiálů“, ale jeden souvislý tok od zadání přes AI přípravu a úpravy až po skutečně vedenou živou hodinu.

### Positioning a veřejný claim — dokončeno 2026-09-19

Finální hlavní claim: **„Od nápadu k odučené hodině. S AI.“**

Pravidla použití:
- hlavní benefitový claim zdůrazňuje celý tok od zadání přes AI přípravu a úpravy až po skutečně vedenou hodinu;
- **„AI navigátor pro interaktivní výuku“** zůstává produktovou kategorií / krátkým popisem značky, nikoli hlavním claimem;
- Syllonaut nemá být veřejně positionován jako pouhý „AI generátor lekcí“ nebo „AI generátor materiálů“;
- veřejná komunikace má zdůrazňovat spojení **AI přípravy + přirozených AI úprav + live vedení výuky + studentské interakce**;
- česká homepage používá claim **„Od nápadu k odučené hodině. S AI.“**;
- anglická homepage používá **„From idea to live teaching. With AI.“**;
- claim byl sjednocen v homepage hero sekci, závěrečném CTA, SEO metadata, Open Graph náhledu, globálním description a README;
- změna byla provedena přes PR **#155 – Refine Syllonaut AI positioning**, Vercel preview prošel a PR byl sloučen do `main`.

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, organizovat, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma, cílovou skupinu, délku, velikost skupiny, tón a další požadavky nebo nahraje vlastní podklady. AI z toho vytvoří validovanou strukturovanou lekci. Učitel ji může upravovat přirozeným jazykem, uložit ke svému účtu, spustit live session a studenti se připojí bez plnohodnotného účtu přes QR, link nebo kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

Hlavní doména: `syllonaut.com`.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Aktuální HEAD je vždy nutné načíst z GitHubu před zahájením práce; tento dokument nesmí nahrazovat kontrolu aktuálního `main`.

### Přepočet tarifů, AI ekonomika a USP — 2026-09-20

Tarify byly přepočítány podle skutečně uložených AI Gateway nákladů z produkčního provozu 16.–19. 9. 2026. Naměřený průměr: nová lekce **$0.142037** (n=28; p95 $0.243025), úprava celé lekce **$0.095525** (n=13; p95 $0.151851), úprava bloku **$0.032222** (n=8; p95 $0.048424) a AI hodnocení jedné odpovědi **$0.014362** (n=63; p95 $0.026176). Pozorovaný mix lesson/block revizí stojí v průměru **$0.071409 za AI úpravu**.

Finální měsíční AI kvóty:
- **Free:** 3 nové AI lekce + 10 AI úprav; 2 importy/kopie; každou lesson family lze živě použít jednou;
- **Teacher:** 10 nových AI lekcí + 20 AI úprav; hotové lekce lze živě používat opakovaně bez omezení;
- **Teacher Pro:** 25 nových AI lekcí + 40 AI úprav; navíc AI grading, pracovní listy/PDF a složky;
- **Team:** 40 nových AI lekcí + 80 AI úprav společně / měsíc, až 10 učitelů;
- **School:** 120 nových AI lekcí + 240 AI úprav společně / měsíc, až 30 učitelů;
- **Campus:** 300 nových AI lekcí + 600 AI úprav společně / měsíc, až 100 učitelů.

Interní AI-grading safety budgety (nejsou customer-facing quota): **Teacher Pro $2 / 150 pokusů**, **School $10 / 700 pokusů**, **Campus $25 / 1 750 pokusů** za měsíc. Při dosažení safety budgetu systém bezpečně přechází na manual review.

Školní ceny: **Team 890 Kč/měs. nebo 8 900 Kč/rok**, **School 2 390 Kč/měsíc nebo 23 900 Kč/rok**, **Campus 5 990 Kč/měsíc nebo 59 900 Kč/rok**. Roční cena odpovídá zhruba 10 měsíčním platbám. Zobrazený přepočet roční ceny na měsíc se ve všech měnách zaokrouhluje nejvýše na dvě desetinná místa. Při plném čerpání kvót a dosavadních průměrných nákladech vychází AI cost přibližně na 38 % efektivního ročního měsíčního výnosu u Teacher, 68 % u Teacher Pro včetně grading safety budgetu, 34 % u Team, 48 % u School a 49 % u Campus. Tím zůstává rezerva na cenové výkyvy modelů, Stripe a infrastrukturu; skutečná marže bude sledována na reálném usage mixu.

**USP pro Pricing a akvizici:** Syllonaut neprodává neomezené generování materiálů jako hlavní hodnotu. Jedna AI lekce je znovupoužitelný live výukový celek: **zadání → AI příprava → přirozené AI úpravy → živá hodina → studentské odpovědi → vyhodnocení → opakované použití**. AI limit se proto vztahuje pouze na novou AI tvorbu a AI úpravy. U placených tarifů spuštění, studentské připojení a opakované používání již vytvořených lekcí AI limit nespotřebovává. Pricing tuto logiku musí komunikovat výrazněji než samotné číselné kvóty.

K…25648 tokens truncated…i striktním opt-in.**

Hotovo:

- GDPR stránka + správce + funkční privacy kontakt;
- consent-gated GA4 loader a analytics opt-in/withdrawal;
- marketing consent audit/self-service withdrawal;
- privacy regression checks;
- produkční GA4 stream `G-1BVLNYB3HV`;
- produkčně ověřený GA4 collect request s HTTP 204 a vznik `_ga` cookies pouze po souhlasu;
- typed analytics helper v `lib/analytics.ts`;
- Enhanced Measurement pageviews;
- privacy-safe produktové eventy pro CTA/pricing/signup/login, generation/revision, folders, live/session/student engagement, reports/CSV a grading;
- `ANALYTICS.md` + regression checks;
- GA4 property `554871574`;
- batch setup skript `scripts/setup-ga4.mjs` a vytvořených 15 custom dimensions pro produktovou analýzu.

Zbývá:

- nasbírat reálný provoz a průběžně ověřovat data v Realtime/Explorations;
- podle skutečných funnelů označit smysluplné key events/conversions;
- doladit reporting až podle reálného používání, nikoli podle prázdné beta property;
- nepřenášet do analytiky e-mail, jméno, lesson text, student answers ani jiné PII/content payloady.

### Milník A.5 — Lokalizace / multilingual lessons 0.9

**Dokončeno, sloučeno do produkčního `main` a 2026-09-19 produkčně acceptance ověřeno — COMPLETE / PASS.**

Produkční model:

- návštěvník v ČR/SR dostane ve výchozím stavu české UI, ostatní anglické;
- ruční volba jazyka UI přebíjí regionální default a je persistentní;
- měna ceníku/billing routing je na jazyku UI nezávislá;
- při tvorbě lekce je přímo viditelné, že zadání lze psát v potřebném/libovolném jazyce;
- jazyk lekce podporuje volbu **Automaticky podle zadání** i explicitní override;
- zvolený/odvozený jazyk lekce se zachovává při AI revizích;
- lesson language je ukládán jako BCP-47 `lang` metadata a není svázán s UI locale;
- locale-aware jsou auth, cookies, lesson creation/workspace/library, live teacher, student, Presenter, grading/reporting, Pricing, GDPR, metadata/SEO;
- 0.9 zachovává Stripe/Customer Portal i live resilience/hardening z aktuálního `main`;
- analytika může anonymně rozlišovat `ui_locale` a `lesson_language` bez přenosu lesson content/PII.

Release 0.9 prošel před merge Preview/build, `npm run check`, security a accessibility kontrolami; produkční `main` je nyní 0.9.


Produkční acceptance 2026-09-19:

- **Free / české UI / požadavek na francouzštinu** → hlavní jazyk zůstává `cs`;
- **Free / anglické UI / požadavek na francouzštinu** → hlavní jazyk zůstává `en`; produkčně ověřeno na uložené lekci o Francouzské revoluci;
- **Free / cizí jazyk jako učivo** → cizojazyčná slovíčka, dialogy a překladové úlohy jsou povolené bez změny hlavního jazyka lekce;
- **Free / překlad celé lekce nebo jednoho bloku** → hlavní jazyk zůstává serverově uzamčený;
- **Teacher/paid / explicitní jazyk** → prakticky ověřena generace v češtině, angličtině a němčině;
- **Teacher/paid / jazyk instrukce ≠ jazyk lekce** → český revizní pokyn upravil německou lekci bez nechtěné změny jejího hlavního jazyka;
- **Teacher/paid / překlad celé lekce** → německá lekce byla přeložena do angličtiny a `language` se změnil `de → en`;
- **Teacher/paid / překlad jednoho bloku** → vybraný anglický blok byl přeložen do francouzštiny, sousední bloky zůstaly anglicky a lesson-level `language` zůstal `en`;
- **číselné odkazy při AI revizi** → od 0.9.10 se „druhý úkol / aktivita 2 / block 2“ mapuje na druhý viditelný blok v `lesson.blocks`; živý test potvrdil správný zásah;
- **cizojazyčné podklady** → německé PDF vytvořilo českou lekci; explicitní cílový jazyk má přednost před jazykem zdrojového materiálu;
- **PDF podklady** → po hotfixu 0.9.12 se self-hosted `/pdf.worker.mjs` v produkci načetl a stejný německý PDF podklad byl úspěšně zpracován;
- **SEC-016** → uložené AI revize načítají autoritativní lesson z DB podle `lessonId + owner_id`, klientský lesson payload není autorita; cross-account A → logout → B test prošel bez přenosu starého lesson stavu;
- **SEC-017** → ruční produkční pokus Free účtu změnit přes `PUT /api/lessons/[id]` `language: en → fr` vrátil HTTP 403 a následná DB kontrola potvrdila, že uložená lekce zůstala `en`.

Základní multilingual funkčnost a bezpečnostní hranice jsou tím považovány za uzavřené. Další jazykové testy mají charakter rozšiřující kombinatoriky (další souborové formáty, další BCP-47 varianty nebo další UI locale), nikoli blokující acceptance.

Další práce na lokalizaci má být už pouze inkrementální: doplnění dalších jazyků/UI locale nebo copy úpravy podle reálného používání, nikoli nový paralelní i18n základ.

### Milník B — live hodina

**Hlavní MVP je dokončené; aktuální produkt je 0.9 a zachovává live resilience/hardening baseline 0.8.16. Po incidentech Supabase prošla live vrstva další least-privilege a recovery hardening fází.**

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit submit, timer, reveal, QR/link/code, recovery, report/CSV, scoring, plan-aware manual/AI grading, review queue, own public score, Presenter, live projektor úloh, Moon race, network hardening, join abuse protection, activity clarity a data tables.

Resilience/hardening 0.8–0.8.16:

- session-scoped Teacher recovery;
- paralelní primary + Cloudflare command race;
- server-driven AI grading s DB retry;
- Cloudflare Worker/Durable Object mirroring a bezpečná snapshot reconciliation přes migraci `20260918093706_allow_live_reconciliation_trigger_bypass`;
- resume ticket lze použít jen při skutečném selhání primárního auth lookupu; běžné odhlášení nesmí fallback obejít;
- service worker necachuje redirectovanou odpověď ani odpověď pro jinou cestu;
- rotace live cache epoch na `syllonaut-live-shell-v2` maže před-hardeningové live cache;
- Worker `0.8.14` / protocol `2` má samostatnou `presenter` capability pouze pro read-only state/WebSocket a explicitně zakazuje Presenter zápis do `/events`;
- Presenter browser od 0.8.16 ukládá a používá samostatný presenter token a pro fallback už nepoužívá teacher capability.

Plánované pokračování hardeningu:

1. do ostrého pondělního testu držet funkční freeze na 0.8.16 mimo kritické opravy;
2. 2026-09-21 provést reálný acceptance test bez umělého vyvolávání výpadků a sledovat Teacher/Presenter, student writes, AI grading, `live_control_revision` a případný primary → fallback → recovery;
3. bezprostředně po testu udělat post-session audit relevantních logů a dat;
4. poté cílené disposable chaos scénáře A–G;
5. následně automatizovat/standardizovat deployment Cloudflare Workeru, aby nevznikala verze aplikace nekompatibilní s Worker protokolem;
6. doplnit cílenou observability pro primary/fallback/recovery, capabilities a reconciliation;
7. oddělit `LIVE_RESUME_SECRET` od ostatních serverových secretů jako další least-privilege krok.

### Milník B.1 — Supabase provozní rozhodovací bod

V posledních dnech se projevily provider-level problémy Supabase Auth/API, které zasáhly live výuku navzdory tomu, že samotný projekt/databáze nebyly zdrojem incidentu. K 2026-09-18 Supabase stále hlásí degraded performance API Gateway a pokračující rollout opravy intermittent JWT 401 rejection.

Rozhodnutí:

- nyní žádná databázová migrace ani paralelní přepis;
- nejprve vyhodnotit ostré testy 2026-09-21 a aktuální stav Supabase;
- pokud bude Auth/API po testech stabilní, zůstat na současné architektuře a pokračovat v hardeningu;
- pokud budou problémy pokračovat, zahájit **read-only migrační audit Supabase → Neon**;
- první audit má projít tabulky, SQL funkce/RPC, triggery, RLS, Auth vazby, Realtime dependency, billing provisioning a migrační/cutover rizika bez změny produkce;
- cílový kandidát je Neon/Postgres; live realtime/control plane by v případné cílové architektuře zůstal oddělený přes Cloudflare Durable Objects;
- žádný cutover bez Preview/staging migrace, E2E a rollback plánu.

### Milník C — Accessibility / inclusive authoring

**Technický baseline implementován a nasazen.**

Hotovo:

- hlavní WCAG 2.2 AA-oriented UI remediace;
- EN 301 549 jako engineering reference;
- ATAG authoring guardrails + deterministic warnings + repair guidance;
- accessibility CI/source regression gate;
- `ACCESSIBILITY.md` release checklist.

Zbývá před formální conformance claim:

- reprezentativní manuální WCAG-EM evaluace;
- VoiceOver/NVDA testy;
- keyboard, 200/400 %, 320 px reflow, reduced motion a focus-obscured ověření.

### Milník D — Internationalization / multilingual

**0.9 dokončeno; připraveno k produkčnímu release.**

Hotovo:

- CS/EN UI locale routing a persistentní přepínač;
- CZ/SK → CS, ostatní země → EN jako první návštěvní preference;
- locale-aware metadata, hreflang, Open Graph, auth, Pricing, GDPR, workspace, live, Presenter a student UI;
- oddělení UI locale od billing regionu;
- lesson language metadata + auto podle zadání + explicitní override + vlastní jazyk;
- zachování jazyka při AI revizích;
- lesson-language `lang` / `dir=auto` v live/student/Presenter obsahu;
- anglická demo lesson;
- `ui_locale` + `lesson_language` analytické dimenze bez PII/content;
- `verify-i18n.mjs` regresní gate.

Zbývá do dalších verzí:

- případné další lokalizace samotného UI nad CS/EN;
- průběžné QA méně běžných písem a RTL jazyků;
- lokalizace externě spravovaných e-mailových šablon podle potřeby.

### Milník E — Growth / akviziční baseline

**Měření připraveno pro první akviziční experimenty.**

Stav k 2026-09-19:

- produkční GA4 property: `554871574`;
- GA4 Admin API setup je dokončený a v administraci ručně ověřený;
- aktivních je **20 event-scoped custom dimensions**;
- aktivní jsou **4 Key Events**: `signup_completed`, `lesson_generation_completed`, `live_session_started`, `subscription_activated`;
- `subscription_activated` je finální placená konverze a vzniká až po LIVE Checkout návratu a serverově potvrzeném Teacher / Teacher Pro plánu;
- akviziční zdroj se má vyhodnocovat přes standardní GA4 campaign attribution / UTM, ne přes PII nebo vlastní uživatelské identifikátory;
- v produkčním GA4 Web streamu bylo 2026-09-19 ručně vypnuto Enhanced Measurement → Page views → **Page changes based on browser history events**, aby 0.9.42 mohla bezpečně používat pouze sanitizované ruční pageviews;
- strict opt-in zůstává zachovaný: GA4 reprezentuje consenting populaci, nikoli absolutní počet všech uživatelů.

Bezprostřední growth krok:

1. první balíček ukázkových lekcí je **vytvořený** a pokrývá 1. stupeň, 2. stupeň, SŠ, matematiku, jazyky, humanitní i přírodovědné předměty a anglickou výuku;
2. distribuční vrstva používá hotové přenositelné share linky a cestu „prohlédnout → uložit vlastní kopii → registrace/přihlášení → upravit / spustit vlastní lekci“;
3. interní 0.9.42 měří `shared_lesson_import_started` a `shared_lesson_imported`; oba eventy jsou bez custom parametrů a neposílají share token, lesson ID ani obsah;
4. stejná revize přepíná GA4 pageviews na ruční sanitizované odesílání: UUID → `:id`, capability token → `:token`, join kód → `:code`; zachovává se jen bezpečný UTM allowlist. Před produkčním mergem musí být v GA4 Web streamu vypnuto Enhanced Measurement → Page views → **Page changes based on browser history events**;
5. pro vlastní tvorbu zůstává activation signálem `lesson_generation_completed`; pro ukázkové/share lekce je hlavním mezikrokem `shared_lesson_imported`; společný hlavní product-value moment je `live_session_started`;
6. připravit jednotnou UTM naming convention pro organické sdílení, ambasadory, sociální sítě a později placené kampaně;
7. vybrat první **3 ukázkové lekce** pro organický test, vytvořit jim aktivní share linky a publikovat je odděleně tak, aby šlo porovnat zdroj i konkrétní kreativní/tématický vstup;
8. placenou reklamu spouštět až po prvním organickém ověření, co přivádí importované a následně skutečně spuštěné lekce.

### Další produktové položky

- koš/verzování;
- templates/favorites/search;
- user export/delete;
- dokončení školního acceptance kola, owner/admin edge cases a school entitlement lifecycle;
- veřejný self-service billing Team / School / Campus až po dokončeném school acceptance a billing acceptance;
- OCR;
- produktová analytika GA4: measurement baseline je hotový; další práce je reporting nad reálnými daty, UTM atribuce a vyhodnocení activation / paid funnelu.

## 19. Beta feedback — uzavřené body

1. Každá aktivita studentovi explicitně říká, zda je individuální/týmová/společná.
2. Sady čísel a číselné datasety se zobrazují jako structured tabulka.
3. AI grading otevřených/týmových odpovědí se nespouští po neaktivitě ani autosave, ale až po explicitním submitu.
4. U parametrů přípravy lekce jsou příklady jen placeholdery; uživatel vyplňuje vlastní hodnoty.
5. Projektor před scoreboardem zobrazuje aktuální úlohu podle teacher-controlled průchodu lekcí a zároveň join QR/link/code.
6. Přesun již vytvořených lekcí do složek byl po prvním testu přepracován na move dialog + lesson menu + bulk + desktop drag-and-drop.
7. Číslované kroky/otázky se v lesson preview, student live a Presenter zobrazují vertikálně jako sémantický seznam.
8. AI generation už nesmí vytvořit display-only `reveal/intro/timer`, který současně požaduje odevzdávanou odpověď; submit požadavky musí používat interaktivní block type.
9. Teacher live rozlišuje koncept `Rozepsaná` od skutečně odevzdané aktuální verze a progress počítá jen aktuální submit snapshoty.
10. Potvrzené AI hodnocení mizí z aktivní review queue; aktuální blok má při řazení přednost.
11. AI grading má tři volitelné úrovně přísnosti pro oprávněné účty; UI je barevný třípolohový slider s plynulým tahem a snapem.
12. Po výpadku spojení se zastaralá submit error hláška po potvrzené synchronizaci sama vyčistí; při nepotvrzeném submitu UI jasně říká, že koncept zůstal uložený a stačí znovu odevzdat.
13. Hlavička **Moje lekce** zobrazuje vedle e-mailu vždy explicitní **Odhlásit / Sign out**; logout ukončí Supabase session, vyčistí live-resume recovery a provede hard navigation na lokalizovanou homepage.
14. Mobilní přihlášení na landing page je responzivní: auth popover se na úzkých displejích vykresluje jako vycentrovaný viewportově omezený panel, ne jako zúžený prvek uvnitř header flexu; respektuje dynamickou výšku Safari a delší obsah lze rolovat.
15. Po kliknutí na **Vytvořit lekci** se mobilní lesson workspace automaticky přesune na pravý/stage panel s průběžnými statusy generování; desktopové chování zůstává beze změny a scroll respektuje `prefers-reduced-motion`.
16. **Prezentační režim** se na telefonech v učitelském live rozhraní vůbec nenabízí; na tabletech a desktopu zůstává dostupný. Přímá Presenter URL zůstává funkční. Mobilní „První let“ automaticky přeskočí oba projekční kroky, nezobrazí návrat na ně a přepočítá kapitolu na 5 relevantních kroků.

## 20. Významné operace 2026-09-17 až 2026-09-20

Bezpečnostní a produktové změny:

- `753c848` — explicit individual submissions
- `8360205` — teacher-controlled regrading
- `c10f0c4` — SEC-003 CSV formula injection fix
- `ab69390` — SEC-004 participant caps + burst limit na DB boundary
- `14ed01e` — srovnání SEC-004 migration history
- `2fffbf2` — `ai_grading_enabled`, manual default, entitled AI grading
- `21975d8` — SEC-005 DB write-boundary hardening
- `534ecb6` — SEC-008 deterministic installs
- `f60fb28` — SEC-009 retention lifecycle
- `aac840f` — SEC-011 relational constraints
- `5182b71` — SEC-012 Office decompression hardening
- `7637dc4` — SEC-013 participant token expiry
- `1becf44` — SEC-014 browser security headers
- `584a72b` — SEC-015 fail-closed AI ZDR
- **0.9.08 / SEC-016** — cross-account lesson-state isolation + DB-authoritative ownership gate před AI revizemi
- **0.9.09** — konzistentní bezpečný logout na stránce Moje lekce pro všechny tarify; e-mail se zkracuje samostatně, takže tlačítko Odhlásit zůstává vždy viditelné
- **0.9.10** — jednoznačné číslování při AI revizi celé lekce: číselné odkazy učitele se mapují podle viditelného pořadí všech bloků, ne podle sémantického typu „úkolu“; přidán regresní check `verify-revision-references.mjs`
- **0.9.11** — čistší přihlášená veřejná hlavička: e-mail, AI kvóta a logout jsou přesunuté z hlavní lišty do kompaktního profilového dropdownu; hlavní CTA zůstává jediným výrazným prvkem a nový regresní check hlídá dostupnost kvóty, odhlášení i responzivního triggeru
- **0.9.12** — hotfix PDF podkladů: worker `pdf-parse` je self-hostovaný jako build-time asset z vlastní domény místo externího jsDelivr URL, takže funguje pod stávající CSP bez jejího oslabení; přidán `verify-pdf-worker.mjs`
- **0.9.13** — live Stripe acceptance foundation: live Teacher/Teacher Pro katalog + DB mappings, live Portal/webhook isolation, admin-only live Checkout/Portal gate a fail-closed ověření skutečné billing country z dokončeného Checkout Session před entitlement provisioningem
- **0.9.14** — sjednocení hlaviček napříč učitelskými obrazovkami: dashboard, lesson workspace, GDPR a Teacher Live používají stejnou hlavní navigaci a společný profilový dropdown; dashboard přesunul primární vytvoření lekce do header CTA a Teacher Live oddělil stav spojení od navigace
- **0.9.15** — live Checkout verification hotfix: webhook lookup nepoužívá subscription filtr na Stripe list endpointu, ale stabilní Customer filtr + lokální párování subscription; krátký retry pokrývá nedeterministické pořadí Stripe eventů
- **0.9.16** — growth funnel analytics: `checkout_complete` zůstává pouze signál návratu ze Stripe; nový Key Event `subscription_activated` se v LIVE prostředí odešle až po serverově potvrzeném Teacher/Teacher Pro v `profiles.active_plan_code`. Pricing krátce refreshuje stav, pokud webhook při návratu ještě dobíhá; Checkout Session ID se do GA4 neposílá a používá se jen lokálně pro deduplikaci. GA4 setup doplňuje dimenze `ui_locale`, `lesson_language`, `plan`, `billing_country` a `source`.
- **0.9.17 / SEC-017** — serverový guard na `PUT /api/lessons/[id]`: Free účet nesmí přes replacement payload změnit `lesson.language`; guard používá autoritativní DB lekci + serverový profil a je krytý regresním testem `verify-lesson-replacement-entitlement.mjs`
- **0.9.18** / `43a64db` — veřejný LIVE launch individuálního billingu: Teacher a Teacher Pro mají aktivní CZK/EUR/USD monthly/annual Stripe Checkout, placení uživatelé mají Customer Portal a GA4 funnel používá produkční `pricing_live` / `stripe_live`; školní tarify zůstávají vypnuté a serverový emergency kill-switch zůstává zachovaný; Preview, `npm run check`, security headers, accessibility i production deployment prošly zeleně
- **0.9.19** / `f180758` — lokalizované subscription lifecycle e-maily Syllonautu přes Resend: aktivace tarifu, naplánované zrušení, odvolání zrušení a definitivní ukončení. Jazyk se drží jako uživatelská preference CZ/EN s billing-country fallbackem; delivery ledger + Resend idempotency chrání před duplicitami při Stripe retry. Transakční e-maily jsou nezávislé na marketingovém souhlasu; payment receipt/refund/failed payment zůstávají Stripe-owned. Produkční acceptance 2026-09-19: replay skutečného LIVE `customer.subscription.deleted` prošel přes produkční webhook, auditní delivery přešla do `sent`, Resend vykázal `delivered` a uživatel ručně potvrdil doručení správně lokalizovaného českého e-mailu. Během acceptance se odhalil chybějící produkční `RESEND_API_KEY`; po doplnění ve Vercelu a redeployi byl test úspěšně zopakován.
- **0.9.20** — větší produktová úprava pro bezpečné sdílení lekcí: autor vytváří odvolatelný odkaz na neměnný read-only snímek, příjemce se přihlásí a importuje vlastní idempotentní kopii bez přístupu k výsledkům, session kódům nebo historii AI úprav. Share link je záměrně přenositelný a vhodný i pro veřejné ukázkové lekce / akviziční distribuci. **Produkční acceptance 2026-09-19: COMPLETE / PASS** — ověřen anonymní read-only náhled, login účtu B, import vlastní kopie, idempotentní opakovaný import bez duplikátu, nezávislá editace kopie bez změny originálu, revokace share a následná 404; již importovaná kopie po revokaci zůstala zachovaná. Databázový unikátní index vynucuje nejvýše jednu aktivní živou hodinu na učitelský účet; školní ceník výslovně uvádí samostatný účet každého učitele.
- **post‑0.9.20 interní didaktický fix** — revize bloku při výrazné změně délky musí odpovídajícím způsobem rozšířit nebo zjednodušit skutečnou studentskou činnost; duration-only výsledek se automaticky jednou opraví a při opakovaném selhání se neuloží. Veřejně zobrazovaná verze zůstává 0.9.20.
- **post‑0.9.20 interní UX fix** — vlastní lokalizovaná 404 stránka v typografii a vizuálním jazyce Syllonautu: orbitální motiv, česká/anglická kosmická hláška, návrat na lokalizovaný landing a přímá cesta do Moje lekce. Regresní kontrakt: `scripts/verify-custom-404.mjs`. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.21 interní** — samoobslužná správa individuálního předplatného: profilové menu vede přímo na vlastní stránku Syllonautu s aktuálním tarifem, obdobím, měnou, obnovením/ukončením a případnou naplánovanou změnou. Teacher → Teacher Pro při stejném období používá okamžitou Stripe proration s `always_invoice + pending_if_incomplete`, takže entitlement se změní až po úspěšné platbě; downgrade a každá změna monthly ↔ annual používá Subscription Schedule od dalšího období. Změna měny/fakturační země zůstává fail-closed mimo samoobsluhu. Payment method, faktury a cancellation zůstávají ve Stripe Customer Portalu. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.22 interní** — pracovní listy z uložené lekce jako prémiový benefit: Teacher Pro má serverový entitlement `worksheet_export_enabled`; Free a Teacher jsou uzamčené, školní ceník benefit zvýrazňuje u budoucích School a Campus, nikoli Team. Učitel volí studentskou verzi nebo klíč, tisknutelné aktivity a množství prostoru pro odpověď; výstup používá balanced typografii a brand prvky Syllonautu, A4 print CSS a browserový tisk / Save as PDF bez dalšího AI callu a bez nové permanentní kopie dokumentu. Worksheet route znovu ověřuje vlastníka lekce i entitlement na serveru. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.23 interní hotfix** — produkční správa předplatného už pro pouhé zobrazení nepotřebuje Stripe `Prices Read`; individuální ceny jsou centralizované a sdílené s veřejným Ceníkem. Server považuje za aktivní pouze canonical Stripe stavy `trialing/active/past_due`, takže historicky zrušený acceptance subscription nemůže kvůli zastaralému DB řádku rozbít stránku ani blokovat nový Checkout. LIVE subscription webhook před zápisem do Supabase načte aktuální subscription ze Stripe a synchronizuje canonical stav, čímž chrání DB před přehráním staršího subscription snapshotu. LIVE restricted key byl v produkci doplněn o potřebná oprávnění pro subscription/invoice cestu; `Subscriptions → Write` zahrnuje i read přístup. Produkční reload Správy předplatného po změně oprávnění prošel PASS. První skutečná změna tarifu zůstává samostatným acceptance testem write/schedule cesty.
- **0.9.24 interní hotfix** — tisk/PDF pracovních listů: odstraněn křehký print selector `body > :not(#main-content)`, který mohl v Safari skrýt celý worksheet a vytvořit prázdné PDF. Print režim nyní explicitně zachovává `#main-content`, skrývá pouze okolní aplikační chrome a převádí seznam aktivit z CSS Gridu na běžný tiskový flow. Každá aktivita má současně moderní i legacy zákaz page-breaku (`break-inside: avoid-page` + `page-break-inside: avoid`), takže pokud se aktivita sama vejde na A4, přesune se celá na další stránku místo rozdělení mezi dvě strany. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.25 interní hotfix** — účet s rolí `admin` má ve Správě předplatného vlastní stav „Administrátorský účet / plný přístup“ a nikdy se neprezentuje jako Free jen proto, že nemá aktivní Stripe subscription. Admin stav se vyhodnocuje serverově před jakýmkoli Stripe lookupem, takže není závislý na billing API ani na historickém acceptance subscription. Produkční acceptance 2026-09-19: stránka se po nasazení načetla a uživatel ručně potvrdil správné zobrazení administrátorského stavu. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.26 interní hotfix** — následný reálný Safari/PDF test ukázal, že prázdný výstup přetrval i po explicitním zachování `#main-content`. Worksheet print CSS proto už vůbec neskrývá ani nepřepíná žádný body-level wrapper. Na dedicated worksheet route se cookie banner/overlay vůbec nerenderuje a tisk skrývá jen worksheet toolbar a skip link; vlastní dokument zůstává v normálním DOM flow. Regresní kontrakt nyní zakazuje jakoukoli body-level manipulaci s `#main-content` v worksheet print CSS. Ochrana aktivit proti page-breaku z 0.9.24 zůstává. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.27 interní** — po třetím reálném Safari exportu, který byl stále prázdný, se PDF cesta oddělila od browserového print enginu. Nový serverově chráněný endpoint `/api/lessons/<id>/worksheet-pdf` generuje skutečné `application/pdf` přímo z uloženého Lesson JSON pomocí pdfmake s vloženým Roboto fontem. Endpoint znovu kontroluje vlastníka lekce a `worksheet_export_enabled`; studentská/učitelská varianta, výběr bloků a velikost prostoru pro odpověď zůstávají zachované. Každá aktivita je v PDF vložená jako non-breaking table row (`dontBreakRows`), takže aktivita, která se sama vejde na A4, nezačne na konci jedné stránky a nepokračuje na další. Browserový `window.print()` se pro PDF už nepoužívá. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.28 interní** — pokud učitel do pracovního listu vybere jen některé aktivity, A4 náhled i skutečný serverový PDF výstup je přečíslují souvisle 1, 2, 3… bez mezer podle původního pořadí v lekci. Zdrojová lekce ani pořadí jejích bloků se nemění. Regresní kontrola hlídá stejné chování v HTML náhledu i PDF generátoru. **Produkční acceptance COMPLETE / PASS (2026-09-19):** uživatel ručně ověřil funkční serverový PDF export i souvislé přečíslování vybraných aktivit; tím je úkol pracovních listů uzavřený. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.30 veřejný release — kontextový průvodce „První let“** — při prvním rozpracování nové lekce v daném prohlížeči se přihlášenému učiteli nabídne interaktivní průchod nejkratší cestou: zadání a generování lekce → AI úprava celé lekce → výběr a úprava jedné aktivity → vytvoření live session → připojení studentů a případné týmy → otevření prezentačního režimu a přesun nového okna na projektor / druhý displej → řízení hodiny → ukončení → report. Spotlight nechává zvýrazněný reálný prvek kliknutelný a zbytek stránky blokuje overlayem; asynchronní kroky se posunou až po skutečně úspěšné operaci. Průvodce je CZ/EN, responzivní, týmový krok je podmíněný a lze jej ručně znovu spustit z uživatelského menu podle aktuálního kontextu. Stav je v této první iteraci uložen per-user v localStorage, aby funkce nezasahovala do produkční DB/Auth/live trust boundary před pondělními testy. Regresní skript hlídá všechny stabilní `data-tour` kotevní body a potvrzené přechody. PR Preview prošel Vercel buildem, Security headers a Accessibility kontrolou. Veřejně zobrazovaná verze je 0.9.30.
- **0.9.31 interní UX — navigace a kontextová nápověda průvodce** — karta průvodce má tlačítko „Zpět“, které se vrací pouze na předchozí dostupný krok v aktuální kapitole a nikdy nevrací stav aplikace ani route. Splněné kroky se nově ukládají do stejného per-user localStorage state, takže po návratu lze pokračovat tlačítkem „Další“ bez opakování již dokončené generace, revize, vytvoření session, týmů nebo live akce. Kontextové „?“ je po ruce u tvorby lekce, AI úpravy celé lekce, úpravy jedné aktivity, spuštění hodiny, lobby/týmů, prezentačního režimu, live řízení a vyhodnocení; globální položka v účtu zůstává. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.32 interní UX hotfix — první krok tvorby lekce** — spotlight prvního kroku už necílí pouze na textarea volného zadání, ale na celý formulář nové lekce. Díky tomu zůstávají během průvodce dostupné všechny povinné parametry (jazyk, cílovka, délka, velikost týmu, tón) i volitelné podklady; druhý krok dál samostatně vede na „Vytvořit lekci“. Regresní kontrakt hlídá, že první krok používá `lesson-create-form`. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.33 interní UX — kontrola lekce před úpravami** — po generování už průvodce neposílá učitele rovnou do AI revize. Nový mezikrok zvýrazní celý náhled lekce a vyžádá si ruční potvrzení „Lekci jsem prošel“. Následující krok „Upravit celou lekci“ je volitelný: úspěšná AI revize stále automaticky pokračuje, ale učitel může zvolit „Bez úpravy pokračovat“, pokud je s výsledkem spokojený. Hardcoded kontextové vstupy byly posunuty na nové indexy kroků. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.34 interní hotfix — deterministický stav průvodce po generování** — state schema průvodce je povýšené na v2 se zachováním migrace z `syllonaut_guide_v1`. Rozběhnutý starý lesson flow na detailu lekce se při migraci vrátí na krok kontroly náhledu a staré `satisfiedSteps` se záměrně nepřenášejí, protože jejich číselné indexy jsou po vložení nového kroku nejednoznačné. Událost `lesson-created` nyní explicitně nastavuje review krok místo relativního `advance()`. Tím se odstraní přeskočení rovnou na „Upravit celou lekci“ i u uživatele s rozpracovaným starším onboarding stavem. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.35 interní UX — volitelná úprava jedné aktivity** — krok 6/7 „Úprava jedné aktivity“ má nyní stejné chování jako volitelná celková úprava lekce. Úspěšná AI revize aktivity posune průvodce automaticky, ale pokud učitel aktivitu měnit nechce, může stisknout „Pokračovat bez úpravy“. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.36 interní hotfix — náhodný pád při startu live hodiny** — `generateJoinCode()` už nepoužívá `byte & 31` nad 31znakovou abecedou. Původní implementace měla přibližně 19,9% pravděpodobnost, že alespoň jeden ze sedmi znaků dostane index 31 a do kódu se zřetězí `undefined`; databázový constraint `sessions_join_code_format` pak insert session odmítl a `/api/sessions` skončilo obecným 500. Nově se každý znak vybírá přes `crypto.randomInt(JOIN_ALPHABET.length)`. Regresní live-resilience kontrola tento kontrakt hlídá. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.37 interní UX — Prezentační režim jako začátek kapitoly 2** — lobby část průvodce nyní vede učitele v pořadí: otevřít Prezentační režim → přesunout studentské okno na projektor / druhý displej → vysvětlení již aktivního kódu/QR a průběžného připojování studentů → případně vytvořit týmy → odstartovat hodinu. Kontextová `?` byla přesměrována na nové indexy a restart v probíhající hodině nyní míří přímo na live controls. Kvůli přeuspořádání číselných live kroků je localStorage state povýšen na v3 a migruje v2 stav bez záměny významu kroků; rozběhnutá lobby v první části kapitoly se bezpečně vrátí na nový první krok s Presenterem. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.38 interní UI hotfix — Presenter join karta na projektoru** — startovní karta v Prezentačním režimu používá pro QR a detaily bezpečné `minmax` sloupce, QR se řídí šířkou vlastního kontejneru a kód hodiny má omezenější `clamp()` velikost, menší adaptivní letter-spacing a `white-space: nowrap`. Pod 1200 px se QR a text skládají pod sebe; pod 900 px se stejně jako dřív skládá i celý lobby layout. Regresní live-resilience kontrola hlídá shrinkovatelný detailní sloupec, nezalamování kódu a 1200px breakpoint. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.39 interní UI hotfix — nezalamovaná adresa v Presenter join kartě** — `www.syllonaut.com/join` má nově vlastní menší responzivní typografii (`clamp(18px, 1.45vw, 26px)`), lehce záporný tracking a `white-space: nowrap`; odstraněno `overflow-wrap: anywhere`, které na projektoru lámalo poslední znak `join` na nový řádek. Regresní live-resilience kontrola hlídá nezalamování adresy i zákaz původního wrap pravidla. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.40 interní UX — handoff průvodce do Presenter okna** — klik na „Prezentační režim“ dál bezpečně otevírá nové okno s `rel="noreferrer"`, ale krok 2/7 „Toto je studentská obrazovka“ se nyní vykreslí přímo v Presenter okně. Učitel dostane instrukci přesunout okno na projektor / druhý displej a dál řídit hodinu v původním okně. „Hotovo – pokračovat“ označí handoff jako splněný a přesune sdílený guide state na krok 3/7; učitelské okno změnu převezme přes BroadcastChannel nebo `storage` event fallback. Presenter získává user scope serverově z Auth/resume ticketu, nikoli přes URL. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.41 interní UX hotfix — celý panel pro vytvoření týmů** — `data-tour="live-team-create"` je nyní na obalu celého formuláře pro vytvoření týmů, nikoli pouze na tlačítku. Spotlight proto nechává použitelné číselné pole „Počet týmů“ i akční tlačítko; po vytvoření týmů tento obal zmizí a volitelný guide krok se již necílí na neaktuální UI. Regresní onboarding kontrola hlídá, že kotva není znovu zúžena jen na tlačítko. Veřejně zobrazovaná verze zůstává 0.9.30. **Produkční acceptance COMPLETE / PASS (2026-09-19):** uživatel ručně prošel celý „První let“ po finální opravě týmového panelu a potvrdil, že zbývající kroky fungují. Tím je implementace a UX ladění průvodce uzavřené; další zásahy jen při nově nalezené regresi nebo nové funkční změně.
- **0.9.42 interní growth/privacy analytics — shared lesson acquisition + sanitizované pageviews** — veřejná/share ukázka nově měří explicitní záměr uložit kopii přes `shared_lesson_import_started` a úspěšný import vlastní kopie přes `shared_lesson_imported`. Eventy nemají custom parametry; share token, lesson ID ani obsah lekce se do GA4 neposílají. GA4 `send_page_view` je vypnutý a Syllonaut posílá ruční pageviews se sanitizovanou route: UUID → `:id`, dlouhý capability token → `:token`, join kód → `:code`; do query se propouští jen validní `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_id`. Custom eventy dostávají stejný sanitizovaný `page_location`. Produkční Web stream musí mít vypnuté history-based pageviews v Enhanced Measurement, jinak by vznikaly duplicitní/nesanitizované SPA pageviews. Úspěšný import se best-effort deduplikuje přes `sessionStorage`; analytika zůstává consent-gated a nesmí ovlivnit import. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.43 interní mobilní UX hotfix — responzivní přihlášení na landing page** — mobilní auth wrapper už nepřebírá globální `width: 100%`/statické chování, které zúžilo přihlašovací kartu mezi ostatní prvky hlavičky. Popover se pod mobilním breakpointem vykresluje jako vycentrovaný `fixed` panel s bezpečnými bočními okraji, limitem výšky přes `100dvh` + safe-area insety, vlastním vertikálním scrollem a vyšší vrstvou než prvky landing page. Desktop zůstává beze změny. PR #202, produkční deployment PASS; uživatel 2026-09-20 ručně potvrdil, že oprava funguje. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.44 interní mobilní UX hotfix — automatický přesun na průběh generování** — po validním spuštění generování nové lekce se na displejích do 900 px aktivní formulářový prvek odfokusuje a viewport se přesune na `stage` panel, kde se okamžitě zobrazují `GenerationProgress` statusy. Scroll se spouští pouze při startu nové generace, respektuje `prefers-reduced-motion` a desktopové dvousloupcové chování nemění. PR #209, produkční Vercel deployment PASS. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.67 interní — zvýraznění AI integrity ochrany v Ceníku** — Teacher Pro, School a Campus nově zobrazují hned pod AI hodnocením samostatně zvýrazněnou ochranu proti nepovolenému využití AI ve studentských odpovědích; CZ/EN. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.66 interní — teacher-confirmed AI integrity zero** — vysoké podezření zůstává pouze review signálem; učitel může explicitně a po potvrzení nastavit 0 bodů za nepovolené využití AI. Automatická kontrolní otázka studentovi se nevytváří. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.65 interní — AI integrity alert při AI gradingu** — nezávislé podezření na generativní AI bez automatického dopadu na body; pouze vysoké podezření s více konkrétními signály posílá odpověď ke kontrole učitele. Ceník benefit uvádí u Teacher Pro, School a Campus. Veřejně zobrazovaná verze zůstává 0.9.30.
- **0.9.45 interní mobilní UX — Presenter pouze pro tablet/desktop** — standardní vstup do Prezentačního režimu a jeho kontextové `?` se skrývají pouze na phone-class layoutu (`hover: none` + úzký portrait nebo nízký landscape viewport), takže iPad/tablet Presenter dál nabízí. Přímá `/sessions/<id>/presenter` route se nezakazuje. „První let“ na telefonu automaticky přeskočí live kroky 1–2 věnované projektoru, tlačítko Zpět se na ně nevrací a progress kapitoly se počítá jako 5 kroků místo 7. Desktop/tablet onboarding zůstává beze změny. Regresní kontrola `verify-onboarding-guide.mjs` hlídá phone visibility i skip logiku. Veřejně zobrazovaná verze zůstává 0.9.30.
- `24e8b1c` — premium lesson folders
- `e0a02bd` — veřejný Pricing / Ceník
- `d2f8b98` — intuitivnější folder move UX: dialog, lesson menu, bulk, drag-and-drop, create-folder-from-move
- `305d628` — School a Campus dostaly AI grading + folders/podsložky
- `0ececf0` / `49e59bd` — Pricing header CTA bez nežádoucího zalamování
- `365d6e5` — sdílená responsive hamburger navigation
- `f6ff9f3` — WCAG/ATAG accessibility remediation + accessibility CI/release baseline

Další významné změny 2026-09-18:

- `278200f2` — privacy-safe GA4 product analytics + funnel/event taxonomy;
- `329c5526` — oprava GA4 `gtag` command queue semantics;
- `d287aec7` — idempotentní GA4 Admin batch setup pro property `554871574`;
- **0.9** / release commit v `main` — CZ/EN UI, regionální locale routing, persistentní override a multilingual lesson engine s odděleným lesson language;

- `4104941` — cookie consent, GDPR page, marketing opt-in a privacy regression checks;
- `93932cf` — doplnění identity správce GDPR;
- `51ff11d` — aktivní privacy kontakt `vaclav@syllonaut.com`;
- `6d72267` — zpřesnění live resilience reconciliation;
- `c773b38` — hotfix student live navigation: fail-open při service worker/cache a Cloudflare WebSocket problému;
- `f703d1b` — číslované instrukce/revealy + generation guard proti display-only blokům vyžadujícím submit;
- `0e4e0f0` — lesson-level `gradingStrictness` a entitlement-gated Mírná/Neutrální/Přísná;
- `42d7531` — submitted typy ve live fallbacku + prioritizace review queue podle aktivního bloku;
- `8ee9e6e` — completion sjednocený podle aktuálního `answer === submitted_answer`;
- `f9b3c32` — reconnect UX: odstranění zastaralých submit error stavů po synchronizaci;
- `76d47d1` — přístupný barevný třístupňový ovladač přísnosti AI hodnocení;
- `57539ce` — plynulé drag ovládání slideru se snapem na tři platné hodnoty;
- **0.7.01** — číslo verze aplikace je viditelné pouze v učitelském dashboardu pod badge BETA; UI používá centrální `APP_VERSION`, aby další verze měly jeden zdroj pravdy v kódu;
- **0.7.02** / `20260918093706` — P2 reconciliation fix: Cloudflare snapshot může bezpečně konvergovat historické odpovědi do Supabase přes úzce scopeovaný transaction advisory marker, aniž by se oslabily běžné SEC-005 live-write kontroly;
- **0.8** / `20260918114341` — live resilience redesign po reálné beta hodině: automatický Teacher/Presenter failover, live resume ticket, paralelní primární + Cloudflare command cesta, srozumitelné timeout UX a server-driven AI grading s jednorázovými capability tokeny a DB retry; produkční Vercel/Supabase část byla ověřena a Cloudflare Worker byl následně nasazen s Version ID `e4940eb9-7862-4717-b9b9-2160ff510d21`;
- **0.8.01** / `b90a2ec` — věková a vývojová přiměřenost je závazná součást AI authoringu při generování i revizích; `npm run check` obsahuje regresní kontrolu pravidel, dashboard zobrazuje `v0.8.01` a chování bylo po nasazení prakticky potvrzeno v produkci.
- **0.8.02** — veřejný Ceník doplňuje EUR vedle CZK a USD u všech individuálních i školních plánů; Stripe sandbox katalog obsahuje odpovídající CZK/EUR/USD price objekty, placené CTA však zůstávají deaktivované do dokončení subscription provisioningu.
- **0.8.03** — Ceník už nezobrazuje tři měny současně: server podle země návštěvníka zobrazuje pouze CZK (ČR), EUR (eurozóna) nebo USD (ostatní). Stejná regionální utilita je připravená pro budoucí checkout routing; fakturační země bude při nákupu vždy znovu ověřena.
- **0.8.04** / migrace `20260918162429`, `20260918162500`, `20260918162640` — billing foundation: plan/price/customer/subscription/event model, service-role-only idempotentní Stripe sync, sandbox/live isolation, manual entitlement overrides a FK indexy. Placené CTA zůstávají vypnuté.
- **0.8.05** — Stripe subscription webhook: raw-body HMAC signature verification, replay tolerance + DB event idempotence, test/live secret binding, server-only Supabase admin client, strict user/country/price/routing validation a auth proxy bypass pro webhook route.
- **0.8.06** — admin-only sandbox Checkout pro Teacher/Teacher Pro: autentizovaný endpoint, serverový DB Price lookup, ISO billing-country selector, regionální CZK/EUR/USD routing, explicitní `managed_payments`, Stripe subscription metadata pro webhook a CI regression checks. Veřejné placené CTA zůstávají `Připravujeme`.
- **0.8.07** — Checkout Customer reuse: pokud `billing_customers` už obsahuje Stripe Customer pro uživatele a prostředí, Checkout používá `customer` místo `customer_email`; první nákup stále Customer vytvoří. Oprava reaguje na reálně zachycený sandbox případ, kdy druhý Checkout vytvořil duplicitního Customer a DB správně odmítla subscription.
- **0.8.08** — admin sandbox Checkout diagnostika: Stripe API chyby se sanitizují na `type/code/message` a zobrazí pouze přihlášenému adminovi v testovacím dialogu; žádné API klíče ani secret hodnoty se nevrací.
- **0.8.09** — admin-only Stripe Customer Portal: server-authenticated Portal Session, Customer ID pouze z `billing_customers`, sanitizované chyby, krátkodobý Stripe-hosted redirect a CTA v Ceníku. Portal se používá pro platební metody, faktury a cancellation; změnu tarifu v Portalu záměrně nezapínáme kvůli řízenému country/currency routingu.
- **0.8.10** — payment recovery event log: webhook přijímá `invoice.payment_failed` a `invoice.paid`, validuje Stripe-signed Syllonaut metadata a idempotentně je ukládá do `billing_events`. Payment event neprovisionuje ani nedeprovisionuje přístup; entitlement zůstává subscription-authoritative.
- **0.8.11** — simulation isolation: subscription eventy ze Stripe `test_clock` se explicitně ignorují, takže Simulations mohou generovat renewal/failure webhooky bez rizika `billing_customer_mismatch` nebo přepsání skutečné sandbox subscription. E2E simulace 2026-09-19 potvrdila `invoice.payment_failed → past_due → retry → invoice.paid → active` bez zápisu simulované subscription do `billing_subscriptions`.
- **0.8.12** — live resume auth-boundary hardening: Teacher, Presenter i live-control capability mohou použít session-scoped recovery ticket pouze tehdy, když primární auth lookup skutečně selže; čisté odhlášení vždy skončí standardním přihlášením. End-session dál maže konkrétní resume ticket.
- **0.8.13** — live navigation cache hardening: service worker odmítne cachovat redirectovanou odpověď nebo odpověď pro jinou cestu, takže auth incident nemůže pod URL živé hodiny uložit homepage či jiný nesouvisející 200 response.
- **0.8.14** — Cloudflare control-plane hardening, fáze 1: Worker přijímá samostatnou `presenter` capability pouze pro read-only state/WebSocket, explicitně zakazuje Presenter zápis do `/events` a jeho `/health` nyní jednoznačně hlásí `workerVersion=0.8.14` + `protocolVersion=2`. Presenter UI se na novou roli přepne až po potvrzeném produkčním Worker deploymentu, aby nevzniklo nekompatibilní mezidobí.
- **0.8.15** — live cache epoch rotation: service worker používá `syllonaut-live-shell-v2`; při aktivaci smaže starší `syllonaut-live-shell-*` cache včetně před-hardeningové `v1`, takže dříve uložený chybný live navigation response nemůže přežít opravu 0.8.13.
- **0.8.16** — Presenter least-privilege fáze 2: browser požaduje `?role=presenter`, ukládá capability odděleně pod presenter storage key a pro fallback state/WebSocket už nepoužívá teacher token; aktivováno až po potvrzeném produkčním Worker 0.8.14 / protocol 2.
- **0.9** — Internationalization + multilingual lessons: CS/EN rozhraní, locale routing podle explicitní preference/regionu, oddělený lesson language s auto detekcí podle zadání a explicitním override, zachování jazyka při revizích, locale-aware live/student/Presenter/auth/Pricing/GDPR/SEO a anonymní analytické dimenze `ui_locale` + `lesson_language`.
- **0.9.01** — multilingual generation jako placený entitlement: Free generuje pouze v aktivním UI locale; Teacher/Teacher Pro a produktově všechny školní plány mají „Lekce v libovolném jazyce“. Serverové vynucení brání obcházení přes prompt/API; Pricing benefit zvýrazňuje u obou placených individuálních tarifů.
- **0.9.02** — uzavření revizního bypassu: Free už nemůže změnit hlavní jazyk přes AI úpravu celé lekce ani jednotlivého bloku; entitlement se kontroluje serverově a jazykový lock je autoritativní systémová instrukce modelu. Cizojazyčné učivo zůstává povolené.
- **0.9.03** — UX doplnění k Free jazykovému omezení: po vytvoření/otevření uložené lekce se zobrazuje výrazné vysvětlení, že nové lekce používají jazyk rozhraní a AI úpravy nemohou změnit hlavní jazyk; součástí je CTA na Ceník.
- **0.9.04** — kontextová zpětná vazba po AI revizi ve Free: po úspěšné úpravě celé lekce nebo jedné aktivity UI vysvětlí, že hlavní jazyk zůstává uzamčený a případný požadavek na překlad/změnu hlavního jazyka se neprovedl; obsahové úpravy probíhají dál.
- **0.9.05** — UX zrychlení editace aktivit: tlačítko „Upravit blok“ přesune uživatele přímo k editoru vybrané aktivity a zaměří textové pole pro pokyn; route/timeline výběr zůstává bez automatického skoku.
- **0.9.06** — oprava sticky-scroll problému z 0.9.05: levý authoring sloupec má na desktopu vlastní viewportový scroll a „Upravit blok“ posouvá přímo tento kontejner; mobil používá stránkový fallback.
- **0.9.07** — zvýraznění výsledku AI revize: nové nebo upravené aktivity jsou do další úspěšné AI změny označené fialovým nádechem i textovým štítkem; změny se detekují porovnáním block JSON podle ID a stav přetrvá reload ve stejném tabu.
- **0.9.08 / SEC-016** — account isolation hotfix: při logoutu nebo přepnutí identity se klientský lesson workspace synchronně vyčistí a provede hard navigation; recovery snapshot serverové lekce lze uložit jen pod původního ownera; pozdní async odpovědi pro jiný účet se zahodí; uložené lesson/block revize před AI ověřují ownership a používají DB-authoritativní lesson.
- viditelné číslo verze v učitelském dashboardu představuje pouze poslední větší veřejný release; menší interní revize se do dashboardu nepromítají. Současný veřejný baseline při zavedení pravidla je `0.9.19`.

**Výchozí funkční baseline verze 0.7 je `57539ce`. Verze 0.8 je první větší funkční posun zaměřený na live resilience; verze 0.9 je druhý větší funkční posun zaměřený na internacionalizaci rozhraní a multilingual lesson engine. Verze 0.9.01 zavádí tarifní entitlement pro generování v libovolném jazyce; 0.9.02 stejný entitlement vynucuje i při AI revizích; 0.9.03 zpřehledňuje toto omezení Free uživatelům přímo v lesson workspace; 0.9.04 přidává kontextovou zpětnou vazbu po revizích; 0.9.05 zrychluje přechod z náhledu bloku přímo do jeho editoru; 0.9.06 opravuje sticky-scroll limit tohoto přechodu na desktopu; 0.9.07 zpřehledňuje výsledek AI revizí zvýrazněním změněných a nových aktivit; 0.9.08 je bezpečnostní hotfix SEC-016 pro striktní izolaci lesson state mezi účty a server-authoritative revize.**

## 21. Pravidla další práce

- nejdřív načíst aktuální `PROJECT.md`, `main` a relevantní soubory;
- vždy zkontrolovat, zda se `main` neposunul kvůli paralelnímu chatu;
- **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**;
- security findings řešit jednotlivě, ne hromadným refaktorem;
- malé logické celky;
- commitovat funkční celky, ne jednotlivé soubory;
- před finálním commitem/merge znovu načíst HEAD `main`;
- zachovat paralelní změny;
- žádný force update `main`;
- `main` je chráněný; standardně pracovní branch → Preview/CI → PR → merge;
- Preview před Production, pokud je dostupné;
- DB migrace pokud možno backward-compatible;
- DDL přes Supabase migration workflow, ne ad-hoc trvalé SQL;
- security/permissions/quota/paid entitlement serverově;
- secrets nikdy do repo/klienta;
- při Supabase zásahu nejdřív ověřit live DB stav;
- po DDL znovu spustit relevantní Supabase advisories;
- nedělat destruktivní/load/stress testy na produkci;
- nevytvářet umělé placené AI cally jen kvůli testu, pokud lze bezpečnost ověřit strukturálně;
- accessibility změny musí chránit jak samotné authoring UI, tak výsledný obsah lekcí;
- automatický accessibility test není náhrada manuálního testu;
- každá schválená produkční **funkční** změna musí automaticky dostat novou **interní** verzi podle pravidel v sekci „Versionování produktu“ a současně aktualizovat příslušný stav/changelog v `PROJECT.md`;
- menší funkční změna inkrementuje interní třetí část o 1, ale **nemění verzi zobrazenou uživateli na dashboardu**;
- větší produktový/funkční release dostane nejbližší vyšší volnou desítkovou hranici v řadě `0.9.x` a zároveň aktualizuje veřejně zobrazovanou verzi;
- řada `0.9.x` zůstává až do ostrého startu; `1.0.0` je vyhrazeno pro produkt považovaný za připravený k ostrému provozu, přičemž při neshodě má konečné rozhodnutí vlastník projektu;
- čistě interní/docs/test/CI změna bez změny chování verzi neposouvá;
- při každé delší nebo vícekrokové práci (typicky >10 s nebo více nástrojových kroků) poslat hned na začátku stručný **heartbeat/plán** s tím, co se právě bude dělat;
- během delší práce posílat **průběžné heartbeaty po významných dokončených krocích**; nesmí se čekat až na finální odpověď a heartbeaty mají popisovat skutečný stav/progres, ne obecné fráze;
- před nástrojovým voláním, které může běžet déle nebo blokovat odpověď, předem napsat, **jaká konkrétní operace se právě spouští**, aby případná systémová hláška o delší odpovědi nebyla bez kontextu;
- pokud jedno konkrétní volání nástroje blokuje průběžné zprávy, po jeho návratu bez prodlení oznámit výsledek a pokračovat v heartbeat režimu; mezi samostatnými voláními nástrojů heartbeat nevynechávat;
- heartbeat neposílat jako nízkoúrovňový log každého kliknutí: cílem je průběžná orientace uživatele v **reálných významných krocích, nálezech, problémech a dokončených částech**;
- `PROJECT.md` jinak měnit pouze na výslovný pokyn uživatele.

## 22. Bezprostřední další krok

Security audit SEC-001 až SEC-016 je dispositioned. Accessibility technický baseline je implementovaný a nasazený. GDPR/cookies/privacy baseline je dokončený. GA4 je produkčně aktivní při opt-in a akviziční measurement baseline je dokončený: property `554871574` má ručně ověřených **20 custom dimensions a 4 Key Events**, včetně serverově potvrzené placené konverze `subscription_activated`. **Stripe sandbox lifecycle i LIVE acceptance individuálních plánů jsou dokončené a E2E ověřené. Teacher a Teacher Pro jsou veřejně prodejné; transakční subscription lifecycle e-maily 0.9.19 zůstávají oddělené od marketingu a finanční e-maily zůstávají Stripe-owned. Navíc je produkčně COMPLETE / PASS behaviorální CZ/EN onboarding/activation/conversion lifecycle přes Resend a CZ/EN landing inquiry s anti-spamem. Školní tarify zůstávají mimo live billing.** **Sdílení lekcí 0.9.20 je produkčně COMPLETE / PASS:** read-only snapshot, vlastní idempotentní kopie příjemce, nezávislá editace, revokace → 404 a zachování již uložené kopie jsou E2E ověřené; přenositelný capability link je zamýšlený distribuční mechanismus i pro ukázkové lekce. **Pracovní listy 0.9.22–0.9.28 jsou produkčně COMPLETE / PASS:** entitlement Teacher Pro, studentská/učitelská varianta, výběr aktivit, A4 náhled, skutečný serverový PDF export s českou diakritikou, nedělení aktivit mezi stránky a souvislé přečíslování částečně vybraných úkolů byly implementované a ručně ověřené v ostrém provozu. Úkol je uzavřený.** **Kontextový průvodce „První let“ 0.9.30–0.9.41 je produkčně COMPLETE / PASS:** celý tříkapitolový tok byl 2026-09-19 ručně ověřen v ostré verzi včetně Presenter handoffu, projektorového layoutu, student join flow, týmového panelu a výsledkového kroku. Úkol je uzavřený; další změny jen při regresi nebo rozšíření produktu.** Live hardening baseline 0.8.16 / Worker 0.8.14 protocol 2 zůstává zachovaný.

Nejbližší priority v tomto pořadí:

1. do pondělní ostré výuky držet 0.9 funkčně stabilní, zejména zachovaný live baseline 0.8.16; nedělat zbytečné zásahy do live/auth/databázové vrstvy;
2. 2026-09-21 provést reálný acceptance test a bezprostřední post-session audit Teacher/Presenter/student writes/AI grading/fallback-recovery;
3. tentýž den znovu ověřit stav Supabase a rozhodnout: **zůstat**, nebo při pokračujících problémech zahájit read-only audit migrace na Neon;
4. po ostrém testu dokončit chaos scénáře A–G a následně Cloudflare deployment automation, observability a oddělený `LIVE_RESUME_SECRET`;
5. multilingual 0.9 acceptance je dokončený a produkčně PASS; v pondělním ostrém testu už jen krátce ověřit, že české/anglické UI a běžný lesson flow neutrpěly regresi, bez znovuotevírání locale architektury;
6. **live billing je veřejný a lifecycle e-maily mají produkční E2E acceptance COMPLETE / PASS**; správa předplatného po 0.9.23/0.9.25 načítá produkční stav správně a admin UX je ručně ověřený PASS. LIVE restricted key permissions byly doplněny a read cesta je produkčně ověřená. Další billing acceptance krok je první skutečná změna tarifu, která ověří write/schedule cestu; změna země/měny zůstává řízená. Team / School / Campus zatím nezapínat;
7. rozšířit již existující CZ/EN ukázkový balíček na **5–10 veřejných lekcí** napříč věkem/předměty; současný lifecycle Showcase má funkční CZ/EN distribuční základ a sjednocené UTM, takže další krok je rozšíření témat a organické vyhodnocení výkonu, nikoli stavba share infrastruktury od nuly;
8. po spuštění ukázkového balíčku nechat GA4 nasbírat reálná data a dokončit funnel reporting nad `signup_completed → lesson_generation_completed → live_session_started → subscription_activated`; zkontrolovat i `ui_locale`, `lesson_language`, `plan`, `billing_country` a `source`;
9. dokončit **V1.1 školní billing acceptance** bez opakování již uzavřených V1 testů: finální card Checkout E2E, owner pohled po bankovní úhradě, bankovní renewal, případně Stripe cancel/restore; potom cleanup sandbox `Test School`, vrácení `loubek@icloud.com` na `user/free`, návrat do interní `Testovací školy` a finální rozhodnutí o veřejném Team/School/Campus self-service. Automatický `bank_match` backend je připravený, ale Air Bank/open-banking provider zatím není připojený;
10. před veřejným prohlášením WCAG 2.2 AA provést manuální WCAG-EM evaluaci podle `ACCESSIBILITY.md`.

Security výjimky SEC-002/007 znovu otevřít při změně předpokladů. Případný odchod od Supabase by zároveň odstranil dnešní SEC-002 architektonický důvod pro sdílený Supabase trust boundary, ale nesmí se předjímat před pondělním rozhodovacím bodem.
