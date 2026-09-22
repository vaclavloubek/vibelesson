update public.profiles
set lesson_folders_enabled = true,
    updated_at = now()
where role = 'user'
  and lesson_folders_enabled = false;
