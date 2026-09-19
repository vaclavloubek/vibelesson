import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const InputSchema = z.object({
  newOwnerUserId: z.string().uuid(),
});

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_owner_transfer' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || organization.role !== 'owner') {
    return NextResponse.json({ error: 'organization_owner_required' }, { status: 403 });
  }
  if (organization.isInternalTest) {
    return NextResponse.json({ error: 'internal_test_owner_is_locked' }, { status: 409 });
  }
  if (input.newOwnerUserId === userId) {
    return NextResponse.json({ error: 'new_owner_must_differ' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('transfer_organization_ownership', {
    p_organization_id: organization.id,
    p_current_owner: userId,
    p_new_owner: input.newOwnerUserId,
  });

  if (error) {
    const message = error.message ?? '';
    const code = message.includes('active_member')
      ? 'new_owner_must_be_active_member'
      : 'organization_owner_transfer_failed';
    console.error('organization owner transfer failed', {
      organizationId: organization.id,
      code: error.code,
      message,
    });
    return NextResponse.json(
      { error: code },
      { status: code === 'organization_owner_transfer_failed' ? 500 : 409 },
    );
  }

  return NextResponse.json({ transferred: true });
}
