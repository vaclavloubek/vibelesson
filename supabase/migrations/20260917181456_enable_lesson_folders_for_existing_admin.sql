update public.profiles
set lesson_folders_enabled = true,
    updated_at = now()
where role = 'admin'
  and lesson_folders_enabled = false;
