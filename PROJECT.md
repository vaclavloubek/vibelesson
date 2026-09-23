# Syllonaut — projektový stav

### Produkční přechod Supabase → Neon dokončen — 2026-09-23

- **Production běží na Neonu:** Neon Postgres + Neon Auth + Data API, Neon projekt `neon-red-ladder`, výchozí (Default) větev `preview/codex/neon-staging-import-20260921-v2` (endpoint `ep-green-hat-b24o0won`). Tuto Neon větev ani stejnojmennou git větev nemazat. PR #284 (cutover), #285, #286 a #287 (opravy po přepnutí) jsou v `main`; produkční nasazení `6e0ddc4` je `Ready`.
- **Finální synchronizace** proběhla při zmrazené Supabase v jedné transakci (`scripts/neon/final-sync.mjs`): 55/55 tabulek se shodným checksumem, 104 cizích klíčů znovu vytvořeno a ověřeno (0 osiřelých řádků), identity Supabase = `app_identity` = `neon_auth` (4), nový účet doplněn bez hesla. Záloha předchozího stavu větve: schéma `migration_backup_20260923083128`. Následně byly převzaty granty role `authenticated` ze Supabase (22 tabulkových, 11 sloupcových, 16 funkcí; jen RLS tabulky, bez TRUNCATE).
- **Ověřeno v produkci:** veřejné stránky, přihlášení vlastníka novým heslem, admin oprávnění a AI kvóta, `/lessons`, živá hodina se studentem, odpověď a AI hodnocení (test vlastníka úspěšný), připojení studenta přes Neon SQL, chráněný cron.
- **Supabase** (`qsjddlgmabgmtssvntmn`) je ponechaná beze změny dat a **jen pro čtení** (`default_transaction_read_only = on`) jako záloha. Nemazat bez samostatného rozhodnutí. Protože Neon už přijal produkční zápisy, prostý návrat na Supabase není povolen (split-brain); postup je v `docs/NEON_MIGRATION.md`.
- **Nové provozní nastavení:** v Production jsou `CRON_SECRET` (zapnul i dříve nefunkční crony školní fakturace a změn služby), `NEON_AUTH_COOKIE_SECRET`, `TURNSTILE_SECRET_KEY` a DB/Auth/Data API proměnné Neonu. AI hodnocení se zpracuje hned po odevzdání; hodinový cron nahrazuje pg_cron (retry hodnocení, konec Free hodin, retence), aby Neon Free (100 CU-h/měsíc) mohl uspávat compute.
- **Otevřené body:** (1) Opraveno: `reconcile_live_control_snapshot` na Neonu (PG18, migrace `0009`). (1b) Opraveno: Stripe webhook na Neonu (`auth.role()` → migrace `0010`); append-only trigger smluvních snapshotů záměrně beze změny. (1c) Vyřešeno: Preview nasazení už nevytvářejí Neon větve. (2) Za provozu neověřeno: školní administrace, Stripe webhook (první obnova předplatného 18.–19. 10.), registrace nového uživatele. (3) Ostatní 3 účty si musí nastavit heslo přes „Zapomenuté heslo“. (4) Ojedinělé `P0001` u `/api/ai-quota` sledovat. Interní verze zůstává **0.9.92** (infrastrukturní přechod bez změny produktu).

Aktualizováno: 2026-09-23 — interní verze **0.9.96**: na stránce živé hodiny je vedle odkazu pro připojení studentů ikona pro zkopírování odkazu do schránky. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.30.

Aktualizováno: 2026-09-23 — interní verze **0.9.95** uzavírá **LEGAL-015** schválenou variantou B: fakturační školní objednávka vyžaduje IČO a u českých organizací se identita ověřuje v registru ARES; faktura nese oficiální název a sídlo z registru. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.30.

Aktualizováno: 2026-09-23 — interní verze **0.9.94** uzavírá **LEGAL-014**: školní objednávka ukazuje přímo nad finálním tlačítkem souhrn s cenou, měnou, obdobím, způsobem platby a režimem obnovení. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.30.

Aktualizováno: 2026-09-23 — interní verze **0.9.93** uzavírá **LEGAL-013** schválenou variantou B: Ceník místo absolutního „bez omezení“ používá přesný claim o opakovaném spouštění hotových lekcí bez čerpání AI limitu a viditelně uvádí limity důvěryhodných zařízení placených účtů. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.30.

Aktualizováno: 2026-09-23 — zpřísněna pracovní pravidla pro Work/agenty: minimální scope, práce po malých krocích, úsporné používání kontextu a nástrojů, zákaz nevyžádaných refaktorů a opakovaných spekulativních pokusů. Kořenový `AGENTS.md` je nově stručným závazným vstupním bodem pro agentní práci; `PROJECT.md` zůstává zdrojem projektového stavu a načítá se cíleně podle úkolu. Jde pouze o dokumentační/procesní změnu, interní verze zůstává **0.9.92** a veřejně zobrazovaná verze 0.9.30.

**Aktuální produktová verze: 0.9.30** — Syllonaut má české a anglické UI, regionální výchozí volbu jazyka a oddělený jazyk generované lekce. **Sdílení lekcí je produkčně dokončené a E2E ověřené:** autor vytváří odvolatelný read-only snapshot, příjemce musí pro uložení a spuštění použít vlastní účet a dostane samostatnou kopii. Share link je záměrně přenositelný a počítá se s ním i pro veřejné ukázkové lekce a akviziční distribuci. Free účet generuje nové lekce pouze v aktivním jazyce UI a při AI revizích nesmí změnit hlavní jazyk existující lekce nebo bloku. Teacher, Teacher Pro a budoucí Team/School/Campus mají benefit **Lekce v libovolném jazyce**, včetně automatické detekce jazyka zadání, explicitní volby dalšího jazyka a změny jazyka při AI revizi. Entitlement je vynucený serverově.

### Kopírování odkazu pro studenty ikonou 0.9.96 — 2026-09-23

- ve Startovní zóně i v panelu **Připojit další studenty** živé hodiny je hned vedle textového odkazu `/join/<kód>` ikonové tlačítko pro zkopírování odkazu do schránky (komponenta `CopyableJoinLink`);
- po zkopírování se ikona na 2,2 s změní na potvrzovací fajfku; tooltip, `aria-label` a `aria-live` oznámení jsou v češtině i angličtině;
- stávající tlačítko **Kopírovat odkaz** pod QR kódem zůstává beze změny;
- změna nezasahuje do databáze, API ani oprávnění; veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Ověření identity organizace u fakturační objednávky 0.9.95 — 2026-09-23

- uzavřen právní auditní bod **LEGAL-015** schválenou variantou B;
- při platbě fakturou je IČO / registrační číslo povinné (formulář i server); karetní objednávky zůstávají beze změny;
- u fakturační země **CZ** server v `POST /api/organizations` ještě před vytvořením objednávky a faktury normalizuje IČO (doplnění vedoucích nul), ověří kontrolní číslici a dotáže se registru **ARES** (`lib/ares-registry.ts`, server-only, timeout 6 s); neexistující subjekt vrací `registration_number_not_found`, zaniklý `registration_number_inactive`, výpadek registru `registry_unavailable` (503) a objednávka se v takovém případě nevytvoří;
- oficiální název a sídlo z ARES přepíší ručně zadané údaje, takže faktura i navazující obnovovací faktury nesou registrovanou identitu; adresa se skládá z ulice / části obce, čísla popisného nebo evidenčního a orientačního, obce a PSČ;
- `billing_snapshot.registryVerification` ukládá zdroj (`ARES` / `self_declared` u zahraničních organizací), normalizované IČO, oficiální název, adresu z registru a čas ověření;
- `PATCH /api/organizations/current` u organizací s `renewal_mode = manual_invoice` odmítá změnu názvu a IČO (`organization_billing_identity_locked`); tuto cestu nepoužívá žádná obrazovka, změna identity jde přes podporu nebo novou ověřenou objednávku;
- formulář ukazuje u faktury povinné IČO s vysvětlením převzetí údajů z ARES a srozumitelné CZ/EN chyby;
- regresní kontrola **scripts/verify-school-organizations.mjs** hlídá server-only ARES lookup, kontrolní číslici, pořadí ověření před vytvořením objednávky, uložení výsledku, zámek identity a formulář; modul byl navíc ověřen proti živému ARES (platné IČO i bez vedoucích nul, chybná kontrolní číslice, neexistující IČO, adresa obce bez ulic);
- změna nezasahuje do databázového schématu, cen ani oprávnění; veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.

### Souhrn školní objednávky u finálního tlačítka 0.9.94 — 2026-09-23

- uzavřen právní auditní bod **LEGAL-014**;
- školní objednávkový formulář zobrazuje přímo nad finálním tlačítkem **Souhrn objednávky** pro fakturu i kartu: tarif a počet učitelů, cenu s měnou a obdobím (**za rok / za měsíc**), délku licence **12 měsíců / 1 měsíc od aktivace po potvrzené platbě**, způsob platby a režim obnovení;
- cena a měna se počítají stejnými funkcemi `billingRouteForCountry` a `organizationMinorUnitPrice` jako serverový `POST /api/organizations`, takže souhrn odpovídá částce uložené do objednávky;
- obnovení: karta = automaticky na další stejné období, dokud ho správce nevypne ve správě školy; faktura = bez automatického obnovení, obnovovací fakturu lze vystavit nejdříve 90 dní před koncem licence;
- u karetní platby v EUR/USD (Stripe managed payments) souhrn uvádí, že konečnou částku včetně případných daní zobrazí Stripe Checkout; daňový model zůstává otevřený v **LEGAL-019**;
- regresní kontrola **scripts/verify-offer-contract-consistency.mjs** hlídá shodný výpočet s API, pořadí souhrnu před tlačítkem a texty období a obnovení;
- změna nezasahuje do databáze, cen ani oprávnění; veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.
- PR **#294** prošel CI (build, source-contracts, axe-public-routes, preview-config) i Vercel Preview; produkční merge commit **a6dd92ce** má Vercel **success** a produkční JavaScript stránky `/school` obsahuje souhrn objednávky (samotný formulář je za přihlášením).

### Přesný claim opakovaného používání lekcí 0.9.93 — 2026-09-23

- uzavřen právní auditní bod **LEGAL-013** schválenou variantou B (texty + informace v Ceníku, bez změny VOP);
- všech 10 výskytů „Opakované používání lekcí bez omezení“ / „Unlimited repeated use of lessons“ v placených tarifech nahradil jeden sdílený claim **„Opakované spouštění hotových lekcí bez čerpání AI limitu“** / **„Repeated launches of finished lessons without using the AI allowance“**; dříve samostatný, nyní duplicitní řádek „Živé spuštění hotové lekce nespotřebovává AI limit“ je v něm sloučen;
- popis tarifu Teacher a úvodní vysvětlení AI limitu už neslibují „bez omezení“, ale opakované učení bez čerpání AI limitu;
- nová poznámka **„Zařízení u placených účtů“** pod kartami tarifů uvádí, že placené funkce včetně spouštění lekcí fungují jen na důvěryhodných zařízeních: Teacher / Teacher Pro **3 aktivní a 5 nových za 30 dní**, Team / School / Campus **5 aktivních a 10 nových za 30 dní** na učitelský účet; zařízení lze odebrat ve správě předplatného nebo školy a studenti se do limitu nepočítají;
- hodnoty odpovídají serverovým funkcím `register_personal_trusted_device` a `register_trusted_device_server`; změna nezasahuje do databáze, limitů ani oprávnění;
- regresní kontrola **scripts/verify-free-lesson-reuse.mjs** vyžaduje nový CZ/EN claim a poznámku o zařízeních, zakazuje v Ceníku „bez omezení“ / „neomezen“ / „unlimited“ / „without limits“ a hlídá shodu čísel s migracemi;
- informace o limitu zařízení zatím není ve VOP; doplnit ji při nejbližší plánované změně VOP;
- veřejně zobrazovaná verze na dashboardu zůstává **0.9.30**.
- PR **#293** prošel CI (build, source-contracts, axe-public-routes, preview-config) i Vercel Preview; produkční merge commit **36e71ba8** má Vercel **success** a živé `/cs/pricing` i `/en/pricing` obsahují nový claim i poznámku o zařízeních bez „bez omezení“ / „unlimited“.

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
- **[LEGAL-013 — RESOLVED 0.9.93] Absolutní marketingové „bez omezení“ kolidovalo s bezpečnostními omezeními zařízení a dalšími guardy.** Ceník nyní u všech placených tarifů používá přesný sdílený CZ/EN claim **„Opakované spouštění hotových lekcí bez čerpání AI limitu“** a pod kartami tarifů viditelně uvádí skutečné limity důvěryhodných zařízení: Teacher / Teacher Pro **3 aktivní / 5 nových za 30 dní**, členové Team / School / Campus **5 aktivních / 10 nových za 30 dní** na učitelský účet. Regresní test zakazuje návrat „bez omezení“ / „unlimited“ do Ceníku a hlídá shodu čísel s DB funkcemi. VOP se neměnily.

#### Střední / provozní rizika

- **[LEGAL-014 — RESOLVED 0.9.94] Školní objednávka neukazovala konkrétní cenu bezprostředně u finálního tlačítka.** Formulář má nově přímo nad tlačítkem **Objednat s povinností platby** / **Objednat a pokračovat k platbě** pevný **Souhrn objednávky**: tarif a počet učitelů, cenu v měně určené fakturační zemí (stejný výpočet jako server), období od aktivace po potvrzené platbě, způsob platby a režim obnovení (karta automaticky, faktura bez automatického obnovení). U karetní platby přes Stripe managed payments souhrn upozorňuje, že konečnou částku včetně případných daní zobrazí Stripe Checkout.
- **[LEGAL-015 — RESOLVED 0.9.95] U školní fakturační objednávky šlo deklarovat cizí nebo neexistující školu bez ověření.** Platba fakturou nově vyžaduje IČO / registrační číslo. U českých organizací server před vytvořením objednávky a faktury ověří IČO (kontrolní číslice + registr **ARES**), odmítne neexistující a zaniklé subjekty a fakturuje výhradně na oficiální název a sídlo z registru; výsledek ověření ukládá do `billing_snapshot.registryVerification`. Při nedostupnosti ARES se fakturační objednávka nevytvoří (nabídne se karta / pozdější pokus). U organizací s obnovou na fakturu nejde ověřený název a IČO později přepsat přes API. Oprávnění konkrétní osoby jednat za školu technicky ověřit nelze; smluvně ho dál kryje povinný checkbox. Karetní objednávky beze změny.
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

Konkurenční kontext: ScioBot veřejně komunikuje neomezený počet základních příprav zdarma a ve ScioBot+ neomezené prémiové přípravy / ScioChat; školní licence navíc neomezuje počet učitelů. Syllonaut proto nemá soutěžit tvrzením „více generování“, ale celým řízeným workflow skutečně odučené interaktivní hodiny a znovupoužitelností hotových lekcí.

### Versionování produktu

Od 2026-09-19 platí pro předprodukční řadu Syllonautu následující pravidlo:

- až do ostrého startu zůstává hlavní vývojová řada **0.9.x**; samotné `0.9` se už před ostrým startem nemění;
- třetí číselná část je interní pořadí produkčních funkčních revizí a může mít libovolný počet číslic;
- **menší funkční úprava** zvýší interní verzi o 1, např. `0.9.36 → 0.9.37`;
- **větší funkční / produktová úprava** dostane nejbližší vyšší volnou desítkovou hranici, např. z `0.9.36` na `0.9.40`; pokud byla tato hranice mezitím dosažena drobnými interními revizemi, použije se další vyšší desítka;
- číslo verze samo o sobě neurčuje závažnost změny; rozhodující je, zda byla konkrétní revize označena jako menší interní úprava, nebo jako větší veřejný release;
- **dashboard uživateli zobrazuje pouze poslední větší veřejný release**. Menší interní revize mohou pokračovat, ale zobrazené číslo se kvůli nim nemění;
- příklad: po veřejném releasu `0.9.40` mohou interně vzniknout `0.9.41`, `0.9.42` atd., zatímco dashboard stále ukazuje `0.9.40`; změní se až při další větší úpravě;
- po vydání většího releasu 0.9.20 je současný veřejně viditelný baseline `0.9.20`; interní revize 0.9.21+ jej na dashboardu nemění;
- číslo za druhou tečkou vždy představuje **jednu koherentní funkční změnu**, nikoli jeden commit nebo jeden změněný soubor;
- čistě dokumentační, testovací, CI, formátovací nebo interní refaktor bez změny produktového chování sám o sobě verzi neposouvá;
- pracovní Preview větev verzi neposouvá; nová interní verze se stává platnou až po sloučení funkční změny do produkčního `main`;
- při každé budoucí produkční funkční změně se má automaticky aktualizovat tento `PROJECT.md`: interní verze + stručný changelog/stav relevantní funkce;
- při větší úpravě se současně aktualizuje i veřejně zobrazovaná verze na dashboardu; při menší úpravě se veřejně zobrazovaná verze nemění;
- **verze `1.0.0` je vyhrazena výhradně pro ostrý start produktu**, tedy okamžik, kdy je Syllonaut považován za připravený pro běžný produkční provoz;
- o připravenosti na `1.0.0` se má usilovat o shodu podle funkčnosti, stability, bezpečnosti, UX a provozní připravenosti; pokud shoda nevznikne, **konečné rozhodnutí o vydání `1.0.0` má vlastník projektu Václav Loubek**;
- `PROJECT.md` se jinak stále mění pouze na výslovný pokyn uživatele; výjimkou je automatická aktualizace verze/stavu jako součást už schválené produkční funkční změny.

## 2. Stack a deployment

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7 + Vercel AI Gateway
- Supabase Auth + Postgres + RLS + Realtime
- Resend pro transakční/auth e-maily; ověřená odesílací doména `syllonaut.com`
- Spaceship Email Forwarding pro příjem `vaclav@syllonaut.com` → cílový Gmail
- AI model: `openai/gpt-5.6-sol`
- Vercel projekt: `edupilot2` (legacy technický název), plán Pro
- autoritativní branch: `main`
- Supabase project ref: `qsjddlgmabgmtssvntmn`, `eu-west-1`, Postgres 17, RLS aktivní
- velikost DB ověřená 2026-09-17: přibližně 13 MB
- Node 24.x, npm 11.19.0, deterministické instalace přes `npm ci`

Všechny současné AI inference cesty explicitně vynucují Vercel AI Gateway `zeroDataRetention: true`.

Routing:

- generování bez podkladů, AI revize a AI grading: OpenAI;
- generování s podklady: pouze Bedrock / Azure, řazené podle ceny;
- ZDR je fail-closed požadavek a hlídá ho AST regression check.

### Preview a SEC-002

Preview používá stejný produkční Supabase trust boundary jako Production a má přístup k placené AI identitě/credentialu.

**SEC-002 — ACCEPTED RISK / DEFERRED.**

Cílová budoucí architektura zůstává:

- samostatný staging Supabase;
- oddělená Preview AI identita/credential;
- Deployment Protection.

Dokud výjimka platí, Preview testy nesmí dělat destruktivní zásahy do produkčních dat, load/stress testy ani zbytečné placené AI cally.

## 3. Hlavní routy

- `/` — locale gateway; explicitní preference → CZ/SK geo → Accept-Language → EN fallback
- `/cs`, `/en` — lokalizované landing pages
- `/pricing` — veřejný Pricing / Ceník
- `/subscription`, `/cs/subscription`, `/en/subscription` — přihlášená správa individuálního předplatného; tarif/fakturační období v Syllonautu, platby/faktury/zrušení přes Stripe Portal
- `/school` — organizace / školní licence, membership, role, shared usage, knihovna a billing administrace podle oprávnění
- `/cs/school`, `/en/school` a school subrouty — locale-preserving gateway na kanonické `/school...` routy se zachováním query stringu
- `/school/invoices/<orderId>` — elektronická bankovní faktura organizace; owner/admin dané organizace nebo superadmin
- `/admin/school-invoices` — globální přehled vydaných školních bankovních faktur; pouze Syllonaut superadmin, včetně ručního potvrzení úhrady
- `/new` — tvorba nové lekce
- `/cs/new`, `/en/new` — locale-preserving acquisition gateway; uloží explicitní UI locale, zachová query/UTM a přesměruje na kanonickou `/new`
- `/lessons` — Moje lekce + Poslední výsledky + složky
- `/cs/lessons`, `/en/lessons` a jejich subrouty — locale-preserving gateway na kanonické lesson routy; používá se mimo jiné z lifecycle e-mailů
- `/lessons/<id>` — lesson workspace
- `/lessons/<id>/worksheet` — serverově chráněný A4 pracovní list / klíč pro učitele; Teacher Pro + budoucí School/Campus, tisk nebo uložení jako PDF
- `/s/<token>` — veřejný read-only snímek sdílené lekce; přihlášení je nutné až pro uložení vlastní kopie. Capability link je záměrně přenositelný/přeposílatelný a může sloužit i jako distribuční URL ukázkové lekce; zveřejnění neotevírá originál, účet autora, výsledky studentů, live session ani AI historii
- `/cs/s/<token>`, `/en/s/<token>` — locale-preserving acquisition gateway pro veřejné ukázky; zachová UTM parametry, uloží explicitní locale cookie a přesměruje na kanonickou share route
- `/sessions/<id>` — teacher live session / report
- `/sessions/<id>/presenter` — projekční režim
- `/join`, `/join/<code>` — studentský vstup
- `/student/<id>` — student live
- `/auth/confirm` — scanner-safe potvrzovací mezikrok
- `/auth/confirm/verify` — POST TokenHash → `verifyOtp`
- `/auth/update-password` — změna hesla po recovery
- `/auth/error` — bezpečný auth error stav

Landing umožní začít návrhem zadání bez okamžité registrace; účet je nutný až pro skutečné AI generování a ukládání.

### Internationalization / multilingual 0.9

Syllonaut od 0.9 rozlišuje tři nezávislé veličiny:

- **UI locale** — jazyk rozhraní, aktuálně `cs` / `en`;
- **billing country/currency** — regionální cenová a platební logika; není odvozována z jazyka UI;
- **lesson language** — jazyk obsahu lekce, uložený jako BCP-47-like tag (`cs`, `en`, `de`, `pt-BR` apod.).

Výchozí UI locale:

1. explicitní locale v URL;
2. uložená volba v `syllonaut_locale` cookie;
3. země návštěvníka: CZ/SK → čeština, ostatní validní země → angličtina;
4. `Accept-Language`;
5. fallback angličtina.

Ruční přepínač CZ/EN je dostupný v hlavních veřejných i pracovních obrazovkách a explicitní volba má přednost před geolokací.

Tvorba lekce:

- formulář výslovně říká, že učitel může zadání napsat v jazyce, ve kterém chce učit;
- Free: jazyk nové lekce je serverově vynucený na aktivní UI locale (`cs` nebo `en`), takže jiné jazyky nelze obejít přes prompt ani přímé API volání;
- Teacher / Teacher Pro / admin: `Jazyk lekce / Lesson language` má default `Automaticky podle zadání`, lze vybrat běžný jazyk nebo zadat jiný vlastní jazyk bez pevného whitelistu;
- u oprávněných účtů má v auto režimu případný explicitní jazykový požadavek v zadání přednost, jinak se použije jazyk volného zadání; UI locale je pouze fallback pro nejednoznačný/absentující text;
- jazyk podkladů sám o sobě nesmí změnit jazyk lekce;
- Free AI revize mají hlavní jazyk lekce/bloku serverově uzamčený; požadavek na překlad celé lekce nebo bloku se nesmí provést, ale cizojazyčný obsah jako slovíčka, dialogy, ukázky nebo překladové úlohy je povolený;
- Teacher / Teacher Pro / admin mohou při AI revizi výslovně požádat o překlad nebo změnu hlavního jazyka;
- lesson content používá vlastní `lang` a `dir=auto` tam, kde je potřeba, takže jazyk obsahu nemusí odpovídat jazyku UI.

Lokalizované oblasti zahrnují landing, Pricing, auth/recovery, GDPR/cookies, lesson authoring/preview, knihovnu/složky, teacher live, grading/reporty, Presenter, join/student live, týmový editor a systémové stavy/error UX.

SEO:

- `/cs` a `/en` mají locale metadata, canonical/hreflang a `x-default=/en`;
- root metadata a Open Graph preview reagují na UI locale;
- `<html lang>` odpovídá aktivnímu jazyku rozhraní.

Analytika:

- custom GA4 eventy nesou anonymní `ui_locale`;
- dokončené generování nese `lesson_language`;
- do těchto parametrů se neposílá prompt, lesson text, student answer, jméno, e-mail ani jiné content/PII payloady;
- regresní testy hlídají allowlist a zakázané high-risk parametry.

Regresní ochrana je v `scripts/verify-i18n.mjs`, `scripts/verify-analytics.mjs`, TypeScript checku a accessibility CI.

### Header / responzivní navigace

Veřejné i učitelské obrazovky používají od 0.9.14 stejnou navigační logiku:

- desktop drží hlavní navigaci **Jak to funguje / Ceník / Moje lekce** a na běžných učitelských obrazovkách primární CTA **Připravit hodinu**;
- po přihlášení se e-mail, AI kvóta a logout přesouvají do kompaktního profilového dropdownu; v hlavní liště zůstává jen trigger účtu;
- profilový dropdown je společný pro Landing, Pricing, GDPR, dashboard, lesson workspace a Teacher Live; obsahuje Moje lekce, Předplatné a bezpečné Odhlásit;
- dropdown se zavírá kliknutím mimo i klávesou Escape; na úzkém mobilním headeru se trigger zmenší na iniciálu;
- Teacher Live záměrně nemá CTA pro zahájení nové lekce, aby během živé hodiny nesoutěžilo s řídicími akcemi; stav spojení je přesunut pod čistou hlavičku do samostatného statusu;
- pod cca 1040 px se na veřejných stránkách zobrazí hamburger menu;
- na telefonu je v menu i `Připravit hodinu`, pokud se desktop CTA skryje;
- menu má `aria-expanded`, unikátní `aria-controls`, Escape zavření a návrat fokusu na spouštěč;
- Pricing header CTA je chráněné proti zalomení na dva řádky.

## 4. Architektonické principy

AI negeneruje libovolný React/HTML. Generuje validovaný `Lesson` JSON; aplikace určuje rendering a chování.

- Zod chrání strukturu.
- Změna jednoho bloku nemá potichu změnit zbytek lekce.
- DB/server je zdroj pravdy pro live session.
- Realtime je pouze invalidation/wake-up; event `invalidate` s payloadem `{}`.
- Teacher smí pracovat jen s vlastní lesson/session.
- `role=admin` není universal content access.
- Student nemá Supabase Auth účet.
- Studentské/public payloady jsou whitelistované.
- Odvozené skóre se nepersistuje jako další zdroj pravdy.
- Kvóty a placená oprávnění jsou server/DB autorita.
- Client UI nesmí být jediná ochrana placené AI operace.
- Secrets nikdy do repo ani klientského JS.
- Podklady i studentský text jsou pro AI nedůvěryhodný obsah, nikoli instrukce pro změnu role/modelu.

## 5. Lesson schema a authoring

Podporované bloky:

`intro`, `team_task`, `poll`, `quiz`, `open_text`, `ranking`, `reveal`, `timer`, `exit_ticket`.

Block může obsahovat:

`id`, `type`, `title`, `durationMinutes`, `instructions`, `options?`, `items?`, `dataTable?`, `correctAnswer?`, `revealText?`, `teacherNote?`, `points?`, `gradingRubric?`. Lesson na nejvyšší úrovni navíc může nést `language?`; nové AI lekce jazykový tag povinně emitují, starší uložené lekce zůstávají zpětně kompatibilní.

Aktuální hranice:

- 3–16 bloků;
- max. 60 minut/blok;
- 10–360 minut lekce.

### Věková a vývojová přiměřenost 0.8.01

Cílová skupina není pouze metadata lekce. Sdílená pravidla AI authoringu ji závazně používají při generování celé lekce i při následné AI revizi celé lekce nebo jednotlivého bloku.

AI musí podle cílové skupiny přizpůsobit zejména:

- úroveň čtení a psaní a slovní zásobu;
- délku vět, počet kroků a objem textu;
- míru abstrakce a potřebné předchozí znalosti;
- délku soustředění a vhodný způsob odpovědi;
- celkovou kognitivní náročnost aktivit a hodnoticích kritérií.

Pro nejmladší žáky / začínající čtenáře nesmí automaticky předpokládat plynulé čtení ani samostatné delší psaní; preferuje krátké konkrétní instrukce a přiměřené formy odpovědi. U starších žáků a dospělých se naopak musí vyhnout infantilizaci. Před vrácením výsledku má model interně projít každý blok a nepřiměřený blok přepracovat.

Jde o prompt-level didaktickou pojistku, nikoli deterministický klasifikátor věku. Cílovka zůstává volným textem, aby bylo možné zadat i heterogenní nebo specifickou skupinu. Regresní check `scripts/verify-age-appropriateness.mjs` hlídá, že pravidla i explicitní předání `audience` do generování nezmizí.

**Produkční ověření 2026-09-18:** po nasazení 0.8.01 byla reálně vytvořena lekce se zadanou nízkou věkovou/ročníkovou cílovou skupinou a uživatel potvrdil, že výsledné úlohy odpovídají očekávaným schopnostem dané skupiny. Tím je vedle CI/Preview ověřeno i skutečné produktové chování této úpravy.

### Formulář přípravy lekce

Po beta úpravě nejsou pomocné hodnoty v parametrech přípravy lekce skutečnými předvyplněnými daty. Slouží pouze jako zesvětlené příklady vstupu; uživatel musí hodnoty skutečně vyplnit.

### Authoring kontrakt interaktivních bloků

Po beta testu 2026-09-18 platí navíc:

- `intro`, `reveal` a `timer` jsou display-only bloky a AI v nich nesmí zadat studentovi text, který má v aplikaci odevzdat;
- individuální odevzdávaný text patří do `open_text` / `exit_ticket`;
- týmový odevzdávaný text patří do `team_task`;
- `reveal` může vybízet k ústní diskusi, ne k submitu do aplikace;
- sekvenční číslované instrukce se mají generovat jako jednotlivé kroky/řádky, ne jako jeden hustý odstavec;
- lesson preview, student live i Presenter umí takové číslované instrukce/reveal text deterministicky renderovat jako skutečný sémantický seznam `<ol><li>`, bez HTML injection;
- při AI revizi celé lekce znamená číselný odkaz vždy **viditelné pořadí všech bloků** v `lesson.blocks`; „druhý úkol / aktivita 2 / block 2“ tedy vždy znamená druhou zobrazenou aktivitu, i když je například `poll`, `reveal` nebo jiného typu. Běžné české/anglické číselné a ordinální formulace se před modelem deterministicky rozliší na konkrétní block ID a model dostává i úplnou mapu pořadí.
- při AI revizi jednotlivého bloku se významná změna časové dotace musí promítnout i do skutečného rozsahu studentské práce. Prodloužení nesmí být pouze změna `durationMinutes`; systém porovnává student-facing obsah bez času/titulu/metodické poznámky a při čistě časové změně provede jeden opravný AI pokus. Pokud ani ten obsah didakticky nepřizpůsobí, revizi neuloží. Výjimkou je výslovný pokyn učitele typu „jen změň čas / obsah neměň“. Regresní kontrakt: `scripts/verify-duration-revision.mjs`.

### Structured `dataTable`

Přidáno po betatestu 2026-09-17:

- `caption` je povinný pro nově AI generované tabulky;
- 2–8 sloupců;
- 1–30 řádků;
- každý řádek odpovídá počtu sloupců;
- renderer je v lesson preview a studentském/live `LiveBlock`;
- číselné datasety, časové řady, výsledky měření, webová analytika apod. se mají generovat do `dataTable`, ne jako nepřehledný odstavec;
- starší uložené lekce se zpětně samy nepřepisují;
- Presenter má vlastní renderer a `dataTable` v jeho payloadu zatím není.

### Source materials

Implementováno/ověřeno:

- PDF, PPTX, DOCX, TXT, MD;
- max. 5 souborů;
- dohromady max. 10 MB;
- originální soubor neopouští zařízení;
- browser extrahuje text, server dostane jen text;
- originál ani extrahovaný text se trvale neukládá;
- bez OCR pro naskenované PDF;
- režimy `primary`, `strict`, `inspiration`;
- prompt injection uvnitř dokumentu se ignoruje jako nedůvěryhodný obsah;
- PDF text extraction používá self-hosted worker `/pdf.worker.mjs`, který se automaticky připraví z nainstalované verze `pdf-parse` před lokálním dev serverem i produkčním buildem; CSP zůstává přísná (`worker-src 'self' blob:`) a není potřeba povolit externí CDN.

SEC-012 je uzavřený: DOCX/PPTX ZIP preflight omezuje počet položek a relevantních XML částí, odmítá ZIP64/multi-disk a streamovaně hlídá dekomprimovaná data.

## 6. ATAG-oriented tvorba přístupného obsahu

Syllonaut je zároveň authoring tool, proto AI generation i revision mají pravidla přístupnosti jako default:

- studentské zadání musí dávat smysl jako samostatný text;
- nesmí spoléhat pouze na barvu, polohu, tvar, velikost, animaci nebo zvuk;
- ranking nesmí být formulovaný jako drag-only gesto;
- důležitá informace musí být dostupná textově, ne pouze ústně od učitele;
- tabulková data musí mít skutečnou tabulkovou strukturu a smysluplný caption;
- budoucí významové obrázky musí mít textovou alternativu nebo explicitní authoring krok pro její doplnění;
- AI revize musí existující přístupné prvky zachovávat, i když instrukce učitele přístupnost výslovně nezmiňuje.

Teacher preview provádí deterministickou kontrolu a upozorňuje na:

- chybějící caption tabulky;
- drag-only formulace;
- zjevnou závislost na barvě/poloze;
- odkazy typu „viz obrázek/graf výše“, pokud pro ně současný lesson model neposkytuje popsaný zdroj.

Každý nález obsahuje konkrétní **Jak opravit** guidance. Jde o pomoc autora, nikoli o automatické potvrzení plné přístupnosti obsahu.

## 7. Účet, kvóty a tarifní entitlementy

### Veřejný Ceník

`/pricing` má přepínače:

- **Pro učitele / Pro školy**;
- **Měsíčně / Ročně**.

Roční varianta komunikuje přibližně **2 měsíce zdarma**. Individuální tarify **Teacher / Teacher Pro jsou produkčně veřejně prodejné přes LIVE Stripe Checkout**; Free CTA vede na registraci bez platební karty. Team / School / Campus zatím nejsou veřejně koupitelné přes self-service Checkout a jejich CTA zůstávají prezentační / připravované.

Individuální plány:

- **Free** — 0 Kč / €0 / $0; 3 nové AI lekce + 10 AI úprav měsíčně + 2 importy/kopie měsíčně; nové lekce pouze v aktivním jazyce UI a AI úpravy bez změny hlavního jazyka; deterministický quiz; ruční hodnocení bodovaných otevřených/týmových odpovědí; bez prémiových složek;
- **Teacher** — 199 Kč / €7.99 / $8.99 měsíčně nebo 1 990 Kč / €79.90 / $89 ročně; 10 AI lekcí + 20 AI úprav; **lekce v libovolném jazyce**; bez placeného AI gradingu a bez prémiových složek;
- **Teacher Pro** — 329 Kč / €13.99 / $14.99 měsíčně nebo 3 290 Kč / €139.90 / $149 ročně; 25 AI lekcí + 40 AI úprav; **lekce v libovolném jazyce**; AI grading `open_text`, `exit_ticket`, `team_task`; složky a podsložky.

U placených individuálních plánů jsou live hodiny a opakované používání již vytvořených lekcí bez tarifního limitu; AI kvóta se čerpá pouze při nové AI tvorbě a AI úpravách. Free může každou lesson family živě použít jednou. Studenti se připojují bez plnohodnotného účtu.

### Recovery-payment integrity 0.9.58 — 2026-09-20

- prohraný dispute ani plný refund už **neodemkne libovolná pozdější subscription platba**; DB drží u každého potvrzeného invoice PaymentIntentu autoritativní `amount_paid`, měnu a `billing_reason`;
- recovery se počítá kumulativně po měně: Syllonaut sečte otevřené neuhrazené refund/chargeback ztráty (stejný původní PaymentIntent se nedvojí) a porovná je se součtem skutečně zaplacených subscription plateb po vzniku nejstarší otevřené ztráty;
- AI lock se uvolní až tehdy, když `recoveredAmount >= requiredAmount`; jedna malá prorata ani několik malých plateb tedy neodemknou vyšší ztrátu, dokud skutečně nezaplatí odpovídající částku;
- Stripe Invoice Payments API se používá po jednotlivých platbách: recovery započítává částku konkrétního PaymentIntentu, ne celý invoice total opakovaně. Součet mapovaných plateb musí souhlasit s `invoice.amount_paid`;
- během aktivního `refund` nebo `dispute` locku je serverově zakázaná změna individuálního tarifu, takže nelze vytvořit malou upgrade proratu jako zkratku k odemčení; zrušení již naplánované změny zůstává povolené;
- legacy `sync_stripe_invoice_payment_event` je po produkčním cutoveru odebraný service-role cestě a recovery metadata jsou povinná; autoritativní cesta je `sync_stripe_invoice_payment_event_v2`;
- uživatelská CZ/EN komunikace výslovně říká, že po prohraném sporu / full refundu se AI odemkne až poté, co pozdější potvrzené subscription platby pokryjí ztracenou / vrácenou částku;
- regresní kontrakt: `scripts/verify-recovery-payment-integrity.mjs` + rozšířené Stripe/dispute/refund verifiery.

### Individuální full-refund AI pause 0.9.57 — 2026-09-20

- **plný refund** platby individuálního Teacher / Teacher Pro dočasně zastaví pouze nové variabilní AI náklady: generování, AI revize a AI grading; uložené lekce, živá výuka, Presenter a ostatní nenákladové funkce zůstávají dostupné;
- **částečný refund AI nezamyká**; rozhodnutí se dělá z kanonického Stripe Charge stavu podle kumulativního `amount_refunded` vůči `amount`, nikoli podle klientského vstupu nebo samotné existence refundu;
- refund lifecycle používá serverově ověřený Stripe webhook, PaymentIntent → subscription/user mapu z potvrzených `invoice.paid` a private DB ledger `individual_billing_refunds`;
- `charge.refunded`, `refund.created`, `refund.updated` a `refund.failed` vedou k novému načtení kanonického Charge stavu; tím může případné selhání/reverze refundu lock bezpečně uvolnit;
- plný refund zůstává uzamčený, dokud pozdější potvrzené subscription platby v dané měně kumulativně nepokryjí vrácenou částku; teprve potom se AI automaticky odemkne bez ručního zásahu;
- interní admin a uživatel krytý aktivním organizačním členstvím jsou z individuálního refund locku vyjmutí;
- UI rozlišuje důvod `refund` od `past_due` a `dispute` a vysvětluje, že hotové lekce/live zůstávají funkční a AI se obnoví po potvrzených subscription platbách pokrývajících vrácenou částku;
- LIVE Stripe webhook musí po produkčním deployi explicitně odebírat `charge.refunded`, `refund.created`, `refund.updated` a `refund.failed`;
- regresní kontrakt: `scripts/verify-full-refund-ai-pause.mjs` + rozšířený `scripts/verify-stripe-webhook.mjs`.

### Individuální dispute / chargeback AI pause 0.9.56 — 2026-09-20

- otevření Stripe dispute nad platbou individuálního Teacher / Teacher Pro dočasně zastaví **pouze nové variabilní AI náklady**: generování, AI revize a AI grading; uložené lekce, živá výuka, Presenter a ostatní nenákladové funkce zůstávají dostupné;
- AI lock se opírá o serverově ověřené Stripe webhooky a private DB ledger, nikoli o klientský stav; dispute se váže na subscription přes PaymentIntent mapu vytvořenou z potvrzených `invoice.paid` eventů a Stripe Invoice Payments API;
- `charge.dispute.created` a `charge.dispute.funds_withdrawn` AI pozastaví; `charge.dispute.closed` ve stavu `won` / `warning_closed` a `charge.dispute.funds_reinstated` ji automaticky odemknou;
- prohraný spor (`lost`) zůstává uzamčený, dokud pozdější potvrzené subscription platby v dané měně kumulativně nepokryjí ztracenou částku; tím malá prorata ani jiná drobná platba neodemkne vyšší chargeback;
- interní admin a uživatel krytý aktivním organizačním členstvím jsou z individuálního dispute locku vyjmutí;
- UI rozlišuje běžný `past_due` od reklamované platby a vysvětluje, že hotové lekce/live zůstávají funkční a za jakých podmínek se AI znovu odemkne;
- existující LIVE invoice platby byly jednorázově backfillnuté do payment mapy, aby ochrana pokrývala i již proběhlé individuální nákupy před nasazením;
- LIVE Stripe webhook musí po produkčním deployi explicitně odebírat `charge.dispute.created`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn` a `charge.dispute.funds_reinstated`;
- regresní kontrakt: `scripts/verify-dispute-ai-pause.mjs` + rozšířený `scripts/verify-stripe-webhook.mjs`.

### Individuální `past_due` AI pause 0.9.54 — 2026-09-20

- stav Stripe `past_due` u individuálního Teacher / Teacher Pro **neshazuje účet na Free** a neblokuje uložené lekce, živou výuku, Presenter ani ostatní nenákladové placené funkce;
- po dobu `past_due` jsou však serverově a databázově pozastavené nové nákladové operace: generování AI lekcí, AI revize celé lekce/bloku a AI grading;
- otevřené/týmové odpovědi zůstávají dostupné k ručnímu hodnocení; nové nebo znovu odevzdané odpovědi se při platebním problému přepnou do manual-review režimu místo AI callu;
- interní admin a uživatel s aktivním organizačním přístupem jsou z individuálního `past_due` AI locku vyjmutí;
- UI stav zobrazuje na dashboardu, v lesson workspace, na Teacher Live a ve správě předplatného a vysvětluje, že AI se **automaticky odemkne, jakmile Stripe platbu potvrdí**;
- autoritativní enforcement je v DB: generation/revision write boundary + grading dispatch/budget; aplikační kontroly slouží pro rychlé a srozumitelné UX;
- regresní kontrakt: `scripts/verify-past-due-ai-pause.mjs`.

### Organization-device DB-boundary repair 0.9.60 — 2026-09-20

- audit po nasazení 0.9.59 odhalil **produkční migrační drift**: aplikace, device ledger a unified server gate byly správně, ale produkční `create_live_session_server` a `requeue_response_evaluation_server` stále používaly starý `private.personal_trusted_device_hash_valid`;
- opravná migrace znovu autoritativně definuje oba service-role-only RPC tak, aby před live session / regrade vždy používaly `private.trusted_device_hash_valid`, který rozlišuje organization 5/10 politiku, personal 3/5 politiku a interní admin výjimku;
- rollback abuse test ověřuje 5 aktivních zařízení, blokaci 6., zachování rolling historie při admin resetu, nemožnost reaktivovat admin-reset token, blokaci 11. nového zařízení za 30 dní a fail-closed live/regrade boundary bez trusted hashe;
- source verifier nyní explicitně vyžaduje i `20260920073500_repair_organization_trusted_device_db_boundary.sql`, aby stejný drift nebyl považovaný za uzavřený jen proto, že správný SQL existuje v dřívějším zdrojovém souboru.

### Organization-member trusted devices 0.9.59 — 2026-09-20

- aktivní člen Team / School / Campus už není z device anti-sharing ochrany vyjmutý; používá **oddělený školní device ledger**, aby správce školy nikdy nemanipuloval s osobní historií zařízení mimo organizaci;
- školní účet má limit **5 současně aktivních důvěryhodných zařízení** a **10 skutečně nových zařízení za klouzavých 30 dní**; vrácení přesně stejného známého tokenu po běžné self-service revokaci není nové zařízení;
- interní Syllonaut admin zůstává z device limitu vyjmutý; běžný owner/admin/teacher organizace používá stejnou školní 5/10 politiku;
- uživatel vidí vlastní aktivní zařízení, rolling 30-day usage a může odebrat starší zařízení; UI explicitně uvádí, že se neukládá IP, User-Agent, poloha ani browser/hardware fingerprint;
- owner/admin školy vidí u každého aktivního člena počet aktivních zařízení a počet nových zařízení za 30 dní a může ne-owner členovi **resetovat aktivní zařízení**;
- admin reset nemaže 30denní historii; aktivní tokeny dostanou `admin_revoked_at` a stejný token se nesmí znovu aktivovat. Browser dostane nový náhodný HttpOnly token a ten se započítá jako nové zařízení;
- sjednocený serverový gate chrání stejné placené operace jako individuální 3/5 politika: AI generování/revize, start live session, worksheet export, placené lesson/folder operace a browser-driven grading/regrade;
- po produkčním cutoveru `create_live_session_server` a `requeue_response_evaluation_server` používají DB validator `private.trusted_device_hash_valid`, takže school device policy není jen UI/Next.js ochrana;
- private ledger ani service RPC nejsou dostupné `authenticated` klientovi; device token je stále pouze náhodný 256bit HttpOnly token a v DB se ukládá jen SHA-256 hash;
- regresní kontrakt: `scripts/verify-organization-member-devices.mjs` + aktualizovaný `scripts/verify-trusted-devices.mjs`.

### Trusted-device write-boundary hardening 0.9.53 — 2026-09-20

- založení nové live session používá service-role-only RPC a DB-authoritativně načítá snapshot vlastní lekce;
- u individuálních Teacher / Teacher Pro DB před vytvořením session ověří, že serverem předaný hash odpovídá aktivnímu nerevokovanému trusted-device tokenu;
- přímý authenticated `INSERT` do `sessions` je po přepnutí aplikace odebraný; běžné řízení už spuštěné hodiny zůstalo beze změny, aby se před ostrým testem nezasahovalo do live baseline;
- browser-driven AI grading vyžaduje trusted device a ruční regrade navíc používá server-only trusted-device RPC; starý přímo volatelný regrade RPC už authenticated role spustit nemůže;
- generování a AI revize zůstávají na stávajících server-only kvótových RPC a server-side trusted-device gate, takže tato změna jejich funkční cestu nepřestavuje;
- regresní check `scripts/verify-trusted-devices.mjs` hlídá jak serverové route, tak DB migrace a odebrání starých přímých cest.

### Billing-anchored individuální AI kvóty 0.9.61 — 2026-09-20

- Teacher / Teacher Pro už nepočítají AI lesson/revision kvótu podle UTC kalendářního měsíce;
- monthly subscription používá přímo Stripe `current_period_start` → `current_period_end`;
- annual subscription má stejné měsíční marketingové limity, ale jednotlivá měsíční quota windows se odvozují vždy od původního ročního anchoru (`anchor + N měsíců`), takže nákup těsně před 1. dnem měsíce nedá druhou plnou kvótu po několika hodinách;
- annual výpočet je anchor-stable i pro konce měsíců (např. 31. 1. → 28. 2. → 31. 3.), nevzniká postupný drift zkráceného únorového data;
- Free individuální kvóty, Free import quota/device budget a Team/School/Campus shared AI pool zůstávají záměrně na UTC kalendářním měsíci;
- AI grading safety budget zůstává samostatný interní UTC-calendar cost ceiling; tato změna se týká marketingových lesson/revision kvót;
- placený profil bez aktuální autoritativní LIVE Stripe period informace **failuje uzavřeně** (`paid_quota_period_unavailable/out_of_range`) místo fallbacku na kalendářní měsíc;
- serverové `reserve_lesson_generation_server`, `reserve_revision_operation_server` i `get_ai_quota` používají jediný private helper `individual_ai_quota_window`;
- nepoužívané authenticated compatibility wrappery `reserve_lesson_generation()` a `reserve_revision_operation(text)` jsou odebrané klientské cestě; nákladová AI reservation je pouze service-role server-authoritative;
- regresní kontrakt: `scripts/verify-billing-anchored-ai-quotas.mjs`.

### AI quota completion boundary 0.9.63 — 2026-09-20

- Produkční audit potvrdil praktický bypass: `public.finish_generation_request(...)` byl `SECURITY DEFINER` a přímo spustitelný rolí `authenticated`. Uživatel mohl po serverové rezervaci vlastní `pending` request označit jako `failed`, zatímco placený AI call dál běžel; pozdější legitimní `succeeded` completion pak kvůli podmínce `status='pending'` nic nezměnil.
- Dopad se týkal generování nové lekce i AI revizí; u Free mohl předčasný `failed` současně uvolnit i device-budget reservation.
- Nový `finish_generation_request_server(p_user_id,...)` je dostupný pouze `service_role`, explicitně váže completion na serverem známé `userId` a zachovává atomické dokončení Free device-budget reservation.
- Původní `finish_generation_request(...)` je odebraný rolím `public`, `anon`, `authenticated` i `service_role`; přímé klientské completion cesty jsou tím fail-closed.
- `/api/generate`, `/api/revise` a `/api/revise-block` používají pro success i error cleanup pouze admin klienta a nový serverový RPC.
- Před změnou prošel rollback test proti produkčnímu schématu; regresní kontrakt: `scripts/verify-generation-completion-boundary.mjs`.
- **Produkční acceptance 2026-09-20: PASS.** PR #205 je na `main`, produkční Vercel deploy je zelený a Supabase eviduje migraci jako `20260920115314_lock_generation_completion_server_side`. Ostrý rollback abuse test potvrdil, že `authenticated` nemůže spustit ani legacy ani nový completion RPC, zatímco `service_role` dokáže korektně dokončit `pending → succeeded`; security advisor už `finish_generation_request` neuvádí mezi authenticated `SECURITY DEFINER` funkcemi.

### Organization payment-loss AI pause 0.9.62 — 2026-09-20

- Team / School / Campus mají samostatný server-authoritative payment-loss stav pro kartový billing: `past_due`, otevřený/prohraný dispute a full refund zastavují **nové AI generování, AI revize a AI grading**, ale samy o sobě neznepřístupní správu školy, uložené lekce ani živou výuku;
- kartové `invoice.payment_failed` už nepřepíná celou organizaci do licence-wide `past_due`; organizace zůstává `active`, nastaví se `past_due_at` a AI je okamžitě pozastavená. Stávající lifecycle po **14 dnech** bez nápravy přejde do `suspended`, což zůstává tvrdý licenční stav;
- `expire_organization_licenses()` během této 14denní card-payment grace aktivní organizaci neexpiruje; po grace ji autoritativně řeší `suspend_overdue_organizations(14)`;
- školní Stripe `invoice.paid` mapuje skutečné `InvoicePayment` / PaymentIntent částky, měnu a billing reason. Součet mapovaných paymentů musí souhlasit s `invoice.amount_paid`;
- open dispute pozastaví AI okamžitě; won / funds reinstated lock uvolní. Lost dispute zůstává zamčený, dokud pozdější potvrzené school subscription platby ve stejné měně kumulativně nepokryjí ztracenou částku;
- částečný refund AI nezamyká; full refund ano. Refund a dispute nad stejným původním PaymentIntentem se při recovery **nedvojí**;
- malá prorata nebo jiná drobná následná platba neodemkne vyšší refund/chargeback; recovery je amount-aware stejně jako u individuálních účtů;
- DB write-boundary `generation_requests`, automatický grading worker, grading safety-budget i ruční regrade používají společný effective personal/organization billing gate;
- UI rozlišuje osobní a školní payment pause. Správce školy dostane odkaz do `/school`; běžný člen vidí, že platbu musí vyřešit správce. Hotový obsah a live výuka zůstávají při AI-only locku dostupné;
- bankovní faktury se touto grace politikou **nemění**: před první potvrzenou platbou je organizace `awaiting_payment`; nové období se aktivuje až po potvrzené úhradě a neuhrazená obnova po konci zaplacené licence zůstává hard-expiry;
- interní `Testovací škola` je z organization payment pause vyňatá; ochrana je určena komerčním organizacím;
- regresní kontrakt: `scripts/verify-organization-ai-billing-pause.mjs` + rozšířený Stripe webhook verifier.
- **Produkční acceptance 2026-09-20: PASS.** PR #201 je na `main`, produkční Vercel deploy je zelený a Supabase eviduje schéma jako `20260920112300_add_organization_ai_billing_pause`. Předprodukční i produkční rollback abuse suite prošly včetně 14denní grace, amount-aware dispute/refund recovery, replay ochrany, PaymentIntent de-duplikace, bankovního hard-expiry a service-role-only sync RPC. Security advisor nehlásí nové veřejně/spojeným uživatelům dostupné sync RPC; nové private ledger tabulky jsou záměrně deny-all. Performance advisor eviduje pouze neblokující covering-index follow-up pro jejich `order_id` FK.

### Tarifní abuse hardening 0.9.52

- Free účet má vlastní měsíční kvóty **3 AI lekce / 10 AI úprav / 2 importy nebo kopie**.
- Nad nimi je privacy-minimal společný budget zařízení napříč všemi Free účty na stejném browserovém zařízení: **6 AI lekcí / 20 AI úprav / 4 importy nebo kopie za klouzavých 30 dní**; limit je v DB odvozen jako 2× aktuální Free plán.
- Zařízení je identifikované pouze SHA-256 hashem náhodného 256bitového HttpOnly tokenu; Syllonaut pro tuto ochranu neukládá IP, User-Agent, polohu ani browser/hardware fingerprint.
- Free účet lze dál normálně registrovat a přihlásit i po vyčerpání device budgetu; blokované jsou pouze nákladové Free operace. Neúspěšná operace rezervaci uvolní.
- Free account + device quota se rezervují atomicky v jedné databázové transakci. Device hash přijímá pouze service-role serverová cesta; staré přímo volatelné Free quota RPC failují, aby klient nemohl hash zařízení podvrhnout.
- Teacher / Teacher Pro mají samostatný anti-sharing model: max. **3 současně důvěryhodná zařízení** a **5 skutečně nových zařízení za klouzavých 30 dní**. Aktivní školní člen používá oddělenou organization-device politiku **5 aktivních / 10 nových za 30 dní**; interní Syllonaut admin je vyjmutý.
- Organizace mají současně seat cap podle tarifu a per-billing-period limit unikátních lidí `seat_limit + max(1, ceil(10 %))`; návrat stejného člena se nepočítá znovu a čekající pozvánka pro nového člověka kapacitu dočasně rezervuje.
- School/Campus školní obsah nese immutable `organization_origin_id`; po zániku členství zůstává uložený, ale přejde do read-only licenčního zámku a znovu se odemkne po obnovení přístupu.
- AI grading má interní safety budget nezávislý na marketingových kvótách: Teacher Pro **$2 / 150 pokusů**, School **$10 / 700**, Campus **$25 / 1 750** za UTC kalendářní měsíc; při vyčerpání se AI request vůbec neodešle a hodnocení přejde na ruční kontrolu.

### Teacher Pro AI kapacita 0.9.51 — 2026-09-20

Teacher Pro byl po přepočtu unit economics rozšířen z **20 AI lekcí + 25 AI úprav** na **25 AI lekcí + 40 AI úprav měsíčně** při nezměněné ceně 329 Kč / €13.99 / $14.99 měsíčně nebo 3 290 Kč / €139.90 / $149 ročně. Při plném vyčerpání nové tvorby a úprav vychází podle dosavadních průměrných produkčních nákladů AI cost na cca **$6.41/měsíc**; se současným interním grading safety budgetem $2 je worst-case cca **$8.41/měsíc**, tedy přibližně **56 % měsíčního USD tarifu** nebo **68 % efektivního měsíčního výnosu ročního USD tarifu**. Změna je záměrně obchodní kompromis: Teacher Pro má působit výrazně štědřeji než Teacher a podporovat USP opakovaně použitelných live lekcí, přičemž hotové lekce lze dál učit bez čerpání AI kvóty.


### Anti-abuse audit — zdroj pravdy a pokračovací protokol

Tahle sekce je handoff pro další anti-abuse chat. **`PROJECT.md` je orientační souhrn, nikoli důkaz, že ochrana opravdu funguje.** Při každém dalším kole je nutné nejdřív načíst aktuální `main`, ověřit relevantní API/RPC/triggery/migrace a podle potřeby produkční DB stav v Supabase. Teprve potom klasifikovat scénář jako `IMPLEMENTED`, `PARTIAL` nebo `MISSING`.

Již známé a produkčně zavedené třídy ochrany, které se nemají znovu navrhovat bez nalezení konkrétního bypassu:

- **Free account quota** — 3 AI lekce / 10 AI úprav / 2 importy nebo kopie za měsíc;
- **Free lesson-family reuse** — jedna skutečná live výuka na logickou rodinu lekce; kopie/importy zachovávají immutable `reuse_family_id`, takže duplikace neresetuje oprávnění;
- **Free session lifetime** — první účastník spustí čas; nové joiny max. 120 minut, hard lifetime 6 hodin, write-boundary enforcement + cron, ukončenou session nelze znovu otevřít;
- **Free multi-account farming** — shared privacy-minimal device budget 6 AI lekcí / 20 AI úprav / 4 importy nebo kopie za klouzavých 30 dní napříč Free účty na jednom zařízení; limity se odvozují jako 2× aktuální Free plán a device hash je server-authoritative;
- **Teacher / Teacher Pro account sharing** — max. 3 současně důvěryhodná zařízení a max. 5 skutečně nových zařízení za klouzavých 30 dní; self-service revokace, účet není locknutý mimo správu zařízení; od 0.9.53 jsou vytvoření nové live session a ruční AI regrade navíc DB/server write-boundary chráněné a staré přímé authenticated cesty jsou uzamčené;
- **Organization member account sharing** — od 0.9.59 má každý aktivní školní člen oddělený private device ledger s limitem 5 aktivních / 10 nových za klouzavých 30 dní, self-service správu a owner/admin reset aktivních zařízení bez mazání rolling historie; resetované tokeny se nesmějí znovu aktivovat a DB live/regrade boundary používá sjednocený validator;
- **Organization seat sharing / rotation** — současný seat cap + limit unikátních lidí za billing period `seat_limit + max(1, ceil(10 %))`, čekající pozvánka rezervuje kapacitu;
- **School/Campus content extraction** — školní knihovní obsah a jeho potomci nesou immutable `organization_origin_id`, nelze ho veřejně sdílet přes lesson share a po ztrátě členství se uzamkne read-only licenčním zámkem;
- **Individual payment failure / chargeback / full refund** — `past_due`, otevřený payment dispute i plně refundovaná subscription platba zachovávají uložené placené funkce a live teaching, ale zastavují nové AI generování/revize/grading. Částečný refund nic nezamyká. `past_due` se odemkne po potvrzení platby; vyhraný dispute po potvrzení výsledku/funds reinstated; prohraný dispute a full-refund lock až poté, co pozdější potvrzené subscription platby kumulativně pokryjí dosud neuhrazenou ztrátu;
- **Individual paid AI quota window** — Teacher/Teacher Pro lesson+revision usage se od 0.9.61 počítá podle LIVE Stripe billing anchoru; monthly = přesná subscription perioda, annual = měsíční podokna od annual anchoru. Free a organization pool zůstávají calendar-based;
- **Organization payment failure / chargeback / full refund** — od 0.9.62 kartové `past_due`, open/lost dispute a full refund zastavují pouze nové nákladové školní AI operace; 14denní card grace zachová administraci/hotový obsah/live, potom následuje hard `suspended`. Dispute/refund recovery je amount-aware a PaymentIntent-deduplicated; bankovní faktury zůstávají aktivované až po potvrzené úhradě;
- **AI grading cost abuse** — atomický interní safety budget a count ceiling, rezervace před AI callem, failed reservation se uvolní, browser i server-worker cesta jsou chráněné.

### Otevřený anti-abuse backlog po 0.9.57 — handoff pro další kola

Následující scénáře jsou po auditu 2026-09-20 považované za významnější zbytková ekonomická / tarifní rizika. Při pokračování se musí znovu ověřit aktuální `main` a produkční DB; tato klasifikace není náhradou skutečného testu.

1. **Recovery-payment integrity po refundu / chargebacku — IMPLEMENTED 0.9.58.** Potvrzené subscription platby se účtují amount-aware po jednotlivých PaymentIntentech a refund/dispute lock se uvolní až při kumulativním pokrytí celkové otevřené ztráty v dané měně. Změna tarifu je během `refund` / `dispute` locku serverově zakázaná. Starý amount-less payment-sync RPC je po cutoveru uzamčený.
2. **Sdílení jednoho školního uživatelského účtu mezi více reálnými učiteli — IMPLEMENTED 0.9.60.** 0.9.59 zavedla oddělenou organization-device politiku 5 aktivních / 10 nových zařízení za klouzavých 30 dní, self-service správu a owner/admin reset bez mazání rolling historie. 0.9.60 opravuje produkční DB drift a znovu vynucuje organization-aware validator i v service-role-only live/regrade boundary.
3. **Placené AI kvóty jsou ukotvené ke kalendářnímu měsíci místo billing period — IMPLEMENTED 0.9.61.** Teacher/Teacher Pro lesson+revision quota používá autoritativní LIVE Stripe periodu; monthly přímo `current_period_start/end`, annual měsíční subwindow od annual anchoru. Free a organization pool zůstávají calendar-based; chybějící placená perioda failuje uzavřeně.
4. **Free device budget lze privacy-minimal modelu obejít smazáním device cookie + novými účty — KNOWN RESIDUAL.** Robustnější prevence by vyžadovala stabilnější cross-cookie signál. Bez dalšího rozhodnutí nezavádět browser/hardware fingerprinting. Pokud se riziko stane významné, preferovat krátkodobý privacy-preserving edge rate-limit před fingerprintingem a předem posoudit GDPR/privacy dopady a false positives.
5. **Organization refund/dispute/payment-failure ochrana před veřejným školním billingem — IMPLEMENTED 0.9.62.** Card `past_due` používá AI-only 14denní grace, dispute/full refund mají amount-aware recovery z přesných Stripe PaymentIntentů a AI generation/revision/grading používají jednotný organization-aware DB/server gate. Hard licence stavy a bankovní invoice workflow zůstávají oddělené.
6. **Předčasné klientské uvolnění AI kvóty přes `finish_generation_request` — IMPLEMENTED 0.9.63.** Completion rezervace je service-role only; klient už nemůže vlastní běžící request označit jako `failed` a nechat server dokončit placenou AI operaci mimo kvótu. Generování i obě revizní cesty používají jednotný serverový completion RPC.

Body **1, 2, 3, 5 a 6 jsou implementované**. Bod 4 zůstává vědomé privacy/abuse trade-off riziko a bez dat o skutečné ztrátě se nemá řešit fingerprintingem.

Pravidla dalšího anti-abuse kola:

1. Nejdřív vytvořit nové realistické scénáře zneužití **tarifní politiky a ekonomiky produktu** napříč Free, Teacher, Teacher Pro, Team, School a Campus. Zaměřit se na obcházení kvót, sdílení účtů, rotaci identit, kopírování/licencování obsahu, souběh, downgrade/upgrade, trial/payment lifecycle, veřejné share/import flow, AI grading a rozdíly browser/API/RPC cest.
2. U každého scénáře před návrhem řešení ověřit skutečný projekt: aktuální `main`, relevantní Next.js route, Supabase funkce/triggery/RLS/granty/migrace, billing entitlementy a podle potřeby produkční data. **Neodvozovat stav pouze z názvu migrace nebo z tohoto markdownu.**
3. Zřetelně uvést, zda je scénář už chráněný, částečně chráněný, nebo skutečně otevřený. Pokud ochrana existuje, pokusit se najít praktický bypass; bez bypassu ji neimplementovat znovu.
4. Otevřené problémy řešit postupně. Pro každý významný problém nejdřív navrhnout několik variant se zásahy do UX, privacy, ekonomiky a technické složitosti a označit doporučenou variantu. Implementaci významné produktové politiky provést až po schválení vlastníkem projektu.
5. Po schválení už nezůstávat u návrhu: změnu skutečně implementovat podle projektových pravidel, po malých krocích a s průběžnými heartbeat updates.
6. Enforcement preferovat **serverově / databázově a atomicky**. Klientský stav ani klientem dodaný device/account identifikátor nesmí být autoritou pro kvótu nebo entitlement.
7. Preferovat privacy-minimal řešení. Bez explicitní potřeby nezavádět IP-based identity, browser/hardware fingerprinting ani další invazivní identifikátory. Pokud ochrana může způsobit false positive, zachovat cestu k nápravě a neblokovat uživateli správu účtu nebo bezpečný cleanup.
8. Každou DB změnu nejdřív dry-run / rollback test, potom relevantní abuse scénář v rollbackované transakci. Po DDL spustit Supabase security/performance advisors a posoudit nové nálezy věcně, ne mechanicky.
9. Každou aplikační změnu ověřit přes existující `npm run check`, relevantní regresní verifier, Vercel Preview, Security headers a Accessibility/axe. Produkci měnit až po zeleném Preview/CI a merge do `main`.
10. Po dokončení aktualizovat `PROJECT.md`, případně přidat nový regression verifier. Dokumentační-only změna sama o sobě neposouvá verzi; funkční produkční anti-abuse změna se verzováním řídí obecnými pravidly projektu.

Školní/týmové plány:

- **Team** — až 10 učitelů; 40 AI lekcí + 80 AI úprav společně; lekce v libovolném jazyce; 890 Kč / €37.99 / $39.99 měsíčně nebo 8 900 Kč / €379.90 / $399 ročně;
- **School** — až 30 učitelů; 120 AI lekcí + 240 AI úprav společně; lekce v libovolném jazyce; 2 390 Kč / €99.99 / $109.99 měsíčně nebo 23 900 Kč / €999.90 / $1,099 ročně; **AI grading + složky/podsložky**;
- **Campus** — až 100 učitelů; 300 AI lekcí + 600 AI úprav společně; lekce v libovolném jazyce; 5 990 Kč / €249.99 / $269.99 měsíčně nebo 59 900 Kč / €2,499.90 / $2,699 ročně; **AI grading + složky/podsložky**.

Team zůstává bez těchto dvou premium benefitů; School a Campus je nově obsahují.

Organizační vrstva pro školní tarify je implementovaná: organizations, membership/role model, pozvánky, seat enforcement, sdílená knihovna pro School/Campus, billing/workflow základ a licenční ochrany obsahu. Team / School / Campus zatím nejsou veřejně samoobslužně prodejné přes LIVE Checkout; jejich provisioning a billing se nesmí vydávat za veřejně spuštěný self-service prodej.

### Školní workflow V1 / V1.1 — implementace a acceptance — 2026-09-20

**Stav: V1 organizační workflow je produkčně nasazené a hlavní funkční acceptance je COMPLETE / PASS. V1.1 školní billing a fakturace jsou produkčně nasazené a klíčová fakturační cesta je E2E PASS; veřejný self-service nákup Team / School / Campus zůstává záměrně vypnutý do finálního acceptance/sign-off.**

Referenční interní organizace:
- **Testovací škola** — plán Campus, `active`, `is_internal_test=true`;
- vlastník je interní Syllonaut admin; interní owner se nezapočítává do komerčních míst, unique rotation ani společného školního AI poolu;
- slouží pro dlouhodobé testování membership/role/library/device funkcí bez komerční fakturace.

Aktuální školní tarifní politika:
- Team: 10 aktivních míst, 40 AI lekcí + 80 AI úprav / měsíc společně;
- School: 30 aktivních míst, 120 AI lekcí + 240 AI úprav / měsíc společně;
- Campus: 100 aktivních míst, 300 AI lekcí + 600 AI úprav / měsíc společně;
- rotace členů je omezená per billing period na `seat_limit + max(1, ceil(10 %))` unikátních lidí; Campus používá **100 aktivních míst / 110 unikátních lidí v období**;
- návrat stejného člověka v témže období unique limit nezvyšuje;
- čekající pozvánka pro nového člověka rezervuje místo v replacement budgetu;
- interní admin je z komerční seat/AI účetní logiky vyňatý pouze jako interní testovací výjimka.

#### V1 — produkčně ověřené / uzavřené scénáře

- pozvánka e-mailem, login a automatické přijetí invite jsou PASS;
- role Učitel / Administrátor se správně promítají do viditelnosti školních administračních funkcí a změna role funguje oběma směry;
- owner/admin vidí členy a role, běžný učitel nevidí privilegované části;
- společný AI pool je serverově sdílený; usage běžného člena se započítává organizaci, interní owner/admin testovací školy ne;
- odebrání člena uvolní aktivní místo a `Moje škola` po zániku členství zmizí;
- návrat stejného uživatele v témže období znovu nezvyšuje unique count a předchozí usage zůstává zachovaný;
- bulk CSV pozvánky mají preview, editaci řádků/rolí, validaci invalidních a duplicitních řádků, skutečné odeslání a zrušení pending pozvánky;
- pending invitation rezervuje replacement budget a zrušení rezervaci uvolní;
- seat cap a replacement cap byly ověřeny rollback testy bez vytváření stovek reálných účtů;
- entitlement lifecycle `active → past_due → suspended → reactivated → expired/cancelled` byl ověřen rollback testy;
- owner/admin edge cases jsou PASS: dvojí přijetí invite, reinvite aktivního člena, owner guardy, ownership transfer a účetní invariants;
- PR #177 uzavřel kritickou chybu, kdy reinvite aktivního člena mohl poškodit owner roli; produkční DB guardy jsou nasazené;
- stale-auth multi-tab problém je opraven server-authoritative identity kontrolou a původní scénář byl ručně potvrzen jako PASS.

Školní knihovna:
- School/Campus používají immutable snapshoty předaných lekcí;
- člen škole předává samostatnou kopii a osobní originál se tím nemění;
- člen si ze školní knihovny vytváří vlastní nezávislou kopii;
- subject metadata, filtr a fallback **Nezařazeno** jsou nasazené;
- při 10+ lekcích se seznam přepne do rolovacího kontejneru se sticky hlavičkou;
- provenance je immutable: importovaná školní kopie si zachovává původ organizace, nelze ji veřejně sdílet ani převést do jiné organizace jako nový školní originál;
- po ztrátě organizačního přístupu obsah přejde do read-only licenčního zámku a po návratu členství se znovu odemkne;
- tyto scénáře jsou produkčně ověřené.

#### V1.1 — objednávka, billing, fakturace a aktivace

Architektura:
- **Platební karta** používá Stripe Checkout / subscription flow;
- **Faktura / bankovní převod** už nepoužívá Stripe Hosted Invoice Page jako platební mechanismus; Syllonaut vystavuje vlastní bankovní fakturu;
- veřejný LIVE self-service gate pro školní tarify zůstává vypnutý; sandbox je dostupný jen interním adminům;
- checkout return z karty je bezpečný: klient nevěří `session_id` jako autoritě aktivace a po návratu čeká na serverově potvrzený stav organizace;
- objednávka vyžaduje oficiální název, fakturační e-mail, zemi, ulici, město a PSČ; IČO/registrační číslo a DIČ/VAT ID jsou globálně volitelné;
- legal name se v UI automaticky zrcadlí z názvu školy, dokud ho uživatel ručně nezmění.

Bankovní faktury:
- každá organizace má **stabilní vlastní variabilní symbol**; VS identifikuje organizaci, nikoli jednotlivou fakturu;
- faktura má vlastní číslo, datum vystavení, splatnost a immutable snapshot dodavatele, odběratele a bankovních údajů;
- standardní splatnost je **14 dní**;
- PDF i elektronická faktura obsahují **QR Platbu / SPD** s IBAN, částkou, měnou, VS a zprávou; QR bylo ručně ověřeno v Air Bank jako funkční;
- na české faktuře je uvedeno **Dodavatel není plátcem DPH.**; stav plátce DPH se snapshotuje pro budoucí změnu režimu;
- jazyk dokladu se při vystavení zmrazí podle fakturační země: **CZ/SK → čeština, všechny ostatní země → angličtina**;
- elektronická faktura i PDF používají stejný `documentLocale`; starší doklady bez tohoto pole používají fallback podle uložené fakturační země;
- sandbox doklad je výrazně označený **TESTOVACÍ DOKLAD — NEPLAŤTE**.

Viditelnost a oprávnění:
- owner/admin organizace vidí své faktury, číslo, částku, splatnost, stav **Zaplacená / Nezaplacená**, elektronickou verzi a PDF;
- owner/admin organizace nemůže měnit stav úhrady;
- všechny faktury všech organizací vidí pouze Syllonaut superadmin na `/admin/school-invoices`;
- jediný účet oprávněný ručně označit bankovní fakturu jako zaplacenou je superadmin `vaclav.loubek@gmail.com`, vynucený pevným `user_id`, nikoli jen e-mailem nebo běžnou rolí `admin`;
- superadmin má položku **Superadmin faktury** v hlavním účtovém menu; ostatní ji nevidí;
- přímý vstup na superadmin stránku pod jiným účtem ukáže explicitní access-boundary informaci místo matoucí 404;
- akce `Označit jako zaplacenou` je chráněná UI, API i service-role-only DB RPC.

Automatické párování bankovních plateb:
- backend je připravený na `bank_match`: **VS → organizace + přesná částka + měna → právě nezaplacená faktura**;
- matcher vyžaduje unikátní referenci bankovní transakce a je idempotentní;
- automatický matcher ignoruje sandboxové faktury a pracuje pouze s `livemode=true`;
- rollback behavior test potvrdil superadmin guard, LIVE match a ochranu před duplicitní bankovní referencí;
- **přímé automatické čtení Air Bank zatím není připojené**; adapter čeká na licencovaný open-banking provider nebo jiný bezpečný zdroj transakcí;
- ruční superadmin potvrzení je do té doby plnohodnotný fallback.

#### V1.1 — dosud úspěšně provedená acceptance

- sandbox Stripe diagnostika bezpečně odhalila `more_permissions_required`; restricted key byl opraven a Stripe customer/invoice test následně fungoval;
- původní Stripe-hosted invoice test byl úspěšně zaplacen testovací kartou a potvrdil webhookovou aktivaci `order=paid → organization=active`; tento Hosted Invoice flow už není finální bankovní fakturační mechanismus;
- bankovní sandbox faktura **SY-2026-000003**, Team / měsíčně / 890 Kč, byla úspěšně vystavena z aplikace;
- elektronická faktura, PDF, QR Platba, bankovní údaje, VS, splatnost a text o neplátci DPH byly ručně ověřeny;
- superadmin ručně označil **SY-2026-000003** jako zaplacenou;
- DB ověřila `organization=active`, `order=paid`, období **2026-09-20 → 2026-10-20** a audit `payment_confirmation_source=superadmin_manual` s přesným superadmin user ID;
- localized `/cs/school` a `/en/school` routy včetně school subroutů správně přesměrují na kanonické aplikační routy se zachovaným query stringem a locale;
- školní fakturační env konfigurace je produkčně nastavena a deploy je zelený;
- PR #179: bezpečný Checkout return; PR #180: povinné fakturační údaje; PR #181: sandbox payment diagnostika;
- PR #190: vlastní bankovní faktury, QR, superadmin potvrzení a bank-match základ;
- PR #194: localized school routing fix; PR #195: neplátce DPH; PR #196: superadmin menu/access boundary; PR #207: automatický jazyk faktury podle billing country.

#### Zbývající acceptance / cleanup před veřejným Team / School / Campus self-service

1. dokončit **kartový** V1.1 E2E přes skutečný Stripe sandbox Checkout z finálního školního UI; serverové lifecycle/rollback testy jsou PASS, ale finální user-facing card path má dostat krátký acceptance;
2. ověřit finální pohled ownera po zaplacení bankovní faktury: active organizace, faktura Zaplacená, PDF/elektronická verze dostupná a bez možnosti ownera měnit stav;
3. ověřit nový **renewal přes bankovní fakturu** z reálného UI; backend lifecycle už je otestovaný, není třeba opakovat membership scénáře;
4. podle potřeby otestovat Stripe subscription cancel-at-period-end / restore na sandbox school card subscription jako externí-provider scénář;
5. rozhodnout, zda je automatické napojení bankovních transakcí přes open-banking provider podmínkou veřejného launch; ruční superadmin potvrzení je funkční fallback;
6. po dokončení acceptance odstranit dočasnou sandbox organizaci **Test School**;
7. testovací účet `loubek@icloud.com` je dočasně app-level `admin` pouze kvůli sandbox školnímu billingu; po testech ho vrátit na běžný `user/free` přes autoritativní entitlement recompute a ověřit Free baseline;
8. po cleanupu vrátit tento účet do interní **Testovací školy**; protože už byl v aktuálním období aktivovaný, návrat nesmí zvýšit unique count;
9. teprve po finálním sign-off rozhodnout o zapnutí veřejného self-service školního billingu. Do té doby `STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED` nezapínat.
### Server-authoritative profil a entitlementy

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`.

Free default:

- `role=user`
- `monthly_lesson_limit=3`
- `monthly_revision_limit=10`
- `ai_grading_enabled=false`
- `lesson_folders_enabled=false`
- `multilingual_lessons_enabled=false`

Admin:

- `role=admin`
- lesson/revision limity `NULL`
- AI grading entitlement automaticky
- folder entitlement automaticky
- multilingual lesson entitlement automaticky

Od 0.8.04 je individuální billing zadrátovaný do DB provisioning modelu:

- `profiles.active_plan_code` nese aplikovaný základní plán;
- `billing_plans` definuje server-authoritative entitlementy pro `free`, `teacher`, `teacher_pro` a interní `admin`, včetně `multilingual_lessons_enabled`;
- `billing_prices` mapuje Stripe Price ID → plán / měnu / období; sandbox i live mají oddělené CZK/EUR/USD mappings pro Teacher a Teacher Pro;
- `billing_customers`, `billing_subscriptions` a `billing_events` drží provider stav a idempotenci;
- `manual_entitlement_overrides` zachovává explicitní beta/admin výjimky nad základním plánem;
- service-role-only RPC `sync_stripe_subscription_event` provádí atomický sync;
- sandbox (`livemode=false`) se ukládá, ale nikdy nesmí změnit produkční entitlement v `profiles`;
- základní placené entitlementy se počítají z live subscriptions ve stavech `trialing`, `active` nebo `past_due`; `unpaid`, `canceled`, `incomplete`, `incomplete_expired` a `paused` přístup neudělují. U individuálního `past_due` však od 0.9.54 zůstávají placené nenákladové funkce dostupné a pouze nové variabilní AI náklady jsou do potvrzení platby serverově pozastavené;
- admin zůstává vždy neomezený a ruční entitlement override se při změně tarifu zachovává.

Webhook HTTP endpoint `/api/billing/stripe/webhook` je od 0.8.05 implementovaný. Ověřuje raw request body přes Stripe HMAC SHA-256 s pětiminutovou tolerancí, odděluje test/live signing secret, u subscription lifecycle eventů vyžaduje serverem zapsané `syllonaut_user_id` + `syllonaut_billing_country` metadata a kontroluje invariant `CZ→CZK+standard Stripe / eurozóna→EUR+Managed Payments / ostatní→USD+Managed Payments`. Od 0.9.13 live subscription event před DB syncem navíc serverově vyhledá právě jeden dokončený Checkout Session podle subscription ID, ověří Customer/user vazbu a skutečnou `customer_details.address.country`; entitlement se fail-closed neprovisionuje, pokud skutečná země neodpovídá měně a Merchant-of-Record větvi. Do DB se ukládá skutečná Checkout country, nikoli pouze předvolená metadata. `invoice.payment_failed` a `invoice.paid` zůstávají pouze audit/recovery signál. Test-clock subscription eventy se dál ignorují. Production Vercel má oddělené test/live Stripe server-only credentials. LIVE Checkout je veřejně aktivní pro Teacher / Teacher Pro; Team / School / Campus zůstávají mimo veřejný self-service prodej.


### Stripe sandbox — dokončený acceptance stav 2026-09-19

Sandbox billing lifecycle je považovaný za **end-to-end ověřený** pro individuální Teacher / Teacher Pro:

- český Checkout: **199 Kč / měsíc**, standardní Stripe, `managed_payments=false`, bez Stripe Tax odpovědnosti;
- zahraniční eurozóna: **€7.99 / měsíc** + lokální DPH, Managed Payments; německý test reálně účtoval €9.51 při 19% DPH a Stripe byl daňový/merchant-of-record issuer;
- Checkout používá fakturační zemi pro routing `CZ→CZK+standard Stripe / eurozóna→EUR+Managed Payments / ostatní→USD+Managed Payments`;
- první nákup vytvoří Stripe Customer, další Checkout Sessions stejného uživatele znovu používají uložené `customer` ID;
- odhalený sandbox problém s duplicitními Customer objekty byl opraven v 0.8.07;
- Stripe nepovoluje jednomu Customerovi současně aktivní subscriptions v různých měnách; změna země/měny proto musí být řízený migration flow, ne paralelní nový Checkout;
- cancellation at period end i její odvolání prošly webhookem a DB;
- Teacher ↔ Teacher Pro upgrade/downgrade prošel a následná nenulová proratační platba byla úspěšně vybrána;
- Customer Portal je v sandboxu nakonfigurovaný pro platební metody, fakturační údaje, historii faktur a cancellation na konci období včetně důvodu; plan switching / quantity changes zůstávají vypnuté;
- restricted sandbox key používá minimálně ověřená oprávnění `Checkout Sessions: Write`, `Customers: Read`, `Customer Portal: Write`;
- Stripe event destination posílá subscription lifecycle + `invoice.payment_failed` + `invoice.paid`;
- Billing Simulation ověřila skutečný renewal failure: karta `…0341` → subscription `past_due` + `invoice.payment_failed`;
- následný retry na funkční kartě → invoice `paid`, subscription zpět `active`, `invoice.paid`;
- simulation subscription se díky 0.8.11 nikdy nezapsala do `billing_subscriptions`; payment eventy zůstaly pouze jako auditní stopa;
- sandbox cleanup dokončen: osiřelá CZK test subscription byla zrušena a Simulation ukončena; aktivní zůstává pouze referenční Teacher/EUR Managed Payments subscription;
- sandbox subscription nikdy nemění produkční entitlementy v `profiles`.

**LIVE billing acceptance je dokončený a od 0.9.18 jsou individuální plány veřejně spuštěné.** Ověřena byla skutečná CZ platba 199 Kč přes standard Stripe, actual billing-country guard, live Customer/subscription provisioning, admin entitlement preservation, Customer Portal, ne-admin Free → Teacher → Free a cancellation webhook. Teacher dostal přesně 25 lekcí, 100 AI úprav a multilingual entitlement; AI grading a složky zůstaly vypnuté. Obě acceptance subscription byly zrušené a oba plné refundy 199 Kč Stripe evidoval jako `succeeded`. Veřejný Checkout je dostupný pouze pro Teacher / Teacher Pro; Team / School / Campus zůstávají deaktivované. Emergency rollback je možný serverovým `STRIPE_LIVE_BILLING_PUBLIC_ENABLED=false`.

Produkční launch 0.9.18:

- release commit na `main`: `43a64db02fd5be21313c1fc59ed7ed8c4c88fcea` — **Syllonaut 0.9.18 — launch public Teacher billing**;
- před merge prošel Vercel Preview, `npm run check`, security headers i accessibility; následný production deployment byl zelený;
- veřejný Ceník standardně používá LIVE billing flow, nikoli sandbox/acceptance režim;
- Teacher a Teacher Pro mají aktivní LIVE CTA pro měsíční i roční variantu v CZK/EUR/USD podle regionální routing logiky;
- nepřihlášený návštěvník je veden k přihlášení/registraci před nákupem; přihlášený běžný uživatel pokračuje do skutečného Stripe Checkout;
- aktivní placený uživatel má na Ceníku přístup do Stripe Customer Portalu pro platební metodu, billing údaje, faktury a cancellation;
- GA4 produkční funnel rozlišuje `pricing_live` / `stripe_live` od sandboxu a admin acceptance;
- Team / School / Campus zůstávají pouze prezentační a nelze je přes LIVE Checkout koupit;
- serverový launch gate zůstává zachovaný jako emergency rollback: explicitní `STRIPE_LIVE_BILLING_PUBLIC_ENABLED=false` veřejné LIVE nákupy vypne.

### AI grading entitlement

Produktové pravidlo:

- Free: deterministic quiz + manual grading otevřených/týmových odpovědí;
- Teacher: stejně bez placeného AI gradingu;
- Teacher Pro: AI grading povolen;
- admin se chová jako Teacher Pro;
- UI ani název plánu není bezpečnostní hranice.

Fail-closed ochrana je v submit/queue, background processoru, `/grade` endpointu i DB claimu.

### Lesson folders entitlement

- Free a Teacher: bez složek;
- Teacher Pro: `lesson_folders_enabled=true`;
- admin: entitlement automaticky;
- server/RLS/DB write boundary vynucují oprávnění.

### Multilingual lesson entitlement

- Free: `multilingual_lessons_enabled=false`; nová lekce se vždy generuje v aktivním UI locale;
- Teacher a Teacher Pro: `multilingual_lessons_enabled=true`;
- admin: entitlement automaticky;
- Team / School / Campus mají multilingual benefit serverově napojený přes implementovanou organizační vrstvu; veřejný self-service školní billing zatím zůstává vypnutý;
- UI pouze zpřístupňuje volbu, ale bezpečnostní hranice je na serveru;
- `/api/generate` pro Free přepíše jazyk generování na serverově odvozený UI locale;
- `/api/revise` a `/api/revise-block` načítají stejný entitlement a pro Free předávají AI vrstvě `allowLanguageChange=false`;
- AI vrstva při Free revizi přidává závaznou systémovou jazykovou politiku; požadavky na změnu hlavního jazyka ignoruje, ale cizojazyčný obsah jako učivo ponechává možný;
- revize celé lekce navíc fail-closed kontroluje, že se při language locku nezmění uložený BCP-47 `language` tag;
- manual entitlement override podporuje `multilingual_lessons_enabled`;
- Free uživatel u uložené lekce vidí výrazný informační panel s vysvětlením jazykového omezení a odkazem na Ceník; panel zároveň výslovně potvrzuje, že cizojazyčné slovní zásoby, dialogy a překladové úlohy jako obsah zůstávají povolené;
- po úspěšné AI revizi celé lekce i jednotlivé aktivity Free uživatel dostane kontextovou stavovou zprávu, že hlavní jazyk zůstává uzamčený a případná překladová/jazyková část pokynu nebyla provedena.

## 8. Lesson workspace a knihovna

Lesson workspace má:

- automatické uložení nové AI lekce;
- `/lessons` knihovnu;
- stabilní `/lessons/<id>`;
- autosave AI změn;
- rename / duplicate / delete;
- jednokrokové Undo bez další AI kvóty;
- lokální recovery snapshot;
- ochranu před zavřením při ukládání;
- zobrazení kvóty;
- Poslední výsledky / historické sessions;
- na desktopu je levý authoring sloupec sticky, omezený výškou viewportu a má vlastní svislé scrollování; kliknutí na **Upravit blok** posune právě tento kontejner na editor vybrané aktivity a nastaví fokus do pole s pokynem pro AI úpravu; na mobilu se používá běžný stránkový scroll a celé chování respektuje `prefers-reduced-motion`;
- po úspěšné AI revizi se v učitelském náhledu automaticky porovná stav bloků před/po změně a nově přidané nebo upravené aktivity dostanou fialový nádech + textový štítek **Nové / upravené**; poslední sada zvýraznění se drží v session storage do další úspěšné revize a při Undo se smaže.

### Prémiové složky a podsložky

Pro Teacher Pro/admin:

- root složky + jedna úroveň podsložek, max. dvě úrovně;
- create / rename / delete;
- lesson přesun do složky i zpět mimo složky;
- lesson vytvořená z aktivní složky se do ní může rovnou uložit;
- owner-scoped RLS/FK;
- `ON DELETE SET NULL` bezpečně vrací lessons mimo smazanou složku.

Aktuální UX přesunu po následné úpravě:

- persistentní dropdowny byly nahrazeny sdíleným **Přesunout do…** dialogem;
- přesun je dostupný v akční nabídce jednotlivé lekce;
- existuje bulk selection a hromadný přesun;
- desktop podporuje drag-and-drop lekce na složku;
- drag-and-drop není jediná cesta — stejná operace je vždy dostupná přes menu/dialog;
- z move flow lze rovnou vytvořit novou složku;
- modal má dialog semantics, keyboard focus trap a po zavření vrací focus na spouštěč.

Složky jsou osobní pro ownera; nejde zatím o sdílený školní/team filesystem.

Ukázková lekce **„Mediální mise – Jak přežít internet a neztratit důstojnost“** je seeddovaná/duplikovaná pod uživatelský účet jako běžná vlastní lesson.

## 9. Auth — stav 2026-09-18

Implementováno:

- signup e-mail + heslo;
- login/logout;
- potvrzení e-mailu;
- forgot password;
- recovery + update password;
- generická recovery odpověď bez account enumeration;
- ochrana proti open redirectu;
- password reveal;
- Cloudflare Turnstile;
- branded Resend/Supabase auth e-maily;
- scanner-safe potvrzení.

Scanner-safe flow:

`TokenHash → /auth/confirm → explicitní POST → /auth/confirm/verify → verifyOtp`

Hosted Supabase Auth hardening:

- canonical Site URL `https://www.syllonaut.com`;
- redirect allowlist přesně `https://www.syllonaut.com`;
- password minimum 8 znaků;
- Turnstile aktivní;
- Resend SMTP/domain ověřené na kořenové doméně `syllonaut.com`;
- stará Resend doména `auth.syllonaut.com` byla odstraněna;
- Supabase Custom SMTP používá sender `Syllonaut <noreply@syllonaut.com>`;
- pro Supabase SMTP je použit samostatný Resend API credential omezený pouze na odesílání z `syllonaut.com`;
- reset hesla byl 2026-09-18 ověřen end-to-end: Supabase → Resend → Gmail, stav `delivered`;
- signup/recovery templates funkční.

**SEC-006 — REMEDIATED / CLOSED.**

**SEC-007 — ACCEPTED RISK / DEFERRED:** Leaked Password Protection je na Supabase Free nedostupná.

### Auth accessibility

Auth popover má dialog semantics, vazbu trigger/dialog, Escape close, přesun fokusu dovnitř při otevření a návrat fokusu na trigger při zavření. Free signup z Pricing využívá stejné zabezpečené auth UI.

### Privacy, cookies, GDPR a analytika

Privacy/cookies baseline je produkčně dokončený a ověřený.

- veřejná route `/gdpr`, verze 1.0, účinná od 18. 9. 2026;
- správce: Václav Loubek, Slepá 868, 289 23 Milovice, Česká republika;
- kontaktní e-mail pro ochranu soukromí: `vaclav@syllonaut.com`;
- příjem na `vaclav@syllonaut.com` je řešen nativním Spaceship forwardingem a byl ověřen end-to-end;
- globální cookie consent je nasazený přes `components/CookieConsent.tsx`;
- consent cookie `syllonaut_cookie_consent_v1` má verzi `2026-09-18-v1` a max. dobu 180 dní;
- Google Analytics 4 se smí načíst pouze po explicitním souhlasu s analytikou;
- reklamní storage/signály, Google Signals a personalizace reklam zůstávají vypnuté;
- po odvolání analytického souhlasu se GA4 zablokuje a aplikace se pokusí odstranit `_ga*` cookies;
- Nastavení cookies je kdykoli dostupné ze sdílené patičky;
- marketingový e-mailový souhlas je oddělený od registrace, není předzaškrtnutý a má self-service withdrawal cestu;
- landing page má CZ/EN kontaktní formulář; jeho e-mail + dotaz se používají pro vyřízení zprávy, zatímco anti-abuse ledger uchovává pouze HMAC pseudonymy klienta/e-mailu s omezenou retencí;
- privacy regression check je součástí `npm run check`.

GA4 je nyní pouze **technicky připravené**: loader/config je consent-gated a očekává `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Produkční Measurement ID a produktová eventová taxonomie ještě nejsou zavedené. Další analytický krok má nejprve vytvořit GA4 property/web data stream, bezpečně nastavit Measurement ID a potom zavést explicitní produktové eventy bez PII a bez studentského obsahu.

### Growth / lifecycle e-maily a poptávkový formulář — produkčně COMPLETE / PASS 2026-09-20

**Behaviorální lifecycle akvizice přes Resend:**

- produkčně jsou aktivní přesně čtyři hlavní automations: **Syllonaut · Onboarding**, **Syllonaut · First live → Paid**, **Syllonaut · Free quota near limit** a **Syllonaut · Free quota reached**;
- každá produkční větev podporuje **CZ i EN** podle kontaktového `ui_locale`; aktivní kontakt synchronizuje `plan`, `ui_locale` a marketingový opt-in stav;
- existuje sedm obsahových šablon v obou jazycích: Welcome, Showcase, Teach first lesson, Free conversion, Reactivation, Quota near a Quota reached;
- marketingový lifecycle je **oddělený od transakčních billing e-mailů** a smí běžet jen pro uživatele s aktivním marketingovým souhlasem; Resend unsubscribe je respektovaný a běžný produktový event kontakt sám znovu nepřihlásí;
- potvrzený signup s marketingovým souhlasem spustí Welcome; pokud nevznikne první lekce, po zpoždění následuje Showcase a později Reactivation;
- skutečné vytvoření/import první lekce ukončí „no lesson“ větev; pokud poté uživatel nespustí live hodinu, přijde Teach first lesson;
- první skutečně serverem potvrzená live session spouští u Free účtu konverzní čekání; pokud uživatel mezitím zaplatí, `syllonaut.subscription.upgraded` workflow ukončí a sales e-mail se neodešle;
- Free kvóta nové AI tvorby má samostatné behaviorální eventy: **near limit při 2/3** a **reached při 3/3**; placený nebo organizační uživatel se do individuální Free konverze nezařadí;
- hlavní produktové eventy: `syllonaut.onboarding.started`, `syllonaut.first_lesson.created`, `syllonaut.first_live.started`, `syllonaut.subscription.upgraded`, `syllonaut.quota.near_limit`, `syllonaut.quota.reached`;
- integrační vrstva v aplikaci je best-effort: selhání marketingového orchestrationu nesmí shodit signup, AI generation, live session ani Stripe webhook;
- regresní kontrakt: `scripts/verify-marketing-lifecycle.mjs`.

**EN acquisition parity:**

- všechny EN lifecycle CTA používají locale-preserving `/en/...` vstupy, takže i nový návštěvník z CZ otevře po kliknutí **anglické UI**; query a UTM parametry se při redirectu zachovají;
- anglický Showcase má tři skutečně anglické veřejné ukázky: **Addition and subtraction within 10**, **Pythagoras' theorem: when can you actually use it?** a **Have you ever…? Present Perfect vs Past Simple**;
- české veřejné ukázky zůstaly beze změny; EN matematické varianty jsou samostatné marketingové shares, ne přepsané české originály;
- runtime i18n smoke test ověřuje `/en/new`, `/en/lessons` a `/en/s/...` včetně locale cookie a zachování UTM;
- všech sedm EN šablon bylo 2026-09-20 vyrenderováno a úspěšně odesláno přes Resend testovací workflow; následně byly všechny skutečné EN maily odeslány na kontrolní Gmail a vlastník projektu jejich podobu ručně schválil;
- dočasné review/test automations jsou po testu **disabled**; produkční čtyři automations zůstávají **enabled**.

**Poptávkový formulář na landing page:**

- konec CZ/EN homepage obsahuje dvoupolový formulář v designovém rytmu landing page: e-mail + text dotazu, český headline **„Zůstala vám otázka mimo radar?“**, EN **„Is there still a question beyond the radar?“**;
- formulář je napojený z předchozí závěrečné CTA sekce stejným guided-scroll / section-cue prvkem jako ostatní části homepage;
- odeslání jde serverově přes Resend; `Reply-To` je e-mail návštěvníka a produkční doručení míří do nakonfigurovaných interních schránek;
- anti-spam vrstvy: same-origin kontrola, skrytý honeypot, minimální doba vyplnění 3 s, limity velikosti body/polí, serverová Zod validace a desetiminutový atomický rate-limit podle HMAC pseudonymu klienta i e-mailu;
- rate-limit ledger je v `private.contact_form_rate_limits`; neukládá raw IP, raw e-mail ani text dotazu a jeho historie se čistí po 30 dnech;
- přístup k rate-limit ledgeru jde pouze přes service-role-only RPC `reserve_contact_form_rate_limit_server` / `release_contact_form_rate_limit_server`; `anon` a `authenticated` nemají EXECUTE;
- při selhání Resend delivery se rezervace uvolní, aby legitimní uživatel mohl dotaz zopakovat;
- GA4 event `contact_inquiry_submit` nese pouze výsledek `success/error/rate_limited`, nikdy e-mail ani text zprávy;
- GDPR stránka popisuje kontaktní data i pseudonymizovanou anti-abuse retenci;
- produkční acceptance: formulář ručně ověřen jako funkční; DB test potvrdil první rezervaci + blokaci druhé ve stejném okně; CI/Preview prošly včetně accessibility/WCAG 2.2 AA automatické kontroly;
- regresní kontrakt: `scripts/verify-contact-inquiry.mjs`.

## 10. Student a live session

Student:

- nemá plnohodnotný účet;
- připojí se QR/kódem/linkem a zadá display name;
- participant identita používá náhodný token;
- raw token je pouze HttpOnly cookie;
- DB drží SHA-256 hash;
- token je scopeovaný na session/participant;
- server-side capability expiruje pevně 24 hodin od joinu;
- po refreshi se identita zachovává po dobu platnosti tokenu;
- student vidí pouze aktivní blok a whitelistovaný stav;
- student nemění teacher-controlled session state.

Veřejný join je povolen v `lobby` a `live`, ne po `ended`.

### Activity clarity

Po beta feedbacku student u každé aktivity explicitně vidí:

- `Individuální aktivita`;
- `Týmová aktivita`;
- `Společná aktivita`.

Stejné rozlišení je i v lesson preview.

### Síťový hardening a live resilience 0.8

- response save timeout + následné ověření, zda zápis proběhl;
- Realtime chyba neblokuje základní serverový tok;
- team lock TTL 60 s, DB cap 120 s;
- team status fallback cca 5 s;
- heartbeat cca 15 s;
- service worker cachuje live navigaci pouze při ne-redirectované 2xx odpovědi stejného originu a stejné cesty; auth redirect nebo jiná 200 stránka proto nemůže přepsat funkční cached live shell;
- team draft v `sessionStorage`;
- autosave retry backoff cca 2–30 s;
- při konfliktu se lokální text nepřepíše vzdálenou verzí bez rozhodnutí studenta;
- Teacher po normálním ownership ověření dostane krátkodobý, HttpOnly/Secure, session-scoped live resume ticket; při dočasné ztrátě Supabase identity/API se konkrétní live session obnoví automaticky bez zásahu učitele;
- explicitní logout všechny live resume tickety serverově maže; normální ukončení session maže ticket konkrétní hodiny;
- resume fallback se aktivuje pouze při skutečné chybě primární auth/ownership vrstvy; korektní stav „uživatel není přihlášen“ vždy fail-closed a ticket neslouží jako alternativní login;
- teacher commandy používají stejný `operationId` pro primární i Cloudflare cestu a obě cesty se spouštějí souběžně; první úspěšná vyhrává;
- navigace přes fallback před odesláním porovná očekávaný aktivní blok se snapshotem; Durable Object navíc validuje `expectedActiveBlockId`, stav session, timer a reveal akce;
- Presenter při výpadku primárního endpointu automaticky skládá obraz z Cloudflare snapshotu a po návratu primární vrstvy se vrátí bez ručního přepínače;
- raw browser AbortError se už nezobrazuje; timeouty jsou normalizované a teacher/presenter ukazují jen srozumitelný stav Primární / Záložní / Synchronizuji;
- live resume podpis je server-only, domain-separated HMAC nad existujícím live bootstrap trust boundary; Cloudflare bearer capability zůstává pouze v `sessionStorage`, ne v persistentním browser storage;
- Cloudflare Worker 0.8 s Durable Object validací `expectedActiveBlockId`, session state, timer a reveal commandů je produkčně nasazený; aktuální ověřený Worker Version ID: `3044c41b-c0b4-443b-81e5-57fabb0d4419`;
- produkční Worker od 0.8.14 podporuje least-privilege `presenter` capability: může číst state/WebSocket, ale `/events` pro ni fail-closed vrací 403; `/health` ověřeně vrací `workerVersion=0.8.14` a `protocolVersion=2`.

### Join abuse protection

DB insert boundary:

- max. 200 participants/session;
- max. 150 nových joinů za 1 minutu/session;
- serializované přes lock session row;
- přímý Edge Function/DB insert nemůže aplikační limit obejít.

## 11. Odevzdání odpovědí: draft vs submit

Neaktivita studenta **není** signál, že je odpověď hotová.

### Team task

- `team_responses.answer` = autosavovaný koncept;
- `submitted_answer` = explicitně odevzdaná verze;
- `submitted_at` = čas submitu;
- autosave nespouští placené hodnocení;
- explicitní submit snapshotuje aktuální text;
- identická opakovaná verze je idempotentní.

### Individual `open_text` / `exit_ticket`

- běžné save = koncept;
- **Odevzdat odpověď** zapisuje `submitted_answer` + `submitted_at`;
- identická verze je idempotentní;
- AI grading se neváže na neaktivitu ani autosave;
- novější odpověď po proběhlém gradingu sama nový placený call nevytvoří;
- teacher případný regrade spouští explicitně.

### Aktuální submitted/completion semantika

Po beta testu 2026-09-18 se stav „odevzdáno“ počítá podle **aktuální verze odpovědi**, ne pouze podle existence historického `submitted_at`:

- odpověď je aktuálně odevzdaná jen tehdy, když existuje submit a současný `answer` odpovídá `submitted_answer`;
- pokud student po submitu text znovu upraví, stav se vrátí na **Rozepsaná** a completion counter se sníží, dokud student znovu neodevzdá;
- stejné pravidlo používají student, teacher live a Presenter;
- `ranking` má explicitní submit; poll/quiz zůstávají instant-choice interakce;
- teacher live rozlišuje `Čeká`, **Rozepsaná** (žlutý stav) a `Odevzdáno`;
- completion počty u open/ranking/team odpovědí počítají pouze aktuálně odevzdané snapshoty.

### Reconnect po odevzdání

Při výpadku spojení se lokální koncept zachovává. Po obnovení spojení student UI znovu vyhodnotí serverový stav:

- pokud server/fallback už submit potvrdil, staré chybové varování se automaticky vyčistí a UI přejde na `Odevzdáno`;
- pokud submit potvrzený není, student dostane konkrétní instrukci, že text je bezpečně uložený a stačí znovu klepnout na odevzdání;
- týmový editor umí při fallback submitu zobrazit stav záložní live vrstvy a po konvergenci odstranit zastaralou chybu;
- není nutné odpověď znovu opisovat.

**SEC-001 — REMEDIATED / CLOSED.**

## 12. Hybridní scoring + grading

Implementováno a nasazeno:

- quiz deterministicky pro všechny tarify;
- `open_text`, `exit_ticket`, `team_task` používají `response_evaluations`;
- bez entitlementu čekají na manual review;
- s entitlementem AI hodnotí explicitně odevzdaný snapshot podle rubriky;
- teacher override > AI;
- student submit není blokován čekáním na AI;
- atomický DB claim chrání proti dvojímu gradingu;
- confidence může vést k `needs_review`;
- persistent teacher review queue;
- rationale/rubrika/confidence/teacher note jsou teacher-only;
- derived scoreboard se neukládá;
- teacher scoreboard i Presenter používají centralizovaný serverový výpočet;
- public student score vrací jen vlastní `score`, `maxPoints`, `rank`.

`response_evaluations` ukládá answer/rubric snapshot, criterion scores, `ai_score`, `teacher_score`, confidence, status, model a skutečný `cost_usd`.

### Server-driven AI grading 0.8

AI grading už není životně závislý na otevřené teacher kartě:

- explicitní submit nadále pouze bezpečně vytvoří/aktualizuje `response_evaluations`;
- pending evaluace spustí DB trigger, který přes `pg_net` asynchronně volá interní Vercel grading endpoint;
- mezi DB a endpointem se používá jednorázová 256bitová capability; DB ukládá jen SHA-256 hash, raw token se neposílá do browseru ani aplikačních logů;
- capability je scopeovaná na jednu evaluation, krátkodobá a po claim/finish není znovu použitelná;
- minutový `pg_cron` retry znovu dispatchuje pouze pending nebo >5 min stale grading joby; běžné AI selhání se bez kontroly neopakuje do nekonečna;
- stávající browser `EvaluationBackgroundPump` zůstává jako kompatibilní sekundární cesta; atomický claim zabrání dvojímu placenému gradingu;
- migration `20260918114341_add_server_driven_ai_grading_jobs` je produkčně aplikovaná.

Security Advisor záměrně vidí `claim_grading_job`, `finish_grading_job` a `fail_grading_job` jako anon-callable `SECURITY DEFINER` RPC. Je to explicitní capability boundary: funkce mají `search_path=''`, běžný `authenticated` ani `service_role` k nim nemají EXECUTE a bez náhodného jednorázového tokenu nevracejí/neprovedou nic. `private.grading_jobs` má RLS a žádné klientské policy/granty.

### Přísnost AI hodnocení a review queue

Pro účty s AI grading entitlementem má lesson volitelné `gradingStrictness`:

- `lenient` — **Mírná**;
- `neutral` — **Neutrální**; zároveň bezpečný default pro starší lekce bez pole;
- `strict` — **Přísná**.

Přísnost nemění rubriku ani nepřidává nová kritéria. Mění pouze způsob interpretace hraničních/částečně splněných odpovědí. Teacher override je vždy autoritativní.

UI používá třístupňový barevný slider zelená → žlutá → červená. Jezdec lze táhnout plynule myší/prstem a po puštění zacvakne na nejbližší ze tří hodnot; kliknutí na hodnoty i klávesnicové/radio semantics zůstávají zachované.

Nastavení je viditelné jen uživatelům s AI grading entitlementem a používá se při vytvoření i uložení lekce. Non-neutral volba při generování je serverově guardovaná entitlementem.

Review queue:

- teacher-confirmed položka po potvrzení zmizí z aktivní fronty;
- pokud vznikne novější submit, položka se může znovu objevit;
- unresolved hodnocení aktuálně aktivního bloku se řadí před starší bloky, aby se teacher lépe orientoval v probíhající hodině.

Hybridní scoring zatím není součástí post-session reportu/CSV.

## 13. Presenter / projekční režim

Presenter je teacher-owner-auth read-only režim určený pro projektor.

Lobby zobrazuje:

- QR;
- join link;
- join code;
- počet připojených.

Live režim:

- zobrazuje právě aktivní úkol ještě před ukončením lekce;
- když teacher přepne na další blok, projektor přejde na stejný blok;
- obsahuje progress, submission/team counter a timer;
- join informace zůstávají dostupné;
- studentům slouží projektor i jako zdroj QR/linku/kódu pro připojení.

Po `ended` se zobrazí scoreboard / Moon race:

- Země → Měsíc;
- poloha rakety odpovídá skutečnému `score / dostupné maximum`;
- finální let s akcelerací/decelerací;
- `prefers-reduced-motion` fallback;
- bez teacher-only grading internals v payloadu.

Presenter používá vlastní typové labely; explicitní ActivityModeBadge ani structured `dataTable` zatím v jeho samostatném rendereru nejsou.

## 14. Accessibility baseline

Accessibility je nově explicitní produktový a release požadavek.

Engineering target:

- **WCAG 2.2 Level AA** pro webovou aplikaci a live surfaces;
- **EN 301 549** jako evropský ICT accessibility reference;
- **ATAG 2.0 principles** pro authoring tool stránku produktu.

Nejde o tvrzení o formální certifikaci/shodě. Plnou deklaraci WCAG 2.2 AA nepoužívat, dokud nebude dokončen reprezentativní manuální WCAG-EM průchod.

### Implementované UI remediace

- programmatické labely pro student responses, team editor a AI revision fields;
- `aria-pressed`/vybrané stavy pro poll/quiz/team/folders/Pricing/view controls;
- `aria-invalid`, popisy chyb a `role=alert`/`status` tam, kde se stav dynamicky mění;
- oznamování aktivního live bloku studentovi;
- skutečná progressbar semantics;
- timer oznamuje milníky, ne každou sekundu;
- GenerationProgress nezahlcuje screen reader sekundovým timerem;
- auth dialog focus management;
- global skip link;
- jednotný `focus-visible`;
- silnější form-control boundary a text kontrast;
- route-specific titles;
- dekorativní landing mockupy jsou mimo accessibility tree;
- responsive mobile nav má přístupnou klávesnicovou obsluhu;
- folder move dialog má správný focus management;
- teacher live controls mají progress/status/error semantics;
- Pricing změny se oznamují stručným live statusem, ne přečtením celých karet.

### Automated accessibility gate

Repo obsahuje:

- `ACCESSIBILITY.md`;
- `scripts/verify-accessibility.mjs`;
- GitHub Actions workflow `Accessibility`.

PR gate spouští:

1. `npm ci`;
2. `npm run check`;
3. `npm run check:accessibility`;
4. axe browser test veřejných rout `/`, `/pricing`, `/join`, `/new` s WCAG A/AA tagy včetně WCAG 2.2 AA.

Poslední accessibility PR před merge prošel TypeScript, source-contract checks, axe, Security headers i Vercel Preview.

### Manuální release checklist

Před případným tvrzením o formální shodě ručně ověřit reprezentativní flow:

- keyboard only;
- VoiceOver + Safari macOS/iOS;
- NVDA + Chrome/Firefox Windows;
- zoom 200 % a 400 %;
- reflow kolem 320 CSS px;
- portrait/landscape;
- reduced motion;
- focus obscured / dialog focus / dynamická oznámení.

## 15. Databázové oblasti a migrace

Hlavní tabulky:

- `profiles`
- `lessons`
- `lesson_folders`
- `generation_requests`
- `sessions`
- `participants`
- `responses`
- `teams`
- `team_responses`
- `team_edit_locks`
- `response_evaluations`

Důležité novější migrace:

- `20260917033538_seed_admin_demo_lesson`
- `20260917085744_extend_team_edit_lock_ttl`
- `20260917102904_submit_team_answers_before_ai_grading`
- `20260917102936_persist_submitted_team_answer_snapshot`
- `20260917105454_submit_team_answers_before_ai_grading`
- `20260917133141_prepare_explicit_individual_submission`
- `20260917134214_activate_explicit_individual_submission`
- `20260917134458_add_teacher_regrade_action`
- `20260917142041_limit_student_session_joins`
- `20260917142118_enforce_participant_join_limits_at_insert`
- `20260917145648_gate_ai_grading_by_entitlement`
- `20260917152048_fix_sec_005_student_write_toctou`
- `20260917162423_add_sec_009_session_retention_lifecycle`
- `20260917163934_strengthen_sec_011_relational_scope_constraints`
- `20260917165505_expire_sec_013_participant_tokens`
- `20260917174635_add_lesson_folders_and_entitlement`
- `20260917175452_index_lesson_folder_scope_fk`
- `20260917180456_harden_lesson_folder_access_and_index_fk`

Repo migration filenames musí zůstat sladěné s produkční `supabase_migrations.schema_migrations`.

Folder schema používá owner-scoped composite FK, RLS, max. dvě úrovně hierarchie, `lessons.folder_id` a server-authoritative `profiles.lesson_folders_enabled`.

## 16. Security audit — stav

Důkladný audit celé aplikace proběhl 2026-09-17.

### Remediated / closed

- **SEC-001** — opakovaná AI spotřeba při auto re-gradingu → explicit draft/submit, idempotence, teacher-controlled regrade;
- **SEC-003** — CSV formula injection → neutralizace potenciálních spreadsheet formulí;
- **SEC-004** — join abuse/cost amplification → 200 participants/session + 150 joins/min/session na DB boundary;
- **SEC-005** — student write TOCTOU → DB write-boundary re-checky live/current block/team/lock;
- **SEC-006** — hosted Supabase Auth hardening → canonical URL, redirect allowlist, password min 8, Turnstile, Resend;
- **SEC-008** — dependency lock/determinism → `package-lock`, Node/npm pin, `npm ci`;
- **SEC-009** — retention/deletion → ended sessions 12 měsíců, abandoned live/lobby 30 dní, expired locks 24 h, teacher manual delete, daily cron;
- **SEC-010** — ochrana `main` → PR workflow, required Vercel, up-to-date branch, linear history, block force-push/deletion;
- **SEC-011** — relational consistency → composite FK scope constraints;
- **SEC-012** — DOCX/PPTX decompression bomb → bounded ZIP/XML preflight + streamed limits;
- **SEC-013** — participant token expiry → server-authoritative 24 h;
- **SEC-014** — browser security headers → CSP, HSTS, nosniff, DENY framing, Referrer/Permissions Policy, no X-Powered-By;
- **SEC-015** — provider-level ZDR → fail-closed AI Gateway `zeroDataRetention: true` + AST regression check;
- **SEC-016** — cross-account lesson leakage / stale client state → server-hydrated lesson nese explicitního ownera, změna auth identity okamžitě čistí lesson/undo/recovery/highlight stav a opouští stale route, logout provede hard navigation; uložené full/block AI revize před kvótou i AI načítají autoritativní lesson přes `lessonId + owner_id` a ignorují klientský lesson payload jako zdroj pravdy.
- **SEC-017** — Free multilingual entitlement bypass přes full lesson replacement → `PUT /api/lessons/[id]` před zápisem načte autoritativní vlastněnou lekci a serverový profil; bez `multilingual_lessons_enabled`/admin role odmítne změnu `lesson.language` proti DB hodnotě HTTP 403. Undo i jiné legitimní replacement operace zůstávají funkční, pokud hlavní jazyk nemění.

### Accepted / deferred

- **SEC-002** — Preview sdílí production AI/Supabase trust boundary;
- **SEC-007** — Leaked Password Protection Disabled na Supabase Free.

Supabase Security Advisor warnings nad `SECURITY DEFINER` RPC neposuzovat mechanicky; vždy ověřit konkrétní ACL, `search_path`, ownership/capability checks a skutečný exposed contract.

## 17. Bezpečnostní hranice

Zachovat:

- teacher jen vlastní lesson/session;
- změna auth identity nesmí zachovat ani znovu hydratovat lesson/recovery data předchozího účtu;
- platformní admin není universal content admin;
- student bez účtu nemá široký DB přístup;
- participant capability je scopeovaná a expiruje;
- student nesmí dostat teacherNote, skryté správné odpovědi, grading rubriku, rationale/confidence, teacher note, cizí odpovědi/tokeny;
- Presenter je read-only a whitelistovaný;
- Realtime = invalidation, ne citlivý datový kanál;
- secrets/service role pouze serverově;
- quota a paid-AI entitlement enforcement server/DB;
- klientský full-lesson replacement nesmí bez multilingual entitlementu změnit autoritativní `lesson.language`;
- destructive operace kontrolují ownership;
- auth redirecty nesmí být open redirect;
- podklady i student text jsou pro AI nedůvěryhodná data.

## 18. Roadmapa / aktuální stav

### Milník A — AI workflow

**Dokončeno.**

AI generation/revision, quota/cost, source materials 10 MB, browser extraction, ZDR routing, prompt-injection ochrana, explicitní setup params, structured `dataTable`, accessibility authoring guardrails.

### Milník A.1 — účet jako workspace

**MVP dokončeno a produkčně ověřeno.**

Ukládání, knihovna, rename/duplicate/delete, sessions history, Teacher Pro/admin folders/podsložky, bulk/move dialog/drag-and-drop UX.

### Milník A.2 — veřejný auth

**Aplikační flow i hosted config auditované a produkčně ověřené.**

SEC-006 closed; SEC-007 accepted/deferred.

### Milník A.3 — Pricing / tarifní produktová vrstva

**Veřejný Ceník je dokončen; individuální Teacher / Teacher Pro LIVE billing je produkčně spuštěný a end-to-end ověřený. Team / School / Campus mají implementovanou organizační/billing foundation, ale veřejný self-service prodej zatím spuštěný není.**

Hotovo:

- teacher/school segment;
- monthly/annual;
- regionální pricing: CZK pro ČR, EUR pro eurozónu, USD pro ostatní;
- Free signup CTA; Teacher / Teacher Pro mají aktivní LIVE Checkout CTA; Team / School / Campus zůstávají bez veřejného self-service nákupu;
- Teacher Pro premium features; School/Campus obsahují AI grading + folders;
- Stripe sandbox katalog CZK/EUR/USD;
- DB plan/price/customer/subscription/event model pro individuální plány;
- idempotentní service-role provisioning RPC a striktní oddělení sandbox/live entitlementů;
- sandbox Checkout pro Teacher / Teacher Pro s country routingem a serverovým Price lookupem;
- reuse existujícího Stripe Customer, aby opakovaný Checkout nevytvářel duplicitní customer identity;
- admin-only sanitizovaná Checkout diagnostika;
- admin-only Stripe Customer Portal pro platební metody, faktury a cancellation;
- webhook evidence pro `invoice.payment_failed` a `invoice.paid`, přičemž entitlement zůstává subscription-authoritative;
- Stripe test-clock / simulation eventy jsou izolované od skutečných sandbox mappings;
- CZ standardní Stripe Checkout i německá Managed Payments větev byly sandboxově ověřeny end-to-end;
- otestováno cancel-at-period-end, obnovení zrušení, upgrade/downgrade Teacher ↔ Teacher Pro, změna billing období a německá DPH;
- sandbox nesmí měnit ostré entitlementy a ruční entitlement overrides se zachovávají.

Zbývá před veřejným self-service prodejem Team / School / Campus:

- definovat bezpečný country/currency migration flow, pokud zákazník změní fakturační zemi/region;

### Milník A.4 — Privacy / GDPR / produktová analytika

**GDPR/cookies baseline je dokončený a GA4 produktová analytika je produkčně aktivní při striktním opt-in.**

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

- nejdřív ověřit aktuální `main`, relevantní soubory a pouze ty části `PROJECT.md`, které jsou potřeba pro konkrétní úkol;
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
- kořenový `AGENTS.md` je závazný provozní vstup pro Work/agenty; při zahájení nové práce nebo nového turnu se řídit jeho aktuální verzí. `PROJECT.md` nečíst mechanicky celý: načíst jen části potřebné pro konkrétní úkol, pokud už relevantní stav není známý z aktuálního kontextu;
- **scope lock:** implementovat pouze výslovně zadaný nebo předem schválený problém a jeho nezbytné technické důsledky. Nedělat „když už jsme tady“ refaktory, redesign, další hardening, nové abstractions, migrace, testovací infrastrukturu ani jiné vedlejší zlepšení bez jasné nutnosti pro schválený úkol;
- preferovat **nejmenší bezpečnou změnu**, která splní acceptance kritéria a zachová existující architekturu, API a paralelní práci. Novou architekturu nebo širší přepis navrhovat jen tehdy, když minimální zásah prokazatelně nestačí;
- pokud první zvolený postup selže, nejdřív zjistit konkrétní příčinu a ověřit skutečný stav. **Nespouštět sérii alternativních pokusů naslepo.** Druhý přístup má vycházet z nového důkazu, ne z hádání;
- neopravovat automaticky cizí nebo nesouvisející chybu nalezenou během práce. Zaznamenat ji a pokračovat v původním scope, pokud přímo neblokuje jeho dokončení nebo nepředstavuje okamžité bezpečnostní/datové riziko;
- **credit/tool discipline:** preferovat cílené čtení konkrétních souborů, diffů, logů a relevantních částí dokumentace před opakovaným plošným skenováním repozitáře. Neopakovat drahé kontroly, pokud se vstupy od posledního úspěšného běhu nezměnily a opakování není nutné pro merge/acceptance;
- testovat od nejlevnějšího relevantního důkazu k širším kontrolám: nejdřív cílený verifier/test daného problému, potom povinné projektové checky před merge. Nepouštět paralelně více nákladných testů jen „pro jistotu“;
- subagenty, paralelní agentní větve, zvýšený reasoning nebo dražší režim používat jen tehdy, když je přínos pro konkrétní složitost úkolu zřejmý. Výchozí je jeden agent a sekvenční práce; nepoužívat další agenty k opakování stejné analýzy;
- po splnění schválených acceptance kritérií, zelených povinných kontrolách a aktualizaci požadované dokumentace **ukončit práci**. Neprovádět následný proaktivní hardening, cleanup nebo „bonusové“ změny bez nového zadání;
- běžné implementační kroky nevyžadují průběžné schvalování uživatelem; souhlas je potřeba vyžádat jen tehdy, když je nutné změnit schválenou variantu, produktovou/politickou logiku, architekturu s širším dopadem nebo provést rizikový/destruktivní krok. Heartbeat má informovat o kroku a jeho dokončení, ne blokovat práci čekáním na souhlas.

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
