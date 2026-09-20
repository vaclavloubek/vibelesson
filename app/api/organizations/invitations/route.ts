import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOrganizationInvitationEmail } from '@/lib/organization-email';
import { normalizeUiLocale } from '@/lib/i18n';

const InputSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['admin', 'teacher']).default('teacher'),
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
    return NextResponse.json({ error: 'invalid_invitation' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('ui_locale')
    .eq('id', userId)
    .maybeSingle();

  const locale = normalizeUiLocale(profile?.ui_locale) ?? 'cs';
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitationId, error } = await admin.rpc('create_organization_invitation', {
    p_organization_id: organization.id,
    p_created_by: userId,
    p_email_normalized: input.email.toLowerCase(),
    p_role: input.role,
    p_locale: locale,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    const message = error.message ?? '';
    const code = message.includes('member_already_active')
      ? 'organization_member_already_active'
      : message.includes('replacement_limit')
        ? 'organization_replacement_limit_reached'
        : message.includes('seat_limit')
          ? 'organization_seat_limit_reached'
          : error.code === '23505'
            ? 'invitation_already_pending'
            : 'invitation_create_failed';
    console.error('organization invitation create failed', { dbCode: error.code, message });
    return NextResponse.json(
      { error: code },
      { status: code === 'invitation_create_failed' ? 500 : 409 },
    );
  }

  const invitationUrl =
    'https://www.syllonaut.com/school/invite?token=' + encodeURIComponent(token);

  let emailSent = false;
  try {
    await sendOrganizationInvitationEmail({
      invitationId: String(invitationId),
      organizationName: organization.name,
      recipient: input.email.toLowerCase(),
      invitationUrl,
      locale,
    });
    emailSent = true;
  } catch (emailError) {
    console.error('organization invitation email failed', emailError);
  }

  return NextResponse.json({
    invitationId,
    emailSent,
    invitationUrl: emailSent ? null : invitationUrl,
    expiresAt,
  }, { status: 201 });
}
