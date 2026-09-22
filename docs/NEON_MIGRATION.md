# Přechod Syllonautu ze Supabase na Neon

Aktualizováno: 2026-09-22
Výchozí commit auditu: `3e2aa66e740001d9e4d28f9d2630781318d0f569`
Pracovní větev ověřeného importu: `codex/neon-staging-import-20260921-v2`

## Stav

Příprava je implementovaná jako bezpečný, opakovatelný migrační balík. Produkční Supabase ani produkční prostředí Vercelu nebyly změněny. Výchozí `DATABASE_BACKEND` zůstává `supabase`; zapnutí Neonu vyžaduje explicitní runtime gate `NEON_CUTOVER_APPROVED=true`.

Databázová stagingová kopie i bezpečný Auth import byly vytvořeny a validovány. Tři účty mají v Neon Auth zachovaná UUID a e-maily, ale záměrně nemají přenesená hesla ani sessions. Jeden testovací účet dokončil reset hesla a celý Preview smoke test login → refresh → logout → refresh. Runtime audit databázových oprávnění následně odstranil implicitní `PUBLIC EXECUTE` ze 178 privilegovaných funkcí a kontrolní audit i aplikační build prošly. **Není povolen produkční cutover**, dokud neprojdou zbývající stop podmínky v tomto dokumentu.

### Zřízený stagingový cíl

Dne 2026-09-21 byl ve Vercel projektu `edupilot2` zřízen Vercel-managed Neon projekt `neon-red-ladder`:

- region AWS Europe Central 1 (Frankfurt), plán Free;
- výchozí Neon branch `main`, určená jako rodič stagingového ověření;
- Vercel resource je připojený pouze k Preview, nikoli k Production;
- pro Preview je zapnuté automatické vytváření izolované Neon branch;
- Managed Better Auth i Data API jsou aktivní;
- plošný `Grant public schema access` zůstal vypnutý; granty a RLS se aplikují explicitně z auditovaných migrací;
- databáze byla při zřízení prázdná a produkční traffic zůstává na Supabase.

### Ověřený stagingový import

Dne 2026-09-21 byl do nové izolované Preview branch proveden kompletní dump/restore ze Supabase. Úspěšný Vercel deployment `4DhTaNKAUgz4YV4dRKQxYm3chPM2` běžel z commitu `50d94d9` a skončil stavem `Ready`:

- preflight ověřil Supabase PostgreSQL 17.6 a Neon PostgreSQL 18.6;
- shodné počty a deterministické checksumy prošly pro všech 14 sledovaných tabulek;
- ověřené počty: `profiles` 3, `lessons` 32, `sessions` 23, `participants` 151, `responses` 265, `teams` 54, `team_responses` 75, `lesson_folders` 9, `lesson_live_usage` 10, `lesson_shares` 8, `billing_subscriptions` 5, `billing_email_deliveries` 1, `organization_memberships` 3 a `organizations` 1;
- identity bridge obsahuje 3 uživatele a shoduje se se zdrojem; heslové hashe ani session tokeny se neimportovaly;
- závěrečný aplikační build, TypeScript a generování stránek prošly;
- Supabase byl po celou dobu pouze čten a produkční Vercel prostředí zůstalo beze změny.

Jednorázový zapisující `buildCommand` byl po úspěchu odstraněn z `vercel.json`, aby další Preview deploymenty migraci automaticky neopakovaly. Úspěšný staging snapshot je dostupný na `https://edupilot2-2267f49n9-vaclavloubek1.vercel.app`; nejde o produkční cutover.

### Ověřený Auth import

Dne 2026-09-21 proběhl na stejné izolované Preview větvi jednorázový import identit. Úspěšný Vercel deployment `4FocukAu9w5woHnRgvL9a25h6j7M` běžel z commitu `a0a67ba` a skončil stavem `Ready` za 50 sekund:

- do `neon_auth.user` byly vloženy přesně 3 identity a jejich UUID/e-mail fingerprint se shoduje se Supabase zdrojem;
- 0 účtů vyžadovalo změnu stavu ověření e-mailu;
- do `neon_auth.account` nebyl importován žádný credential účet;
- nebyla přenesena hesla, session tokeny ani OAuth tokeny a nebyl odeslán žádný e-mail;
- synchronizační trigger pro `app_identity.users` byl nainstalován a následný Next.js build prošel.

Jednorázový Auth `buildCommand` byl po ověření odstraněn. Dne 2026-09-22 jeden importovaný testovací účet dokončil reset hesla; následný browser test ověřil login, zachování relace po úplném refreshi, logout, odstranění relace a nepřihlášený stav po druhém refreshi.

### Ověřený audit databázových oprávnění

Dne 2026-09-22 proběhl proti Preview Neonu metadata-only audit v read-only transakci. Před opravou potvrdil 29 veřejných tabulek, 27 RLS policies, 0 veřejných view a 179 `SECURITY DEFINER` funkcí. Všechny tabulky měly RLS zapnuté, role neměly `LOGIN`, `SUPERUSER` ani `BYPASSRLS`, všechny privilegované funkce měly explicitní `search_path` a žádná neměla přímý grant pro `anonymous` nebo `authenticated`. Jediným tvrdým blokátorem byl výchozí PostgreSQL grant `PUBLIC EXECUTE` na 178 funkcích.

Migrace `0004_harden_security_definer_execute.sql` v jedné transakci odebrala `PUBLIC EXECUTE` ze všech privilegovaných funkcí ve schématech `public`, `private` a `app_identity` a změnila default privileges jejich ownerů, aby se grant nevracel u nových funkcí. Vercel Preview deployment `C8udLTHfiVtsm7FeVUvvkVfCEmx3` z commitu `f1652b9` potvrdil postconditions `PUBLIC execute=0`, `missing search_path=0`, následný audit s 0 tvrdými blokátory a úspěšný Next.js build. Jednorázový zapisující hook byl odstraněn commitem `d7677d7`; jeho běžný Preview deployment skončil stavem `success`.

### První aplikační datový řez

Veřejné načtení sdílené lekce `/s/[token]` má samostatnou serverovou datovou službu. Výchozí cesta stále volá úzké Supabase RPC `get_lesson_share`; v Preview lze pouze pro tento read-only tok zapnout přímý parametrizovaný dotaz do Neon Postgres pomocí `NEON_SHARED_LESSON_READS=true`. Dotaz zachovává omezení na aktivní sdílení bez organizačního původu, nevrací metadata vlastníka a connection string zůstává pouze na serveru.

Ověřeno 2026-09-22 ve Vercel Preview větvi `codex/neon-staging-import-20260921-v2`: branch-only přepínač byl aktivní, Supabase RPC a Neon SQL vrátily stejný kryptografický otisk snapshotu a deployment `AZrmVsW1iHiBi4oZtQQvgJuHqYfs` skončil `Ready`. Kontrola byla read-only a nevytiskla token, obsah lekce ani tajné hodnoty. Produkční prostředí zůstalo na Supabase.

Canary přepínač je oddělený od globálního `DATABASE_BACKEND`, aby nebylo nutné předčasně přepnout ostatní aplikační cesty. Pokud by se omylem objevil v Production, bez `NEON_CUTOVER_APPROVED=true` selže zavřeně. Read-only paritu stejného snapshotu ze Supabase RPC a Neon SQL ověřuje `npm run neon:verify-share-read`; skript nezobrazuje token, obsah lekce ani tajné hodnoty.

### Druhý aplikační datový řez

Seznam složek na `/lessons` čte přes serverovou abstrakci s výchozím Supabase fallbackem. Branch-only `NEON_LESSON_FOLDER_READS=true` přesměruje v Preview pouze parametrizovaný dotaz `public.lesson_folders` omezený na přihlášeného vlastníka do Neon Postgres. Produkční použití bez `NEON_CUTOVER_APPROVED=true` selže zavřeně; chyba složkového dotazu se bezpečně degraduje bez znepřístupnění seznamu lekcí.

Ověřeno 2026-09-22 ve Vercel Preview deploymentu `DmnmajCsKYK8vkN4gimyDUMcTQLh` z commitu `8840b48`: read-only skript porovnal všech 9 složek a owner-scoped výsledek mezi Supabase a Neonem a vrátil `PASS`. Nelogoval ID vlastníka, názvy složek ani tajné hodnoty. Rozdílné databázové locale vracelo shodné řádky v jiném pořadí, proto obě cesty nyní používají stejné stabilní aplikační řazení. Paritu ověřuje `npm run neon:verify-folder-read`.

### Třetí aplikační datový řez

Seznam lekcí na `/lessons` používá branch-only `NEON_LESSON_LIST_READS=true`, parametrizovaný owner-scoped Neon SQL a Supabase fallback. První paritní kontrola odhalila jediný zastaralý řádek v izolovaném Neon stagingu; řízená transakce jej odstranila a závislý `generation_requests` řádek srovnala přes deklarované `ON DELETE SET NULL`.

Deployment `C64YjkL2LkWA8jxtcWM23CnBxxUf` z commitu `ec74305` potvrdil 31 shodných lekcí v celé tabulce a 6 shodných owner-scoped řádků. Jednorázový hook byl odstraněn commitem `090151a`; produkce zůstala na Supabase.

### Čtvrtý aplikační datový řez

Historie ukončených relací na `/lessons` používá serverovou abstrakci s výchozím Supabase fallbackem. Branch-only `NEON_SESSION_HISTORY_READS=true` přesměruje pouze owner-scoped read nad `public.sessions` do Neonu, filtruje `status='ended'` a nenulové `ended_at`, používá parametrizované user ID a má stejnou produkční pojistku `NEON_CUTOVER_APPROVED=true`.

Vercel Preview deployment `2njzbvAf1fcP86WvXUhSz3e9EfDp` z commitu `7079655` porovnal 23 ukončených relací v celé tabulce i 23 owner-scoped relací a potvrdil `PASS`. Kontrola byla read-only a nelogovala owner ID, join code, snapshot lekce ani tajné hodnoty. Jednorázový hook byl odstraněn commitem `91c6c55`; následný běžný Preview deployment `4FR4t6bztdqsRfEn3wxVfkHdxgPj` skončil stavem `Ready` za 55 sekund. Produkce nebyla změněna.

### Pátý aplikační datový řez

Detail vlastní lekce na `/lessons/[id]` používá serverovou abstrakci s výchozím Supabase fallbackem. Branch-only `NEON_LESSON_DETAIL_READS=true` přesměruje pouze owner-scoped čtení sloupců `id`, `source_prompt` a `lesson` do Neonu. Dotaz je parametrizovaný ID lekce i uživatele; úpravy lekce, spuštění živé relace a všechny zápisy zůstávají na Supabase. Produkční použití bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `DDSyzRz6acizH9jiN1Paj8GTvLqj` z commitu `f935180` porovnal 31 detailů lekcí v celé tabulce i jeden přesný owner-scoped detail a potvrdil `PASS`. Kontrola byla read-only a nelogovala ID lekce, ID vlastníka, prompt, obsah ani tajné hodnoty. Jednorázový hook byl odstraněn commitem `ed6a9a6`; následný běžný Preview deployment `GwL9eYJ1UNDNomQi77ysVbRjKPSN` skončil stavem `Ready` za 49 sekund. Produkce nebyla změněna.

### Šestý aplikační datový řez

Serverové načtení obsahu lekce pro route `/api/lessons/[id]/worksheet-pdf` používá novou úzkou datovou službu s výchozím Supabase fallbackem. Branch-only `NEON_LESSON_WORKSHEET_READS=true` přesměruje do Neonu pouze owner-scoped čtení sloupců `id` a `lesson`; ověření uživatele, entitlementu, důvěryhodného zařízení, organizačního původu, samotné vytvoření PDF a všechny zápisy zůstávají na Supabase. Parametrizovaný SQL dotaz je omezený ID lekce i uživatele a produkční použití bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `5R4E8Wd5h9YGu3Fq1itxpTVPxJCN` z commitu `e1d861e` porovnal všech 31 worksheet záznamů i jeden přesný owner-scoped výsledek a potvrdil `PASS`. Kontrola byla read-only a nelogovala ID lekce, ID vlastníka, obsah ani tajné hodnoty. Jednorázový build hook byl poté odstraněn; produkce nebyla změněna.

### Sedmý aplikační datový řez

Server-rendered stránka pracovního listu `/lessons/[id]/worksheet` nyní používá stejnou `readLessonWorksheet` službu a branch-only `NEON_LESSON_WORKSHEET_READS=true` jako PDF endpoint. Přesměrované jsou pouze owner-scoped sloupce `id` a `lesson`; Supabase nadále obsluhuje Auth, přijetí podmínek, trusted-device gate, profilový entitlement, organizační původ i všechny zápisy. Produkční pojistka zůstává sdílená a bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Dotaz ani datový kontrakt se proti šestému řezu nezměnily, proto stránka sdílí jeho read-only paritní důkaz 31 shodných záznamů a jednoho přesného owner-scoped výsledku. Nové zapojení stránky, migrační regresní kontrakt a rozšířený TypeScript/Next.js build ověřil Vercel Preview deployment `9CiHricuiWYkABs5QsWgbCaCkgpT` z commitu `2b51467`; skončil stavem `Ready` za 59 sekund. Produkce nebyla změněna.

### Osmý aplikační datový řez

Oprávnění k opakovanému použití lekcí a čtení append-only historie `lesson_live_usage` nyní používají jednu serverovou službu na obou učitelských obrazovkách: `/lessons` i `/lessons/[id]`. Branch-only `NEON_LESSON_REUSE_READS=true` přesměruje v Preview pouze čtení na parametrizovaný Neon SQL; entitlement je omezený ID uživatele a historie použití explicitně `owner_id`, v detailu navíc `lesson_id`. Supabase zůstává výchozím fallbackem a nadále obsluhuje Auth, spuštění živé relace, záznam použití i všechny ostatní zápisy. Produkční zapnutí bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `38WtK9ZGQmseqLGD3RD9jPVzTde6` z commitu `3fd0dd3` porovnal oprávnění všech 3 profilů, všech 10 řádků `lesson_live_usage` a jeden samostatný owner-scoped výsledek. Potvrdil `PASS`, dokončil TypeScript/Next.js build a nelogoval ID uživatele, ID lekce ani tajné hodnoty. Po branch-only aktivaci přepínače prošel opakovaný Preview deployment `4PR2YnZHaai8adjXTRSZXb6CYRRa` ve stavu `Ready`. Jednorázový build hook byl následně odstraněn commitem `b081f93`; čistý Preview deployment `3iwh5qpevDU11TpJ7sWfY7zXhwiu` skončil `Ready` za 46 sekund. Produkce nebyla změněna.

### Devátý aplikační datový řez

Vlastnická brána učitelské živé relace na `/sessions/[id]` i prezentační stránce `/sessions/[id]/presenter` nyní používá společnou serverovou službu. Branch-only `NEON_SESSION_ACCESS_READS=true` přesměruje v Preview pouze parametrizované ověření dvojice `session id` a `teacher id` do Neonu. Supabase nadále obsluhuje Auth, Terms, resume ticket, živá data, ovládání relace, odpovědi, Realtime i všechny zápisy. Produkční použití bez `NEON_CUTOVER_APPROVED=true` selže zavřeně a po vypnutí přepínače zůstává výchozí Supabase cesta s původními retry pokusy.

Vercel Preview deployment `5PEwytzBduvwWqjrTTdsXa13z1Ui` z commitu `5aacc03` porovnal všech 23 vazeb relace–vlastník a samostatně jeden oprávněný i jeden záměrně zamítnutý owner-scoped přístup. Potvrdil `PASS`, dokončil plný TypeScript/Next.js build a nelogoval ID relace, ID vlastníka, snapshot, join code ani tajné hodnoty. Jednorázový build hook byl odstraněn commitem `d8877ed`; následný běžný Preview deployment `5SBsEPkHrDSCeB7KQPb41Gsguzaf` skončil `Ready` za 50 sekund. Produkce nebyla změněna.

### Desátý aplikační datový řez

První zápisový řez pokrývá výhradně vytváření, přejmenování a mazání složek lekcí v route handlerech `/api/folders` a `/api/folders/[id]`. Branch-only `NEON_LESSON_FOLDER_WRITES=true` přesměruje v Preview jen tyto tři owner-scoped mutace na parametrizovaný serverový Neon SQL. Auth, Terms, trusted-device kontrola, entitlementy, lekce a všechny ostatní čtecí i zápisové cesty zůstávají na Supabase. Při vypnutém přepínači se používá původní Supabase cesta; produkční zapnutí bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `DdDgMBriPfVdyedtW8iZeUdGE1Hf` z commitu `7b7fa6d` provedl v jediné cílové transakci vytvoření kořenové i podřízené složky, zamítnutý update pod cizím vlastníkem, owner-scoped přejmenování, ověření databázové ochrany rodiče s potomkem a smazání obou testovacích záznamů. Následný `ROLLBACK` obnovil původní Neon staging fingerprint; build skončil `Ready` za 49 sekund a nelogoval žádné ID, názvy ani tajné hodnoty. Kontrola současně zaznamenala drift živého Supabase zdroje proti staging snapshotu při shodném počtu 9/9 složek, který musí zahrnout závěrečná delta synchronizace. Jednorázový build hook byl odstraněn commitem `b8054c3` a branch-only přepínač byl ve Vercelu aktivován pouze pro migrační Preview větev. Produkce nebyla změněna.

### Jedenáctý aplikační datový řez

Druhý zápisový řez pokrývá přesun vlastních lekcí do vlastní složky a zpět mezi nezařazené přes `/api/lessons/move`. Branch-only `NEON_LESSON_MOVE_WRITES=true` přesměruje v Preview pouze kontrolu cílové složky a owner-scoped update `public.lessons.folder_id` na parametrizovaný serverový Neon SQL. Supabase nadále obsluhuje Auth, trusted-device kontrolu, entitlement, kontrolu organizačního původu a všechny ostatní čtecí i zápisové cesty. Při vypnutém přepínači zůstává původní Supabase cesta; produkční zapnutí bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `73rqwmUaWfqaz1sPGfTKLhRvNC1A` z commitu `632abf4` porovnal 31/31 zdrojových a stagingových přiřazení lekcí a shodný fingerprint. Uvnitř jediné cílové transakce ověřil vytvoření dočasné složky, zamítnutý update pod cizím vlastníkem, přesun lekce do složky, přesun zpět mezi nezařazené, obnovu původního umístění a odstranění dočasné složky. Následný `ROLLBACK` potvrdil nezměněný staging baseline; build skončil `Ready` za 51 sekund a nelogoval žádné owner, lesson ani folder ID, obsah ani tajné hodnoty. Jednorázový build hook byl odstraněn a branch-only přepínač je ve Vercelu aktivní pouze pro migrační Preview větev. Produkce nebyla změněna.

### Dvanáctý aplikační datový řez

Třetí zápisový řez pokrývá přejmenování vlastní lekce přes `PATCH /api/lessons/[id]` a uložení celého upraveného dokumentu přes `PUT /api/lessons/[id]`. Branch-only `NEON_LESSON_CONTENT_WRITES=true` přesměruje v Preview pouze owner-scoped načtení a update sloupců `title`, `lesson` a `updated_at` na parametrizovaný serverový Neon SQL. Supabase nadále obsluhuje Auth, trusted-device kontrolu, organizační původ, profilový a vícejazyčný entitlement, duplikaci, mazání i všechny ostatní datové cesty. Při vypnutém přepínači zůstává původní Supabase cesta; produkční zapnutí bez `NEON_CUTOVER_APPROVED=true` selže zavřeně.

Vercel Preview deployment `5G6y1KXHJwgKY5cGz141DqyMsJ8W` z commitu `a0d19c1` zaznamenal očekávaný drift živého zdroje proti staging snapshotu (32/31 lekcí) pro závěrečnou delta synchronizaci. Uvnitř jediné cílové transakce ověřil zamítnutý update pod cizím vlastníkem, owner-scoped přejmenování synchronizované do skalárního titulku i JSON dokumentu, plné nahrazení dokumentu, obnovu původních hodnot a následný `ROLLBACK`. Kontrola potvrdila nezměněný Neon staging baseline, build skončil `Ready` za 54 sekund a nelogoval owner ID, lesson ID, titulky, obsah ani tajné hodnoty. Jednorázový build hook byl odstraněn a Config přepínač je aktivní pouze pro migrační Preview větev. Produkce nebyla změněna.

## Incident 2026-09-21

Pozorovaný problém na `/lessons` nebyla ztráta dat:

- přímý databázový dotaz v době incidentu vrátil 26 lekcí, 9 složek, 22 ukončených sessions a profil přibližně za sekundu;
- session nebyla expirovaná a `auth.sessions.refreshed_at` se změnilo v 14:31:45 CEST;
- po refreshi tokenu začala stejná verze aplikace a stejná data znovu fungovat; `main` zůstal na `3e2aa66e` a neproběhl deploy ani migrace;
- Supabase současně evidoval incident s odmítáním JWT na API Gateway/Data API;
- `/lessons` prováděl mnoho navazujících Auth/Data API/RPC požadavků bez explicitního timeoutu. LEGAL-012 přidal jednu další kontrolu akceptace VOP, ale incident začal před nasazením této změny.

Pracovní závěr: kořenem byl přechodný Auth/API stav po validaci JWT; sekvenční načítání bez timeoutu zvětšilo dopad na UI. V této větvi proto každý Supabase fetch končí po 8 sekundách, nezávislé dotazy `/lessons` běží souběžně, Terms gate má jeden batch RPC a route má vlastní loading/error boundary.

## Inventura závislostí

| Oblast | Nález | Cílová náhrada |
|---|---:|---|
| Soubory s přímou Supabase závislostí | 101 | postupně `lib/neon/*` a serverové datové služby |
| Tabulky volané přes `.from()` | 23 | Neon Postgres + Data API/RLS |
| RPC jména volaná aplikací | přibližně 70 | stejné PostgreSQL funkce po revizi grantů |
| SQL migrace v repozitáři | 134 | zdrojové `pg_dump` schéma je kanonické; historie není úplný bootstrap |
| `SECURITY DEFINER` výskyty v migracích | 280 | runtime metadata audit hotový; `PUBLIC EXECUTE` odstraněn, jednotlivé RPC grantovat až po kontrole actor/owner autorizace |
| `auth.uid()` výskyty | 92 | Neon Data API / `pg_session_jwt`, ověřit typ UUID |
| `auth.users` výskyty | 39 | přemapovat na `app_identity.users`; zachovat UUID |
| Supabase Edge Functions | 2 (`student-session`, `team-edit`) | port do Vercel route/server modulů |
| Supabase Realtime klienti | 4 | Cloudflare Durable Object WebSocket + replay/polling |
| `pg_net` / outbound HTTP | 3 aktivní dispatch cesty | soukromá DB fronta + Vercel Cron/worker |
| Supabase Storage | nepoužívá se | žádná migrace souborů |

První verzovaná SQL migrace už odkazuje na existující `public.lessons`; migrační adresář tedy není úplný bootstrap databáze. Proto se cílové schéma vytváří ze skutečného zdrojového `pg_dump --section=pre-data/post-data`, ne pouhým přehráním 134 souborů.

## Cílová architektura

| Současnost | Cíl |
|---|---|
| Supabase Postgres | Neon Postgres v AWS regionu co nejblíže Vercelu a dnešnímu `eu-west-1` |
| Supabase Data API | Neon Data API pro úzké RLS klientské cesty |
| `service_role` RPC | dočasná NOLOGIN kompatibilitní role; server-only `app_service` přes `@neondatabase/serverless`, později přímé nejmenší granty |
| Supabase Auth/SSR | Neon Auth (Managed Better Auth) s httpOnly cookies a zachovanými UUID |
| `auth.users` FK | stabilní `app_identity.users` bridge, synchronizovaný z `neon_auth.user` |
| Supabase Realtime | existující Cloudflare `LiveSession` Durable Object |
| Supabase Edge Functions | Vercel Route Handlers / serverové moduly |
| `pg_net` | DB outbox + idempotentní Vercel worker/Cron |
| Supabase Cron | Vercel Cron nebo explicitní Neon-supported scheduler podle konkrétní úlohy |

Pro privilegované billingové, právní a organizační operace se nepoužije veřejný Data API klíč. Poběží výhradně serverově, s omezenou DB rolí a existující Stripe/Resend idempotencí. Hodnoty connection stringů, Stripe secretů, webhook secretů a Auth cookie secretu se nesmí logovat ani vystavit přes `NEXT_PUBLIC_*`.

## Co je v této větvi připravené

- přesně připnuté balíky `@neondatabase/serverless`, `@neondatabase/auth` a `@neondatabase/neon-js`;
- lazy serverový Neon SQL klient a oddělený serverový/klientský Neon Auth základ;
- explicitní konfigurace a cutover guard;
- read-only preflight, výchozí dry-run migrace, explicitní write gate, import identity bridge a deterministické kontroly počtů/checksumů;
- samostatný Auth preflight, který bez výpisu e-mailů porovná počet a fingerprint UUID/e-mailů a odmítne ne-UUID identitu;
- dry-run-first Auth import s vlastní zápisovou pojistkou, zachováním UUID, kontrolou konfliktů a výslovným zákazem kopírování hesel a sessions;
- idempotentní SQL prerequisites a Neon Auth synchronizační trigger;
- deklarace Cloudflare Durable Object SQLite migrace;
- hardening `/lessons` proti opakování incidentu;
- první izolovaný datový port `/s/[token]` se samostatným Preview canary přepínačem a read-only paritní kontrolou;
- druhý izolovaný datový port seznamu složek na `/lessons` s owner-scoped SQL, stabilním řazením a read-only paritní kontrolou;
- třetí izolovaný datový port seznamu lekcí na `/lessons` s owner-scoped SQL, Supabase fallbackem a read-only paritní kontrolou;
- čtvrtý izolovaný datový port historie ukončených relací na `/lessons` s owner-scoped SQL, Supabase fallbackem a read-only paritní kontrolou;
- pátý izolovaný datový port detailu vlastní lekce na `/lessons/[id]` s owner-scoped SQL, Supabase fallbackem a read-only paritní kontrolou;
- devátý izolovaný datový port vlastnické brány `/sessions/[id]` a `/sessions/[id]/presenter` se společným owner-scoped SQL, Supabase fallbackem a read-only paritní kontrolou;
- regresní kontrakt `scripts/verify-neon-migration-preparation.mjs`.

Balíky Neon Auth a Neon JS jsou v této revizi beta a jsou připnuté přesně. Před produkcí musí staging prokázat funkčnost konkrétních verzí; automatický upgrade není povolen.

## Proměnné prostředí

Server-only:

```text
DATABASE_BACKEND=supabase|neon
NEON_DATABASE_URL=
NEON_DATABASE_URL_UNPOOLED=
NEON_DATA_API_URL=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
NEON_SHARED_LESSON_READS=false|true
NEON_LESSON_FOLDER_READS=false|true
NEON_LESSON_LIST_READS=false|true
NEON_SESSION_HISTORY_READS=false|true
NEON_LESSON_DETAIL_READS=false|true
NEON_LESSON_WORKSHEET_READS=false|true
NEON_SESSION_ACCESS_READS=false|true
NEON_LESSON_FOLDER_WRITES=false|true
NEON_LESSON_MOVE_WRITES=false|true
NEON_LESSON_CONTENT_WRITES=false|true
NEON_CUTOVER_APPROVED=false|true
```

Klientské endpointy bez credentialů:

```text
NEXT_PUBLIC_NEON_DATA_API_URL=
NEXT_PUBLIC_NEON_AUTH_URL=
```

Pouze jednorázový migrační shell, nikdy Vercel runtime:

```text
SUPABASE_DB_URL=
NEON_MIGRATION_APPROVED=I_UNDERSTAND_THIS_WRITES_TO_NEON
NEON_AUTH_IMPORT_APPROVED=I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS
```

### Bezpečné lokální načtení Preview proměnných

Místní kopie se propojí s existujícím Vercel projektem a tajné hodnoty se stáhnou přímo do Git-ignorovaného souboru. Connection stringy se nekopírují do chatu ani do verzovaných souborů.

```bash
vercel link --yes --project edupilot2
vercel env pull .env.local --environment=preview --yes
chmod 600 .env.local
```

Po rotaci Neon databázového hesla je nutné Preview proměnné stáhnout znovu a vytvořit nový Preview deployment. Hodnoty se při ověřování nikdy nevypisují; kontroluje se pouze přítomnost požadovaných názvů. Vercel Secret hodnoty jsou po uložení write-only, takže ručně vytvořený `SUPABASE_DB_URL` se při `env pull` stáhne jako prázdná hodnota a jednorázový migrační shell si jej musí vyžádat skrytě za běhu.

Vzdálený Vercel Preview preflight používá pro zdroj výhradně Supabase **Session pooler** (`*.pooler.supabase.com:5432`). Přímý endpoint `db.*.supabase.co` je IPv6 a z Vercel buildu nemusí být dosažitelný (`ENETUNREACH`).

## Staging runbook

### 1. Zřídit izolovaný cíl

1. [Hotovo] Neon je zřízen přes Vercel Marketplace v AWS Frankfurt.
2. [Hotovo] Vercel Production nebyl připojen; Preview vytváří izolované databázové branche.
3. [Hotovo] Data API a Managed Better Auth jsou aktivní na výchozí branch `main`.
4. [Čeká] Nastavit trusted origins, e-mail, OAuth callbacky a cookie doménu pouze na staging.
5. [Čeká] Vytvořit nepoužívané staging Stripe webhook endpointy nebo Stripe test-mode endpointy; nikdy nemíchat test/live secrets.

### 2. Nástroje a read-only kontrola

Je potřeba kompatibilní `psql` a `pg_dump`. Hodnoty URL se nevypisují.

```bash
npm run neon:preflight
npm run neon:preflight -- --execute
```

První příkaz je pouze náhled. Druhý čte verze, velikost a požadované role ze zdroje i cíle.

Ověřeno 2026-09-21 přes jednorázový Vercel Preview build:

- zdroj: PostgreSQL 17.6, 21 MB, schémata `auth`, `private`, `public`, 55 aplikačních tabulek a 3 Auth uživatelé;
- cíl: PostgreSQL 18.6, přibližně 7,8 MB systémových dat, 0 aplikačních tabulek, role `anonymous`/`authenticated` a Neon Auth připravené;
- výsledek: `PASS`, všechny dotazy uvnitř read-only transakcí, žádné databázové zápisy;
- kapacita: zdrojových 21 MB se vejde do 0,5GB Free staging limitu s výraznou rezervou.

Pro opakování v chráněném Preview buildu slouží `npm run neon:remote-preflight`. Nesmí být trvale připojen k běžnému build commandu; zapíná se pouze jednorázově a po kontrole se z build konfigurace odstraní.

### 3. Kopie databáze

Stav: **Hotovo pro izolovaný staging**. Úspěšný import a checksumy jsou zaznamenané výše. Příkazy níže zůstávají runbookem pro nový čistý staging nebo budoucí finální copy po schváleném write-freeze.

```bash
npm run neon:migrate
NEON_MIGRATION_APPROVED=I_UNDERSTAND_THIS_WRITES_TO_NEON npm run neon:migrate -- --execute
```

Výchozí příkaz nic nemění. `--execute` zapisuje jen do cílového Neonu, nikdy do Supabase. Citlivý dočasný export vzniká s `umask 077` v náhodném adresáři a po skončení se odstraní. Heslové hashe ani session tokeny se tímto krokem neexportují.

Skript odmítne cíl, který už obsahuje aplikační tabulky v `public`, `private` nebo `app_identity`. Po částečně neúspěšném importu se nepokračuje přes existující data; vytvoří se nová čistá Neon branch a import se opakuje od začátku.

### 4. Auth migrace

Aktuální Neon Auth je Better Auth v `neon_auth.*`. Starší Neon návod pro Stack Auth a `users_sync` není pro tuto architekturu autoritativní.

Read-only kontrola před importem 2026-09-21 ověřila:

- Supabase má 3 aktivní uživatele, všichni 3 mají potvrzený e-mail a heslovou identitu; jediný provider je `email`;
- stagingová tabulka `neon_auth.user` byla prázdná a používá UUID primární klíč;
- heslo se v Better Auth ukládá do `neon_auth.account` s providerem `credential`;
- Supabase hashe jsou bcrypt, zatímco spravovaný Better Auth používá scrypt. Hashe se proto nekopírují a existující uživatelé musí jednou projít bezpečným resetem hesla.

Povinný postup a stav:

1. [Hotovo] Spustit dry-run; nesmí nic změnit:

```bash
bash scripts/neon/auth-import.sh
```

2. [Hotovo] Na izolované Preview branch spustit zápis pouze s explicitní pojistkou:

```bash
NEON_AUTH_IMPORT_APPROVED=I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS \
  bash scripts/neon/auth-import.sh --execute
```

Skript načte ze Supabase pouze UUID a stav ověření, importuje 3 řádky do `neon_auth.user`, porovná fingerprint a nainstaluje synchronizační trigger. Nekopíruje `encrypted_password`, OAuth tokeny ani sessions a neposílá žádný e-mail.

3. [Hotovo] Vercel Preview spustil `scripts/neon/remote-auth-import-build.sh`, který normalizoval prefixované Neon proměnné, dočasně připravil PostgreSQL nástroje a provedl import. Deployment `4FocukAu9w5woHnRgvL9a25h6j7M` z commitu `a0a67ba` potvrdil 3 identity, 0 credential účtů a `PASS`; jednorázový `buildCommand` byl následně odstraněn.
4. [Hotovo] Preview-only stránka `/auth/neon-staging` používá oficiální Next.js proxy Neon Auth, neobsahuje registraci ani Turnstile a v Production vrací 404. Vlastník testovacího účtu spustil obnovu hesla a browser smoke test ověřil login, zachování relace po refreshi, logout, odstranění relace a nepřihlášený stav po druhém refreshi. Odeslání resetovacího e-mailu nebylo součástí automatického importu.

Pro aktivaci testovací stránky musí Preview obsahovat serverové proměnné `NEON_AUTH_BASE_URL` a citlivou `NEON_AUTH_COOKIE_SECRET` o délce alespoň 32 znaků. Cookie secret se nesmí prefixovat `NEXT_PUBLIC_`, zapisovat do repozitáře ani sdílet s Production. Klient komunikuje pouze se stejným originem přes `/api/auth/[...path]`.
5. Samostatně ověřit registraci, verifikaci e-mailu a případný budoucí OAuth callback.
6. Diagnostiku lze zopakovat:

```bash
npm run neon:auth-preflight
```

Auth preflight musí vrátit shodný počet i fingerprint mezi Supabase, `app_identity.users` a `neon_auth.user` a nula non-UUID ID. Nezobrazuje jednotlivé e-maily.

### 4a. Databázová oprávnění

1. [Hotovo] `npm run neon:security-audit` v read-only transakci ověřil role, RLS, policies, view a `SECURITY DEFINER` funkce.
2. [Hotovo] `0004_harden_security_definer_execute.sql` odebral implicitní `PUBLIC EXECUTE` ze 178 funkcí a nastavil deny-by-default pro nové funkce.
3. [Hotovo] Kontrolní audit v témže Preview buildu vrátil 0 tvrdých blokátorů a 0 přímých grantů pro `anonymous`/`authenticated`; standardní build po odstranění jednorázového hooku je zelený.
4. [Čeká průběžně] Při portování každého RPC explicitně ověřit actor/owner autorizaci a přidat nejmenší nutný grant pouze odpovídající roli. Patnáct RLS tabulek bez policies je nyní server-only deny-by-default; policy se přidá jen tehdy, bude-li tabulka skutečně potřebná přes Data API.

### 5. Aplikační port

1. [Ověřeno v Preview] `/s/[token]` čte přes serverovou abstrakci. `NEON_SHARED_LESSON_READS=true` přesměruje pouze veřejný snapshot na Neon a zachová Supabase jako automatický fallback po vypnutí přepínače. Paritní test potvrdil shodný výsledek obou backendů.
2. [Ověřeno v Preview] Seznam složek na `/lessons` používá `NEON_LESSON_FOLDER_READS=true`, parametrizovaný owner-scoped Neon SQL a společné stabilní řazení. Paritní test potvrdil 9 shodných řádků a shodný výsledek pro jednoho vlastníka.
3. [Ověřeno v Preview] Seznam lekcí na `/lessons` používá `NEON_LESSON_LIST_READS=true`, parametrizovaný owner-scoped Neon SQL a Supabase fallback po vypnutí přepínače. Paritní test po jednorázovém srovnání zastaralého stagingového řádku potvrdil 31 shodných lekcí v celé tabulce a 6 shodných řádků pro jednoho vlastníka. Závislý `generation_requests` řádek se přes deklarované `ON DELETE SET NULL` srovnal přesně se zdrojem; transakce byla omezená na konkrétní Preview větev a jednorázový build hook byl odstraněn.
4. [Ověřeno v Preview] Historie ukončených relací na `/lessons` používá `NEON_SESSION_HISTORY_READS=true`, parametrizovaný owner-scoped Neon SQL, filtr `status='ended'` a nenulové `ended_at`, Supabase fallback po vypnutí přepínače a produkční pojistku. Read-only paritní kontrola potvrdila 23 shodných řádků v celé tabulce i 23 shodných owner-scoped řádků; jednorázový build hook byl odstraněn.
5. [Ověřeno v Preview] Detail vlastní lekce na `/lessons/[id]` používá `NEON_LESSON_DETAIL_READS=true`, parametrizovaný owner-scoped Neon SQL a Supabase fallback po vypnutí přepínače. Read-only paritní kontrola potvrdila 31 shodných detailů v celé tabulce i jeden shodný přesný owner-scoped detail; editace, spuštění relace a všechny zápisy zůstávají na Supabase. Jednorázový build hook byl odstraněn a následný běžný Preview build je zelený.
6. [Ověřeno v Preview] Načtení obsahu lekce pro `/api/lessons/[id]/worksheet-pdf` používá `NEON_LESSON_WORKSHEET_READS=true`, parametrizovaný owner-scoped Neon SQL a Supabase fallback po vypnutí přepínače. Read-only paritní kontrola potvrdila 31 shodných worksheet záznamů v celé tabulce i jeden shodný přesný owner-scoped výsledek; auth, oprávnění, trusted-device kontrola, vytvoření PDF a všechny zápisy zůstávají na Supabase. Jednorázový build hook byl odstraněn.
7. [Ověřeno v Preview] Server-rendered stránka `/lessons/[id]/worksheet` používá tutéž `readLessonWorksheet` službu, branch-only přepínač, Supabase fallback a produkční pojistku jako PDF endpoint. Sdílí jeho read-only paritní důkaz 31 shodných záznamů a jednoho owner-scoped výsledku; Auth, Terms, trusted-device, entitlement, organizační původ a zápisy zůstávají na Supabase. Samotné zapojení stránky prošlo rozšířeným TypeScript/Next.js buildem.
8. [Ověřeno v Preview] Oprávnění k opakovanému použití lekcí a `lesson_live_usage` na `/lessons` i `/lessons/[id]` používají společnou serverovou službu, branch-only `NEON_LESSON_REUSE_READS=true`, Supabase fallback, produkční pojistku a parametrizované user/owner/lesson scope. Read-only parita potvrdila 3 shodná oprávnění, 10 shodných usage řádků i jeden přesný owner-scoped výsledek; zápisy a spuštění relací zůstávají na Supabase.
9. [Ověřeno v Preview] Vlastnická brána `/sessions/[id]` a `/sessions/[id]/presenter` používá společnou serverovou službu, branch-only `NEON_SESSION_ACCESS_READS=true`, parametrizovaný Neon SQL, Supabase fallback s retry a produkční pojistku. Read-only parita potvrdila 23 shodných vazeb relace–vlastník, jeden oprávněný a jeden zamítnutý přístup; Auth, Terms, resume ticket, živá data, ovládání, odpovědi, Realtime a zápisy zůstávají na Supabase.
10. [Ověřeno v Preview] Vytvoření, přejmenování a mazání složek lekcí používá branch-only `NEON_LESSON_FOLDER_WRITES=true`, owner-scoped parametrizovaný serverový SQL, Supabase fallback a produkční pojistku. Rollback test ověřil celý zápisový cyklus, zamítnutí cizího vlastníka i databázovou ochranu rodiče s potomkem a potvrdil nezměněný Neon staging baseline. Drift živého zdroje je evidovaný pro finální delta synchronizaci.
11. [Ověřeno v Preview] Přesun vlastních lekcí do vlastní složky a zpět mezi nezařazené používá branch-only `NEON_LESSON_MOVE_WRITES=true`, owner-scoped parametrizovaný serverový SQL, Supabase fallback a produkční pojistku. Rollback test porovnal 31/31 přiřazení, ověřil celý přesunový cyklus i zamítnutí cizího vlastníka a potvrdil nezměněný Neon staging baseline.
12. [Ověřeno v Preview] Přejmenování a úplné uložení vlastních lekcí používá branch-only `NEON_LESSON_CONTENT_WRITES=true`, owner-scoped parametrizovaný serverový SQL, Supabase fallback a produkční pojistku. Rollback test ověřil zamítnutí cizího vlastníka, přejmenování, plnou náhradu dokumentu, obnovu původních hodnot a nezměněný Neon staging baseline; drift 32/31 je evidovaný pro delta synchronizaci.
13. [Ověřeno v Preview] Mazání vlastní lekce používá branch-only `NEON_LESSON_DELETE_WRITES=true`, owner-scoped parametrizovaný serverový SQL, Supabase fallback a produkční pojistku. Rollback test porovnal zdrojový a stagingový stav, zamítl smazání pod cizím vlastníkem, provedl smazání pod skutečným vlastníkem jen uvnitř transakce a po rollbacku potvrdil přesně nezměněný Neon staging baseline. Drift 32/31 zůstává evidovaný pro finální delta synchronizaci.
14. [Ověřeno v Preview] Duplikace vlastní lekce používá branch-only `NEON_LESSON_DUPLICATE_WRITES=true` a jedinou server-only funkci `duplicate_lesson_server`. Kontrola vlastníka a organizačního původu, rezervace Free účtové i zařízení kvóty, vložení kopie, zachování lineage a dokončení rezervace proběhnou v jedné databázové transakci. Funkce je `SECURITY INVOKER` a `EXECUTE` je odebrané rolím `PUBLIC`, `anon`, `authenticated` i `service_role`; volá ji jen serverové přímé Postgres spojení. Rollback test porovnal zdroj/staging 32/31, ověřil zamítnutého cizího vlastníka, povinný device cookie, výslednou kopii a oba kvótové ledgery a potvrdil nezměněný staging.
15. [Ověřeno v Preview] Celý lifecycle sdílení lekce používá dvojici branch-only přepínačů `NEON_LESSON_SHARE_WRITES=true` a `NEON_SHARED_LESSON_IMPORT_WRITES=true`. Vytvoření a revokace sdílení jsou owner-scoped serverové SQL operace; import volá jedinou `SECURITY INVOKER` funkci `import_shared_lesson_neon_server`, která atomicky ověří token, zabrání duplicitě, rezervuje Free účtovou i zařízení kvótu, vloží lekci s provenance a dokončí oba ledgery. `EXECUTE` je odebrané veřejným i klientským rolím a produkční aktivace bez `NEON_CUTOVER_APPROVED=true` selže zavřeně. Rollback test ověřil create/read/revoke/import, zamítnutí cizího vlastníka, idempotenci a nezměněný Neon staging baseline; následný čistý Preview deployment `FKEfVQm26i7zsdtvL1C97KwdrasB` z commitu `4fac1c7` skončil `Ready`.
16. [Čeká] Další server-only mutaci nebo související RPC portovat až po samostatném owner/actor auditu; klientské Data API granty se neotevírají plošně. Poté následují Edge Functions, Realtime/outbox, závěrečná delta synchronizace a browserová akceptační matice.

Před cutoverem musí být dokončeno:

- nahradit Supabase SSR/Auth helpery Neon Auth middlewarem/handlerem;
- přesměrovat `.from()` a `.rpc()` na Neon Data API nebo serverové SQL služby;
- převést `student-session` a `team-edit` z Edge Functions do Vercel serverových modulů;
- odstranit čtyři Supabase Realtime kanály až po ověření teacher/student/presenter WebSocket reconnectu, replay a fallback pollingu přes Cloudflare;
- nahradit všechny `net.http_post` grading dispatch funkce DB outboxem; samotná existence `private.grading_jobs` nestačí, protože současný worker používá jednorázový plaintext capability token;
- převést cron úlohy pro grading retry, free-session expiry a billing lifecycle;
- zachovat append-only právní evidenci, Stripe webhook signature validation, idempotency keys a oddělení test/live klíčů;
- přegenerovat databázové typy proti Neonu a odstranit `service_role` z klientských cest.

### 6. Akceptační testy

Minimální testovací matice:

| Tok | Povinné ověření |
|---|---|
| Auth | registrace, login heslem, OAuth, reset, refresh, logout, revokace |
| Lekce | seznam, složky, vytvoření, AI generování, editace, share/import, archivace |
| Live | teacher start/next/end, student join/response, týmy, presenter, reconnect/replay |
| Hodnocení | enqueue, claim, AI výsledek, retry, budget a review |
| Billing | test Checkout, signed webhook replay, upgrade/downgrade, portal, refund/dispute |
| Právní | VOP re-consent v4/v5/v6, snapshot, online odstoupení, immutable audit |
| Organizace | pozvánka, role, seat/device limity, objednávka, invoice lifecycle |
| Izolace | cizí user/org nesmí číst ani měnit data; anonymous nesmí privileged RPC |
| Výkon | `/lessons` p95, počet backend round-tripů, timeout/error UX |

Každý test musí projít přes browser → Vercel route → Neon/Auth/Data API → odpověď v UI. Nestačí pouze SQL dotaz.

## Stop podmínky před produkcí

Cutover je zakázaný, pokud platí alespoň jedna položka:

- Auth import nezachovává UUID nebo není prokázané přihlášení existujících účtů;
- checksum/count nesedí pro libovolnou kritickou tabulku;
- některý `SECURITY DEFINER` RPC má implicitní `PUBLIC` execute, neomezený `search_path` nebo chybějící kontrolu actor/owner;
- kompatibilitní role `anon` / `service_role` jsou LOGIN role nebo mají širší členství, než je popsáno v `0001_prerequisites.sql`;
- některá veřejná tabulka nemá RLS nebo správný grant pro `anonymous`/`authenticated`;
- aplikace stále volá Supabase Edge Function, Realtime channel nebo `pg_net` v kritickém toku;
- Stripe/Resend workflow ztratí idempotenci nebo rozlišení test/live;
- Cloudflare Durable Object migrace nebyla ověřena proti skutečné deployed migration history;
- Vercel preview/build/typecheck nebo staging E2E nejsou zelené;
- není domluvené write-freeze okno a osoba oprávněná rozhodnout rollback.

## Produkční cutover

Pro velikost současných dat je bezpečnější krátký write freeze než obousměrný dual-write. Billingová a právní data se nesmí zapisovat paralelně do dvou zdrojů bez distribuované idempotence.

1. Oznámit údržbové okno a zastavit nové mutace, signup, checkout a live start; čtení může zůstat.
2. Zaznamenat poslední Supabase transakční čas a commit aplikace.
3. Provedení finálního dump/importu a všech checksumů.
4. Ověřit identity fingerprint a Auth smoke test.
5. Nastavit Neon env pro nový Vercel deployment, ale ponechat starý deployment dostupný pro rollback.
6. Nasadit s `DATABASE_BACKEND=neon` a `NEON_CUTOVER_APPROVED=true`.
7. Spustit smoke testy v pořadí Auth → read-only lekce → bezpečná testovací mutace → live staging-like flow → Stripe test-mode.
8. Otevřít zápisy až po zeleném výsledku a 15 minut sledovat Auth 4xx/5xx, DB errors, latency a queue backlog.
9. Supabase ponechat beze změny a read-only po dohodnuté rollback období. Mazání projektu je samostatné budoucí rozhodnutí.

## Rollback

Pokud se problém objeví ještě během write freeze:

1. neotevírat Neon zápisy;
2. vrátit Vercel env na Supabase a nasadit poslední známý dobrý commit;
3. ověřit login, `/lessons`, jednu read-only session a Stripe webhook health;
4. znovu otevřít zápisy do Supabase.

Pokud už Neon přijal produkční zápisy, prosté přepnutí zpět by vytvořilo split-brain a je zakázané. Zápisy se znovu zmrazí, identifikuje se Neon-only delta podle časů/ID a ta se řízeně přenese zpět nebo se Neon opraví vpřed. Billingové/právní eventy se deduplikují podle existujících provider ID a idempotency keys; nikdy se slepě nereplayují.

## Provoz po cutoveru

- měřit p50/p95/p99 pro Auth, Data API, přímé SQL a `/lessons` odděleně;
- logovat názvy operací, status a latency, nikdy JWT, cookie, DB URL, e-mail ani odpovědi studentů;
- alertovat na Auth 401/403 skok, DB 5xx, timeouty, grading queue age a Cloudflare revision/reconnect chyby;
- zálohy a PITR Neonu otestovat obnovou do nové branch;
- po stabilizačním období odstranit Supabase kód po menších PR, ale Supabase projekt rušit až po samostatném schválení a ověřené retenci/exportu auditních dat.
