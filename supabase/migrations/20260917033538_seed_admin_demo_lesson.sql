with admin_owner as (
  select id
  from public.profiles
  where role = 'admin'
  order by created_at asc
  limit 1
)
insert into public.lessons (owner_id, title, source_prompt, lesson)
select
  admin_owner.id,
  'Mediální mise',
  'Pracovní kopie vestavěné ukázkové lekce Syllonautu.',
  $lesson${
    "title": "Mediální mise",
    "subtitle": "Jak přežít internet a neztratit důstojnost",
    "audience": "1. ročník Digitální marketing",
    "totalMinutes": 180,
    "groupSize": "3–4 studenti",
    "learningObjectives": [
      "Rozlišit médium, platformu, zdroj a autora.",
      "Vysvětlit framing, gatekeeping a agenda-setting.",
      "Rozlišit fakt, názor, interpretaci a reklamní tvrzení.",
      "Posoudit komerční zájem, algoritmickou selekci a důvěryhodnost zdroje."
    ],
    "blocks": [
      {"id":"b1","type":"team_task","title":"Co je sakra médium?","durationMinutes":15,"instructions":"Rozdělte kartičky na médium, platformu, zdroj a tvůrce. Dva sporné případy musíte obhájit.","items":["TikTok","CNN","influencer","tisková zpráva","ChatGPT","algoritmus Instagramu"],"teacherNote":"Debrief: odděl zdroj, autora, distribuční platformu a algoritmický výběr.","points":4},
      {"id":"b2","type":"team_task","title":"Redakce z pekla","durationMinutes":25,"instructions":"Vyberte tři zprávy, určete pořadí a napište titulky. Máte bulvár a potřebujete KLIKY. Bonusový bod za nejhorší titulek, který je stále technicky pravdivý.","items":["Ekonomika +1,8 %","Utekl páv","Firma propustí 2000 lidí","Brambora připomíná Karla Gotta","Nový výzkum Alzheimerovy choroby","Influencer spadl do bazénu"],"teacherNote":"Pojmy: gatekeeping, news values, agenda-setting.","points":6},
      {"id":"b3","type":"team_task","title":"Stejná událost, čtyři reality","durationMinutes":25,"instructions":"Město ruší 120 parkovacích míst kvůli cyklopruhům. Vytvořte titulek, první dvě věty, popis fotografie a člověka, kterého oslovíte podle role svého média.","items":["Motoristický web","Ekologický magazín","Lokální neutrální médium","Instagram politika, který změnu prosadil"],"teacherNote":"Pojem: framing. Zdůrazni, že různé rámce mohou pracovat se stejnými pravdivými fakty.","points":5},
      {"id":"b4","type":"poll","title":"Fakt, názor, nebo marketingový výpotek?","durationMinutes":15,"instructions":"Zařaďte tvrzení „Češi milují slevy.“ Co přesně bychom potřebovali vědět, abychom ho mohli posoudit?","options":["Fakt","Názor","Interpretace","Nelze určit bez definice"],"teacherNote":"Nejdůležitější je donutit studenty definovat vágní slovo „milují“."},
      {"id":"b5","type":"ranking","title":"Influencer, nebo reklamní plocha?","durationMinutes":25,"instructions":"Seřaďte případy od nejvíc redakčního obsahu po nejvíc komerčně motivovaný obsah. U tří položek vysvětlete, kdo má ekonomický zájem a jak je označen.","items":["Recenze bez spolupráce","Produkt zdarma bez honoráře","#spoluprace","Partner content","Článek na e-shopu: 5 nejlepších notebooků"],"teacherNote":"Pojmy: native advertising, advertorial, sponzorovaný obsah, product placement.","points":5},
      {"id":"b6","type":"team_task","title":"Algoritmus, který vám zničí život","durationMinutes":25,"instructions":"Jste doporučovací algoritmus. Kevin začal videem „Jak začít posilovat“. Ve třech kolech mu navrhněte stále extrémnější obsah tak, aby každý krok byl algoritmicky obhajitelný.","teacherNote":"Pojmy: engagement, personalizace, recommender system, algoritmická selekce, filter bubble.","points":6},
      {"id":"b7","type":"reveal","title":"Mediální CSI: kdo to vlastně řekl?","durationMinutes":25,"instructions":"Zpráva tvrdí: „Lidé, kteří pijí tři kávy denně, jsou o 27 % produktivnější.“ Nejdřív navrhněte, co byste ověřovali. Pak odhalte původ informace.","revealText":"DailyNews.cz → LifestyleToday → „britští vědci“ → průzkum výrobce kávy CoffeeLife. 27 % nebyl růst produktivity, ale rozdíl v subjektivní odpovědi mezi skupinami.","teacherNote":"Pojmy: primární a sekundární zdroj, nezávislé potvrzení, source laundering.","points":6},
      {"id":"b8","type":"team_task","title":"BOSS FIGHT: Generace Z opouští vysoké školy!","durationMinutes":20,"instructions":"Rozpitvejte fiktivní článek: „63 % mladých už nevěří, že má vysoká škola smysl.“ Článek vznikl ve spolupráci s dvanáctitýdenní vzdělávací akademií. Každý zásah musí mít formu: „Tohle je problém, protože…“ + správný pojem.","items":["zdroj průzkumu","63 % koho?","framing","komerční zájem","expert","influencer","algoritmická distribuce"],"teacherNote":"Finále: boduj jen obhájené zásahy, ne pouhé „tohle je divné“.","points":10},
      {"id":"b9","type":"exit_ticket","title":"Jedna otázka na cestu","durationMinutes":5,"instructions":"Doplňte jednu větu: „Odteď se u mediálního sdělení nejdřív zeptám…“","teacherNote":"Ideální reflex: Kdo to říká? Odkud to ví? Proč mi to říká? Co vybral a co vynechal?"}
    ]
  }$lesson$::jsonb
from admin_owner
where not exists (
  select 1
  from public.lessons l
  where l.owner_id = admin_owner.id
    and l.source_prompt = 'Pracovní kopie vestavěné ukázkové lekce Syllonautu.'
);
