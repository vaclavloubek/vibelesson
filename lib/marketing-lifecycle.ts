import { after } from 'next/server';
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
  | 'syllonaut.subscription.renewing_soon'
  | 'syllonaut.organization_owner.activated'
  | 'syllonaut.organization_member.joined'
  | 'syllonaut.quota.near_limit'
  | 'syllonaut.quota.reached'
  | 'syllonaut.grading_quota.reached';

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

// invoice.upcoming identifies only the Stripe subscription, so its owner and plan
// come from the LIVE billing_subscriptions row. Only an active subscription that
// is not set to cancel at period end will actually renew; anything else (including
// organization subscriptions, which have no row here) is skipped.
async function loadRenewingSubscription(subscriptionId: string) {
  let row: { user_id?: unknown; plan_code?: unknown } | null | undefined;
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select user_id, plan_code from public.billing_subscriptions
      where provider = 'stripe' and livemode = true
        and external_subscription_id = ${subscriptionId}
        and status = 'active' and cancel_at_period_end = false
      limit 1
    `;
    row = rows[0];
  } else {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('billing_subscriptions')
      .select('user_id, plan_code')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('external_subscription_id', subscriptionId)
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .maybeSingle();
    if (error) throw new MarketingLifecycleError('marketing_renewing_subscription_lookup_failed');
    row = data;
  }
  if (!row) return null;
  if (typeof row.user_id !== 'string') {
    throw new MarketingLifecycleError('marketing_renewing_subscription_user_invalid');
  }
  if (row.plan_code !== 'teacher' && row.plan_code !== 'teacher_pro') {
    throw new MarketingLifecycleError('marketing_renewing_subscription_plan_invalid');
  }
  return { userId: row.user_id, planCode: row.plan_code };
}

export async function emitSubscriptionRenewingSoon(subscriptionId: string) {
  const subscription = await loadRenewingSubscription(subscriptionId);
  if (!subscription) return null;

  const result = await ensureMarketingContact(subscription.userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.subscription.renewing_soon', { plan_code: subscription.planCode });
  return result;
}

export type OrganizationFirstActivation = {
  ownerUserId: string;
  planCode: 'school' | 'campus';
};

type OrganizationActivationRow = {
  owner_user_id?: unknown;
  plan_code?: unknown;
  activated_at?: unknown;
  is_internal_test?: unknown;
  livemode?: unknown;
};

// Every activation RPC writes organizations.activated_at only once (coalesce), so a
// null value read just before the RPC means that call performs the first activation.
// Internal test organizations, sandbox orders and plans without an owner onboarding
// flow (team) are skipped. Best-effort: a lookup failure must never block billing.
export async function loadOrganizationFirstActivation(
  lookup: { orderId: string } | { variableSymbol: string },
): Promise<OrganizationFirstActivation | null> {
  let row: OrganizationActivationRow | null | undefined;
  try {
    if (getDatabaseBackend() === 'neon') {
      assertApprovedNeonCutover();
      const sql = createNeonSql();
      const rows = 'orderId' in lookup
        ? await sql`
          select o.owner_user_id, o.plan_code, o.activated_at, o.is_internal_test, oo.livemode
          from public.organization_orders oo
          join public.organizations o on o.id = oo.organization_id
          where oo.id = ${lookup.orderId}::uuid
          limit 1
        `
        : await sql`
          select owner_user_id, plan_code, activated_at, is_internal_test, true as livemode
          from public.organizations
          where payment_variable_symbol = ${lookup.variableSymbol}
          limit 1
        `;
      row = rows[0];
    } else {
      const admin = createAdminClient();
      let organizationId: string | null = null;
      let livemode: unknown = true;
      if ('orderId' in lookup) {
        const { data, error } = await admin
          .from('organization_orders')
          .select('organization_id, livemode')
          .eq('id', lookup.orderId)
          .maybeSingle();
        if (error) throw new MarketingLifecycleError('marketing_organization_lookup_failed');
        organizationId = data?.organization_id ?? null;
        livemode = data?.livemode;
      }
      const query = admin
        .from('organizations')
        .select('owner_user_id, plan_code, activated_at, is_internal_test');
      const { data, error } = organizationId
        ? await query.eq('id', organizationId).maybeSingle()
        : 'variableSymbol' in lookup
          ? await query.eq('payment_variable_symbol', lookup.variableSymbol).maybeSingle()
          : { data: null, error: null };
      if (error) throw new MarketingLifecycleError('marketing_organization_lookup_failed');
      row = data ? { ...data, livemode } : null;
    }
  } catch (lookupError) {
    console.warn('marketing organization activation lookup failed', {
      code: lookupError instanceof Error ? lookupError.message : 'unknown',
    });
    return null;
  }

  if (!row || row.activated_at !== null || row.is_internal_test !== false || row.livemode !== true) {
    return null;
  }
  if (row.plan_code !== 'school' && row.plan_code !== 'campus') return null;
  if (typeof row.owner_user_id !== 'string') return null;
  return { ownerUserId: row.owner_user_id, planCode: row.plan_code };
}

export async function emitOrganizationOwnerActivated(userId: string, payload: { plan_code: string }) {
  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.organization_owner.activated', { plan_code: payload.plan_code });
  return result;
}

// Runs after the response, so a marketing failure never fails the activation request.
export function scheduleOrganizationOwnerActivated(activation: OrganizationFirstActivation | null) {
  if (!activation) return;
  const { ownerUserId, planCode } = activation;
  after(async () => {
    try {
      await emitOrganizationOwnerActivated(ownerUserId, { plan_code: planCode });
    } catch (marketingError) {
      console.warn('marketing organization owner activation failed', {
        code: marketingError instanceof Error ? marketingError.message : 'unknown',
      });
    }
  });
}

export async function emitOrganizationMemberJoined(userId: string) {
  // Internal test organizations never start marketing flows, and the member template
  // speaks about a school organization, so only School and Campus members qualify.
  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || organization.isInternalTest) return null;
  if (organization.planCode !== 'school' && organization.planCode !== 'campus') return null;

  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.organization_member.joined');
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

type AiGradingQuotaNoticeRow = {
  id: string;
  recipient_user_id: string;
  organization_id: string | null;
  organization_internal_test: boolean;
  window_start: string | Date;
  window_end: string | Date;
  used_count: number;
  count_limit: number;
  plan_code: string;
  quota_scope: 'individual' | 'organization';
  attempt_count: number;
};

const AI_GRADING_QUOTA_NOTICE_BATCH = 20;

// private.reserve_ai_grading_budget records one notice per account and quota
// window when AI grading suggestions run out (neon/migrations/0016). This turns
// them into the marketing event; the email itself is a Resend automation.
// Organizations notify their owner. Claims are leased, so concurrent drains
// never send the same notice twice; failures retry up to 5 attempts.
export async function drainAiGradingQuotaNotices(max = AI_GRADING_QUOTA_NOTICE_BATCH) {
  const summary = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  if (getDatabaseBackend() !== 'neon') return summary;
  assertApprovedNeonCutover();

  const limit = Math.max(1, Math.min(AI_GRADING_QUOTA_NOTICE_BATCH, Math.trunc(max)));
  const sql = createNeonSql();
  const rows = await sql`
    select * from private.claim_ai_grading_quota_notices(${limit}::integer)
  ` as AiGradingQuotaNoticeRow[];
  summary.claimed = rows.length;

  for (const row of rows) {
    let status: 'sent' | 'skipped' | 'failed';
    let detail: string | null = null;
    try {
      const windowEnd = new Date(row.window_end);
      if (row.organization_internal_test) {
        status = 'skipped';
        detail = 'internal_test_organization';
      } else if (!(windowEnd.getTime() > Date.now())) {
        // The allowance has already reset; an email now would be misleading.
        status = 'skipped';
        detail = 'window_ended';
      } else {
        const result = await ensureMarketingContact(row.recipient_user_id);
        if (result.status !== 'active') {
          status = 'skipped';
          detail = result.status;
        } else {
          await sendLifecycleEvent(result, 'syllonaut.grading_quota.reached', {
            used: Math.max(0, Math.trunc(Number(row.used_count))),
            limit: Math.max(1, Math.trunc(Number(row.count_limit))),
            reset_date: windowEnd.toISOString(),
            quota_scope: row.quota_scope,
            plan_code: row.plan_code,
          });
          status = 'sent';
        }
      }
    } catch (error) {
      status = 'failed';
      detail = error instanceof MarketingLifecycleError ? error.code : 'grading_quota_notice_failed';
    }

    summary[status] += 1;
    await sql`
      select private.finish_ai_grading_quota_notice(${row.id}::uuid, ${status}, ${detail})
    `;
  }

  return summary;
}
