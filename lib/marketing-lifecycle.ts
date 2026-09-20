import { normalizeUiLocale } from '@/lib/i18n';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const RESEND_API_BASE = 'https://api.resend.com';
const RESEND_REQUEST_TIMEOUT_MS = 8_000;

export type MarketingLifecycleEvent =
  | 'syllonaut.onboarding.started'
  | 'syllonaut.first_lesson.created'
  | 'syllonaut.first_live.started'
  | 'syllonaut.subscription.upgraded'
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
  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: authData, error: authError }] = await Promise.all([
    admin
      .from('profiles')
      .select('marketing_email_consent, ui_locale, active_plan_code')
      .eq('id', userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (profileError || !profile) throw new MarketingLifecycleError('marketing_profile_lookup_failed');
  if (authError) throw new MarketingLifecycleError('marketing_user_lookup_failed');

  const email = authData.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const metadataLocale = typeof authData.user?.user_metadata?.ui_locale === 'string'
    ? normalizeUiLocale(authData.user.user_metadata.ui_locale)
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

export async function emitFirstLessonCreatedIfNeeded(userId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);

  if (error) throw new MarketingLifecycleError('marketing_first_lesson_lookup_failed');
  if (count !== 1) return { status: 'not_first' as const };

  const result = await ensureMarketingContact(userId);
  if (result.status !== 'active') return result;

  await sendLifecycleEvent(result, 'syllonaut.first_lesson.created');
  return result;
}

export async function emitFirstLiveStartedIfNeeded(userId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', userId)
    .not('started_at', 'is', null);

  if (error) throw new MarketingLifecycleError('marketing_first_live_lookup_failed');
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
