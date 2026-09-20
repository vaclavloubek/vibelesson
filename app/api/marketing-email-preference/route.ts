import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { syncLifecycleContact } from '@/lib/lifecycle-email';

const InputSchema = z.object({ enabled: z.boolean() });

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  try {
    const { enabled } = InputSchema.parse(await request.json());
    const { error } = await supabase.rpc('set_marketing_email_consent', { p_granted: enabled });
    if (error) {
      console.error('marketing consent update failed', { code: error.code });
      return NextResponse.json({ error: 'marketing_consent_update_failed' }, { status: 500 });
    }

    try {
      await syncLifecycleContact(userId);
    } catch (syncError) {
      console.error('marketing consent resend sync failed', syncError);
      return NextResponse.json({ error: 'marketing_consent_sync_failed' }, { status: 503 });
    }

    return NextResponse.json({ enabled });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    console.error('marketing consent request failed', error);
    return NextResponse.json({ error: 'marketing_consent_request_failed' }, { status: 500 });
  }
}
