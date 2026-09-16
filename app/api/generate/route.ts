import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLesson } from '@/lib/ai';

export const maxDuration = 60;

const InputSchema = z.object({
  prompt: z.string().min(5).max(5000),
  audience: z.string().min(1).max(200),
  duration: z.number().int().min(10).max(360),
  groupSize: z.string().min(1).max(100),
  tone: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const input = InputSchema.parse(await req.json());
    const lesson = await createLesson(input);
    return NextResponse.json(lesson);
  } catch (error) {
    console.error('generate lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo vygenerovat. Zkus to prosím znovu.' }, { status: 500 });
  }
}
