import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  token: z.string().min(20).max(200),
});

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_invitation_token' }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email || userData.user?.id !== userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const admin = createAdminClient();
  const tokenHash = createHash('sha256').update(input.token).digest('hex');
  const { data, error } = await admin.rpc('accept_organization_invitation', {
    p_user_id: userId,
    p_email_normalized: email,
    p_token_hash: tokenHash,
  });

  if (error) {
    const message = error.message ?? '';
    const code = message.includes('email_mismatch')
      ? 'invitation_email_mismatch'
      : message.includes('expired')
        ? 'invitation_expired'
        : message.includes('membership_exists')
          ? 'active_organization_membership_exists'
          : message.includes('replacement_limit')
            ? 'organization_replacement_limit_reached'
            : message.includes('seat_limit')
              ? 'organization_seat_limit_reached'
              : message.includes('not_found')
              ? 'invitation_not_found'
              : 'invitation_accept_failed';

    console.error('organization invitation accept failed', { dbCode: error.code, message });
    return NextResponse.json(
      { error: code },
      { status: code === 'invitation_accept_failed' ? 500 : 409 },
    );
  }

  return NextResponse.json({ accepted: true, ...(data as Record<string, unknown>) });
}
