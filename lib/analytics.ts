export const ANALYTICS_CONSENT_COOKIE = 'syllonaut_cookie_consent_v1';
export const ANALYTICS_CONSENT_VERSION = '2026-09-18-v1';
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
export const GA_DEBUG_MODE = process.env.NEXT_PUBLIC_GA_DEBUG_MODE === 'true';

export type ActivityType =
  | 'intro'
  | 'team_task'
  | 'poll'
  | 'quiz'
  | 'open_text'
  | 'ranking'
  | 'reveal'
  | 'timer'
  | 'exit_ticket';

export type ActivityMode = 'individual' | 'team' | 'shared';
export type MaterialMode = 'primary' | 'strict' | 'inspiration';
export type RevisionScope = 'whole_lesson' | 'activity';
export type SessionState = 'lobby' | 'live' | 'ended';

export type DurationBucket =
  | '10_30'
  | '31_60'
  | '61_90'
  | '91_120'
  | '121_180'
  | '181_360'
  | 'unknown';

export type BlockCountBucket = '0' | '1_4' | '5_8' | '9_12' | '13_16' | '17_plus';
export type ParticipantCountBucket = '0' | '1_5' | '6_10' | '11_20' | '21_40' | '41_80' | '81_120' | '121_200' | '201_plus';
export type ItemCountBucket = '1' | '2_5' | '6_10' | '11_25' | '26_plus';
export type GroupSizeBucket = '1' | '2' | '3_4' | '5_8' | '9_plus' | 'unknown';
export type MaterialSizeBucket = 'lt_1mb' | '1_to_5mb' | '5_to_10mb' | 'over_10mb';
export type FileTypeGroup = 'pdf' | 'presentation' | 'document' | 'text' | 'mixed' | 'other';

export type GenerationFailureStage = 'materials' | 'request' | 'stream' | 'result';
export type GenerationErrorCode =
  | 'material_extraction_failed'
  | 'network_error'
  | 'request_failed'
  | 'stream_failed'
  | 'invalid_result'
  | 'unknown';

export type RevisionErrorCode = 'network_error' | 'request_failed' | 'invalid_result' | 'unknown';

type AnalyticsEventParameters = {
  prepare_lesson_cta_click: { location: 'hero' | 'header' | 'pricing' | 'other' };
  pricing_view: { segment: 'teacher' | 'school'; billing_period: 'monthly' | 'annual' };
  pricing_segment_change: { segment: 'teacher' | 'school' };
  pricing_billing_period_change: { billing_period: 'monthly' | 'annual' };
  free_signup_click: { location: 'pricing' | 'auth' | 'landing' };
  plan_select: {
    plan: 'teacher' | 'teacher-pro';
    billing_period: 'monthly' | 'annual';
    source: 'pricing_sandbox' | 'pricing_live_acceptance' | 'pricing_live';
  };
  checkout_start: {
    plan: 'teacher' | 'teacher-pro';
    billing_period: 'monthly' | 'annual';
    billing_country: string;
    source: 'pricing_sandbox' | 'pricing_live_acceptance' | 'pricing_live';
  };
  checkout_complete: { source: 'stripe_sandbox' | 'stripe_live_acceptance' | 'stripe_live' };
  subscription_activated: {
    plan: 'teacher' | 'teacher-pro';
    source: 'stripe_live';
  };
  billing_portal_open: { source: 'pricing_sandbox' | 'pricing_live_acceptance' | 'pricing_live' };

  signup_started: undefined;
  signup_completed: undefined;
  login_completed: undefined;

  lesson_creation_started: undefined;
  source_materials_added: {
    file_count: number;
    file_type_group: FileTypeGroup;
    size_bucket: MaterialSizeBucket;
    material_mode: MaterialMode;
  };
  lesson_generation_started: {
    has_materials: boolean;
    material_mode: MaterialMode;
    duration_bucket: DurationBucket;
    group_size_bucket: GroupSizeBucket;
  };
  lesson_generation_completed: {
    has_materials: boolean;
    block_count_bucket: BlockCountBucket;
    duration_bucket: DurationBucket;
    lesson_language: string;
  };
  lesson_generation_failed: {
    failure_stage: GenerationFailureStage;
    error_code: GenerationErrorCode;
  };

  lesson_revision_started: { revision_scope: RevisionScope };
  lesson_revision_completed: { revision_scope: RevisionScope };
  lesson_revision_failed: { revision_scope: RevisionScope; error_code: RevisionErrorCode };

  lesson_duplicated: undefined;
  shared_lesson_import_started: undefined;
  shared_lesson_imported: undefined;
  folder_created: undefined;
  lesson_moved_to_folder: undefined;
  bulk_lessons_moved: { item_count_bucket: ItemCountBucket };

  live_session_created: undefined;
  live_session_started: {
    block_count_bucket: BlockCountBucket;
    planned_duration_bucket: DurationBucket;
  };
  presenter_opened: { session_state: SessionState };
  activity_advanced: { activity_type: ActivityType; activity_mode: ActivityMode };
  student_join_completed: undefined;
  activity_response_submitted: { activity_type: ActivityType; activity_mode: ActivityMode };
  live_session_ended: {
    participant_count_bucket: ParticipantCountBucket;
    completed_activity_count_bucket: BlockCountBucket;
  };

  session_report_viewed: undefined;
  session_csv_exported: undefined;
  ai_grading_completed: {
    activity_type: Extract<ActivityType, 'open_text' | 'exit_ticket' | 'team_task'>;
    result_state: 'graded' | 'needs_review';
  };
  manual_grading_completed: {
    activity_type: Extract<ActivityType, 'open_text' | 'exit_ticket' | 'team_task'>;
  };
  teacher_grade_override: {
    activity_type: Extract<ActivityType, 'open_text' | 'exit_ticket' | 'team_task'>;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventParameters;

const EVENT_PARAMETER_KEYS: { [K in AnalyticsEventName]: readonly (keyof NonNullable<AnalyticsEventParameters[K]>)[] } = {
  prepare_lesson_cta_click: ['location'],
  pricing_view: ['segment', 'billing_period'],
  pricing_segment_change: ['segment'],
  pricing_billing_period_change: ['billing_period'],
  free_signup_click: ['location'],
  plan_select: ['plan', 'billing_period', 'source'],
  checkout_start: ['plan', 'billing_period', 'billing_country', 'source'],
  checkout_complete: ['source'],
  subscription_activated: ['plan', 'source'],
  billing_portal_open: ['source'],

  signup_started: [],
  signup_completed: [],
  login_completed: [],

  lesson_creation_started: [],
  source_materials_added: ['file_count', 'file_type_group', 'size_bucket', 'material_mode'],
  lesson_generation_started: ['has_materials', 'material_mode', 'duration_bucket', 'group_size_bucket'],
  lesson_generation_completed: ['has_materials', 'block_count_bucket', 'duration_bucket', 'lesson_language'],
  lesson_generation_failed: ['failure_stage', 'error_code'],

  lesson_revision_started: ['revision_scope'],
  lesson_revision_completed: ['revision_scope'],
  lesson_revision_failed: ['revision_scope', 'error_code'],

  lesson_duplicated: [],
  shared_lesson_import_started: [],
  shared_lesson_imported: [],
  folder_created: [],
  lesson_moved_to_folder: [],
  bulk_lessons_moved: ['item_count_bucket'],

  live_session_created: [],
  live_session_started: ['block_count_bucket', 'planned_duration_bucket'],
  presenter_opened: ['session_state'],
  activity_advanced: ['activity_type', 'activity_mode'],
  student_join_completed: [],
  activity_response_submitted: ['activity_type', 'activity_mode'],
  live_session_ended: ['participant_count_bucket', 'completed_activity_count_bucket'],

  session_report_viewed: [],
  session_csv_exported: [],
  ai_grading_completed: ['activity_type', 'result_state'],
  manual_grading_completed: ['activity_type'],
  teacher_grade_override: ['activity_type'],
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const UUID_PATH_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATH_SEGMENT = /^[0-9a-f]{32,}$/i;
const JOIN_CODE_PATH_SEGMENT = /^[A-HJ-NP-Z2-9]{7}$/;
const SAFE_CAMPAIGN_VALUE = /^[A-Za-z0-9._~-]{1,100}$/;
const CAMPAIGN_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
] as const;

export function sanitizeAnalyticsPathname(pathname: string): string {
  const segments = pathname.split('/');
  const sanitized = segments.map((segment, index) => {
    if (!segment) return segment;
    if (UUID_PATH_SEGMENT.test(segment)) return ':id';
    if (TOKEN_PATH_SEGMENT.test(segment)) return ':token';
    if (segments[index - 1] === 'join' && JOIN_CODE_PATH_SEGMENT.test(segment)) return ':code';
    return segment;
  });
  return sanitized.join('/') || '/';
}

function safeCampaignSearch(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();

  for (const key of CAMPAIGN_QUERY_KEYS) {
    const value = input.get(key);
    if (value && SAFE_CAMPAIGN_VALUE.test(value)) output.set(key, value);
  }

  const serialized = output.toString();
  return serialized ? `?${serialized}` : '';
}

export function analyticsPageLocation(): string {
  if (typeof window === 'undefined') return '';
  const path = sanitizeAnalyticsPathname(window.location.pathname);
  return `${window.location.origin}${path}${safeCampaignSearch(window.location.search)}`;
}

function analyticsPageReferrer(): string | undefined {
  if (typeof document === 'undefined' || !document.referrer) return undefined;

  try {
    const referrer = new URL(document.referrer);
    if (typeof window !== 'undefined' && referrer.origin === window.location.origin) {
      return `${referrer.origin}${sanitizeAnalyticsPathname(referrer.pathname)}`;
    }
    return `${referrer.protocol}//${referrer.host}/`;
  } catch {
    return undefined;
  }
}

export function gaDisableKey(measurementId = GA_MEASUREMENT_ID) {
  return `ga-disable-${measurementId}`;
}

export function analyticsConsentGranted() {
  if (typeof document === 'undefined') return false;

  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`))
    ?.slice(ANALYTICS_CONSENT_COOKIE.length + 1);

  if (!raw) return false;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as {
      version?: unknown;
      analytics?: unknown;
    };
    return parsed.version === ANALYTICS_CONSENT_VERSION && parsed.analytics === true;
  } catch {
    return false;
  }
}

type EventArgs<N extends AnalyticsEventName> =
  AnalyticsEventParameters[N] extends undefined
    ? [] | [parameters: undefined]
    : [parameters: AnalyticsEventParameters[N]];

export function trackEvent<N extends AnalyticsEventName>(name: N, ...args: EventArgs<N>): boolean {
  try {
    if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return false;
    if (!analyticsConsentGranted() || !window.gtag) return false;

    const runtime = window as unknown as Record<string, unknown>;
    if (runtime[gaDisableKey()] === true) return false;

    const source = (args[0] ?? {}) as Record<string, unknown>;
    const safeParameters: Record<string, string | number | boolean> = {};

    for (const key of EVENT_PARAMETER_KEYS[name] as readonly string[]) {
      const value = source[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safeParameters[key] = value;
      }
    }

    const uiLocale = document.documentElement.lang === 'en' ? 'en' : 'cs';
    const pageLocation = analyticsPageLocation();
    const pagePath = sanitizeAnalyticsPathname(window.location.pathname);
    const pageReferrer = analyticsPageReferrer();

    window.gtag('event', name, {
      ...safeParameters,
      ui_locale: uiLocale,
      page_location: pageLocation,
      page_title: pagePath,
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
      ...(GA_DEBUG_MODE ? { debug_mode: true } : {}),
    });
    return true;
  } catch {
    // Analytics is observational only and must never affect the product flow.
    return false;
  }
}

export function trackPageView(): boolean {
  try {
    if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return false;
    if (!analyticsConsentGranted() || !window.gtag) return false;

    const runtime = window as unknown as Record<string, unknown>;
    if (runtime[gaDisableKey()] === true) return false;

    const pagePath = sanitizeAnalyticsPathname(window.location.pathname);
    const pageReferrer = analyticsPageReferrer();

    window.gtag('event', 'page_view', {
      page_location: analyticsPageLocation(),
      page_title: pagePath,
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
      ...(GA_DEBUG_MODE ? { debug_mode: true } : {}),
    });
    return true;
  } catch {
    // Analytics is observational only and must never affect product navigation.
    return false;
  }
}

const sentEventKeys = new Set<string>();

export function trackEventOnce<N extends AnalyticsEventName>(
  dedupKey: string,
  name: N,
  ...args: EventArgs<N>
): boolean {
  if (sentEventKeys.has(dedupKey)) return false;
  const sent = trackEvent(name, ...args);
  if (sent) sentEventKeys.add(dedupKey);
  return sent;
}

export function bucketDuration(minutes: number): DurationBucket {
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 360) return 'unknown';
  if (minutes <= 30) return '10_30';
  if (minutes <= 60) return '31_60';
  if (minutes <= 90) return '61_90';
  if (minutes <= 120) return '91_120';
  if (minutes <= 180) return '121_180';
  return '181_360';
}

export function bucketBlockCount(count: number): BlockCountBucket {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count <= 4) return '1_4';
  if (count <= 8) return '5_8';
  if (count <= 12) return '9_12';
  if (count <= 16) return '13_16';
  return '17_plus';
}

export function bucketParticipantCount(count: number): ParticipantCountBucket {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count <= 5) return '1_5';
  if (count <= 10) return '6_10';
  if (count <= 20) return '11_20';
  if (count <= 40) return '21_40';
  if (count <= 80) return '41_80';
  if (count <= 120) return '81_120';
  if (count <= 200) return '121_200';
  return '201_plus';
}

export function bucketItemCount(count: number): ItemCountBucket {
  if (!Number.isFinite(count) || count <= 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 10) return '6_10';
  if (count <= 25) return '11_25';
  return '26_plus';
}

export function bucketGroupSize(value: string): GroupSizeBucket {
  const numbers = value.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (!numbers.length) return 'unknown';
  const size = Math.max(...numbers);
  if (size <= 1) return '1';
  if (size === 2) return '2';
  if (size <= 4) return '3_4';
  if (size <= 8) return '5_8';
  return '9_plus';
}

export function bucketMaterialSize(totalBytes: number): MaterialSizeBucket {
  if (totalBytes < 1024 * 1024) return 'lt_1mb';
  if (totalBytes <= 5 * 1024 * 1024) return '1_to_5mb';
  if (totalBytes <= 10 * 1024 * 1024) return '5_to_10mb';
  return 'over_10mb';
}

export function fileTypeGroup(files: readonly Pick<File, 'name' | 'type'>[]): FileTypeGroup {
  const groups = new Set<FileTypeGroup>();

  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf' || file.type === 'application/pdf') groups.add('pdf');
    else if (extension === 'pptx') groups.add('presentation');
    else if (extension === 'docx') groups.add('document');
    else if (extension === 'txt' || extension === 'md' || file.type.startsWith('text/')) groups.add('text');
    else groups.add('other');
  }

  if (groups.size === 1) return [...groups][0];
  if (groups.size > 1) return 'mixed';
  return 'other';
}

export function activityMode(activityType: ActivityType): ActivityMode {
  if (activityType === 'team_task') return 'team';
  if (activityType === 'intro' || activityType === 'reveal' || activityType === 'timer') return 'shared';
  return 'individual';
}

export function generationErrorCode(error: unknown, stage: GenerationFailureStage): GenerationErrorCode {
  if (stage === 'materials') return 'material_extraction_failed';
  if (stage === 'result') return 'invalid_result';

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/failed to fetch|load failed|network|connection|abort/.test(message)) return 'network_error';
  if (stage === 'stream') return 'stream_failed';
  if (stage === 'request') return 'request_failed';
  return 'unknown';
}

export function revisionErrorCode(error: unknown): RevisionErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/failed to fetch|load failed|network|connection|abort/.test(message)) return 'network_error';
  if (/server nevrátil|invalid|parse|schema/.test(message)) return 'invalid_result';
  if (error instanceof Error) return 'request_failed';
  return 'unknown';
}
