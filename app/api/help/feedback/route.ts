import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isHelpAssistantSwitchOn } from '@/lib/help-assistant';

const InputSchema = z.object({
  requestId: z.string().uuid(),
  feedback: z.enum(['up', 'down']),
});

// Thumbs up/down on one answer. Runs under the teacher's own Data API session:
// RLS allows updating only the feedback column of their own succeeded rows.
export async function POST(req: Request) {
  if (!isHelpAssistantSwitchOn()) return NextResponse.json(null, { status: 404 });

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_input' }, { status: 400 });

  const { data, error } = await supabase
    .from('help_assistant_requests')
    .update({ feedback: parsed.data.feedback })
    .eq('id', parsed.data.requestId)
    .select('id');

  if (error) {
    console.error('help feedback failed', { code: error.code });
    return NextResponse.json({ code: 'unavailable' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ code: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
