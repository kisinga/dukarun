-- Audited, idempotent product catalog imports. Merge changes supplied rows;
-- replace additionally deactivates rows omitted from a full catalog export.

alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ManageCustomers',
  'ManageCatalog',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = array_append(permissions, 'ManageCatalog'),
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ManageCatalog' = any(permissions));

-- New companies receive ManageCatalog through the provisioned Admin role.
do $$
declare
  v_definition text;
  v_old text := '''ManageCustomers''';
  v_new text := '''ManageCustomers'', ''ManageCatalog''';
begin
  select pg_get_functiondef('public.provision_company_base(text,text,text,text,text)'::regprocedure)
    into v_definition;
  if position('''ManageCatalog''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add ManageCatalog to provision_company_base';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

create table public.catalog_export_markers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  exported_at timestamptz not null default clock_timestamp(),
  unique (company_id, id)
);

alter table public.catalog_export_markers enable row level security;
grant all on public.catalog_export_markers to service_role;

create or replace function public.start_catalog_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_exported_at timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;

  insert into public.catalog_export_markers (company_id, actor)
  values (v_company_id, auth.uid())
  returning id, exported_at into v_id, v_exported_at;

  return jsonb_build_object('export_id', v_id, 'exported_at', v_exported_at);
end;
$$;

revoke execute on function public.start_catalog_export() from anon, public;
grant execute on function public.start_catalog_export() to authenticated;

create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('merge', 'replace')),
  idempotency_key uuid not null,
  source_export_id uuid references public.catalog_export_markers(id),
  source_exported_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (company_id, idempotency_key)
);

create index catalog_imports_company_time_idx
  on public.catalog_imports(company_id, created_at desc);

alter table public.catalog_imports enable row level security;

create policy "catalog imports readable by actor or catalog managers"
  on public.catalog_imports for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (actor = (select auth.uid()) or public.current_user_has_permission('ManageCatalog'))
  );

grant select on public.catalog_imports to authenticated;
grant all on public.catalog_imports to service_role;

create trigger catalog_imports_audit
  after insert or update or delete on public.catalog_imports
  for each row execute function public.audit_trigger();

create or replace function public.import_catalog_products(
  p_products jsonb,
  p_mode text default 'merge',
  p_idempotency_key uuid default gen_random_uuid(),
  p_source_export_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_import_id uuid;
  v_existing_result jsonb;
  v_product jsonb;
  v_variants jsonb;
  v_variant jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_variant_label text;
  v_variant_position int;
  v_manufacturer_id uuid;
  v_name text;
  v_created int := 0;
  v_updated int := 0;
  v_deactivated_products int := 0;
  v_deactivated_variants int := 0;
  v_row_count int;
  v_seen_products uuid[] := '{}'::uuid[];
  v_seen_variants uuid[] := '{}'::uuid[];
  v_result jsonb;
  v_error text;
  v_source_exported_at timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_mode not in ('merge', 'replace') then raise exception 'invalid_import_mode'; end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'products_required';
  end if;
  if p_mode = 'replace' then
    select exported_at into v_source_exported_at
    from public.catalog_export_markers
    where id = p_source_export_id and company_id = v_company_id;
    if v_source_exported_at is null then raise exception 'replace_requires_full_export'; end if;
  end if;

  insert into public.catalog_imports (
    company_id, actor, mode, idempotency_key, source_export_id, source_exported_at
  ) values (
    v_company_id, auth.uid(), p_mode, p_idempotency_key, p_source_export_id, v_source_exported_at
  )
  on conflict (company_id, idempotency_key) do nothing
  returning id into v_import_id;

  if v_import_id is null then
    select result into v_existing_result
    from public.catalog_imports
    where company_id = v_company_id and idempotency_key = p_idempotency_key;
    if v_existing_result is null then raise exception 'import_already_processing'; end if;
    return v_existing_result;
  end if;

  -- Exception block is a subtransaction: failed imports leave no catalog changes,
  -- while the outer job row can still record the failure.
  begin
    for v_product in select value from jsonb_array_elements(p_products)
    loop
      v_name := nullif(trim(coalesce(v_product ->> 'name', '')), '');
      if v_name is null then raise exception 'invalid_name'; end if;
      v_variants := v_product -> 'variants';
      if v_variants is null or jsonb_typeof(v_variants) <> 'array'
         or jsonb_array_length(v_variants) = 0 then
        raise exception 'variants_required: %', coalesce(v_product ->> 'product_key', v_name);
      end if;

      v_product_id := nullif(v_product ->> 'product_id', '')::uuid;
      if v_product_id is not null and v_product_id = any(v_seen_products) then
        raise exception 'duplicate_product_id: %', v_product_id;
      end if;
      if v_product_id is not null then
        if not exists (
          select 1 from public.products
          where id = v_product_id and company_id = v_company_id
        ) then raise exception 'product_not_found: %', v_product_id; end if;
        v_seen_products := array_append(v_seen_products, v_product_id);
      end if;

      v_manufacturer_id := null;
      if nullif(trim(coalesce(v_product ->> 'manufacturer_name', '')), '') is not null then
        v_manufacturer_id := public.upsert_manufacturer(v_product ->> 'manufacturer_name');
      end if;

      for v_variant in select value from jsonb_array_elements(v_variants)
      loop
        v_variant_id := nullif(v_variant ->> 'variant_id', '')::uuid;
        if v_product_id is null and v_variant_id is not null then
          raise exception 'new_product_has_variant_id: %', v_variant_id;
        end if;
        if v_variant_id is not null then
          if v_variant_id = any(v_seen_variants) then
            raise exception 'duplicate_variant_id: %', v_variant_id;
          end if;
          if not exists (
            select 1 from public.product_variants
            where id = v_variant_id and product_id = v_product_id and company_id = v_company_id
          ) then raise exception 'variant_not_found: %', v_variant_id; end if;
          v_seen_variants := array_append(v_seen_variants, v_variant_id);
        end if;
      end loop;

      if v_product_id is null then
        v_product_id := public.create_catalog_product_with_manufacturer(
          v_name,
          v_variants,
          nullif(trim(coalesce(v_product ->> 'barcode', '')), ''),
          null,
          v_manufacturer_id
        );
        update public.products
        set active = coalesce((v_product ->> 'active')::boolean, true), updated_at = now()
        where id = v_product_id and company_id = v_company_id;
        v_variant_position := 0;
        for v_variant in select value from jsonb_array_elements(v_variants)
        loop
          v_variant_position := v_variant_position + 1;
          v_variant_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
          if v_variant_label is null then
            v_variant_label := case when jsonb_array_length(v_variants) = 1 then 'Default'
                                    else 'Variant ' || v_variant_position end;
          end if;
          update public.product_variants
          set active = coalesce((v_variant ->> 'active')::boolean, true), updated_at = now()
          where product_id = v_product_id
            and company_id = v_company_id
            and name = v_variant_label;
        end loop;
        v_created := v_created + 1;
      else
        perform public.update_catalog_product_with_manufacturer(
          v_product_id,
          v_name,
          v_variants,
          nullif(trim(coalesce(v_product ->> 'barcode', '')), ''),
          coalesce((v_product ->> 'active')::boolean, true),
          v_manufacturer_id
        );
        v_updated := v_updated + 1;
      end if;
    end loop;

    if p_mode = 'replace' then
      if exists (
        select 1 from public.product_variants v
        where v.company_id = v_company_id
          and v.created_at <= v_source_exported_at
          and v.updated_at > v_source_exported_at
          and not (v.id = any(v_seen_variants))
      ) or exists (
        select 1 from public.products p
        where p.company_id = v_company_id
          and p.created_at <= v_source_exported_at
          and p.updated_at > v_source_exported_at
          and not (p.id = any(v_seen_products))
      ) then raise exception 'stale_export: omitted catalog items changed after export'; end if;

      update public.product_variants
      set active = false, updated_at = now()
      where company_id = v_company_id
        and active
        and created_at <= v_source_exported_at
        and not (id = any(v_seen_variants));
      get diagnostics v_deactivated_variants = row_count;

      update public.products
      set active = false, updated_at = now()
      where company_id = v_company_id
        and active
        and created_at <= v_source_exported_at
        and not (id = any(v_seen_products));
      get diagnostics v_deactivated_products = row_count;
    end if;

    v_result := jsonb_build_object(
      'status', 'completed',
      'import_id', v_import_id,
      'mode', p_mode,
      'created', v_created,
      'updated', v_updated,
      'deactivated_products', v_deactivated_products,
      'deactivated_variants', v_deactivated_variants
    );
  exception when others then
    v_error := sqlerrm;
    v_result := jsonb_build_object(
      'status', 'failed', 'import_id', v_import_id, 'mode', p_mode, 'error', v_error
    );
  end;

  update public.catalog_imports
  set status = v_result ->> 'status', result = v_result, completed_at = now()
  where id = v_import_id;
  return v_result;
end;
$$;

revoke execute on function public.import_catalog_products(jsonb, text, uuid, uuid)
  from anon, public;
grant execute on function public.import_catalog_products(jsonb, text, uuid, uuid)
  to authenticated;
