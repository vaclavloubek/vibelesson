import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { reviseLesson } from '@/lib/ai';

export const maxDuration = 60;

const InputSchema = z.object({
  instruction: z.string().min(2).max(3000),
  lesson: LessonSchema,
});

export async function POST(req: Request) {
  try {
    const { instruction, lesson } = InputSchema.parse(await req.json());
    return NextResponse.json(await reviseLesson(lesson, instruction));
  } catch (error) {
    console.error('revise lesson failed', error);
    return NextResponse.json({ error: 'Úprava lekce se nepodařila. Zkus formulovat změnu jinak.' }, { status: 500 });
  }
}
