-- Receipt and calculation are immutable legal evidence; execution is separate.
create table private.individual_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  snapshot_id uuid not null unique references private.individual_contract_snapshots(id),
  received_at timestamptz not null,
  notice_sha256 text not null check (notice_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  eligibility_confirmed boolean not null check (eligibility_confirmed),
  created_at timestamptz not null default now()
);
create table private.individual_withdrawal_calculations (
  withdrawal_id uuid primary key references private.individual_withdrawals(id),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);
create table private.individual_withdrawal_execution (
  withdrawal_id uuid primary key references private.individual_withdrawals(id),
  first_attempt_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  status text not null default 'received' check (status in ('received','prepared','processing','submitted','manual_review')),
  stripe_refund_id text,
  stripe_refund_status text,
  review_reason text,
  updated_at timestamptz not null default now()
);
alter table private.individual_withdrawals enable row level security;
alter table private.individual_withdrawal_calculations enable row level security;
alter table private.individual_withdrawal_execution enable row level security;
revoke all on private.individual_withdrawals, private.individual_withdrawal_calculations,
  private.individual_withdrawal_execution from public, anon, authenticated, service_role;
create trigger individual_withdrawals_immutable before update or delete on private.individual_withdrawals
  for each row execute function private.reject_individual_contract_evidence_mutation();
create trigger individual_withdrawal_calculations_immutable before update or delete on private.individual_withdrawal_calculations
  for each row execute function private.reject_individual_contract_evidence_mutation();

create function public.register_individual_withdrawal_for_service(
  p_user_id uuid, p_snapshot_id uuid, p_received_at timestamptz, p_notice_sha256 text, p_actor_user_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing private.individual_withdrawals;
begin
  if p_actor_user_id is distinct from '5bbed66a-c125-4740-947c-946a364c6d3f'::uuid then
    raise exception 'superadmin_required';
  end if;
  if p_received_at is null or p_received_at > now() then raise exception 'withdrawal_receipt_invalid'; end if;
  if not exists (select 1 from private.individual_contract_snapshots s
    where s.id=p_snapshot_id and s.user_id=p_user_id and s.livemode
      and s.accepted_at <= p_received_at) then raise exception 'withdrawal_snapshot_missing'; end if;
  insert into private.individual_withdrawals(user_id,snapshot_id,received_at,notice_sha256,actor_user_id,eligibility_confirmed)
    values(p_user_id,p_snapshot_id,p_received_at,p_notice_sha256,p_actor_user_id,true)
    on conflict (snapshot_id) do nothing returning id into v_id;
  if v_id is null then
    select * into strict v_existing from private.individual_withdrawals where snapshot_id=p_snapshot_id;
    if v_existing.received_at is distinct from p_received_at or v_existing.notice_sha256 is distinct from p_notice_sha256 then
      raise exception 'withdrawal_receipt_conflict';
    end if;
    v_id := v_existing.id;
  end if;
  insert into private.individual_withdrawal_execution(withdrawal_id) values(v_id) on conflict do nothing;
  return v_id;
end; $$;

create function public.get_individual_withdrawal_for_service(p_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
select jsonb_build_object('receipt',to_jsonb(w),'execution',to_jsonb(e),'calculation',c.evidence,
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from private.stripe_subscription_payments p
    where p.user_id=w.user_id and p.livemode), '[]'::jsonb))
from private.individual_withdrawals w
join private.individual_withdrawal_execution e on e.withdrawal_id=w.id
left join private.individual_withdrawal_calculations c on c.withdrawal_id=w.id
where w.id=p_id;
$$;

create function public.prepare_individual_withdrawal_for_service(p_id uuid,p_evidence jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.individual_withdrawal_execution where withdrawal_id=p_id for update;
  if not found then raise exception 'withdrawal_missing'; end if;
  if exists(select 1 from private.individual_withdrawal_calculations where withdrawal_id=p_id) then
    if not exists(select 1 from private.individual_withdrawal_calculations where withdrawal_id=p_id and evidence=p_evidence) then
      raise exception 'withdrawal_calculation_conflict';
    end if;
    return;
  end if;
  insert into private.individual_withdrawal_calculations values(p_id,p_evidence,now());
  update private.individual_withdrawal_execution set status='prepared',updated_at=now() where withdrawal_id=p_id;
end; $$;

create function public.claim_individual_withdrawal_for_service(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid := gen_random_uuid();
begin
  -- Retry only while Stripe's original idempotency key is guaranteed retained.
  update private.individual_withdrawal_execution set status='processing',
    first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes',
    lease_token=v_token,updated_at=now()
  where withdrawal_id=p_id and status in ('prepared','processing')
    and (lease_until is null or lease_until < now())
    and (first_attempt_at is null or first_attempt_at > now()-interval '23 hours');
  if not found then return null; end if;
  return v_token;
end; $$;

create function public.finish_individual_withdrawal_for_service(
  p_id uuid,p_token uuid,p_refund_id text,p_refund_status text,p_review_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.individual_withdrawal_execution set
    status=case when p_review_reason is null then 'submitted' else 'manual_review' end,
    stripe_refund_id=p_refund_id,stripe_refund_status=p_refund_status,review_reason=p_review_reason,
    lease_until=null,updated_at=now()
  where withdrawal_id=p_id and lease_token=p_token and status='processing';
  if not found then raise exception 'withdrawal_lease_conflict'; end if;
end; $$;

revoke all on function public.register_individual_withdrawal_for_service(uuid,uuid,timestamptz,text,uuid),
  public.get_individual_withdrawal_for_service(uuid),public.prepare_individual_withdrawal_for_service(uuid,jsonb),
  public.claim_individual_withdrawal_for_service(uuid),public.finish_individual_withdrawal_for_service(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.register_individual_withdrawal_for_service(uuid,uuid,timestamptz,text,uuid),
  public.get_individual_withdrawal_for_service(uuid),public.prepare_individual_withdrawal_for_service(uuid,jsonb),
  public.claim_individual_withdrawal_for_service(uuid),public.finish_individual_withdrawal_for_service(uuid,uuid,text,text,text)
  to service_role;

create function public.reconcile_individual_withdrawal_for_service(
  p_id uuid,p_refund_id text,p_payment_intent_id text,p_amount bigint,p_currency text,p_status text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_refund_id !~ '^re_[A-Za-z0-9_]+$' or p_status not in ('pending','requires_action','succeeded','failed','canceled') then
    raise exception 'withdrawal_refund_invalid';
  end if;
  update private.individual_withdrawal_execution e set
    stripe_refund_id=p_refund_id,stripe_refund_status=p_status,
    status=case when p_status in ('failed','canceled','requires_action') then 'manual_review' else 'submitted' end,
    review_reason=case when p_status in ('failed','canceled','requires_action') then 'stripe_refund_attention_required' else null end,
    updated_at=now()
  from private.individual_withdrawal_calculations c
  where e.withdrawal_id=p_id and c.withdrawal_id=e.withdrawal_id and e.first_attempt_at is not null
    and (e.stripe_refund_id is null or e.stripe_refund_id=p_refund_id)
    and c.evidence->>'paymentIntentId'=p_payment_intent_id
    and (c.evidence->>'refundDueMinor')::bigint=p_amount and c.evidence->>'currency'=p_currency;
  if not found then raise exception 'withdrawal_refund_evidence_mismatch'; end if;
end; $$;
revoke all on function public.reconcile_individual_withdrawal_for_service(uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_individual_withdrawal_for_service(uuid,text,text,bigint,text,text) to service_role;
