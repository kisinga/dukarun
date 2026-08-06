-- 0009_profile_self_service.sql
-- Members manage their own staff profile: display name + avatar photo.
-- Avatars live in a dedicated public bucket (staff-avatars), tenant-scoped by
-- the <company_id>/ path prefix, same convention as product-images.

alter table public.company_staff_profiles add column avatar_path text;

-- ---------------------------------------------------------------------------
-- Storage: staff-avatars bucket (public read, member writes on own prefix)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('staff-avatars', 'staff-avatars', true)
on conflict (id) do nothing;

create policy "members write their company avatar prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members update their company avatar prefix"
  on storage.objects for update
  using (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  )
  with check (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members delete their company avatar prefix"
  on storage.objects for delete
  using (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

-- ---------------------------------------------------------------------------
-- update_my_profile: self-service name + avatar (no ManageTeam required).
-- NULL arguments leave the column unchanged; the avatar path must stay under
-- the caller's company prefix so it matches the storage policies above.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_display_name text default null,
  p_avatar_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  if p_display_name is not null and (v_name is null or length(v_name) > 120) then
    raise exception 'invalid_display_name: 1-120 characters required';
  end if;

  if p_avatar_path is not null and p_avatar_path <> ''
     and not p_avatar_path like v_company_id::text || '/%' then
    raise exception 'invalid_avatar_path: must live under the company prefix';
  end if;

  insert into public.company_staff_profiles (company_id, user_id, display_name, avatar_path)
  values (v_company_id, auth.uid(), coalesce(v_name, 'Member'), nullif(p_avatar_path, ''))
  on conflict (company_id, user_id) do update
  set display_name = coalesce(v_name, company_staff_profiles.display_name),
      -- null keeps the current avatar; '' clears it; a path replaces it
      avatar_path = case
        when p_avatar_path is null then company_staff_profiles.avatar_path
        else nullif(p_avatar_path, '')
      end,
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.update_my_profile(text, text) from anon, public;
grant execute on function public.update_my_profile(text, text) to authenticated;
