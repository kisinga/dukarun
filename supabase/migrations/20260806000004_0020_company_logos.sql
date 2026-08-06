-- 0020_company_logos.sql
-- Public company-logos bucket so members can manage the logo from Settings.
-- Logos live under the <company_id>/ prefix, same convention as staff-avatars.
-- (companies.address/email + their grants landed in 0019_company_contact.)

-- ---------------------------------------------------------------------------
-- Storage: company-logos bucket (public read, member writes on own prefix)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

drop policy if exists "company logos readable by everyone" on storage.objects;
create policy "company logos readable by everyone"
  on storage.objects for select
  using (bucket_id = 'company-logos');

drop policy if exists "members write their company logo prefix" on storage.objects;
create policy "members write their company logo prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

drop policy if exists "members update their company logo prefix" on storage.objects;
create policy "members update their company logo prefix"
  on storage.objects for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

drop policy if exists "members delete their company logo prefix" on storage.objects;
create policy "members delete their company logo prefix"
  on storage.objects for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );
