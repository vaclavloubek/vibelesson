create policy team_edit_locks_no_client_access
on public.team_edit_locks
for all
to anon, authenticated
using (false)
with check (false);
