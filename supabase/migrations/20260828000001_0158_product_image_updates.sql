-- Stage product photo changes in the client, then apply the metadata swap with
-- optimistic concurrency. Storage upload/deletion remains client-owned because
-- it cannot participate in the database transaction.

update public.products
set image_path = null
where image_path is not null and btrim(image_path) = '';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'product-images';

create table public.product_image_cleanup_queue (
  company_id uuid not null references public.companies(id) on delete cascade,
  object_path text not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  last_attempt_at timestamptz,
  queued_at timestamptz not null default now(),
  primary key (company_id, object_path)
);

alter table public.product_image_cleanup_queue enable row level security;
revoke all on public.product_image_cleanup_queue from public, anon, authenticated;
grant all on public.product_image_cleanup_queue to service_role;

create or replace function public.assert_product_image_object(
  p_company_id uuid,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_image_path is null
     or p_image_path <> btrim(p_image_path)
     or char_length(p_image_path) > 300
     or p_image_path !~ (
       '^' || p_company_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
     ) then
    raise exception 'invalid_product_image_path';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'product-images' and name = p_image_path
  ) then
    raise exception 'product_image_object_not_found';
  end if;
end;
$$;

revoke execute on function public.assert_product_image_object(uuid, text)
  from public, anon, authenticated;

create or replace function public.set_product_image(
  p_product_id uuid,
  p_image_path text,
  p_expected_image_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_previous_path text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_image_path is not null then
    perform public.assert_product_image_object(v_company_id, p_image_path);
  end if;

  select image_path
  into v_previous_path
  from public.products
  where id = p_product_id and company_id = v_company_id
  for update;

  if not found then raise exception 'product_not_found: %', p_product_id; end if;
  if v_previous_path is distinct from p_expected_image_path then
    raise exception 'product_image_conflict';
  end if;

  update public.products
  set image_path = p_image_path,
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if v_previous_path is not null and v_previous_path is distinct from p_image_path then
    insert into public.product_image_cleanup_queue(company_id, object_path)
    values(v_company_id, v_previous_path)
    on conflict(company_id, object_path) do nothing;
  end if;

  return v_previous_path;
end;
$$;

revoke execute on function public.set_product_image(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.queue_product_image_cleanup(p_object_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_object_path is null
     or p_object_path !~ (
       '^' || v_company_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
     ) then
    raise exception 'invalid_product_image_path';
  end if;

  insert into public.product_image_cleanup_queue(company_id, object_path)
  values(v_company_id, p_object_path)
  on conflict(company_id, object_path) do nothing;
end;
$$;

create or replace function public.pending_product_image_cleanup(p_limit integer default 20)
returns table(object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid_cleanup_limit'; end if;

  return query
  select q.object_path
  from public.product_image_cleanup_queue q
  where q.company_id = v_company_id
  order by q.queued_at, q.object_path
  limit p_limit;
end;
$$;

create or replace function public.record_product_image_cleanup(
  p_object_path text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_error is null then
    delete from public.product_image_cleanup_queue
    where company_id = v_company_id and object_path = p_object_path;
  else
    update public.product_image_cleanup_queue
    set attempts = attempts + 1,
        last_error = left(p_error, 500),
        last_attempt_at = now()
    where company_id = v_company_id and object_path = p_object_path;
  end if;
end;
$$;

revoke execute on function public.queue_product_image_cleanup(text) from public, anon;
revoke execute on function public.pending_product_image_cleanup(integer) from public, anon;
revoke execute on function public.record_product_image_cleanup(text, text) from public, anon;
grant execute on function public.queue_product_image_cleanup(text) to authenticated;
grant execute on function public.pending_product_image_cleanup(integer) to authenticated;
grant execute on function public.record_product_image_cleanup(text, text) to authenticated;

-- Canonical product mutations own the full family+variant aggregate. Image
-- metadata joins the same transaction so a conflict rolls back every edit.
create or replace function public.create_catalog_product_with_manufacturer(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null,
  p_manufacturer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.manufacturers
    where id = p_manufacturer_id and company_id = v_company_id and active
  ) then raise exception 'manufacturer_not_found'; end if;
  if p_image_path is not null then
    perform public.assert_product_image_object(v_company_id, p_image_path);
  end if;

  v_product_id := public.create_catalog_product(p_name, p_variants, p_barcode, p_image_path);
  update public.products set manufacturer_id = p_manufacturer_id where id = v_product_id;
  return v_product_id;
end;
$$;

drop function public.update_catalog_product_with_manufacturer(uuid, text, jsonb, text, boolean, uuid);
create function public.update_catalog_product_with_manufacturer(
  p_product_id uuid,
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_active boolean default null,
  p_manufacturer_id uuid default null,
  p_image_changed boolean default false,
  p_image_path text default null,
  p_expected_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.manufacturers
    where id = p_manufacturer_id and company_id = v_company_id and active
  ) then raise exception 'manufacturer_not_found'; end if;

  perform public.update_catalog_product(p_product_id, p_name, p_variants, p_barcode, p_active);
  update public.products
  set manufacturer_id = p_manufacturer_id, updated_at = now()
  where id = p_product_id and company_id = v_company_id;
  if p_image_changed then
    perform public.set_product_image(p_product_id, p_image_path, p_expected_image_path);
  end if;
  return p_product_id;
end;
$$;

revoke execute on function public.create_catalog_product(text, jsonb, text, text)
  from authenticated;
revoke execute on function public.update_catalog_product(uuid, text, jsonb, text, boolean)
  from authenticated;
revoke execute on function public.update_catalog_product_with_manufacturer(
  uuid, text, jsonb, text, boolean, uuid, boolean, text, text
) from public, anon;
grant execute on function public.update_catalog_product_with_manufacturer(
  uuid, text, jsonb, text, boolean, uuid, boolean, text, text
) to authenticated;

-- Retire pre-aggregate mutation APIs. No compatibility aliases remain: callers
-- must submit the complete product family through the canonical RPCs above.
drop function if exists public.create_product(text, text, text);
drop function if exists public.update_product(uuid, text, text, text, boolean);
drop function if exists public.upsert_variant(
  uuid, text, bigint, uuid, text, text, bigint, boolean, boolean, boolean, text
);
drop function if exists public.create_product_with_variants(text, jsonb, text, text);

drop policy if exists "members write their company image prefix" on storage.objects;
create policy "members write their company image prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageStockAdjustments'))
  );

drop policy if exists "members update their company image prefix" on storage.objects;
create policy "members update their company image prefix"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageStockAdjustments'))
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageStockAdjustments'))
  );

drop policy if exists "members delete their company image prefix" on storage.objects;
create policy "members delete their company image prefix"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageStockAdjustments'))
  );
