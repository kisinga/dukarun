-- The custody cutover replaced prepare_sale_order_core and lost the catalog
-- lock installed by 0171. Restore it before any draft/order write while keeping
-- logical-sale serialization first for both online and offline callers.
create or replace function public.offline_line_current_state(p_company_id uuid,p_line jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.product_variants%rowtype;p public.products%rowtype;
  k public.variant_packs%rowtype;v_source text;v_price bigint;v_floor bigint;
begin
  -- Assessment must join the catalog lock before retaining product/pack rows.
  perform pg_advisory_xact_lock_shared(
    hashtextextended('catalog-units:' || p_company_id::text, 0)
  );
  select * into v from public.product_variants where company_id=p_company_id
    and id=(p_line->>'variant_id')::uuid for share;
  if v.id is null then return jsonb_build_object('available',false); end if;
  select * into p from public.products where id=v.product_id and company_id=p_company_id for share;
  v_source:=coalesce(p_line->>'price_source','retail');
  v_price:=case when v_source='wholesale' then v.wholesale_price else v.price end;
  v_floor:=v.wholesale_price;
  if nullif(p_line->>'pack_id','') is not null then
    select * into k from public.variant_packs where company_id=p_company_id
      and variant_id=v.id and id=(p_line->>'pack_id')::uuid for share;
    v_price:=k.sale_price;v_floor:=k.sale_price;
  end if;
  return jsonb_build_object('available',v.active and p.active and
    (nullif(p_line->>'pack_id','') is null or (k.active and k.sale_price is not null and v.kind='good')),
    'product_id',v.product_id,'variant_id',v.id,'pack_id',k.id,
    'product_name',p.name,'variant_name',v.name,'unit_name',coalesce(k.name,v.stock_unit),
    'stock_unit',v.stock_unit,'units_per_unit',coalesce(k.units_per_pack,1),
    'kind',v.kind,'allow_fractional',v.allow_fractional,'track_inventory',v.track_inventory,
    'expected_unit_price',v_price,'price_floor',v_floor,
    'catalogue_version',jsonb_build_object('product',p.updated_at,'variant',v.updated_at,'pack',k.updated_at));
end;
$$;

create or replace function public.prepare_sale_order_core(
  p_customer_id uuid,
  p_lines jsonb,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_client_ref text := nullif(btrim(p_client_ref), '');
  v_order_id uuid;
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_root public.offline_sale_requests%rowtype;v_revision uuid;v_logical_ref text;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'location_id', nullif(current_setting('app.business_location_id', true), '')::uuid,
    'customer_id', p_customer_id,
    'lines', coalesce(p_lines, '[]'::jsonb),
    'draft_id', p_draft_id
  )::text, 'sha256'), 'hex');

  if v_client_ref is not null then
    select r.* into v_root from public.offline_sale_requests r
    where r.company_id=v_company_id and (r.client_ref=v_client_ref or exists(
      select 1 from public.offline_sale_revisions rv where rv.request_id=r.id and rv.execution_key=v_client_ref));
    v_logical_ref:=coalesce(v_root.client_ref,v_client_ref);
    perform pg_advisory_xact_lock(hashtextextended('sale:'||v_company_id::text||':'||v_logical_ref,73));
    -- A custody receipt or correction may have committed while this original
    -- attempt waited. Resolve the root again after acquiring the logical lock.
    select r.* into v_root from public.offline_sale_requests r
    where r.company_id=v_company_id and (r.client_ref=v_client_ref or exists(
      select 1 from public.offline_sale_revisions rv where rv.request_id=r.id and rv.execution_key=v_client_ref));
    if v_root.id is not null then
      select * into v_existing from public.orders where company_id=v_company_id
        and (offline_request_id=v_root.id or client_ref=v_root.client_ref)
        and (status='completed' or (status='voided' and posted_at is not null)) limit 1;
      if v_existing.id is not null then return v_existing.id; end if;
      if v_root.status='cancelled' then raise exception 'offline_sale_cancelled'; end if;
      if nullif(current_setting('app.offline_request_id',true),'') is distinct from v_root.id::text then
        raise exception 'offline_review_required: resume the durable review'; end if;
      select id into v_revision from public.offline_sale_revisions
        where request_id=v_root.id and execution_key=v_client_ref;
    end if;
  end if;

  -- Offline submission already holds the logical sale lock. Keep that lock
  -- before the shared catalog lock, then take all document and item row locks.
  -- This also covers held drafts and retries that attach custody to an order.
  perform pg_advisory_xact_lock_shared(
    hashtextextended('catalog-units:' || v_company_id::text, 0)
  );

  if v_client_ref is not null then
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.id is not null then
      if v_existing.status='voided' and v_existing.posted_at is null then
        raise exception 'sale_attempt_voided: create a reviewed correction'; end if;
      if v_existing.sale_request_fingerprint is not null
        and v_existing.sale_request_fingerprint <> v_fingerprint then
        raise exception 'idempotency_conflict: client_ref reused with different sale payload';
      end if;
      if v_root.id is not null then
        update public.orders set offline_request_id=v_root.id,offline_revision_id=v_revision,
          captured_at=coalesce(captured_at,v_root.captured_at),
          posting_request_fingerprint=coalesce((select payload_fingerprint from public.offline_sale_revisions where id=v_revision),v_root.request_fingerprint)
          where id=v_existing.id;
      end if;
      return v_existing.id;
    end if;
  end if;

  if p_draft_id is not null then
    -- Checkout creates a replacement order, so save_draft never sees the old ID.
    -- Lock and validate the source before replacing it. Keep this after the
    -- idempotency lookup: a successful retry no longer has a source draft.
    perform 1 from public.orders
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    for update;
    if not found then raise exception 'draft_not_found: %', p_draft_id; end if;
    if exists (
      select 1 from public.order_lines
      where order_id = p_draft_id and company_id = v_company_id and pack_id is not null
    ) and exists (
      select 1 from jsonb_array_elements(p_lines) line where not line ? 'units_per_unit'
    ) then
      raise exception 'pack_client_update_required: reopen the app before editing this sale';
    end if;
  end if;

  perform set_config('app.cache_change_suppressed', 'on', true);
  v_order_id := public.save_draft(p_customer_id, p_lines);

  begin
    update public.orders
    set client_ref = v_client_ref,
        sale_request_fingerprint = v_fingerprint,
        offline_request_id = v_root.id,
        offline_revision_id = v_revision,
        captured_at = v_root.captured_at,
        posting_request_fingerprint = coalesce((select payload_fingerprint from public.offline_sale_revisions where id=v_revision),v_root.request_fingerprint)
    where id = v_order_id;
  exception when unique_violation then
    delete from public.orders where id = v_order_id;
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.sale_request_fingerprint is not null
      and v_existing.sale_request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_conflict: client_ref reused with different sale payload';
    end if;
    perform set_config(
      'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
    );
    return v_existing.id;
  end;

  if p_draft_id is not null then
    delete from public.approvals
    where company_id = v_company_id
      and type = 'below_wholesale'
      and metadata ->> 'order_id' = p_draft_id::text;
    delete from public.orders
    where id = p_draft_id
      and company_id = v_company_id
      and status in ('draft', 'expired');
  end if;

  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  return v_order_id;
end;
$$;
