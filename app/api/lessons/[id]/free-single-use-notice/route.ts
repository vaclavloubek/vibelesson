import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { recordFreeSingleUseNoticeAcknowledgement } from '@/lib/free-single-use-notice-ack';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const AcknowledgementSchema = z.object({
  dismissedVia: z.enum(['ok', 'close']),
  locale: z.enum(['cs', 'en']),
}).strict();

export async function POST(request: Request, { params }: RouteContext) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const lessonId = z.string().uuid().safeParse(id);
  if (!lessonId.success) return NextResponse.json({ error: 'invalid_lesson' }, { status: 400 });

  let input: z.infer<typeof AcknowledgementSchema>;
  try {
    input = AcknowledgementSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_acknowledgement' }, { status: 400 });
  }

  try {
    const acknowledgedAt = await recordFreeSingleUseNoticeAcknowledgement({
      userId,
      lessonId: lessonId.data,
      locale: input.locale,
      dismissedVia: input.dismissedVia,
    });
    return NextResponse.json({ acknowledged: true, acknowledgedAt });
  } catch (error) {
    console.error('record free single use notice acknowledgement failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'acknowledgement_failed' }, { status: 500 });
  }
}
