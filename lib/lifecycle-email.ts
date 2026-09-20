import { normalizeUiLocale, type UiLocale } from '@/lib/i18n';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const RESEND_API = 'https://api.resend.com';
const MARKETING_TOPIC_ID = '63c4729e-bef9-4192-90a0-86b1c29aac81';

export type LifecycleEventName =
  | 'syllonaut.onboarding.started'
  | 'syllonaut.first_lesson.created'
  | 'syllonaut.first_live.started'
  | 'syllonaut.subscription.upgraded'
  | 'syllonaut.quota.near_limit'
  | 'syllonaut.quota.reached';

type EventPayload = Record<string, string | number | boolean>;

type QuotaRow = {
  lesson_used: number;
  lesson_limit: number | null;
  lesson_remaining: number | null;
  lesson_unlimited: boolean;
};

function resendApiKey() {
  const key = process.env.RESEND_API_KEY;
  return key && key.startsWith('re_') ? key : null;
}

async function resendRequest(path: string, init: RequestInit) {
  const apiKey = resendApiKey();
  if (!apiKey) throw new Error('lifecycle_resend_api_key_missing');

  return fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

async function lifecycleContext(userId: string) {
  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: authUser, error: authError }] = await Promise.all([
    admin
      .from('profiles')
      .select('marketing_email_consent, ui_locale, active_plan_code, role')
      .eq('id', userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (profileError) throw new Error('lifecycle_profile_lookup_failed');
  const email = authUser.user?.email?.trim().toLowerCase();
  if (authError || !email) throw new Error('lifecycle_email_missing');

  let organization = null;
  try {
    organization = await getCurrentOrganizationForUser(userId);
  } catch {
    throw new Error('lifecycle_organization_lookup_failed');
  }

  const activeOrganizationPlan = organization
    && !['expired', 'cancelled'].includes(organization.status)
      ? organization.planCode
      : null;

  const plan = profile?.role === 'admin'
    ? 'admin'
    : activeOrganizationPlan
      ?? (typeof profile?.active_plan_code === 'string' && profile.active_plan_code
        ? profile.active_plan_code
        : 'free');

  const metadataLocale = normalizeUiLocale(authUser.user?.user_metadata?.ui_locale);
  const locale: UiLocale = normalizeUiLocale(profile?.ui_locale) ?? metadataLocale ?? 'cs';
  const marketingConsent = Boolean(profile?.marketing_email_consent);

  return { email, locale, plan, marketingConsent };
}

async function ensureResendContact(context: Awaited<ReturnType<typeof lifecycleContext>>) {
  const properties = {
    ui_locale: context.locale,
    plan: context.plan,
    marketing_status: context.marketingConsent ? 'opt_in' : 'opt_out',
  };

  const encodedEmail = encodeURIComponent(context.email);
  const patch = await resendRequest(`/contacts/${encodedEmail}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });

  if (patch.status === 404) {
    if (!context.marketingConsent) return false;
    const create = await resendRequest('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email: context.email,
        properties,
        topics: [{ id: MARKETING_TOPIC_ID, subscription: 'opt_in' }],
      }),
    });
    if (!create.ok && create.status !== 409) throw new Error(`lifecycle_contact_create_${create.status}`);
  } else if (!patch.ok) {
    throw new Error(`lifecycle_contact_update_${patch.status}`);
  }

  const topic = await resendRequest(`/contacts/${encodedEmail}/topics`, {
    method: 'PATCH',
    body: JSON.stringify({
      topics: [{
        id: MARKETING_TOPIC_ID,
        subscription: context.marketingConsent ? 'opt_in' : 'opt_out',
      }],
    }),
  });
  if (!topic.ok && topic.status !== 404) throw new Error(`lifecycle_topic_update_${topic.status}`);

  return true;
}

export async function syncLifecycleContact(userId: string) {
  const context = await lifecycleContext(userId);
  await ensureResendContact(context);
  return context;
}

export async function sendLifecycleEvent(
  userId: string,
  event: LifecycleEventName,
  payload: EventPayload = {},
) {
  const context = await lifecycleContext(userId);
  if (!context.marketingConsent) {
    await ensureResendContact(context);
    return { skipped: 'no_marketing_consent' as const };
  }

  await ensureResendContact(context);
  const response = await resendRequest('/events/send', {
    method: 'POST',
    body: JSON.stringify({
      event,
      email: context.email,
      payload: {
        ui_locale: context.locale,
        plan: context.plan,
        ...payload,
      },
    }),
  });

  if (!response.ok) throw new Error(`lifecycle_event_send_${response.status}`);
  return { sent: true as const, event };
}

export async function sendFirstLessonLifecycleEvent(userId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);
  if (error) throw new Error('lifecycle_first_lesson_count_failed');
  if (count !== 1) return { skipped: 'not_first_lesson' as const };
  return sendLifecycleEvent(userId, 'syllonaut.first_lesson.created');
}

export async function sendFirstLiveLifecycleEvent(userId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', userId)
    .not('started_at', 'is', null);
  if (error) throw new Error('lifecycle_first_live_count_failed');
  if (count !== 1) return { skipped: 'not_first_live' as const };
  return sendLifecycleEvent(userId, 'syllonaut.first_live.started');
}

export async function sendLessonQuotaLifecycleEvent(
  userId: string,
  supabase: { rpc: (name: 'get_ai_quota') => PromiseLike<{ data: unknown; error: unknown }> },
) {
  const { data, error } = await supabase.rpc('get_ai_quota');
  if (error) throw new Error('lifecycle_quota_lookup_failed');
  const row = (Array.isArray(data) ? data[0] : data) as QuotaRow | null;
  if (!row || row.lesson_unlimited || row.lesson_limit !== 3) return { skipped: 'not_free_lesson_quota' as const };

  if (row.lesson_remaining === 1) {
    return sendLifecycleEvent(userId, 'syllonaut.quota.near_limit', {
      used: row.lesson_used,
      limit: row.lesson_limit,
    });
  }
  if (row.lesson_remaining === 0) {
    return sendLifecycleEvent(userId, 'syllonaut.quota.reached', {
      used: row.lesson_used,
      limit: row.lesson_limit,
    });
  }
  return { skipped: 'no_quota_threshold' as const };
}
