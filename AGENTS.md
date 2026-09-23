# AGENTS.md — Syllonaut

Tento soubor je závazný provozní vstup pro agentní práci v repozitáři. Je záměrně krátký. Projektový stav, historii rozhodnutí, backlog a detailní acceptance jsou v `PROJECT.md`; načítej z něj jen části relevantní pro právě řešený úkol.

## 1. Než začneš

1. Ověř aktuální `main` a zda se neposunul kvůli paralelní práci.
2. Načti relevantní soubory, diffy a pouze potřebné části `PROJECT.md`.
3. Urči přesný scope a acceptance kritéria z uživatelova zadání a již schválených rozhodnutí.
4. U delší nebo vícekrokové práce pošli stručný heartbeat: co právě ověřuješ nebo měníš. Po každém významném dokončeném kroku oznam výsledek a přechod na další krok.

## 2. Scope lock a minimal patch

- Implementuj pouze výslovně zadaný nebo schválený problém a jeho nezbytné technické důsledky.
- Preferuj nejmenší bezpečnou změnu, která splní acceptance kritéria a zachová existující architekturu a paralelní práci.
- Nedělej nevyžádaný refactoring, redesign, cleanup, další hardening, nové abstractions, migrace, testovací infrastrukturu ani „bonusová“ vylepšení.
- Nalezený nesouvisející problém neopravuj automaticky. Zaznamenej ho; řeš ho jen tehdy, pokud přímo blokuje aktuální úkol nebo představuje okamžité bezpečnostní/datové riziko.
- Pokud je nutné změnit schválenou variantu nebo udělat širší produktové/architektonické rozhodnutí, nejdřív to oznam a vyžádej souhlas vlastníka projektu. Běžné implementační kroky souhlas po každém kroku nepotřebují.

## 3. Práce po malých krocích

Používej cyklus:

**OVĚŘENÍ → ÚPRAVA → CÍLENÉ OVĚŘENÍ → další malý krok**

- Neměň současně více nezávislých oblastí, pokud to úkol nevyžaduje.
- Commituj logické funkční celky, ne nahodilé jednotlivé soubory.
- Před potenciálně dlouhým nebo blokujícím voláním nástroje napiš, co konkrétně spouštíš. Po návratu nástroje bez prodlení oznam skutečný výsledek.
- Heartbeat není nízkoúrovňový log; informuje o významném kroku, nálezu, problému a dokončení.

## 4. Ochrana proti plýtvání kredity a slepým pokusům

- Čti cíleně: konkrétní soubor, diff, log nebo relevantní část dokumentace. Nečti celý velký `PROJECT.md` ani celý repozitář opakovaně bez důvodu.
- Neopakuj drahý test, build, scan nebo audit, pokud se jeho vstupy od posledního úspěšného běhu nezměnily a opakování není povinné pro merge/acceptance.
- Testuj od nejlevnějšího relevantního důkazu k širším kontrolám: cílený verifier/test → povinné projektové checky → Preview/CI.
- Pokud první přístup selže, nejdřív zjisti konkrétní příčinu. Nespouštěj sérii alternativních implementací nebo nástrojových pokusů naslepo.
- Subagenty, paralelní agentní větve, zvýšený reasoning nebo dražší režim používej jen při prokazatelné potřebě. Výchozí je jeden agent a sekvenční práce; nepoužívej další agenty k opakování stejné analýzy.
- Nevytvářej syntetické placené AI cally, produkční load/stress testy ani jiné nákladné operace, pokud lze požadavek ověřit strukturálně nebo bezpečněji.

## 5. Git, testy a produkce

- Standardně: pracovní branch → cílené testy → povinné checky/Preview/CI → PR → merge. Žádný force update `main`.
- Před finálním merge znovu ověř HEAD `main` a zachovej paralelní změny.
- Při Supabase zásahu nejdřív ověř skutečný produkční DB stav. DDL pouze přes migration workflow, pokud možno backward-compatible; po DDL spusť relevantní security/performance advisories.
- Security, permissions, quota a placené entitlementy vynucuj serverově/databázově, ne klientským stavem.
- Secrets nikdy do repozitáře ani klienta.
- Nedělej destruktivní testy na produkci.
- Accessibility automatika nenahrazuje manuální ověření tam, kde je relevantní.

## 6. Stop condition

Jakmile jsou splněná schválená acceptance kritéria, povinné kontroly jsou zelené a požadovaná dokumentace je aktualizovaná, práci ukonči. Bez nového zadání nepokračuj proaktivním hardeningem, refaktorem nebo dalšími změnami.

## 7. Dokumentace a verze

- `PROJECT.md` měň pouze na výslovný pokyn uživatele nebo když je jeho aktualizace součástí schváleného dokončení.
- Funkční produkční změny verzuj podle pravidel v `PROJECT.md`.
- Čistě docs/test/CI změna bez změny chování verzi neposouvá.
