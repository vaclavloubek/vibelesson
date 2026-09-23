-- Make Cloudflare live-control snapshot reconciliation work on Neon (PostgreSQL 18).
--
-- 1. In reconcile_live_control_snapshot_impl the revealed-block filter compared
--    `block->>'id' = value`. On PG18 the unqualified `value` binds to the inner
--    jsonb_array_elements() column (jsonb) instead of the outer text element,
--    failing with `operator does not exist: text = jsonb`. Qualify it.
-- 2. The live-write triggers let reconciliation through only for
--    current_user = 'postgres' (Supabase's owner). On Neon the SECURITY DEFINER
--    wrapper runs as its own owner, so compare with that owner instead. The
--    transaction-scoped advisory marker taken only by the wrapper still gates it.
--
-- Definitions are patched in place from the live catalog; every replacement
-- must match exactly once or the migration aborts. Idempotent.

do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
  v_fn regprocedure;
  v_owner_check constant text :=
    'current_user = (select r.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner '
    || 'where p.oid = ''public.reconcile_live_control_snapshot(uuid,jsonb)''::pg_catalog.regprocedure)';
begin
  -- 1. Revealed-block filter.
  v_def := pg_catalog.pg_get_functiondef('public.reconcile_live_control_snapshot_impl(uuid,jsonb)'::regprocedure);
  if position('as revealed(value)' in v_def) = 0 then
    v_old := 'from jsonb_array_elements_text(p_snapshot->''revealedBlockIds'') value';
    v_new := 'from jsonb_array_elements_text(p_snapshot->''revealedBlockIds'') as revealed(value)';
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'reconcile impl: revealed source not found exactly once';
    end if;
    v_def := replace(v_def, v_old, v_new);

    v_old := 'where block->>''id'' = value';
    v_new := 'where block->>''id'' = revealed.value';
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'reconcile impl: revealed filter not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;

  -- 2. Reconciliation bypass in the live-write triggers.
  foreach v_fn in array array[
    'public.enforce_response_live_context()'::regprocedure,
    'public.enforce_team_response_edit_lock()'::regprocedure,
    'public.enforce_participant_team_change()'::regprocedure
  ] loop
    v_def := pg_catalog.pg_get_functiondef(v_fn);
    if position('reconcile_live_control_snapshot(uuid,jsonb)' in v_def) = 0 then
      v_old := 'current_user = ''postgres''';
      if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception '%: postgres bypass not found exactly once', v_fn;
      end if;
      execute replace(v_def, v_old, v_owner_check);
    end if;
  end loop;
end
$migration$;

-- Postconditions.
do $check$
declare
  v_revealed text[];
begin
  if position('= revealed.value' in pg_catalog.pg_get_functiondef('public.reconcile_live_control_snapshot_impl(uuid,jsonb)'::regprocedure)) = 0
     or position('current_user = ''postgres''' in pg_catalog.pg_get_functiondef('public.enforce_response_live_context()'::regprocedure)) > 0
     or position('current_user = ''postgres''' in pg_catalog.pg_get_functiondef('public.enforce_team_response_edit_lock()'::regprocedure)) > 0
     or position('current_user = ''postgres''' in pg_catalog.pg_get_functiondef('public.enforce_participant_team_change()'::regprocedure)) > 0 then
    raise exception '0009 postconditions failed';
  end if;

  -- The corrected filter keeps only ids present in the lesson snapshot.
  select coalesce(array_agg(value), '{}'::text[])
  into v_revealed
  from jsonb_array_elements_text('["b1","missing"]'::jsonb) as revealed(value)
  where exists (
    select 1
    from jsonb_array_elements('[{"id":"b1"},{"id":"b2"}]'::jsonb) block
    where block->>'id' = revealed.value
  );
  if v_revealed is distinct from array['b1'] then
    raise exception '0009 revealed filter check failed';
  end if;
end
$check$;
