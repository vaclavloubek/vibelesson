update public.generation_requests
set status = 'failed', completed_at = now()
where status = 'pending'
  and created_at < now() - interval '2 minutes';
