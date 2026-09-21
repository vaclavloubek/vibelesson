import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';
import { recordCurrentTermsReconsent } from '@/lib/terms-acceptance';

export const dynamic = 'force-dynamic';

const ReconsentSchema = z.object({
  termsAccepted: z.literal(true),
  termsVersion: z.literal(TERMS_ACCEPTANCE_KEY),
}).strict();

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let input: z.infer<typeof ReconsentSchema>;
  try {
    input = ReconsentSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_terms_acceptance' }, { status: 400 });
  }

  try {
    const acceptedAt = await recordCurrentTermsReconsent(userId);
    return NextResponse.json({
      accepted: true,
      termsVersion: TERMS_VERSION,
      termsAcceptanceKey: input.termsVersion,
      acceptedAt,
    });
  } catch (error) {
    console.error('record Terms re-consent failed', error);
    return NextResponse.json({ error: 'terms_reconsent_failed' }, { status: 500 });
  }
}
