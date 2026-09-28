-- Referral program, phase 1. The whole program is behind the server flag
-- REFERRALS_ENABLED (lib/referral-program.ts); with the flag off the app never
-- calls these functions, so nothing is shown, written or evaluated.
--
-- Rules (owner decisions 2026-09-28):
-- * A teacher shares a personal link (/{locale}?ref=CODE) themselves; the app
--   sends no invitations. Only individual accounts (Free, Teacher, Teacher Pro)
--   take part; admins and organization members have no link and never consume
--   the bonus (it stays frozen while the account is an organization member).
-- * Only the referrer is rewarded: +reward_units bonus AI lesson generations per
--   qualified invitee, valid reward_valid_months from the grant.
-- * An invitee qualifies within qualify_window_days of signing up either by a
--   live Stripe subscription (Teacher / Teacher Pro, on its own), or by a
--   verified email plus an ended live lesson in which at least
--   min_submitting_participants distinct participants submitted an individual
--   answer, without sharing a device with the referrer.
-- * At most monthly_cap rewards per UTC calendar month and total_cap in total.
-- * All numeric constants live in private.referral_program_settings and are
--   mirrored in lib/referral-program-config.ts (checked by
--   scripts/verify-referral-program.mjs).
--
-- 1. private.referral_program_settings, referral_codes, referral_attributions,
--    lesson_credit_grants (deny-all RLS, no API grants).
-- 2. public.generation_requests.credit_grant_id plus a trigger that keeps
--    lesson_credit_grants.units_used in step with every pending -> failed path.
-- 3. public.reserve_lesson_generation_server: after the plan refuses on the
--    monthly limit, reserve from the valid bonus grant expiring first. The plan
--    count ignores bonus rows; the Free device budget applies unchanged.
-- 4. Server-only functions: code, attribution at signup, summary, hourly
--    qualification. public.get_ai_quota is unchanged.
--
-- No function called through the Data API changes signature, so no schema
-- cache refresh is needed. Apply statement by statement (PL/pgSQL bodies).

create table if not exists private.referral_program_settings (
  id boolean primary key default true check (id),
  reward_units integer not null check (reward_units > 0),
  reward_valid_months integer not null check (reward_valid_months > 0),
  qualify_window_days integer not null check (qualify_window_days > 0),
  min_submitting_participants integer not null check (min_submitting_participants > 0),
  monthly_cap integer not null check (monthly_cap > 0),
  total_cap integer not null check (total_cap > 0),
  updated_at timestamptz not null default now()
);

insert into private.referral_program_settings (
  id, reward_units, reward_valid_months, qualify_window_days,
  min_submitting_participants, monthly_cap, total_cap
)
values (true, 3, 12, 60, 5, 3, 10)
on conflict (id) do nothing;

create table if not exists private.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists private.referral_attributions (
  invitee_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  signup_device_hash text check (signup_device_hash is null or signup_device_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'rewarded', 'capped', 'rejected', 'expired')),
  reject_reason text check (reject_reason is null or reject_reason in (
    'self_referral', 'shared_device', 'same_email', 'disposable_email', 'referrer_not_individual'
  )),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualifying_session_id uuid,
  qualified_by text check (qualified_by is null or qualified_by in ('live_lesson', 'paid_plan')),
  check ((status = 'rejected') = (reject_reason is not null)),
  check ((status in ('rewarded', 'capped')) = (qualified_at is not null))
);

create index if not exists referral_attributions_referrer_idx
  on private.referral_attributions (referrer_user_id, status);

create index if not exists referral_attributions_pending_idx
  on private.referral_attributions (created_at)
  where status = 'pending';

-- The invitee and referrer never change after signup; only the outcome does.
create or replace function private.referral_attributions_immutable_parties()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.invitee_user_id is distinct from old.invitee_user_id
     or new.referrer_user_id is distinct from old.referrer_user_id
     or new.signup_device_hash is distinct from old.signup_device_hash
     or new.created_at is distinct from old.created_at then
    raise exception 'referral_attribution_immutable' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists referral_attributions_immutable_parties
  on private.referral_attributions;

create trigger referral_attributions_immutable_parties
  before update on private.referral_attributions
  for each row execute function private.referral_attributions_immutable_parties();

create table if not exists private.lesson_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('referral')),
  -- One grant per invitee: the idempotence key of the reward.
  invitee_user_id uuid unique,
  units_granted integer not null check (units_granted > 0),
  units_used integer not null default 0,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (units_used >= 0 and units_used <= units_granted),
  check (expires_at > granted_at),
  check (source <> 'referral' or invitee_user_id is not null)
);

create index if not exists lesson_credit_grants_user_valid_idx
  on private.lesson_credit_grants (user_id, expires_at)
  where revoked_at is null;

alter table public.generation_requests
  add column if not exists credit_grant_id uuid
    references private.lesson_credit_grants(id) on delete set null;

create index if not exists generation_requests_credit_grant_idx
  on public.generation_requests (credit_grant_id)
  where credit_grant_id is not null;

alter table private.referral_program_settings enable row level security;
alter table private.referral_codes enable row level security;
alter table private.referral_attributions enable row level security;
alter table private.lesson_credit_grants enable row level security;

revoke all on table private.referral_program_settings from public;
revoke all on table private.referral_codes from public;
revoke all on table private.referral_attributions from public;
revoke all on table private.lesson_credit_grants from public;
revoke all on table private.referral_program_settings from anon, anonymous, authenticated, authenticator;
revoke all on table private.referral_codes from anon, anonymous, authenticated, authenticator;
revoke all on table private.referral_attributions from anon, anonymous, authenticated, authenticator;
revoke all on table private.lesson_credit_grants from anon, anonymous, authenticated, authenticator;

comment on table private.referral_program_settings is
  'Single row with every numeric constant of the referral program; mirrored in lib/referral-program-config.ts.';
comment on table private.referral_codes is
  'Personal referral code of an individual account, random (8 characters, no confusable characters), created when the account first opens the referral section.';
comment on table private.referral_attributions is
  'At most one referrer per invitee, fixed at signup. Outcome: pending, rewarded, capped (limit reached, no reward), rejected (reject_reason) or expired.';
comment on table private.lesson_credit_grants is
  'Bonus AI lesson generations (referral rewards). Consumed after the plan monthly limit, earliest expiry first, only while the account is individual; a failed generation returns the unit.';

-- Units follow generation_requests: a bonus reservation takes a unit, and any
-- path that fails a pending/succeeded request (finish, stale sweeps in the
-- reserve functions, the Free device budget) returns it.
create or replace function private.sync_lesson_credit_units()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.credit_grant_id is not null and new.status in ('pending', 'succeeded') then
      update private.lesson_credit_grants
      set units_used = units_used + 1
      where id = new.credit_grant_id;
    end if;
    return new;
  end if;

  -- Only "on delete set null" (grant deleted with its account) may clear it.
  if new.credit_grant_id is distinct from old.credit_grant_id then
    if new.credit_grant_id is not null then
      raise exception 'generation_request_credit_immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.credit_grant_id is not null
     and old.status in ('pending', 'succeeded')
     and new.status = 'failed' then
    update private.lesson_credit_grants
    set units_used = greatest(units_used - 1, 0)
    where id = new.credit_grant_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists generation_requests_sync_lesson_credit_insert
  on public.generation_requests;

create trigger generation_requests_sync_lesson_credit_insert
  after insert on public.generation_requests
  for each row
  when (new.credit_grant_id is not null)
  execute function private.sync_lesson_credit_units();

drop trigger if exists generation_requests_sync_lesson_credit_update
  on public.generation_requests;

create trigger generation_requests_sync_lesson_credit_update
  after update of status, credit_grant_id on public.generation_requests
  for each row
  when (new.credit_grant_id is not null or old.credit_grant_id is not null)
  execute function private.sync_lesson_credit_units();

-- Individual account: not admin, no active organization, individual plan.
create or replace function private.referral_account_is_individual(p_user_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce((
    select p.role <> 'admin'
      and coalesce(p.active_plan_code, 'free') in ('free', 'teacher', 'teacher_pro')
      and not exists (select 1 from private.current_active_organization(p.id))
    from public.profiles p
    where p.id = p_user_id
  ), false);
$function$;

-- Lowercase; gmail.com / googlemail.com without dots and without "+tag".
create or replace function private.referral_normalize_email(p_email text)
 returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_at integer;
  v_local text;
  v_domain text;
begin
  v_at := length(v_email) - strpos(reverse(v_email), '@') + 1;
  if strpos(v_email, '@') = 0 then
    return v_email;
  end if;
  v_local := substr(v_email, 1, v_at - 1);
  v_domain := substr(v_email, v_at + 1);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(split_part(v_local, '+', 1), '.', '');
    v_domain := 'gmail.com';
  end if;
  return v_local || '@' || v_domain;
end;
$function$;

-- Every device hash known for an account: trusted devices (including revoked),
-- Free device budget requests and the device used at its own signup.
create or replace function private.referral_account_device_hashes(p_user_id uuid)
 returns table(token_hash text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select d.token_hash from private.user_trusted_devices d where d.user_id = p_user_id
  union
  select b.device_token_hash from private.free_device_budget_requests b where b.user_id = p_user_id
  union
  select a.signup_device_hash from private.referral_attributions a
  where a.invitee_user_id = p_user_id and a.signup_device_hash is not null;
$function$;

-- Returns the account's code, creating it on first use; null when the account
-- does not take part (admin, organization member, missing profile).
create or replace function private.get_or_create_referral_code_server(p_user_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_i integer;
  v_attempt integer := 0;
begin
  if p_user_id is null or not private.referral_account_is_individual(p_user_id) then
    return null;
  end if;

  select c.code into v_code from private.referral_codes c where c.user_id = p_user_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'referral_code_generation_failed' using errcode = 'P0001';
    end if;

    -- Rejection sampling over random bytes: no modulo bias, nothing derived
    -- from the user id or email.
    v_code := '';
    while length(v_code) < 8 loop
      v_bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
      for v_i in 0 .. length(v_bytes) - 1 loop
        v_byte := get_byte(v_bytes, v_i);
        if v_byte < 248 and length(v_code) < 8 then
          v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
        end if;
      end loop;
    end loop;

    begin
      insert into private.referral_codes (user_id, code)
      values (p_user_id, v_code)
      on conflict (user_id) do nothing;
    exception when unique_violation then
      continue;
    end;

    select c.code into v_code from private.referral_codes c where c.user_id = p_user_id;
    return v_code;
  end loop;
end;
$function$;

-- Called once at signup, after the device cookie exists. Unknown codes and
-- repeated calls are ignored silently; the result is only for logging.
create or replace function private.record_referral_attribution_server(
  p_invitee_user_id uuid,
  p_code text,
  p_signup_device_hash text,
  p_disposable_email boolean
)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_device text := case
    when p_signup_device_hash ~ '^[0-9a-f]{64}$' then p_signup_device_hash
    else null
  end;
  v_referrer uuid;
  v_invitee_email text;
  v_referrer_email text;
  v_reason text;
  v_status text;
begin
  if p_invitee_user_id is null or v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$' then
    return 'ignored';
  end if;

  select c.user_id into v_referrer from private.referral_codes c where c.code = v_code;
  if v_referrer is null then
    return 'ignored';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_invitee_user_id) then
    return 'ignored';
  end if;

  select u.email into v_invitee_email from neon_auth."user" u where u.id = p_invitee_user_id;
  select u.email into v_referrer_email from neon_auth."user" u where u.id = v_referrer;

  if v_referrer = p_invitee_user_id then
    v_reason := 'self_referral';
  elsif not private.referral_account_is_individual(v_referrer) then
    v_reason := 'referrer_not_individual';
  elsif v_device is not null and exists (
    select 1 from private.referral_account_device_hashes(v_referrer) d
    where d.token_hash = v_device
  ) then
    v_reason := 'shared_device';
  elsif v_invitee_email is not null and v_referrer_email is not null
    and private.referral_normalize_email(v_invitee_email)
      = private.referral_normalize_email(v_referrer_email) then
    v_reason := 'same_email';
  elsif coalesce(p_disposable_email, false) then
    v_reason := 'disposable_email';
  end if;

  v_status := case when v_reason is null then 'pending' else 'rejected' end;

  insert into private.referral_attributions (
    invitee_user_id, referrer_user_id, signup_device_hash, status, reject_reason
  )
  values (p_invitee_user_id, v_referrer, v_device, v_status, v_reason)
  on conflict (invitee_user_id) do nothing;

  if not found then
    return 'ignored';
  end if;
  return v_status;
end;
$function$;

-- Numbers for the account's referral section; never names or emails.
create or replace function private.get_referral_summary_server(p_user_id uuid)
 returns table(
   pending_count integer,
   rewarded_count integer,
   bonus_remaining integer,
   bonus_next_expiry timestamptz
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    (select count(*)::integer from private.referral_attributions a
      where a.referrer_user_id = p_user_id and a.status = 'pending'),
    (select count(*)::integer from private.referral_attributions a
      where a.referrer_user_id = p_user_id and a.status = 'rewarded'),
    (select coalesce(sum(g.units_granted - g.units_used), 0)::integer
      from private.lesson_credit_grants g
      where g.user_id = p_user_id and g.revoked_at is null and g.expires_at > now()),
    (select min(g.expires_at)
      from private.lesson_credit_grants g
      where g.user_id = p_user_id and g.revoked_at is null and g.expires_at > now()
        and g.units_used < g.units_granted);
$function$;

-- Hourly (cron /api/cron/neon-grading, only with REFERRALS_ENABLED). Idempotent:
-- the grant is unique per invitee and each attribution leaves 'pending' once.
create or replace function private.process_referral_qualifications()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_settings private.referral_program_settings%rowtype;
  v_row private.referral_attributions%rowtype;
  v_window_end timestamptz;
  v_by text;
  v_session_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_total integer;
  v_month integer;
  v_rewarded integer := 0;
  v_capped integer := 0;
  v_rejected integer := 0;
  v_expired integer := 0;
  v_pending integer := 0;
begin
  select * into v_settings from private.referral_program_settings where id;
  if not found then
    raise exception 'referral_program_settings_missing' using errcode = 'P0001';
  end if;

  for v_row in
    select a.*
    from private.referral_attributions a
    where a.status = 'pending'
    order by a.created_at, a.invitee_user_id
    for update skip locked
  loop
    v_window_end := v_row.created_at + make_interval(days => v_settings.qualify_window_days);
    v_by := null;
    v_session_id := null;

    -- A live individual subscription qualifies on its own.
    if exists (
      select 1 from public.billing_subscriptions bs
      where bs.user_id = v_row.invitee_user_id
        and bs.livemode
        and bs.status in ('active', 'trialing')
        and bs.plan_code in ('teacher', 'teacher_pro')
        and bs.created_at <= v_window_end
    ) then
      v_by := 'paid_plan';
    elsif exists (
      select 1 from neon_auth."user" u
      where u.id = v_row.invitee_user_id and u."emailVerified"
    ) then
      select s.id into v_session_id
      from public.sessions s
      where s.teacher_id = v_row.invitee_user_id
        and s.status = 'ended'
        and s.ended_at is not null
        and s.ended_at >= v_row.created_at
        and s.ended_at <= v_window_end
        and (
          select count(distinct r.participant_id)
          from public.responses r
          where r.session_id = s.id
            and r.submitted_at is not null
        ) >= v_settings.min_submitting_participants
      order by s.ended_at, s.id
      limit 1;

      if v_session_id is not null then
        if exists (
          select 1
          from private.referral_account_device_hashes(v_row.invitee_user_id) i
          join private.referral_account_device_hashes(v_row.referrer_user_id) r
            on r.token_hash = i.token_hash
        ) then
          update private.referral_attributions
          set status = 'rejected', reject_reason = 'shared_device'
          where invitee_user_id = v_row.invitee_user_id;
          v_rejected := v_rejected + 1;
          continue;
        end if;
        v_by := 'live_lesson';
      end if;
    end if;

    if v_by is null then
      if now() > v_window_end then
        update private.referral_attributions
        set status = 'expired'
        where invitee_user_id = v_row.invitee_user_id;
        v_expired := v_expired + 1;
      else
        v_pending := v_pending + 1;
      end if;
      continue;
    end if;

    -- Serializes rewards per referrer so concurrent runs cannot pass the caps.
    perform 1 from public.profiles p where p.id = v_row.referrer_user_id for update;

    select count(*)::integer,
           count(*) filter (where g.granted_at >= v_month_start)::integer
    into v_total, v_month
    from private.lesson_credit_grants g
    where g.user_id = v_row.referrer_user_id
      and g.source = 'referral';

    if v_total >= v_settings.total_cap or v_month >= v_settings.monthly_cap then
      update private.referral_attributions
      set status = 'capped', qualified_at = now(),
          qualifying_session_id = v_session_id, qualified_by = v_by
      where invitee_user_id = v_row.invitee_user_id;
      v_capped := v_capped + 1;
      continue;
    end if;

    insert into private.lesson_credit_grants (
      user_id, source, invitee_user_id, units_granted, granted_at, expires_at
    )
    values (
      v_row.referrer_user_id, 'referral', v_row.invitee_user_id,
      v_settings.reward_units, now(),
      now() + make_interval(months => v_settings.reward_valid_months)
    )
    on conflict (invitee_user_id) do nothing;

    update private.referral_attributions
    set status = 'rewarded', qualified_at = now(),
        qualifying_session_id = v_session_id, qualified_by = v_by
    where invitee_user_id = v_row.invitee_user_id;
    v_rewarded := v_rewarded + 1;
  end loop;

  return jsonb_build_object(
    'rewarded', v_rewarded,
    'capped', v_capped,
    'rejected', v_rejected,
    'expired', v_expired,
    'pending', v_pending
  );
end;
$function$;

create or replace function public.reserve_lesson_generation_server(p_user_id uuid, p_device_token_hash text)
 returns table(request_id uuid, allowed boolean, used integer, monthly_limit integer, denial_code text, device_used integer, device_limit integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_calendar_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_calendar_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_device_required boolean := false;
  v_device_allowed boolean := true;
  v_device_used integer := 0;
  v_device_limit integer;
  v_device_denial text;
  v_credit_grant_id uuid;
begin
  if p_user_id is null then raise exception 'user_required'; end if;

  select cao.organization_id, cao.monthly_lesson_limit
  into v_org_id, v_limit
  from private.current_active_organization(p_user_id) cao;

  if v_org_id is not null then
    perform 1 from public.organizations o where o.id = v_org_id for update;

    v_window_start := v_calendar_start;
    v_window_end := v_calendar_end;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where organization_id = v_org_id
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select p.monthly_lesson_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id
    for update;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(p_user_id, now()) q;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = p_user_id
      and organization_id is null
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    -- Plan allowance: bonus (referral) generations never count.
    select count(*)::integer into v_used
    from public.generation_requests g
    where g.user_id = p_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.credit_grant_id is null
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    -- Bonus lessons: individual accounts only (organization members keep them
    -- frozen), valid grant with units left, earliest expiry first. The profile
    -- row lock above serializes concurrent reservations per teacher.
    if v_org_id is null and private.referral_account_is_individual(p_user_id) then
      select g.id
      into v_credit_grant_id
      from private.lesson_credit_grants g
      where g.user_id = p_user_id
        and g.revoked_at is null
        and g.granted_at <= now()
        and g.expires_at > now()
        and g.units_used < g.units_granted
      order by g.expires_at, g.granted_at, g.id
      limit 1
      for update of g;
    end if;

    if v_credit_grant_id is null then
      return query select
        null::uuid, false, v_used, v_limit,
        'account_quota_exhausted'::text,
        null::integer, null::integer;
      return;
    end if;
  end if;

  select d.required, d.allowed, d.used, d.device_limit, d.denial_code
  into v_device_required, v_device_allowed, v_device_used, v_device_limit, v_device_denial
  from private.lock_free_device_budget(
    p_user_id,
    p_device_token_hash,
    'generate_lesson'
  ) d;

  if not v_device_allowed then
    return query select
      null::uuid, false, v_used, v_limit,
      v_device_denial,
      v_device_used, v_device_limit;
    return;
  end if;

  insert into public.generation_requests (
    user_id,
    organization_id,
    action,
    status,
    credit_grant_id
  )
  values (
    p_user_id,
    v_org_id,
    'generate_lesson',
    'pending',
    v_credit_grant_id
  )
  returning id into v_request_id;

  if v_device_required then
    perform private.reserve_free_device_budget_request(
      v_request_id,
      p_user_id,
      p_device_token_hash,
      'generate_lesson'
    );
  end if;

  -- For a bonus reservation "used" stays above the limit, so the Free quota
  -- lifecycle events (near limit / reached) are not sent again.
  return query select
    v_request_id,
    true,
    v_used + 1,
    v_limit,
    null::text,
    case when v_device_required then v_device_used + 1 else null end,
    v_device_limit;
end;
$function$;

revoke all on function private.referral_attributions_immutable_parties() from public;
revoke all on function private.sync_lesson_credit_units() from public;
revoke all on function private.referral_account_is_individual(uuid) from public;
revoke all on function private.referral_normalize_email(text) from public;
revoke all on function private.referral_account_device_hashes(uuid) from public;
revoke all on function private.get_or_create_referral_code_server(uuid) from public;
revoke all on function private.record_referral_attribution_server(uuid, text, text, boolean) from public;
revoke all on function private.get_referral_summary_server(uuid) from public;
revoke all on function private.process_referral_qualifications() from public;
revoke all on function public.reserve_lesson_generation_server(uuid, text) from public;

revoke all on function private.referral_attributions_immutable_parties() from anon, anonymous, authenticated, authenticator;
revoke all on function private.sync_lesson_credit_units() from anon, anonymous, authenticated, authenticator;
revoke all on function private.referral_account_is_individual(uuid) from anon, anonymous, authenticated, authenticator;
revoke all on function private.referral_normalize_email(text) from anon, anonymous, authenticated, authenticator;
revoke all on function private.referral_account_device_hashes(uuid) from anon, anonymous, authenticated, authenticator;
revoke all on function private.get_or_create_referral_code_server(uuid) from anon, anonymous, authenticated, authenticator;
revoke all on function private.record_referral_attribution_server(uuid, text, text, boolean) from anon, anonymous, authenticated, authenticator;
revoke all on function private.get_referral_summary_server(uuid) from anon, anonymous, authenticated, authenticator;
revoke all on function private.process_referral_qualifications() from anon, anonymous, authenticated, authenticator;
revoke all on function public.reserve_lesson_generation_server(uuid, text) from anon, anonymous, authenticated, authenticator;
