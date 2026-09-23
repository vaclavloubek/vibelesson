import { NextResponse } from 'next/server';
import { sendOrganizationRenewalReminderEmail } from '@/lib/organization-email';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (!secret || authorization !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createPrivilegedRpcClient();

  const [expiredResult, suspendedResult] = await Promise.all([
    admin.rpc('expire_organization_licenses'),
    admin.rpc('suspend_overdue_organizations', { p_grace_days: 14 }),
  ]);

  if (expiredResult.error || suspendedResult.error) {
    console.error('organization billing cron failed', {
      expireCode: expiredResult.error?.code,
      suspendCode: suspendedResult.error?.code,
    });
    return NextResponse.json(
      { error: 'organization_billing_cron_failed' },
      { status: 500 },
    );
  }

  const now = new Date();
  const reminderEnd = new Date(now.getTime() + 61 * 24 * 60 * 60 * 1000);

  const { data: reminderOrganizations, error: reminderLookupError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, name, billing_email, billing_country, current_period_end
        from public.organizations
        where status = 'active' and renewal_mode = 'manual_invoice'
          and current_period_end > ${now.toISOString()}::timestamptz
          and current_period_end <= ${reminderEnd.toISOString()}::timestamptz
      `;
      return { data: rows, error: null };
    })()
    : await createAdminClient()
      .from('organizations')
      .select('id, name, billing_email, billing_country, current_period_end')
      .eq('status', 'active')
      .eq('renewal_mode', 'manual_invoice')
      .gt('current_period_end', now.toISOString())
      .lte('current_period_end', reminderEnd.toISOString());

  if (reminderLookupError) {
    console.error('organization renewal reminder lookup failed', reminderLookupError.code);
    return NextResponse.json(
      { error: 'organization_renewal_reminder_lookup_failed' },
      { status: 500 },
    );
  }

  let remindersSent = 0;
  let reminderFailures = 0;

  for (const organization of reminderOrganizations ?? []) {
    if (!organization.current_period_end) continue;
    const periodEnd = new Date(organization.current_period_end);
    const daysRemaining = Math.ceil(
      (periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    const days = daysRemaining <= 7 ? 7 : daysRemaining <= 30 ? 30 : 60;
    const notificationType = 'renewal_' + days;

    const { data: reserved, error: reserveError } = await admin.rpc(
      'mark_organization_notification_sent',
      {
        p_organization_id: organization.id,
        p_notification_type: notificationType,
        p_period_end: organization.current_period_end,
        p_provider_message_id: null,
      },
    );

    if (reserveError) {
      reminderFailures += 1;
      console.error('organization renewal reminder reservation failed', {
        organizationId: organization.id,
        code: reserveError.code,
      });
      continue;
    }

    if (!reserved) continue;

    let emailDelivered = false;
    try {
      const messageId = await sendOrganizationRenewalReminderEmail({
        organizationId: organization.id,
        organizationName: organization.name,
        recipient: organization.billing_email,
        periodEnd: organization.current_period_end,
        days: days as 60 | 30 | 7,
        locale: organization.billing_country === 'CZ' ? 'cs' : 'en',
      });
      emailDelivered = true;

      if (getDatabaseBackend() === 'neon') {
        assertApprovedNeonCutover();
        await createNeonSql()`
          update public.organization_billing_notifications
          set provider_message_id = ${messageId}
          where organization_id = ${organization.id}::uuid
            and notification_type = ${notificationType}
            and period_end = ${organization.current_period_end}::timestamptz
        `;
      } else {
        await createAdminClient()
          .from('organization_billing_notifications')
          .update({ provider_message_id: messageId })
          .eq('organization_id', organization.id)
          .eq('notification_type', notificationType)
          .eq('period_end', organization.current_period_end);
      }

      remindersSent += 1;
    } catch (error) {
      reminderFailures += 1;
      console.error('organization renewal reminder send failed', {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      // If delivery succeeded but evidence persistence failed, keep the
      // reservation. Releasing it could send the same legal reminder twice.
      if (emailDelivered) continue;
      if (getDatabaseBackend() === 'neon') {
        assertApprovedNeonCutover();
        await createNeonSql()`
          delete from public.organization_billing_notifications
          where organization_id = ${organization.id}::uuid
            and notification_type = ${notificationType}
            and period_end = ${organization.current_period_end}::timestamptz
        `;
      } else {
        await createAdminClient()
          .from('organization_billing_notifications')
          .delete()
          .eq('organization_id', organization.id)
          .eq('notification_type', notificationType)
          .eq('period_end', organization.current_period_end);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    expired: expiredResult.data ?? 0,
    suspended: suspendedResult.data ?? 0,
    remindersSent,
    reminderFailures,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
