-- All legitimate lesson creation now goes through server-controlled paths:
-- AI generation uses the service-role client after reserve_lesson_generation(),
-- duplication uses the service-role client after reserve_lesson_import(),
-- shared imports use the SECURITY DEFINER import_lesson_share() function.
-- Close the generic authenticated INSERT path so quota type cannot be forged.

drop trigger if exists lessons_enforce_free_creation_quota on public.lessons;
drop function if exists private.enforce_free_lesson_creation_quota();

drop policy if exists users_can_insert_own_lessons on public.lessons;
drop policy if exists lesson_clients_cannot_forge_share_provenance on public.lessons;
drop policy if exists lesson_clients_cannot_forge_organization_library_provenance on public.lessons;

revoke insert on table public.lessons from anon, authenticated;

comment on table public.lessons is
  'Lesson rows are readable/editable by their owner, but new rows are created only through server-controlled generation/import/copy paths.';
