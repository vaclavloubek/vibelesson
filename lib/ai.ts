import { generateText, Output } from 'ai';
import { LessonSchema, type Lesson, LessonBlockSchema, type LessonBlock } from './schema';

const model = process.env.AI_MODEL || 'openai/gpt-5.6-sol';

const baseRules = `
Jsi expert na didaktiku a interaktivní výuku. Tvoříš lekce pro aplikaci EduPilot.
Výstup MUSÍ být prakticky použitelný bez dalšího přepisování učitelem.

Pravidla:
- Zadání studentům piš přímo, jasně a stručně, aby je učitel nemusel ústně opakovat.
- Preferuj aktivní práci studentů před výkladem.
- Humor používej pouze v míře odpovídající zadanému tónu a věku cílové skupiny; nikdy infantilně.
- Každý blok musí mít jednoznačný cíl a realistickou délku.
- U týmových aktivit napiš konkrétní výstup, který má tým vytvořit.
- U quiz/poll bloků vyplň options. U quizu vyplň correctAnswer přesně jako jednu z options.
- U reveal bloku vyplň revealText.
- U ranking bloku vyplň items.
- U otevřených odpovědí a exit ticketu formuluj jednu konkrétní otázku.
- teacherNote používej pro stručnou metodickou poznámku, řešení nebo debrief; student ji nevidí.
- points přidávej tam, kde dává smysl týmová soutěž.
- Nevymýšlej faktické údaje, studie ani citace, pokud nejsou součástí uživatelova zadání. Když je aktivita potřebuje, použij zjevně fiktivní scénář.
- Celkový součet durationMinutes má co nejpřesněji odpovídat požadované délce.
- Jazyk výstupu je čeština, není-li výslovně požadováno jinak.
`;

function getGatewayCost(providerMetadata: unknown): number | null {
  if (!providerMetadata || typeof providerMetadata !== 'object') return null;

  const gateway = (providerMetadata as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== 'object') return null;

  const rawCost = (gateway as Record<string, unknown>).cost;
  const parsed = typeof rawCost === 'number'
    ? rawCost
    : typeof rawCost === 'string'
      ? Number(rawCost)
      : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function createLesson(input: {
  prompt: string;
  audience: string;
  duration: number;
  groupSize: string;
  tone: string;
}) {
  const { output, providerMetadata } = await generateText({
    model,
    output: Output.object({ schema: LessonSchema }),
    system: baseRules,
    prompt: `Vytvoř interaktivní lekci podle tohoto zadání:\n\n${input.prompt}\n\nCílová skupina: ${input.audience}\nPožadovaná délka: ${input.duration} minut\nVelikost týmu: ${input.groupSize}\nTón: ${input.tone}\n\nLekce má působit jako hotová interaktivní aplikace, ne jako osnovy pro učitele.`,
  });

  const lesson = LessonSchema.parse({ ...output, totalMinutes: output.blocks.reduce((sum, b) => sum + b.durationMinutes, 0) });
  return { lesson, costUsd: getGatewayCost(providerMetadata) };
}

export async function reviseLesson(lesson: Lesson, instruction: string) {
  const { output, providerMetadata } = await generateText({
    model,
    output: Output.object({ schema: LessonSchema }),
    system: baseRules,
    prompt: `Uprav existující lekci přesně podle instrukce učitele. Zachovej vše, co instrukce nemění.\n\nINSTRUKCE:\n${instruction}\n\nEXISTUJÍCÍ LEKCE:\n${JSON.stringify(lesson, null, 2)}`,
  });

  const revisedLesson = LessonSchema.parse({ ...output, totalMinutes: output.blocks.reduce((sum, b) => sum + b.durationMinutes, 0) });
  return { lesson: revisedLesson, costUsd: getGatewayCost(providerMetadata) };
}

export async function reviseBlock(block: LessonBlock, instruction: string, lessonContext: Pick<Lesson, 'title' | 'audience' | 'groupSize' | 'learningObjectives'>) {
  const { output, providerMetadata } = await generateText({
    model,
    output: Output.object({ schema: LessonBlockSchema }),
    system: baseRules,
    prompt: `Uprav JEN tento blok lekce podle instrukce. Zachovej jeho id a vše, co instrukce nemění.\n\nINSTRUKCE:\n${instruction}\n\nKONTEXT LEKCE:\n${JSON.stringify(lessonContext, null, 2)}\n\nBLOK:\n${JSON.stringify(block, null, 2)}`,
  });

  const revisedBlock = LessonBlockSchema.parse({ ...output, id: block.id });
  return { block: revisedBlock, costUsd: getGatewayCost(providerMetadata) };
}
