import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { sendOrganizationInvitationEmail } from '@/lib/organization-email';
import { normalizeUiLocale } from '@/lib/i18n';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const EntrySchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['admin', 'teacher']).default('teacher'),
});

const InputSchema = z.object({
  entries: z.array(EntrySchema).min(1).max(100),
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
    return NextResponse.json({ error: 'invalid_bulk_invitation' }, { status: 400 });
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

  const unique = new Map<string, 'admin' | 'teacher'>();
  for (const entry of input.entries) {
    const email = entry.email.trim().toLowerCase();
    if (!unique.has(email)) unique.set(email, entry.role);
  }

  const invited: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const [email, role] of unique) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitationId, error } = await admin.rpc(
      'create_organization_invitation',
      {
        p_organization_id: organization.id,
        p_created_by: userId,
        p_email_normalized: email,
        p_role: role,
        p_locale: locale,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      },
    );

    if (error || !invitationId) {
      const message = error?.message ?? '';
      const code = message.includes('member_already_active')
        ? 'member_already_active'
        : message.includes('replacement_limit')
          ? 'replacement_limit_reached'
          : message.includes('seat_limit')
            ? 'seat_limit_reached'
            : error?.code === '23505'
              ? 'already_pending'
              : 'create_failed';
      failed.push({ email, error: code });
      if (code === 'seat_limit_reached' || code === 'replacement_limit_reached') break;
      continue;
    }

    const invitationUrl =
      'https://www.syllonaut.com/school/invite?token=' + encodeURIComponent(token);

    try {
      await sendOrganizationInvitationEmail({
        invitationId: String(invitationId),
        organizationName: organization.name,
        recipient: email,
        invitationUrl,
        locale,
      });
      invited.push(email);
    } catch (emailError) {
      console.error('bulk organization invitation email failed', {
        invitationId,
        email,
        error: emailError instanceof Error ? emailError.message : 'unknown',
      });
      await admin
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId)
        .eq('organization_id', organization.id)
        .eq('status', 'pending');
      failed.push({ email, error: 'email_failed' });
    }
  }

  return NextResponse.json({
    invited,
    failed,
    requested: unique.size,
  }, { status: invited.length ? 200 : 409 });
}
