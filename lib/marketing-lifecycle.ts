import { normalizeUiLocale } from '@/lib/i18n';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

const RESEND_API_BASE = 'https://api.resend.com';
const RESEND_REQUEST_TIMEOUT_MS = 8_000;

export type MarketingLifecycleEvent =
  | 'syllonaut.onboarding.started'
  | 'syllonaut.first_lesson.created'
  | 'syllonaut.first_live.started'
  | 'syllonaut.subscription.upgraded'
  | 'syllonaut.subscription.ended'
  | 'syllonaut.quota.near_limit'
  | 'syllonaut.quota.reached';

type MarketingContext = {
  email: string;
  consent: boolean;
  locale: 'cs' | 'en';
  plan: string;
};

type ResendContact = {
  id?: string;
  email?: string;
  unsubscribed?: boolean;
};

type SyncResult =
  | { status: 'active'; email: string; locale: 'cs' | 'en'; plan: string }
  | { status: 'disabled' | 'unsubscribed' | 'missing_email' | 'not_configured' };

export class MarketingLifecycleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'MarketingLifecycleError';
  }
}

function resendApiKey() {
  const key = process.env.RESEND_API_KEY;
  return key && key.startsWith('re_') ? key : null;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resendRequest(
  path: string,
  init: RequestInit,
  options: { allowNotFound?: boolean } = {},
): Promise<Response | null> {
  const apiKey = resendApiKey();
  if (!apiKey) throw new MarketingLifecycleError('resend_api_key_missing');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${RESEND_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Syllonaut/marketing-lifecycle',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt === 0) {
        await delay(150);
        continue;
      }
      throw new MarketingLifecycleError('resend_network_error');
    }

    if (options.allowNotFound && response.status === 404) return null;
    if (response.ok) return response;

    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await delay(150);
      continue;
    }

    throw new MarketingLifecycleError(`resend_http_${response.status}`);
  }

  throw new MarketingLifecycleError('resend_request_failed');
}

async function loadMarketingContext(userId: string): Promise<MarketingContext | null> {
  let profile: { marketing_email_consent: boolean; ui_locale: string | null; active_plan_code: string | null } | null;
  let email: string | undefined;
  let metadata: Record<string, unknown> | null = null;
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const [profileRows, identityRows] = await Promise.all([
      sql`
        select marketing_email_consent, ui_locale, active_plan_code
        from public.profiles where id = ${userId}::uuid limit 1
      `,
      sql`
        select email, raw_user_meta_data from app_identity.users
        where id = ${userId}::uuid and deleted_at is null limit 1
      `,
    ]);
    profile = (profileRows[0] as typeof profile | undefined) ?? null;
    email = (identityRows[0]?.email as string | undefined)?.trim().toLowerCase();
    metadata = (identityRows[0]?.raw_user_meta_data as Record<string, unknown> | null | undefined) ?? null;
    if (!identityRows[0]) throw new MarketingLifecycleError('marketing_user_lookup_failed');
  } else {
    const admin = createAdminClient();
    const [{ data, error: profileError }, { data: authData, error: authError }] = await Promise.all([
      admin
        .from('profiles')
        .select('marketing_email_consent, ui_locale, active_plan_code')
        .eq('id', userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    if (profileError) throw new MarketingLifecycleError('marketing_profile_lookup_failed');
    if (authError) throw new MarketingLifecycleError('marketing_user_lookup_failed');
    profile = data;
    email = authData.user?.email?.trim().toLowerCase();
    metadata = authData.user?.user_metadata ?? null;
  }

  if (!profile) throw new MarketingLifecycleError('marketing_profile_lookup_failed');
  if (!email) return null;

  const metadataLocale = typeof metadata?.ui_locale === 'string'
    ? normalizeUiLocale(metadata.ui_locale)
    : null;
  const locale = normalizeUiLocale(profile.ui_locale) ?? metadataLocale ?? 'cs';

  // Organization members must never enter the individual Free conversion branch.
  // Fail closed if the organization lookup itself is unhealthy.
  const organization = await getCurrentOrganizationForUser(userId);
  const individualPlan = typeof profile.active_plan_code === 'string' && profile.active_plan_code
    ? profile.active_plan_code
    : 'free';
  const plan = organization ? `organization_${organization.planCode}` : individualPlan;

  return {
    email,
    consent: Boolean(profile.marketing_email_consent),
    locale,
    plan,
  };
}

async function getResendContact(email: string): Promise<ResendContact | null> {
  const response = await resendRequest(
    `/contacts/${encodeURIComponent(email)}`,
    { method: 'GET' },
    { allowNotFound: true },
  );
  if (!response) return null;

  const payload = await response.json().catch(() => null) as ResendContact | null;
  if (!payload || typeof payload !== 'object') {
    throw new MarketingLifecycleError('resend_contact_response_invalid');
  }
  return payload;
}

async function updateResendContact(
  email: string,
  input: { unsubscribed?: boolean; properties: Record<string, string | number | null> },
) {
  await resendRequest(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

async function createResendContact(context: MarketingContext) {
  const response = await resendRequest('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email: context.email,
      unsubscribed: false,
      properties: {
        marketing_status: 'opt_in',
        ui_locale: context.locale,
        plan: context.plan,
      },
    }),
  });
  if (!response) throw new MarketingLifecycleError('resend_contact_create_failed');
}

async function ensureMarketingContact(
  userId: string,
  { explicitConsent = false }: { explicitConsent?: boolean } = {},
): Promise<SyncResult> {
  if (!resendApiKey()) return { status: 'not_configured' };

  const context = await loadMarketingContext(userId);
  if (!context) return { status: 'missing_email' };

  const existing = await getResendContact(context.email);

  if (!context.consent) {
    if (existing) {
      await updateResendContact(context.email, {
        unsubscribed: true,
        properties: {
          marketing_status: 'opt_out',
          ui_locale: context.locale,
          plan: context.plan,
        },
      });
    }
    return { status: 'disabled' };
  }

  // A Resend unsubscribe is authoritative until the user explicitly opts in again
  // inside Syllonaut. Product events must never silently resubscribe the contact.
  if (existing?.unsubscribed && !explicitConsent) {
    await updateResendContact(context.email, {
      properties: {
        marketing_status: 'opt_out',
        ui_locale: context.locale,
        plan: context.plan,
      },
    });
    return { status: 'unsubscribed' };
  }

  if (existing) {
    await updateResendContact(context.email, {
      ...(explicitConsent ? { unsubscribed: false } : {}),
      properties: {
        marketing_status: 'opt_in',
        ui_locale: context.locale,
        plan: context.plan,
      },
    });
  } else {
    await createResendContact(context);
  }

  return {
    status: 'active',
    email: context.email,
    locale: context.locale,
    plan: context.plan,
  };
}

async function sendLifecycleEvent(
  result: Extract<SyncResult, { status: 'active' }>,
  event: MarketingLifecycleEvent,
  payload: Record<string, string | number | boolean> = {},
) {
  await resendRequest('/events/send', {
    method: 'POST',
    body: JSON.stringify({
      event,
      email: result.email,
      payload: {
        ui_locale: result.locale,
        plan: result.plan,
        ...payload,
      },
    }),
  });
}

export async function syncMarketingPreference(userId: string) {
  return ensureMarketingContact(userId, { explicitConsent: true });
}

export async function startMarketingOnboarding(userId: string) {
  const result = await ensureMarketingContact(userId, { explicitConsent: true });
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.onboarding.started');
  return result;
}

export async function syncMarketingPlan(userId: string) {
  return ensureMarketingContact(userId);
}

export async function emitSubscriptionUpgraded(userId: string) {
  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.subscription.upgraded');
  return result;
}

// The profile is already back on Free when a subscription ends, so the plan the
// user had comes from the ended subscription row itself (derived from its Stripe
// price by sync_stripe_subscription_event and kept after cancellation).
async function loadEndedSubscriptionPlanCode(userId: string, subscriptionId: string) {
  let planCode: unknown;
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select plan_code from public.billing_subscriptions
      where provider = 'stripe' and livemode = true
        and external_subscription_id = ${subscriptionId}
        and user_id = ${userId}::uuid
      limit 1
    `;
    planCode = rows[0]?.plan_code;
  } else {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('billing_subscriptions')
      .select('plan_code')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('external_subscription_id', subscriptionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new MarketingLifecycleError('marketing_ended_subscription_lookup_failed');
    planCode = data?.plan_code;
  }
  if (planCode !== 'teacher' && planCode !== 'teacher_pro') {
    throw new MarketingLifecycleError('marketing_ended_subscription_plan_invalid');
  }
  return planCode;
}

export async function emitSubscriptionEnded(userId: string, subscriptionId: string) {
  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  const planCode = await loadEndedSubscriptionPlanCode(userId, subscriptionId);
  await sendLifecycleEvent(result, 'syllonaut.subscription.ended', { plan_code: planCode });
  return result;
}

export async function emitFirstLessonCreatedIfNeeded(userId: string) {
  let count: number;
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`select count(*)::integer as count from public.lessons where owner_id = ${userId}::uuid`;
    count = Number(rows[0]?.count);
  } else {
    const admin = createAdminClient();
    const result = await admin
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId);
    if (result.error) throw new MarketingLifecycleError('marketing_first_lesson_lookup_failed');
    count = result.count ?? 0;
  }
  if (!Number.isFinite(count)) throw new MarketingLifecycleError('marketing_first_lesson_lookup_failed');
  if (count !== 1) return { status: 'not_first' as const };

  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.first_lesson.created');
  return result;
}

export async function emitFirstLiveStartedIfNeeded(userId: string) {
  let count: number;
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select count(*)::integer as count from public.sessions
      where teacher_id = ${userId}::uuid and started_at is not null
    `;
    count = Number(rows[0]?.count);
  } else {
    const admin = createAdminClient();
    const result = await admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', userId)
      .not('started_at', 'is', null);
    if (result.error) throw new MarketingLifecycleError('marketing_first_live_lookup_failed');
    count = result.count ?? 0;
  }
  if (!Number.isFinite(count)) throw new MarketingLifecycleError('marketing_first_live_lookup_failed');
  if (count !== 1) return { status: 'not_first' as const };

  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.first_live.started');
  return result;
}

export async function emitFreeLessonQuotaLifecycle(
  userId: string,
  used: number,
  monthlyLimit: number | null,
) {
  if (!Number.isFinite(used) || monthlyLimit === null || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
    return { status: 'invalid_quota' as const };
  }

  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;
  if (result.plan !== 'free') return { status: 'not_free' as const };

  const limit = Math.max(1, Math.trunc(monthlyLimit));
  const normalizedUsed = Math.max(0, Math.trunc(used));

  if (normalizedUsed === limit) {
    await sendLifecycleEvent(result, 'syllonaut.quota.reached', {
      used: normalizedUsed,
      limit,
    });
    return result;
  }

  if (normalizedUsed === Math.max(1, limit - 1)) {
    await sendLifecycleEvent(result, 'syllonaut.quota.near_limit', {
      used: normalizedUsed,
      limit,
    });
  }

  return result;
}
