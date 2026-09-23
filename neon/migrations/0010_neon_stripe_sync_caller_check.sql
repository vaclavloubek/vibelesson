-- Stripe subscription sync on Neon.
--
-- public.sync_stripe_subscription_event() guarded itself with
-- `auth.role() is distinct from 'service_role'` (Supabase JWT role). Neon's
-- pg_session_jwt has no auth.role(), so every Stripe subscription webhook
-- failed. On Neon the webhook calls this function over the server-only owner
-- connection and EXECUTE is revoked from PUBLIC/anon/authenticated (0004), so
-- reject the Data API login and request roles instead.
--
-- Patched in place from the live catalog; the replacement must match exactly
-- once or the migration aborts. Idempotent.

do $migration$
declare
  v_fn constant regprocedure :=
    'public.sync_stripe_subscription_event(text,text,boolean,uuid,text,text,text,boolean,text,boolean,timestamptz,timestamptz,timestamptz,text)'::regprocedure;
  v_def text := pg_catalog.pg_get_functiondef(v_fn);
  v_old constant text := 'if auth.role() is distinct from ''service_role'' then';
  v_new constant text := 'if session_user::text in (''authenticator'', ''authenticated'', ''anonymous'', ''anon'') then';
begin
  if position(v_old in v_def) > 0 then
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'sync_stripe_subscription_event: caller check not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;

  if position('auth.role()' in pg_catalog.pg_get_functiondef(v_fn)) > 0 then
    raise exception '0010 postcondition failed: auth.role() still referenced';
  end if;
end
$migration$;

-- Behavioural check: from the server connection the function must get past the
-- caller check and reject the malformed event id (22023), not fail on the role.
do $check$
begin
  perform public.sync_stripe_subscription_event(
    'not-an-event', null, false, null, null, null, null, false, null, false, null, null, null, null
  );
  raise exception '0010 check failed: malformed event id was accepted';
exception
  when sqlstate '22023' then
    null;
end
$check$;
