# Prompt pro pokračování projektu EduPilot v novém chatu

Zkopíruj následující text jako první zprávu do nového chatu:

---

Pracujeme na projektu **EduPilot — AI kopilot pro interaktivní výuku**.

GitHub repository je zatím pod původním slugem:

`vaclavloubek/vibelesson`

Nejdřív si přes GitHub konektor načti a přečti celý soubor `PROJECT.md` z tohoto repozitáře. Ten je zdrojem pravdy o produktu, současném technickém stavu, architektuře, roadmapě a pravidlech dalšího vývoje. Potom zkontroluj aktuální obsah repozitáře a případné poslední commity, protože projekt mohl být od poslední aktualizace změněn.

## Co je cílem produktu

EduPilot má učiteli umožnit vytvořit interaktivní výuku pomocí přirozeného jazyka a následně ji také živě vést. Učitel popíše téma, cílovou skupinu, délku, styl a požadavky. AI z toho vytvoří strukturovanou lekci z předem definovaných interaktivních bloků. Učitel může běžnou češtinou upravit celou lekci nebo jedinou aktivitu. Později spustí živou session, studenti se připojí přes kód/QR a jejich odpovědi se zobrazují v reálném čase.

Důležité architektonické pravidlo: **AI negeneruje libovolný React/HTML frontend. Generuje validovaný Lesson JSON podle Zod schématu a UI jej skládá z ověřených komponent.** Toto rozhodnutí neměň bez velmi dobrého důvodu.

## Aktuální technologický základ

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7
- Vercel AI Gateway
- výchozí model `openai/gpt-5.6-sol`
- plán pro živou výuku: Supabase Postgres + Auth + Realtime

## Co už bylo vytvořeno

- generování celé lekce přes `/api/generate`;
- AI úprava celé lekce přes `/api/revise`;
- AI úprava jediného bloku přes `/api/revise-block`;
- teacher/student preview;
- několik typů interaktivních bloků definovaných v `lib/schema.ts`;
- demo lekce „Mediální mise“;
- rebrand z pracovního názvu VibeLesson na **EduPilot** v UI, package name, metadatech, README a AI system promptu;
- `PROJECT.md` s podrobným stavem.

Repository se fyzicky stále jmenuje `vibelesson`, protože předchozí GitHub nástroj neuměl rename repozitáře. Pokud je nyní dostupný nástroj pro přejmenování repository, můžeš navrhnout změnu na `edupilot`; jinak na tom nezastavuj práci.

## První úkol v tomto chatu

Pokračuj od **Milníku A — veřejná alfa**.

1. Ověř aktuální repo a načti `PROJECT.md`.
2. Ověř, zda je už vytvořen Vercel projekt pro EduPilot / toto repo.
3. Pokud není, zjisti nejjednodušší cestu k importu z GitHubu a řekni mi přesně jen ten ruční krok, který skutečně musím udělat já.
4. Jakmile Vercel projekt existuje, zkontroluj deployment/build logy.
5. Oprav případné build chyby přímo v GitHubu.
6. Ověř veřejnou URL aplikace.
7. Otestuj minimálně:
   - načtení homepage;
   - tlačítko „Ukázková lekce“;
   - učitelský náhled;
   - studentský režim;
   - mobilní použitelnost;
   - API generování, pokud je dostupná AI autentizace.
8. Před přidáním Supabase nejprve dokonči a ověř stabilní veřejné preview.

## Způsob spolupráce

- Postupuj po malých krocích.
- U každého technického kroku používej logiku **TEST/OVĚŘENÍ → ÚPRAVA → znovu OVĚŘENÍ**.
- Nedělej velké refaktory bez důvodu.
- Po změně vždy zkontroluj, že nerozbila teacher ani student režim.
- Studentské rozhraní musí fungovat primárně na mobilu.
- Učitel nemá být nucen ručně opakovat zadání aktivit; text pro studenty má být samostatně pochopitelný.
- Pokud narazíš na nejasnost, nejdřív se podívej do repa a `PROJECT.md`, než se zeptáš.
- Pokud můžeš krok provést přes připojený GitHub/Vercel/Supabase nástroj, proveď ho místo toho, abys mě posílal do administrace.
- Supabase projekt nevytvářej bez mého potvrzení případných nákladů a organizace.
- Průběžně aktualizuj `PROJECT.md`, když se významně změní stav nebo architektura.

Začni načtením `PROJECT.md` a kontrolou aktuálního stavu repozitáře a Vercelu. Pak pokračuj rovnou prakticky.

---
