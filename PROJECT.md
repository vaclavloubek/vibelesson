# Syllonaut — projektový stav

Aktualizováno: 2026-09-18 po dokončení GDPR/cookies/privacy baseline, migraci e-mailové domény Syllonautu na kořenové `syllonaut.com`, ověření Supabase Auth SMTP end-to-end a paralelním zpřesnění live resilience reconciliation.

Aktuální produkční `main` před touto dokumentační aktualizací:

`6d72267578e7f51ca0d23fef7b617c72c5edfb5f` — **Refine live resilience reconciliation**.

Vercel deployment tohoto HEAD je úspěšný. Bezpečnostní audit má 13 remediovaných/uzavřených nálezů; SEC-002 a SEC-007 jsou vědomě přijaté výjimky / odložená rizika.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, organizovat, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma, cílovou skupinu, délku, velikost skupiny, tón a další požadavky nebo nahraje vlastní podklady. AI z toho vytvoří validovanou strukturovanou lekci. Učitel ji může upravovat přirozeným jazykem, uložit ke svému účtu, spustit live session a studenti se připojí bez plnohodnotného účtu přes QR, link nebo kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

Hlavní doména: `syllonaut.com`.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Aktuální HEAD je vždy nutné načíst z GitHubu před zahájením práce; tento dokument nesmí nahrazovat kontrolu aktuálního `main`.

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

### Formulář přípravy lekce

Po beta úpravě nejsou pomocné hodnoty v parametrech přípravy lekce skutečnými předvyplněnými daty. Slouží pouze jako zesvětlené příklady vstupu; uživatel musí hodnoty skutečně vyplnit.

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

- **Free** — 0 Kč / $0; 5 nových AI lekcí + 20 AI úprav měsíčně; deterministický quiz; ruční hodnocení bodovaných otevřených/týmových odpovědí; bez prémiových složek;
- **Teacher** — 199 Kč / $8.99 měsíčně nebo 1 990 Kč / $89 ročně; 25 AI lekcí + 100 AI úprav; bez placeného AI gradingu a bez prémiových složek;
- **Teacher Pro** — 329 Kč / $14.99 měsíčně nebo 3 290 Kč / $149 ročně; 60 AI lekcí + 250 AI úprav; AI grading `open_text`, `exit_ticket`, `team_task`; složky a podsložky.

Všechny individuální plány počítají s live hodinami bez tarifního limitu a se studentským připojením bez plnohodnotného účtu.

Školní/týmové plány:

- **Team** — až 10 učitelů; 200 AI lekcí + 800 AI úprav společně; 1 290 Kč / $59.99 měsíčně nebo 12 900 Kč / $599 ročně;
- **School** — až 30 učitelů; 600 AI lekcí + 2 400 AI úprav; 3 190 Kč / $149.99 měsíčně nebo 31 900 Kč / $1,499 ročně; **AI grading + složky/podsložky**;
- **Campus** — až 100 učitelů; 2 000 AI lekcí + 8 000 AI úprav; 8 490 Kč / $399.99 měsíčně nebo 84 900 Kč / $3,999 ročně; **AI grading + složky/podsložky**.

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

### Síťový hardening

- response save timeout + následné ověření, zda zápis proběhl;
- Realtime chyba neblokuje základní serverový tok;
- team lock TTL 60 s, DB cap 120 s;
- team status fallback cca 5 s;
- heartbeat cca 15 s;
- team draft v `sessionStorage`;
- autosave retry backoff cca 2–30 s;
- při konfliktu se lokální text nepřepíše vzdálenou verzí bez rozhodnutí studenta.

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
- CZK/USD;
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

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit submit, timer, reveal, QR/link/code, recovery, report/CSV, scoring, plan-aware manual/AI grading, review queue, own public score, Presenter, live projektor úloh, Moon race, network hardening, join abuse protection, activity clarity, data tables.

Zbývá:

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
- `6d72267` — zpřesnění live resilience reconciliation.

Aktuální uvedený `main` má úspěšný Vercel deployment.

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
- `PROJECT.md` měnit pouze na výslovný pokyn uživatele.

## 22. Bezprostřední další krok

Security audit SEC-001 až SEC-015 je dokončen a dispositioned. Accessibility technický baseline je implementovaný a nasazený. GDPR/cookies/privacy baseline je dokončený a ověřený; GA4 je připravené v kódu, ale zatím bez produkčního Measurement ID a bez vlastní eventové taxonomie.

Nejbližší smysluplné produktové priority:

1. nastavit Google Analytics 4 a zavést privacy-safe produktové eventy + základní funnel/reporting;
2. pokračovat ve sběru a zapracování beta feedbacku;
3. doplnit hybridní scoring do post-session reportu/CSV;
4. rozhodnout o billing/provisioning architektuře před aktivací placených tarifů;
5. navrhnout organization membership/role model pro Team/School/Campus;
6. před veřejným prohlášením WCAG 2.2 AA provést manuální WCAG-EM evaluaci podle `ACCESSIBILITY.md`.

Security výjimky SEC-002/007 znovu otevřít pouze při změně předpokladů (staging/širší tým/produkční škála, resp. placený Supabase plán).