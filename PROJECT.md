# Syllonaut — projektový stav

Aktualizováno: 2026-09-18 po zavedení regionálního zobrazování jediné relevantní měny ve veřejném ceníku ve verzi 0.8.03.

**Aktuální produktová verze: 0.8.03** — veřejný Ceník zobrazuje jen jednu regionálně relevantní měnu: CZK pro ČR, EUR pro eurozónu a USD pro ostatní návštěvníky; placené CTA zůstávají vypnuté do dokončení bezpečného billing provisioningu.

Produkční release 0.8:

`45fe128e05bc9007ef9a927d70562d6d4c80ac77` — **Release Syllonaut 0.8 live resilience**.

Produkční stav 0.8 je potvrzený ve všech třech hlavních vrstvách: Vercel aplikace je nasazená, Supabase migration `20260918114341` je aplikovaná a Cloudflare Worker `syllonaut-live-control` byl ručně nasazen přes Wrangler; aktuální ověřený Worker Version ID je `e4940eb9-7862-4717-b9b9-2160ff510d21`. Server-driven AI grading se po releasu reálně ověřil na dvou pending evaluacích z beta hodiny: obě doběhly bez browser-driven pumpy. Bezpečnostní audit má 13 remediovaných/uzavřených nálezů; SEC-002 a SEC-007 jsou vědomě přijaté výjimky / odložená rizika.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, organizovat, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma, cílovou skupinu, délku, velikost skupiny, tón a další požadavky nebo nahraje vlastní podklady. AI z toho vytvoří validovanou strukturovanou lekci. Učitel ji může upravovat přirozeným jazykem, uložit ke svému účtu, spustit live session a studenti se připojí bez plnohodnotného účtu přes QR, link nebo kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

Hlavní doména: `syllonaut.com`.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Aktuální HEAD je vždy nutné načíst z GitHubu před zahájením práce; tento dokument nesmí nahrazovat kontrolu aktuálního `main`.

### Versionování produktu

Od verze **0.7** se Syllonaut čísluje podle následujícího projektového pravidla:

- **0.7** je výchozí baseline zavedená 2026-09-18;
- **větší funkční změna / nový významný produktový celek** posouvá verzi o jednu desetinu, např. `0.7 → 0.8`;
- **menší samostatná funkční úprava** zvyšuje třetí část verze o jednu, zapisovanou dvěma číslicemi: `0.7.01`, `0.7.02` … `0.7.99`;
- číslo za druhou tečkou vždy představuje **jednu koherentní funkční změnu**, nikoli jeden commit nebo jeden změněný soubor;
- při posunu o desetinu se patch část zahazuje/resetuje, např. `0.7.14 → 0.8`;
- čistě dokumentační, testovací, CI, formátovací nebo interní refaktor bez změny produktového chování sám o sobě verzi neposouvá;
- pracovní Preview větev verzi neposouvá; nová verze se stává platnou až po sloučení funkční změny do produkčního `main`;
- pokud není změna zjevně „větší“, výchozí interpretace je **menší funkční úprava** a tedy zvýšení třetí části;
- při každé budoucí produkční funkční změně se má automaticky aktualizovat tento `PROJECT.md`: aktuální verze + stručný changelog/stav relevantní funkce. Není potřeba čekat na zvláštní pokyn k verzování;
- `PROJECT.md` se jinak stále mění pouze na výslovný pokyn uživatele; výjimkou je právě tato automatická aktualizace verze/stavu jako součást už schválené produkční funkční změny.

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

- `/` — landing
- `/pricing` — veřejný Pricing / Ceník
- `/new` — tvorba nové lekce
- `/lessons` — Moje lekce + Poslední výsledky + složky
- `/lessons/<id>` — lesson workspace
- `/sessions/<id>` — teacher live session / report
- `/sessions/<id>/presenter` — projekční režim
- `/join`, `/join/<code>` — studentský vstup
- `/student/<id>` — student live
- `/auth/confirm` — scanner-safe potvrzovací mezikrok
- `/auth/confirm/verify` — POST TokenHash → `verifyOtp`
- `/auth/update-password` — změna hesla po recovery
- `/auth/error` — bezpečný auth error stav

Landing umožní začít návrhem zadání bez okamžité registrace; účet je nutný až pro skutečné AI generování a ukládání.

### Header / responzivní navigace

Landing i Pricing používají sdílenou responzivní navigaci:

- desktop drží standardní navigaci + CTA;
- pod cca 1040 px se zobrazí hamburger menu;
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

`id`, `type`, `title`, `durationMinutes`, `instructions`, `options?`, `items?`, `dataTable?`, `correctAnswer?`, `revealText?`, `teacherNote?`, `points?`, `gradingRubric?`.

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
- lesson preview, student live i Presenter umí takové číslované instrukce/reveal text deterministicky renderovat jako skutečný sémantický seznam `<ol><li>`, bez HTML injection.

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
- prompt injection uvnitř dokumentu se ignoruje jako nedůvěryhodný obsah.

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

- **Free** — 0 Kč / €0 / $0; 5 nových AI lekcí + 20 AI úprav měsíčně; deterministický quiz; ruční hodnocení bodovaných otevřených/týmových odpovědí; bez prémiových složek;
- **Teacher** — 199 Kč / €7.99 / $8.99 měsíčně nebo 1 990 Kč / €79.90 / $89 ročně; 25 AI lekcí + 100 AI úprav; bez placeného AI gradingu a bez prémiových složek;
- **Teacher Pro** — 329 Kč / €13.99 / $14.99 měsíčně nebo 3 290 Kč / €139.90 / $149 ročně; 60 AI lekcí + 250 AI úprav; AI grading `open_text`, `exit_ticket`, `team_task`; složky a podsložky.

Všechny individuální plány počítají s live hodinami bez tarifního limitu a se studentským připojením bez plnohodnotného účtu.

Školní/týmové plány:

- **Team** — až 10 učitelů; 200 AI lekcí + 800 AI úprav společně; 1 290 Kč / €54.99 / $59.99 měsíčně nebo 12 900 Kč / €549.90 / $599 ročně;
- **School** — až 30 učitelů; 600 AI lekcí + 2 400 AI úprav; 3 190 Kč / €139.99 / $149.99 měsíčně nebo 31 900 Kč / €1,399.90 / $1,499 ročně; **AI grading + složky/podsložky**;
- **Campus** — až 100 učitelů; 2 000 AI lekcí + 8 000 AI úprav; 8 490 Kč / €369.99 / $399.99 měsíčně nebo 84 900 Kč / €3,699.90 / $3,999 ročně; **AI grading + složky/podsložky**.

Team zůstává bez těchto dvou premium benefitů; School a Campus je nově obsahují.

Týmová administrace, skutečné organization membership, billing, checkout a provisioning zatím implementované nejsou.

### Server-authoritative profil a entitlementy

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`.

Free default:

- `role=user`
- `monthly_lesson_limit=5`
- `monthly_revision_limit=20`
- `ai_grading_enabled=false`
- `lesson_folders_enabled=false`

Admin:

- `role=admin`
- lesson/revision limity `NULL`
- AI grading entitlement automaticky
- folder entitlement automaticky

Názvy plánů a ceny zatím nejsou zadrátované do DB billing/provisioning modelu. Runtime oprávnění se řídí explicitními hodnotami v `profiles` a kvótami.

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
- Poslední výsledky / historické sessions.

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
- team draft v `sessionStorage`;
- autosave retry backoff cca 2–30 s;
- při konfliktu se lokální text nepřepíše vzdálenou verzí bez rozhodnutí studenta;
- Teacher po normálním ownership ověření dostane krátkodobý, HttpOnly/Secure, session-scoped live resume ticket; při dočasné ztrátě Supabase identity/API se konkrétní live session obnoví automaticky bez zásahu učitele;
- explicitní logout všechny live resume tickety serverově maže; ticket proto není náhradou běžného účtového přihlášení;
- teacher commandy používají stejný `operationId` pro primární i Cloudflare cestu a obě cesty se spouštějí souběžně; první úspěšná vyhrává;
- navigace přes fallback před odesláním porovná očekávaný aktivní blok se snapshotem; Durable Object navíc validuje `expectedActiveBlockId`, stav session, timer a reveal akce;
- Presenter při výpadku primárního endpointu automaticky skládá obraz z Cloudflare snapshotu a po návratu primární vrstvy se vrátí bez ručního přepínače;
- raw browser AbortError se už nezobrazuje; timeouty jsou normalizované a teacher/presenter ukazují jen srozumitelný stav Primární / Záložní / Synchronizuji;
- live resume podpis je server-only, domain-separated HMAC nad existujícím live bootstrap trust boundary; Cloudflare bearer capability zůstává pouze v `sessionStorage`, ne v persistentním browser storage;
- Cloudflare Worker 0.8 s Durable Object validací `expectedActiveBlockId`, session state, timer a reveal commandů je produkčně nasazený; ověřený Worker Version ID: `e4940eb9-7862-4717-b9b9-2160ff510d21`.

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
- **SEC-015** — provider-level ZDR → fail-closed AI Gateway `zeroDataRetention: true` + AST regression check.

### Accepted / deferred

- **SEC-002** — Preview sdílí production AI/Supabase trust boundary;
- **SEC-007** — Leaked Password Protection Disabled na Supabase Free.

Supabase Security Advisor warnings nad `SECURITY DEFINER` RPC neposuzovat mechanicky; vždy ověřit konkrétní ACL, `search_path`, ownership/capability checks a skutečný exposed contract.

## 17. Bezpečnostní hranice

Zachovat:

- teacher jen vlastní lesson/session;
- platformní admin není universal content admin;
- student bez účtu nemá široký DB přístup;
- participant capability je scopeovaná a expiruje;
- student nesmí dostat teacherNote, skryté správné odpovědi, grading rubriku, rationale/confidence, teacher note, cizí odpovědi/tokeny;
- Presenter je read-only a whitelistovaný;
- Realtime = invalidation, ne citlivý datový kanál;
- secrets/service role pouze serverově;
- quota a paid-AI entitlement enforcement server/DB;
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

**Veřejný Ceník dokončen; billing záměrně neaktivní.**

Hotovo:

- teacher/school segment;
- monthly/annual;
- regionální pricing: CZK pro ČR, EUR pro eurozónu, USD pro ostatní;
- Free signup CTA;
- paid `Připravujeme`;
- Teacher Pro premium features;
- School/Campus obsahují AI grading + folders;
- responzivní header/hamburger.

Zbývá před skutečným prodejem:

- billing provider;
- checkout;
- subscription lifecycle;
- DB provisioning podle zakoupeného plánu;
- organization membership/roles;
- fakturace, upgrade/downgrade/cancel.

### Milník A.4 — Privacy / GDPR / analytics readiness

**GDPR/cookies baseline dokončen; GA4 připraveno k aktivaci.**

Hotovo:

- GDPR stránka + správce + funkční privacy kontakt;
- consent-gated GA4 loader;
- analytics opt-in/withdrawal;
- marketing consent audit/self-service withdrawal;
- privacy regression checks;
- ověřená e-mailová infrastruktura pro auth i privacy kontakt.

Zbývá:

- vytvořit/napojit GA4 property a web data stream;
- nastavit `NEXT_PUBLIC_GA_MEASUREMENT_ID` v Production/Preview podle zvolené strategie;
- zavést a zdokumentovat produktové eventy;
- ověřit eventy v GA4 DebugView/Realtime;
- definovat klíčové eventy/conversions až podle skutečných produktových funnelů;
- nepřenášet do analytiky e-mail, jméno, lesson text, student answers ani jiné PII/content payloady.

### Milník B — live hodina

**Hlavní MVP dokončeno.**

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit submit, timer, reveal, QR/link/code, recovery, report/CSV, scoring, plan-aware manual/AI grading, review queue, own public score, Presenter, live projektor úloh, Moon race, network hardening, join abuse protection, activity clarity, data tables. Verze 0.8 přidává session-scoped Teacher recovery, automatický primary/Cloudflare command race, Presenter fallback, bezpečné timeout UX a server-driven AI grading s DB retry.

P2 Cloudflare Worker/Durable Object mirroring zůstává aktivní; migration `20260918093706_allow_live_reconciliation_trigger_bypass` řeší snapshot convergence přes SEC-005 guardy. 0.8 navíc chrání teacher navigaci client-side preflightem, takže správnost základního failoveru není závislá jen na okamžitém nasazení nové Worker validace.

Zbývá:

- po nasazení 0.8 udělat cílený end-to-end test primární → fallback → recovery a následný chaos test A–G;
- hybridní scoring v post-session reportu/CSV;
- případné další statistiky.

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

### Další produktové položky

- koš/verzování;
- sdílení lekcí a public read-only link;
- templates/favorites/search;
- user export/delete;
- skutečné školní/organizační účty, membership a správa rolí;
- billing/checkout/subscription lifecycle;
- OCR;
- produktová analytika GA4: Measurement ID, event taxonomy, funnel/reporting;
- lokalizace.

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

## 20. Významné operace 2026-09-17 až 2026-09-18

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
- `24e8b1c` — premium lesson folders
- `e0a02bd` — veřejný Pricing / Ceník
- `d2f8b98` — intuitivnější folder move UX: dialog, lesson menu, bulk, drag-and-drop, create-folder-from-move
- `305d628` — School a Campus dostaly AI grading + folders/podsložky
- `0ececf0` / `49e59bd` — Pricing header CTA bez nežádoucího zalamování
- `365d6e5` — sdílená responsive hamburger navigation
- `f6ff9f3` — WCAG/ATAG accessibility remediation + accessibility CI/release baseline

Další významné změny 2026-09-18:

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
- viditelné číslo verze v učitelském dashboardu používá centrální `APP_VERSION`; aktuálně je pod badge BETA zobrazeno `v0.8.03`.

**Výchozí funkční baseline verze 0.7 je `57539ce`. Verze 0.8 je první větší funkční posun: cílem je, aby krátkodobý výpadek Supabase Auth/API nevyžadoval od učitele žádnou ruční obsluhu a aby grading nepřestal běžet spolu s teacher browserem.**

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
- každá schválená produkční **funkční** změna musí automaticky dostat novou verzi podle pravidel v sekci „Versionování produktu“ a současně aktualizovat příslušný stav/changelog v `PROJECT.md`;
- menší funkční změna standardně inkrementuje třetí část (`0.7.01`, `0.7.02` …), větší produktový/funkční celek desetinu (`0.8`, `0.9` …);
- čistě interní/docs/test/CI změna bez změny chování verzi neposouvá;
- `PROJECT.md` jinak měnit pouze na výslovný pokyn uživatele.

## 22. Bezprostřední další krok

Security audit SEC-001 až SEC-015 je dokončen a dispositioned. Accessibility technický baseline je implementovaný a nasazený. GDPR/cookies/privacy baseline je dokončený a ověřený; GA4 je připravené v kódu, ale zatím bez produkčního Measurement ID a bez vlastní eventové taxonomie.

Nejbližší smysluplné produktové priority:

1. ověřit 0.8 v nejbližší reálné výuce jako produkční acceptance test: bez umělého vyvolávání výpadků sledovat Teacher/Presenter, studentské zápisy, AI grading, `live_control_revision` a případné automatické primary → fallback → recovery; cílené chaos scénáře A–G doplnit až následně, pokud je reálná výuka sama neprověří;
2. nastavit Google Analytics 4 a zavést privacy-safe produktové eventy + základní funnel/reporting;
3. pokračovat ve sběru a zapracování beta feedbacku;
4. doplnit hybridní scoring do post-session reportu/CSV;
5. rozhodnout o billing/provisioning architektuře před aktivací placených tarifů;
6. navrhnout organization membership/role model pro Team/School/Campus;
7. před veřejným prohlášením WCAG 2.2 AA provést manuální WCAG-EM evaluaci podle `ACCESSIBILITY.md`.

Security výjimky SEC-002/007 znovu otevřít pouze při změně předpokladů (staging/širší tým/produkční škála, resp. placený Supabase plán).