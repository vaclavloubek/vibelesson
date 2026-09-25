-- AI grading suggestion top-up packs (phase 2). The whole purchase flow is
-- behind the server flag AI_GRADING_TOPUPS_ENABLED; this migration only adds
-- the ledger and changes nothing for accounts without a grant.
--
-- Rules (decided 2026-09-25):
-- * Packs are for individual Teacher Pro only. Consumption order: the plan's
--   monthly allowance first, then purchased packs, earliest expiry first.
-- * A pack is valid for 12 months from payment, across allowance periods, and
--   is consumed only while the account is on Teacher Pro (frozen otherwise).
-- * A failed AI grading returns the unit (failed reservations never count).
-- * Refund of a pack payment revokes the rest of that pack. A dispute revokes it
--   too and records the dispute in private.individual_billing_disputes, so the
--   existing AI pause applies and is released exactly as for subscriptions.
-- * Only LIVE grants are consumed; sandbox purchases are recorded but inert.
--
-- 1. private.ai_grading_credit_grants, private.billing_topup_prices and the
--    append-only private.ai_grading_topup_contract_snapshots (deny-all).
-- 2. private.ai_grading_budget_requests.credit_grant_id: pack consumption.
--    Plan allowance and plan cost ceiling ignore these rows.
-- 3. private.reserve_ai_grading_budget: after a plan refusal, reserve from a
--    valid pack; the phase-1 quota notice is recorded only when no pack is left.
-- 4. public.get_ai_quota: grading_credit_remaining and grading_credit_next_expiry
--    appended at the end (drop + create, grant authenticated only).
-- 5. Server-only functions for the checkout snapshot, the webhook (grant,
--    refund, dispute) and request_ai_suggestions_for_manual_evaluations_server.
--
-- Apply statement by statement through run_sql_transaction (PL/pgSQL bodies),
-- then refresh the Data API schema cache (get_ai_quota changed).

create table if not exists private.billing_topup_prices (
  pack_code text not null
    check (pack_code in ('grading_60', 'grading_100', 'grading_200')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  livemode boolean not null,
  external_price_id text not null unique
    check (external_price_id ~ '^price_[A-Za-z0-9_]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_topup_prices_active_key
  on private.billing_topup_prices (pack_code, currency, livemode)
  where active;

create table if not exists private.ai_grading_topup_contract_snapshots (
  id uuid primary key,
  user_id uuid not null,
  livemode boolean not null,
  pack_code text not null
    check (pack_code in ('grading_60', 'grading_100', 'grading_200')),
  quantity integer not null check (quantity > 0),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  amount_minor bigint not null check (amount_minor > 0),
  billing_country text not null check (billing_country ~ '^[A-Z]{2}$'),
  terms_version text not null check (length(btrim(terms_version)) > 0),
  terms_acceptance_key text not null check (length(btrim(terms_acceptance_key)) > 0),
  locale text not null check (locale in ('cs', 'en')),
  immediate_delivery_requested boolean not null check (immediate_delivery_requested),
  withdrawal_loss_acknowledged boolean not null check (withdrawal_loss_acknowledged),
  contract_html text not null check (length(contract_html) > 1000),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  external_checkout_session_id text not null unique
    check (external_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (livemode and external_checkout_session_id ~ '^cs_live_')
    or (not livemode and external_checkout_session_id ~ '^cs_test_')
  )
);

drop trigger if exists ai_grading_topup_contract_snapshots_append_only
  on private.ai_grading_topup_contract_snapshots;

create trigger ai_grading_topup_contract_snapshots_append_only
  before update or delete on private.ai_grading_topup_contract_snapshots
  for each row execute function private.reject_individual_contract_evidence_mutation();

create table if not exists private.ai_grading_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  livemode boolean not null,
  pack_code text not null
    check (pack_code in ('grading_60', 'grading_100', 'grading_200')),
  quantity integer not null check (quantity > 0),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  amount_minor bigint not null check (amount_minor > 0),
  external_checkout_session_id text not null unique
    check (external_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'),
  external_payment_intent_id text
    check (external_payment_intent_id is null or external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  external_customer_id text
    check (external_customer_id is null or external_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  -- Teacher Pro subscription active at purchase; a dispute on the pack payment
  -- is recorded against it so the existing individual AI pause applies.
  external_subscription_id text
    check (external_subscription_id is null or external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  purchased_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason in ('refund', 'dispute')),
  contract_snapshot_id uuid
    references private.ai_grading_topup_contract_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > purchased_at),
  check ((revoked_at is null) = (revoke_reason is null))
);

create unique index if not exists ai_grading_credit_grants_payment_intent_key
  on private.ai_grading_credit_grants (livemode, external_payment_intent_id)
  where external_payment_intent_id is not null;

create index if not exists ai_grading_credit_grants_user_valid_idx
  on private.ai_grading_credit_grants (user_id, expires_at)
  where revoked_at is null;

alter table private.ai_grading_budget_requests
  add column if not exists credit_grant_id uuid
    references private.ai_grading_credit_grants(id) on delete restrict;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_grading_budget_requests_credit_individual_check'
      and conrelid = 'private.ai_grading_budget_requests'::regclass
  ) then
    alter table private.ai_grading_budget_requests
      add constraint ai_grading_budget_requests_credit_individual_check
      check (credit_grant_id is null or organization_id is null);
  end if;
end;
$constraint$;

create index if not exists ai_grading_budget_requests_credit_grant_idx
  on private.ai_grading_budget_requests (credit_grant_id)
  where credit_grant_id is not null;

alter table private.billing_topup_prices enable row level security;
alter table private.ai_grading_topup_contract_snapshots enable row level security;
alter table private.ai_grading_credit_grants enable row level security;

revoke all on table private.billing_topup_prices from public;
revoke all on table private.ai_grading_topup_contract_snapshots from public;
revoke all on table private.ai_grading_credit_grants from public;
revoke all on table private.billing_topup_prices from anon, anonymous, authenticated, authenticator;
revoke all on table private.ai_grading_topup_contract_snapshots from anon, anonymous, authenticated, authenticator;
revoke all on table private.ai_grading_credit_grants from anon, anonymous, authenticated, authenticator;

comment on table private.ai_grading_credit_grants is
  'Purchased AI grading suggestion packs (individual Teacher Pro). Valid 12 months from payment, consumed after the plan allowance, earliest expiry first; only livemode grants are consumed. Revoked on refund or dispute of the pack payment.';
comment on table private.billing_topup_prices is
  'Stripe one-time prices of AI grading suggestion packs per currency and mode. Separate from public.billing_prices, which billing-subscription-state treats as subscription prices.';
comment on table private.ai_grading_topup_contract_snapshots is
  'Append-only contract snapshot accepted before a pack checkout: pack, price, Terms version, immediate delivery request and acknowledgement of losing the withdrawal right.';

-- Remaining units of one grant: quantity minus reserved/succeeded reservations.
create or replace function private.ai_grading_credit_grant_remaining(p_grant_id uuid)
 returns integer
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select greatest(
    g.quantity - (
      select count(*)::integer
      from private.ai_grading_budget_requests r
      where r.credit_grant_id = g.id
        and r.status in ('reserved', 'succeeded')
    ),
    0
  )
  from private.ai_grading_credit_grants g
  where g.id = p_grant_id;
$function$;

create or replace function private.reserve_ai_grading_budget(p_evaluation_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_role text;
  v_ai_enabled boolean;
  v_org_id uuid;
  v_plan_code text;
  v_budget numeric(12,2);
  v_count_limit integer;
  v_used_count integer;
  v_used_cost numeric(14,6);
  v_reservation numeric(12,6) := 0.100000;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_grant_id uuid;
begin
  select s.teacher_id, p.role, coalesce(p.ai_grading_enabled, false)
  into v_user_id, v_role, v_ai_enabled
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  join public.profiles p on p.id = s.teacher_id
  where e.id = p_evaluation_id;

  if v_user_id is null or not v_ai_enabled then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if private.effective_ai_billing_paused(v_user_id) then
    return false;
  end if;

  select cao.organization_id, cao.plan_code
  into v_org_id, v_plan_code
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    perform 1
    from public.organizations o
    where o.id = v_org_id
    for update;

    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  else
    perform 1
    from public.profiles p
    where p.id = v_user_id
    for update;

    select coalesce(p.active_plan_code, 'free')
    into v_plan_code
    from public.profiles p
    where p.id = v_user_id;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(v_user_id, now()) q;
  end if;

  select bp.monthly_ai_grading_budget_usd,
         bp.monthly_ai_grading_count_limit
  into v_budget, v_count_limit
  from public.billing_plans bp
  where bp.code = v_plan_code
    and bp.ai_grading_enabled;

  if v_budget is null or v_count_limit is null then
    return false;
  end if;

  update private.ai_grading_budget_requests r
  set status = 'failed',
      completed_at = now()
  where r.status = 'reserved'
    and r.created_at < now() - interval '15 minutes'
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if exists (
    select 1
    from private.ai_grading_budget_requests r
    where r.evaluation_id = p_evaluation_id
      and r.status = 'reserved'
  ) then
    return true;
  end if;

  -- Plan allowance and plan cost ceiling: purchased-pack rows never count.
  select
    count(*)::integer,
    coalesce(sum(
      case
        when r.status = 'reserved' then r.reserved_cost_usd
        else coalesce(r.actual_cost_usd, 0)
      end
    ), 0)::numeric(14,6)
  into v_used_count, v_used_cost
  from private.ai_grading_budget_requests r
  where r.status in ('reserved', 'succeeded')
    and r.credit_grant_id is null
    and r.created_at >= v_window_start
    and r.created_at < v_window_end
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if v_used_count >= v_count_limit
     or v_used_cost + v_reservation > v_budget then
    -- Purchased packs: individual Teacher Pro only, LIVE, not revoked, not
    -- expired, with units and cost headroom left; earliest expiry first. The
    -- profile row lock above serializes concurrent reservations per teacher.
    if v_org_id is null and v_plan_code = 'teacher_pro' then
      select g.id
      into v_grant_id
      from private.ai_grading_credit_grants g
      where g.user_id = v_user_id
        and g.livemode
        and g.revoked_at is null
        and g.purchased_at <= now()
        and g.expires_at > now()
        and (
          select count(*)
          from private.ai_grading_budget_requests r
          where r.credit_grant_id = g.id
            and r.status in ('reserved', 'succeeded')
        ) < g.quantity
        and (
          select coalesce(sum(
            case
              when r.status = 'reserved' then r.reserved_cost_usd
              else coalesce(r.actual_cost_usd, 0)
            end
          ), 0)
          from private.ai_grading_budget_requests r
          where r.credit_grant_id = g.id
            and r.status in ('reserved', 'succeeded')
        ) + v_reservation <= g.quantity * 0.100000
      order by g.expires_at, g.purchased_at, g.id
      limit 1
      for update of g;

      if v_grant_id is not null then
        insert into private.ai_grading_budget_requests (
          evaluation_id,
          user_id,
          organization_id,
          plan_code,
          status,
          reserved_cost_usd,
          credit_grant_id
        )
        values (
          p_evaluation_id,
          v_user_id,
          null,
          v_plan_code,
          'reserved',
          v_reservation,
          v_grant_id
        );

        return true;
      end if;
    end if;

    insert into private.ai_grading_quota_notices (
      user_id,
      organization_id,
      window_start,
      window_end,
      used_count,
      count_limit
    )
    values (
      v_user_id,
      v_org_id,
      v_window_start,
      v_window_end,
      v_used_count,
      v_count_limit
    )
    on conflict do nothing;

    return false;
  end if;

  insert into private.ai_grading_budget_requests (
    evaluation_id,
    user_id,
    organization_id,
    plan_code,
    status,
    reserved_cost_usd
  )
  values (
    p_evaluation_id,
    v_user_id,
    v_org_id,
    v_plan_code,
    'reserved',
    v_reservation
  );

  return true;
end;
$function$;

revoke all on function private.ai_grading_credit_grant_remaining(uuid) from public;
revoke all on function private.ai_grading_credit_grant_remaining(uuid) from anon, anonymous, authenticated, authenticator;
revoke all on function private.reserve_ai_grading_budget(uuid) from public;
revoke all on function private.reserve_ai_grading_budget(uuid) from anon, anonymous, authenticated, authenticator;

drop function if exists public.get_ai_quota();

create function public.get_ai_quota()
 returns table(
   lesson_used integer,
   lesson_limit integer,
   lesson_remaining integer,
   revision_used integer,
   revision_limit integer,
   revision_remaining integer,
   lesson_unlimited boolean,
   revision_unlimited boolean,
   grading_used integer,
   grading_limit integer,
   grading_remaining integer,
   grading_unlimited boolean,
   grading_enabled boolean,
   quota_window_start timestamp with time zone,
   quota_window_end timestamp with time zone,
   quota_source text,
   plan_code text,
   quota_scope text,
   grading_credit_remaining integer,
   grading_credit_next_expiry timestamp with time zone
 )
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_plan_code text;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_lesson_used integer;
  v_revision_used integer;
  v_grading_limit integer;
  v_grading_used integer := 0;
  v_grading_enabled boolean := false;
  v_grading_unlimited boolean := false;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_quota_source text;
  v_credit_remaining integer := 0;
  v_credit_next_expiry timestamptz;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.plan_code, cao.monthly_lesson_limit, cao.monthly_revision_limit
  into v_org_id, v_plan_code, v_lesson_limit, v_revision_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    v_quota_source := 'calendar_utc';

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select coalesce(p.active_plan_code, 'free'), p.monthly_lesson_limit, p.monthly_revision_limit
    into v_plan_code, v_lesson_limit, v_revision_limit
    from public.profiles p
    where p.id = v_user_id;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end, q.quota_source
    into v_window_start, v_window_end, v_quota_source
    from private.individual_ai_quota_window(v_user_id, now()) q;

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    -- Purchased packs (LIVE, not revoked, not expired). Reported even while
    -- frozen outside Teacher Pro; the UI decides what to show.
    select
      coalesce(sum(u.remaining), 0)::integer,
      min(u.expires_at) filter (where u.remaining > 0)
    into v_credit_remaining, v_credit_next_expiry
    from (
      select
        g.expires_at,
        greatest(g.quantity - (
          select count(*)::integer
          from private.ai_grading_budget_requests r
          where r.credit_grant_id = g.id
            and r.status in ('reserved', 'succeeded')
        ), 0) as remaining
      from private.ai_grading_credit_grants g
      where g.user_id = v_user_id
        and g.livemode
        and g.revoked_at is null
        and g.expires_at > now()
    ) u;
  end if;

  select bp.ai_grading_enabled, bp.monthly_ai_grading_count_limit
  into v_grading_enabled, v_grading_limit
  from public.billing_plans bp
  where bp.code = v_plan_code;

  v_grading_enabled := coalesce(v_grading_enabled, false);
  v_grading_unlimited := v_plan_code = 'admin' and v_grading_enabled;

  if v_grading_enabled and not v_grading_unlimited and v_grading_limit is not null then
    select count(*)::integer into v_grading_used
    from private.ai_grading_budget_requests r
    where r.status in ('reserved', 'succeeded')
      and r.credit_grant_id is null
      and r.created_at >= v_window_start
      and r.created_at < v_window_end
      and (
        (v_org_id is not null and r.organization_id = v_org_id)
        or
        (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
      );
  end if;

  return query select
    v_lesson_used,
    v_lesson_limit,
    case when v_lesson_limit is null then null else greatest(v_lesson_limit - v_lesson_used, 0) end,
    v_revision_used,
    v_revision_limit,
    case when v_revision_limit is null then null else greatest(v_revision_limit - v_revision_used, 0) end,
    v_lesson_limit is null,
    v_revision_limit is null,
    v_grading_used,
    v_grading_limit,
    case
      when not v_grading_enabled or v_grading_unlimited or v_grading_limit is null then null
      else greatest(v_grading_limit - v_grading_used, 0)
    end,
    v_grading_unlimited,
    v_grading_enabled,
    v_window_start,
    v_window_end,
    v_quota_source,
    v_plan_code,
    case when v_org_id is not null then 'organization' else 'individual' end,
    coalesce(v_credit_remaining, 0),
    v_credit_next_expiry;
end;
$function$;

revoke all on function public.get_ai_quota() from public;
revoke all on function public.get_ai_quota() from anon, anonymous, authenticated, authenticator;
grant execute on function public.get_ai_quota() to authenticated;

-- Checkout: immutable contract snapshot accepted before the Stripe redirect.
create or replace function public.create_ai_grading_topup_contract_snapshot(
  p_snapshot_id uuid,
  p_user_id uuid,
  p_livemode boolean,
  p_pack_code text,
  p_quantity integer,
  p_currency text,
  p_amount_minor bigint,
  p_billing_country text,
  p_terms_version text,
  p_terms_acceptance_key text,
  p_locale text,
  p_immediate_delivery_requested boolean,
  p_withdrawal_loss_acknowledged boolean,
  p_contract_html text,
  p_content_sha256 text,
  p_checkout_session_id text
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if p_snapshot_id is null or p_user_id is null then
    raise exception 'topup_snapshot_identity_missing' using errcode = '22023';
  end if;
  if (p_pack_code, p_quantity) not in (('grading_60', 60), ('grading_100', 100), ('grading_200', 200)) then
    raise exception 'topup_snapshot_pack_invalid' using errcode = '22023';
  end if;
  if not coalesce(p_immediate_delivery_requested, false)
     or not coalesce(p_withdrawal_loss_acknowledged, false) then
    raise exception 'topup_snapshot_consent_required' using errcode = '22023';
  end if;

  insert into private.ai_grading_topup_contract_snapshots (
    id, user_id, livemode, pack_code, quantity, currency, amount_minor,
    billing_country, terms_version, terms_acceptance_key, locale,
    immediate_delivery_requested, withdrawal_loss_acknowledged,
    contract_html, content_sha256, external_checkout_session_id
  ) values (
    p_snapshot_id, p_user_id, p_livemode, p_pack_code, p_quantity, p_currency, p_amount_minor,
    p_billing_country, p_terms_version, p_terms_acceptance_key, p_locale,
    p_immediate_delivery_requested, p_withdrawal_loss_acknowledged,
    p_contract_html, p_content_sha256, p_checkout_session_id
  );

  return p_snapshot_id;
end;
$function$;

-- Webhook: idempotent grant per Checkout Session. The paid session must match
-- the snapshot accepted before checkout (user, pack, currency, price, mode).
create or replace function public.grant_ai_grading_credit_from_checkout(
  p_event_id text,
  p_livemode boolean,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_customer_id text,
  p_user_id uuid,
  p_pack_code text,
  p_currency text,
  p_amount_minor bigint,
  p_contract_snapshot_id uuid,
  p_paid_at timestamptz
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_snapshot private.ai_grading_topup_contract_snapshots%rowtype;
  v_subscription_id text;
  v_grant_id uuid;
  v_inserted boolean := false;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or (p_customer_id is not null and p_customer_id !~ '^cus_[A-Za-z0-9_]+$')
     or p_user_id is null
     or p_contract_snapshot_id is null
     or p_paid_at is null then
    raise exception 'invalid_ai_grading_topup_grant' using errcode = '22023';
  end if;

  select * into v_snapshot
  from private.ai_grading_topup_contract_snapshots s
  where s.id = p_contract_snapshot_id;

  if not found then
    raise exception 'ai_grading_topup_snapshot_missing' using errcode = 'P0001';
  end if;

  if v_snapshot.user_id <> p_user_id
     or v_snapshot.livemode <> p_livemode
     or v_snapshot.pack_code <> p_pack_code
     or v_snapshot.currency <> p_currency
     or v_snapshot.amount_minor <> p_amount_minor
     or v_snapshot.external_checkout_session_id <> p_checkout_session_id then
    raise exception 'ai_grading_topup_snapshot_mismatch' using errcode = 'P0001';
  end if;

  select bs.external_subscription_id
  into v_subscription_id
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
    and bs.provider = 'stripe'
    and bs.livemode = p_livemode
    and bs.plan_code = 'teacher_pro'
    and bs.status in ('trialing', 'active', 'past_due')
  order by case bs.status when 'active' then 0 when 'trialing' then 1 else 2 end,
           bs.updated_at desc
  limit 1;

  insert into private.ai_grading_credit_grants (
    user_id, livemode, pack_code, quantity, currency, amount_minor,
    external_checkout_session_id, external_payment_intent_id, external_customer_id,
    external_subscription_id, purchased_at, expires_at, contract_snapshot_id
  ) values (
    p_user_id, p_livemode, p_pack_code, v_snapshot.quantity, p_currency, p_amount_minor,
    p_checkout_session_id, p_payment_intent_id, p_customer_id,
    v_subscription_id, p_paid_at, p_paid_at + interval '12 months', p_contract_snapshot_id
  )
  on conflict (external_checkout_session_id) do nothing
  returning id into v_grant_id;

  v_inserted := v_grant_id is not null;
  if not v_inserted then
    select g.id into v_grant_id
    from private.ai_grading_credit_grants g
    where g.external_checkout_session_id = p_checkout_session_id;
  end if;

  -- billing_events requires a subscription id; the grant itself is the record.
  if v_subscription_id is not null then
    insert into public.billing_events (
      provider, livemode, external_event_id, event_type, user_id, external_subscription_id
    ) values (
      'stripe', p_livemode, p_event_id, 'ai_grading_topup.granted', p_user_id, v_subscription_id
    )
    on conflict (provider, livemode, external_event_id) do nothing;
  end if;

  return jsonb_build_object('grantId', v_grant_id, 'granted', v_inserted, 'userId', p_user_id);
end;
$function$;

-- Webhook: a refund of a pack payment revokes what is left of that pack.
-- Raises ai_grading_topup_payment_mapping_missing for any other payment so the
-- caller falls through to the subscription / organization refund handling.
create or replace function public.sync_ai_grading_topup_refund_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_payment_intent_id text,
  p_amount_refunded bigint,
  p_event_at timestamptz
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_grant private.ai_grading_credit_grants%rowtype;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_amount_refunded is null or p_amount_refunded < 0
     or p_event_at is null then
    raise exception 'invalid_ai_grading_topup_refund' using errcode = '22023';
  end if;

  select * into v_grant
  from private.ai_grading_credit_grants g
  where g.livemode = p_livemode
    and g.external_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'ai_grading_topup_payment_mapping_missing' using errcode = 'P0001';
  end if;

  if p_amount_refunded > 0 and v_grant.revoked_at is null then
    update private.ai_grading_credit_grants
    set revoked_at = p_event_at,
        revoke_reason = 'refund'
    where id = v_grant.id;
  end if;

  if v_grant.external_subscription_id is not null then
    insert into public.billing_events (
      provider, livemode, external_event_id, event_type, user_id, external_subscription_id
    ) values (
      'stripe', p_livemode, p_event_id, p_event_type, v_grant.user_id, v_grant.external_subscription_id
    )
    on conflict (provider, livemode, external_event_id) do nothing;
  end if;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'userId', v_grant.user_id,
    'revoked', p_amount_refunded > 0 or v_grant.revoked_at is not null
  );
end;
$function$;

-- Webhook: a dispute on a pack payment revokes the rest of the pack and is
-- recorded in the existing dispute ledger, so the existing individual AI
-- pause applies and is released by the same rules (won / funds reinstated).
create or replace function public.sync_ai_grading_topup_dispute_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_dispute_id text,
  p_payment_intent_id text,
  p_status text,
  p_event_at timestamptz
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_grant private.ai_grading_credit_grants%rowtype;
  v_subscription_id text;
  v_release boolean := false;
  v_release_reason text := null;
  v_closed_at timestamptz := null;
  v_recorded boolean := false;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_dispute_id !~ '^d[pu]_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or char_length(coalesce(p_status, '')) not between 1 and 64
     or p_event_at is null
     or p_event_type not in (
       'charge.dispute.created',
       'charge.dispute.closed',
       'charge.dispute.funds_withdrawn',
       'charge.dispute.funds_reinstated'
     ) then
    raise exception 'invalid_ai_grading_topup_dispute' using errcode = '22023';
  end if;

  select * into v_grant
  from private.ai_grading_credit_grants g
  where g.livemode = p_livemode
    and g.external_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'ai_grading_topup_payment_mapping_missing' using errcode = 'P0001';
  end if;

  if v_grant.revoked_at is null then
    update private.ai_grading_credit_grants
    set revoked_at = p_event_at,
        revoke_reason = 'dispute'
    where id = v_grant.id;
  end if;

  v_subscription_id := v_grant.external_subscription_id;
  if v_subscription_id is null then
    select bs.external_subscription_id
    into v_subscription_id
    from public.billing_subscriptions bs
    where bs.user_id = v_grant.user_id
      and bs.provider = 'stripe'
      and bs.livemode = p_livemode
    order by bs.updated_at desc
    limit 1;
  end if;

  if p_event_type = 'charge.dispute.closed' then
    v_closed_at := p_event_at;
    if p_status in ('won', 'warning_closed') then
      v_release := true;
      v_release_reason := 'dispute_resolved';
    end if;
  elsif p_event_type = 'charge.dispute.funds_reinstated' then
    v_release := true;
    v_release_reason := 'funds_reinstated';
  end if;

  if v_subscription_id is not null then
    insert into private.individual_billing_disputes (
      provider, livemode, external_dispute_id, external_payment_intent_id,
      user_id, external_subscription_id, status, last_event_type, last_event_id,
      opened_at, last_event_at, closed_at, released_at, release_reason, updated_at
    )
    values (
      'stripe', p_livemode, p_dispute_id, p_payment_intent_id,
      v_grant.user_id, v_subscription_id, p_status, p_event_type, p_event_id,
      p_event_at, p_event_at, v_closed_at,
      case when v_release then p_event_at else null end,
      v_release_reason, now()
    )
    on conflict (provider, livemode, external_dispute_id)
    do update set
      status = excluded.status,
      last_event_type = excluded.last_event_type,
      last_event_id = excluded.last_event_id,
      last_event_at = excluded.last_event_at,
      closed_at = coalesce(excluded.closed_at, private.individual_billing_disputes.closed_at),
      released_at = case
        when excluded.released_at is not null then excluded.released_at
        when excluded.last_event_type in ('charge.dispute.created', 'charge.dispute.funds_withdrawn') then null
        else private.individual_billing_disputes.released_at
      end,
      release_reason = case
        when excluded.release_reason is not null then excluded.release_reason
        when excluded.last_event_type in ('charge.dispute.created', 'charge.dispute.funds_withdrawn') then null
        else private.individual_billing_disputes.release_reason
      end,
      updated_at = now()
    where excluded.last_event_at >= private.individual_billing_disputes.last_event_at;
    v_recorded := true;
  end if;

  if v_subscription_id is not null then
    insert into public.billing_events (
      provider, livemode, external_event_id, event_type, user_id, external_subscription_id
    ) values (
      'stripe', p_livemode, p_event_id, p_event_type, v_grant.user_id, v_subscription_id
    )
    on conflict (provider, livemode, external_event_id) do nothing;
  end if;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'userId', v_grant.user_id,
    'disputeRecorded', v_recorded,
    'pauseReason', private.individual_ai_billing_pause_reason(v_grant.user_id)
  );
end;
$function$;

-- Teacher asks AI for suggestions on responses that fell back to manual
-- grading because the allowance ran out (after a top-up or an allowance
-- reset). Only the teacher's own session, only manual-budget-v1, only
-- unconfirmed. Setting status to pending fires enqueue_server_grading_job,
-- which calls private.dispatch_response_evaluation_job. Responses beyond the
-- remaining allowance return to manual grading when their job is claimed.
create or replace function public.request_ai_suggestions_for_manual_evaluations_server(
  p_user_id uuid,
  p_session_id uuid,
  p_device_token_hash text
)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ai_enabled boolean := false;
  v_count integer := 0;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'invalid_ai_suggestion_request' using errcode = '22023';
  end if;

  if not private.trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and s.teacher_id = p_user_id
  ) then
    return 0;
  end if;

  select coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_ai_enabled
  from public.profiles p
  where p.id = p_user_id;

  if not coalesce(v_ai_enabled, false)
     or private.effective_ai_billing_paused(p_user_id) then
    return 0;
  end if;

  update public.response_evaluations e
  set status = 'pending',
      grader_version = 'b7-v6-server-regrade',
      error = null,
      updated_at = now()
  from public.sessions s
  where s.id = e.session_id
    and s.id = p_session_id
    and s.teacher_id = p_user_id
    and e.status = 'needs_review'
    and e.grader_version = 'manual-budget-v1'
    and not e.teacher_confirmed;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.create_ai_grading_topup_contract_snapshot(uuid, uuid, boolean, text, integer, text, bigint, text, text, text, text, boolean, boolean, text, text, text) from public;
revoke all on function public.create_ai_grading_topup_contract_snapshot(uuid, uuid, boolean, text, integer, text, bigint, text, text, text, text, boolean, boolean, text, text, text) from anon, anonymous, authenticated, authenticator;
revoke all on function public.grant_ai_grading_credit_from_checkout(text, boolean, text, text, text, uuid, text, text, bigint, uuid, timestamptz) from public;
revoke all on function public.grant_ai_grading_credit_from_checkout(text, boolean, text, text, text, uuid, text, text, bigint, uuid, timestamptz) from anon, anonymous, authenticated, authenticator;
revoke all on function public.sync_ai_grading_topup_refund_event(text, text, boolean, text, bigint, timestamptz) from public;
revoke all on function public.sync_ai_grading_topup_refund_event(text, text, boolean, text, bigint, timestamptz) from anon, anonymous, authenticated, authenticator;
revoke all on function public.sync_ai_grading_topup_dispute_event(text, text, boolean, text, text, text, timestamptz) from public;
revoke all on function public.sync_ai_grading_topup_dispute_event(text, text, boolean, text, text, text, timestamptz) from anon, anonymous, authenticated, authenticator;
revoke all on function public.request_ai_suggestions_for_manual_evaluations_server(uuid, uuid, text) from public;
revoke all on function public.request_ai_suggestions_for_manual_evaluations_server(uuid, uuid, text) from anon, anonymous, authenticated, authenticator;
