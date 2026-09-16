import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonBlockSchema } from '@/lib/schema';
import { reviseBlock } from '@/lib/ai';

export const maxDuration = 60;

const InputSchema = z.object({
  instruction: z.string().min(2).max(2000),
  block: LessonBlockSchema,
  lessonContext: z.object({
    title: z.string(),
    audience: z.string(),
    groupSize: z.string(),
    learningObjectives: z.array(z.string()),
  }),
});

export async function POST(req: Request) {
  try {
    const { instruction, block, lessonContext } = InputSchema.parse(await req.json());
    return NextResponse.json(await reviseBlock(block, instruction, lessonContext));
  } catch (error) {
    console.error('revise block failed', error);
    return NextResponse.json({ error: 'Úprava aktivity se nepodařila.' }, { status: 500 });
  }
}
