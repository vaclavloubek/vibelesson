# Syllonaut — projektový stav

Aktualizováno: 2026-09-19 pro interní verzi 0.9.25 — správa předplatného rozlišuje administrátorský účet od skutečného Free tarifu. Admin bez aktivního Stripe subscription se už nezobrazuje jako Free; stránka explicitně uvádí plný administrátorský přístup mimo Stripe billing. Veřejně zobrazovaná verze na dashboardu zůstává 0.9.20.

**Aktuální produktová verze: 0.9.20** — Syllonaut má české a anglické UI, regionální výchozí volbu jazyka a oddělený jazyk generované lekce. **Sdílení lekcí je produkčně dokončené a E2E ověřené:** autor vytváří odvolatelný read-only snapshot, příjemce musí pro uložení a spuštění použít vlastní účet a dostane samostatnou kopii. Share link je záměrně přenositelný a počítá se s ním i pro veřejné ukázkové lekce a akviziční distribuci. Free účet generuje nové lekce pouze v aktivním jazyce UI a při AI revizích nesmí změnit hlavní jazyk existující lekce nebo bloku. Teacher, Teacher Pro a budoucí Team/School/Campus mají benefit **Lekce v libovolném jazyce**, včetně automatické detekce jazyka zadání, explicitní volby dalšího jazyka a změny jazyka při AI revizi. Entitlement je vynucený serverově.

Produkční release 0.8:

`45fe128e05bc9007ef9a927d70562d6d4c80ac77` — **Release Syllonaut 0.8 live resilience**.

Produkční stav 0.8 je potvrzený ve všech třech hlavních vrstvách: Vercel aplikace je nasazená, Supabase migration `20260918114341` je aplikovaná a Cloudflare Worker `syllonaut-live-control` byl ručně nasazen přes Wrangler; aktuální ověřený Worker Version ID je `3044c41b-c0b4-443b-81e5-57fabb0d4419`, `workerVersion=0.8.14`, `protocolVersion=2`. Server-driven AI grading se po releasu reálně ověřil na dvou pending evaluacích z beta hodiny: obě doběhly bez browser-driven pumpy. Bezpečnostní audit má 15 remediovaných/uzavřených nálezů; SEC-002 a SEC-007 jsou vědomě přijaté výjimky / odložená rizika.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, organizovat, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma, cílovou skupinu, délku, velikost skupiny, tón a další požadavky nebo nahraje vlastní podklady. AI z toho vytvoří validovanou strukturovanou lekci. Učitel ji může upravovat přirozeným jazykem, uložit ke svému účtu, spustit live session a studenti se připojí bez plnohodnotného účtu přes QR, link nebo kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

Hlavní doména: `syllonaut.com`.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Aktuální HEAD je vždy nutné načíst z GitHubu před zahájením práce; tento dokument nesmí nahrazovat kontrolu aktuálního `main`.

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
- `/new` — tvorba nové lekce
- `/lessons` — Moje lekce + Poslední výsledky + složky
- `/lessons/<id>` — lesson workspace
- `/lessons/<id>/worksheet` — serverově chráněný A4 pracovní list / klíč pro učitele; Teacher Pro + budoucí School/Campus, tisk nebo uložení jako PDF
- `/s/<token>` — veřejný read-only snímek sdílené lekce; přihlášení je nutné až pro uložení vlastní kopie. Capability link je záměrně přenositelný/přeposílatelný a může sloužit i jako distribuční URL ukázkové lekce; zveřejnění neotevírá originál, účet autora, výsledky studentů, live session ani AI historii
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

Roční varianta komunikuje přibližně **2 měsíce zdarma**. Placené tarify zatím nejsou aktivně prodejné: CTA je neaktivní s textem **Připravujeme**. Aktivní je pouze Free CTA, které otevře existující zabezpečený signup bez platební karty.

Individuální plány:

- **Free** — 0 Kč / €0 / $0; 5 nových AI lekcí + 20 AI úprav měsíčně; nové lekce pouze v aktivním jazyce UI a AI úpravy bez změny hlavního jazyka; deterministický quiz; ruční hodnocení bodovaných otevřených/týmových odpovědí; bez prémiových složek;
- **Teacher** — 199 Kč / €7.99 / $8.99 měsíčně nebo 1 990 Kč / €79.90 / $89 ročně; 25 AI lekcí + 100 AI úprav; **lekce v libovolném jazyce**; bez placeného AI gradingu a bez prémiových složek;
- **Teacher Pro** — 329 Kč / €13.99 / $14.99 měsíčně nebo 3 290 Kč / €139.90 / $149 ročně; 60 AI lekcí + 250 AI úprav; **lekce v libovolném jazyce**; AI grading `open_text`, `exit_ticket`, `team_task`; složky a podsložky.

Všechny individuální plány počítají s live hodinami bez tarifního limitu a se studentským připojením bez plnohodnotného účtu.

Školní/týmové plány:

- **Team** — až 10 učitelů; 200 AI lekcí + 800 AI úprav společně; lekce v libovolném jazyce; 1 290 Kč / €54.99 / $59.99 měsíčně nebo 12 900 Kč / €549.90 / $599 ročně;
- **School** — až 30 učitelů; 600 AI lekcí + 2 400 AI úprav; lekce v libovolném jazyce; 3 190 Kč / €139.99 / $149.99 měsíčně nebo 31 900 Kč / €1,399.90 / $1,499 ročně; **AI grading + složky/podsložky**;
- **Campus** — až 100 učitelů; 2 000 AI lekcí + 8 000 AI úprav; lekce v libovolném jazyce; 8 490 Kč / €369.99 / $399.99 měsíčně nebo 84 900 Kč / €3,699.90 / $3,999 ročně; **AI grading + složky/podsložky**.

Team zůstává bez těchto dvou premium benefitů; School a Campus je nově obsahují.

Týmová administrace a skutečné organization membership zatím implementované nejsou. Billing foundation je připravený pouze pro individuální Free / Teacher / Teacher Pro; Team / School / Campus se zatím nesmí provisionovat.

### Server-authoritative profil a entitlementy

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`.

Free default:

- `role=user`
- `monthly_lesson_limit=5`
- `monthly_revision_limit=20`
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
- ostrý entitlement se počítá jen z live subscriptions ve stavech `trialing`, `active` nebo `past_due`; `unpaid`, `canceled`, `incomplete`, `incomplete_expired` a `paused` přístup neudělují;
- admin zůstává vždy neomezený a ruční entitlement override se při změně tarifu zachovává.

Webhook HTTP endpoint `/api/billing/stripe/webhook` je od 0.8.05 implementovaný. Ověřuje raw request body přes Stripe HMAC SHA-256 s pětiminutovou tolerancí, odděluje test/live signing secret, u subscription lifecycle eventů vyžaduje serverem zapsané `syllonaut_user_id` + `syllonaut_billing_country` metadata a kontroluje invariant `CZ→CZK+standard Stripe / eurozóna→EUR+Managed Payments / ostatní→USD+Managed Payments`. Od 0.9.13 live subscription event před DB syncem navíc serverově vyhledá právě jeden dokončený Checkout Session podle subscription ID, ověří Customer/user vazbu a skutečnou `customer_details.address.country`; entitlement se fail-closed neprovisionuje, pokud skutečná země neodpovídá měně a Merchant-of-Record větvi. Do DB se ukládá skutečná Checkout country, nikoli pouze předvolená metadata. `invoice.payment_failed` a `invoice.paid` zůstávají pouze audit/recovery signál. Test-clock subscription eventy se dál ignorují. Production Vercel má oddělené test/live Stripe server-only credentials; veřejné placené CTA jsou stále vypnuté a live Checkout je do dokončení acceptance serverově admin-only.


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
- Team / School / Campus mají benefit produktově uvedený v Pricing; skutečné organization provisioning zatím není implementované;
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
- privacy regression check je součástí `npm run check`.

GA4 je nyní pouze **technicky připravené**: loader/config je consent-gated a očekává `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Produkční Measurement ID a produktová eventová taxonomie ještě nejsou zavedené. Další analytický krok má nejprve vytvořit GA4 property/web data stream, bezpečně nastavit Measurement ID a potom zavést explicitní produktové eventy bez PII a bez studentského obsahu.

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

**Veřejný Ceník je dokončen; Stripe + DB billing foundation a hlavní sandbox lifecycle jsou implementované a end-to-end otestované. Ostrý prodej zůstává záměrně vypnutý.**

Hotovo:

- teacher/school segment;
- monthly/annual;
- regionální pricing: CZK pro ČR, EUR pro eurozónu, USD pro ostatní;
- Free signup CTA; placené CTA zůstává `Připravujeme`;
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

Zbývá před skutečným prodejem:

- live Stripe Price IDs, live credentials a produkční onboarding;
- finálně ověřovat skutečnou billing country ze Stripe dat; předem zvolená země nesmí sama rozhodnout live routing;
- produkční acceptance testy webhooků, checkoutu, renewal/failure/cancel/upgrade/downgrade flow;
- definovat bezpečný country/currency migration flow, pokud zákazník změní fakturační zemi/region;
- organization membership/roles pro Team / School / Campus;
- teprve potom aktivovat placené CTA a ostrý prodej.

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
- strict opt-in zůstává zachovaný: GA4 reprezentuje consenting populaci, nikoli absolutní počet všech uživatelů.

Bezprostřední growth krok:

1. vytvořit první sadu **5–10 kvalitních ukázkových lekcí** napříč ročníky a předměty;
2. každá má demonstrovat skutečný výukový výsledek Syllonautu, ne fungovat jako obecná reklamní stránka;
3. použít hotové přenositelné share linky jako hlavní distribuční vrstvu ukázkových lekcí a připravit konzistentní CTA cestu „prohlédnout → uložit vlastní kopii → registrace/přihlášení → upravit / spustit vlastní lekci“;
4. připravit UTM naming convention pro organické sdílení, ambasadory, sociální sítě a později placené kampaně;
5. první měsíc optimalizovat primárně na `lesson_generation_completed` a `live_session_started`; placený `subscription_activated` sledovat jako výslednou obchodní konverzi;
6. placenou reklamu spouštět až po dokončení ukázkového balíčku a prvním organickém ověření, co skutečně přivádí aktivované učitele.

### Další produktové položky

- koš/verzování;
- školní interní knihovna nad hotovým public read-only sdílením lekcí;
- templates/favorites/search;
- user export/delete;
- skutečné školní/organizační účty, membership a správa rolí;
- live billing activation po produkčním acceptance a organization membership;
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

## 20. Významné operace 2026-09-17 až 2026-09-19

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
- **0.9.23 interní hotfix** — produkční správa předplatného už pro pouhé zobrazení nepotřebuje Stripe `Prices Read`; individuální ceny jsou centralizované a sdílené s veřejným Ceníkem. Server považuje za aktivní pouze canonical Stripe stavy `trialing/active/past_due`, takže historicky zrušený acceptance subscription nemůže kvůli zastaralému DB řádku rozbít stránku ani blokovat nový Checkout. LIVE subscription webhook před zápisem do Supabase načte aktuální subscription ze Stripe a synchronizuje canonical stav, čímž chrání DB před přehráním staršího subscription snapshotu. Pro tuto funkci musí LIVE restricted key nově povolit pouze nutné `Subscriptions → Write`, `Subscription Schedules → Write` a `Invoices → Read`; původní `Checkout Sessions → Write`, `Customers → Read`, `Customer Portal → Write` zůstávají.
- **0.9.24 interní hotfix** — tisk/PDF pracovních listů: odstraněn křehký print selector `body > :not(#main-content)`, který mohl v Safari skrýt celý worksheet a vytvořit prázdné PDF. Print režim nyní explicitně zachovává `#main-content`, skrývá pouze okolní aplikační chrome a převádí seznam aktivit z CSS Gridu na běžný tiskový flow. Každá aktivita má současně moderní i legacy zákaz page-breaku (`break-inside: avoid-page` + `page-break-inside: avoid`), takže pokud se aktivita sama vejde na A4, přesune se celá na další stránku místo rozdělení mezi dvě strany. Veřejně zobrazovaná verze zůstává 0.9.20.
- **0.9.25 interní hotfix** — účet s rolí `admin` má ve Správě předplatného vlastní stav „Administrátorský účet / plný přístup“ a nikdy se neprezentuje jako Free jen proto, že nemá aktivní Stripe subscription. Admin stav se vyhodnocuje serverově před jakýmkoli Stripe lookupem, takže není závislý na billing API ani na historickém acceptance subscription. Veřejně zobrazovaná verze zůstává 0.9.20.
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
- `PROJECT.md` jinak měnit pouze na výslovný pokyn uživatele.

## 22. Bezprostřední další krok

Security audit SEC-001 až SEC-016 je dispositioned. Accessibility technický baseline je implementovaný a nasazený. GDPR/cookies/privacy baseline je dokončený. GA4 je produkčně aktivní při opt-in a akviziční measurement baseline je dokončený: property `554871574` má ručně ověřených **20 custom dimensions a 4 Key Events**, včetně serverově potvrzené placené konverze `subscription_activated`. **Stripe sandbox lifecycle i LIVE acceptance individuálních plánů jsou dokončené a E2E ověřené. Teacher a Teacher Pro jsou veřejně prodejné; 0.9.19 doplňuje vlastní CZ/EN lifecycle e-maily Syllonautu, zatímco finanční e-maily zůstávají ve Stripe. Školní tarify zůstávají mimo live billing.** **Sdílení lekcí 0.9.20 je produkčně COMPLETE / PASS:** read-only snapshot, vlastní idempotentní kopie příjemce, nezávislá editace, revokace → 404 a zachování již uložené kopie jsou E2E ověřené; přenositelný capability link je zamýšlený distribuční mechanismus i pro ukázkové lekce. Live hardening baseline 0.8.16 / Worker 0.8.14 protocol 2 zůstává zachovaný.

Nejbližší priority v tomto pořadí:

1. do pondělní ostré výuky držet 0.9 funkčně stabilní, zejména zachovaný live baseline 0.8.16; nedělat zbytečné zásahy do live/auth/databázové vrstvy;
2. 2026-09-21 provést reálný acceptance test a bezprostřední post-session audit Teacher/Presenter/student writes/AI grading/fallback-recovery;
3. tentýž den znovu ověřit stav Supabase a rozhodnout: **zůstat**, nebo při pokračujících problémech zahájit read-only audit migrace na Neon;
4. po ostrém testu dokončit chaos scénáře A–G a následně Cloudflare deployment automation, observability a oddělený `LIVE_RESUME_SECRET`;
5. multilingual 0.9 acceptance je dokončený a produkčně PASS; v pondělním ostrém testu už jen krátce ověřit, že české/anglické UI a běžný lesson flow neutrpěly regresi, bez znovuotevírání locale architektury;
6. **live billing je veřejný a lifecycle e-maily mají produkční E2E acceptance COMPLETE / PASS**; interní 0.9.21 doplňuje samoobslužnou správu Teacher / Teacher Pro, 0.9.22 pracovní listy pro Teacher Pro a 0.9.23 opravuje první produkční regresi správy předplatného. Před mergem 0.9.23 je nutné doplnit na LIVE restricted key `Subscriptions → Write`, `Subscription Schedules → Write` a `Invoices → Read`; poté ověřit stránku a teprve následně první skutečnou změnu tarifu. Změna země/měny zůstává řízená. Team / School / Campus zatím nezapínat;
7. vytvořit **5–10 ukázkových lekcí** jako první distribuční balíček, publikovat je přes hotové přenositelné share linky, zvolit témata napříč věkem/předměty, připravit jasnou cestu k uložení vlastní kopie/registraci a UTM naming convention; nejprve je ověřit organicky, teprve potom pustit placené kampaně;
8. po spuštění ukázkového balíčku nechat GA4 nasbírat reálná data a dokončit funnel reporting nad `signup_completed → lesson_generation_completed → live_session_started → subscription_activated`; zkontrolovat i `ui_locale`, `lesson_language`, `plan`, `billing_country` a `source`;
9. pokračovat ve sběru beta feedbacku, hybridním scoringu report/CSV a následně organization membership/roles pro Team/School/Campus;
10. před veřejným prohlášením WCAG 2.2 AA provést manuální WCAG-EM evaluaci podle `ACCESSIBILITY.md`.

Security výjimky SEC-002/007 znovu otevřít při změně předpokladů. Případný odchod od Supabase by zároveň odstranil dnešní SEC-002 architektonický důvod pro sdílený Supabase trust boundary, ale nesmí se předjímat před pondělním rozhodovacím bodem.
